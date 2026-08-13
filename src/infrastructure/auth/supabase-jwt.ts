/**
 * Aether AI — Infrastructure: Supabase JWT Verification
 *
 * Turns a bearer token into a user id for `resolveUser`. This is the gate in
 * front of every RLS-scoped dashboard query, so the identity it returns is the
 * identity Postgres trusts.
 *
 * Verification uses `jose` rather than hand-rolled parsing. JWT verification
 * looks like a hundred lines of base64 and a signature check, and that is
 * exactly why it goes wrong: the well-known failures are `alg: none` accepted
 * as valid, algorithm confusion (an RS256 *public* key fed to an HMAC verifier
 * as its secret, letting anyone forge tokens from public material), unchecked
 * expiry, and non-constant-time comparison. Those are solved problems, and
 * reimplementing them here would be inventing risk for no benefit.
 *
 * Supabase issues both shapes depending on project age:
 *  - legacy projects: HS256 signed with the project's JWT secret
 *  - current projects: ES256/RS256 with rotating keys published via JWKS
 * Both are supported, and the accepted algorithms are pinned in each case so a
 * token cannot choose its own verification path.
 */

import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";

export interface VerifiedUser {
  readonly userId: string;
  readonly email?: string;
  readonly expiresAt: Date;
}

export class AuthError extends Error {
  constructor(
    readonly code: "missing_token" | "invalid_token" | "expired" | "misconfigured",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/** Tolerance for clock drift between Supabase and this server. */
const CLOCK_TOLERANCE_SECONDS = 30;

export type SupabaseAuthConfig =
  | {
      readonly mode: "shared_secret";
      /** The project's JWT secret. Never log or expose this. */
      readonly jwtSecret: string;
      readonly issuer?: string;
      readonly audience?: string;
    }
  | {
      readonly mode: "jwks";
      /** e.g. https://<project>.supabase.co/auth/v1/.well-known/jwks.json */
      readonly jwksUrl: string;
      readonly issuer?: string;
      readonly audience?: string;
    };

/**
 * Algorithms are pinned per mode. Without this a token could declare
 * `alg: HS256` against a project configured for asymmetric keys, and the
 * public key would be used as an HMAC secret — public material becomes a
 * signing key and anyone can mint a valid token for any user.
 */
const ALGORITHMS_BY_MODE = {
  shared_secret: ["HS256"],
  jwks: ["RS256", "ES256"],
} as const;

export class SupabaseTokenVerifier {
  private readonly key: Uint8Array | JWTVerifyGetKey;
  private readonly algorithms: readonly string[];

  constructor(private readonly config: SupabaseAuthConfig) {
    if (config.mode === "shared_secret") {
      if (!config.jwtSecret || config.jwtSecret.length < 32) {
        // A short secret is brute-forceable offline; refusing to start is far
        // better than accepting forgeable tokens.
        throw new AuthError(
          "misconfigured",
          "Supabase JWT secret is missing or too short (expected at least 32 characters).",
        );
      }
      this.key = new TextEncoder().encode(config.jwtSecret);
      this.algorithms = ALGORITHMS_BY_MODE.shared_secret;
    } else {
      if (!config.jwksUrl) {
        throw new AuthError("misconfigured", "JWKS URL is required in jwks mode.");
      }
      // Caches and rotates keys automatically; a rotated signing key does not
      // require a redeploy.
      this.key = createRemoteJWKSet(new URL(config.jwksUrl));
      this.algorithms = ALGORITHMS_BY_MODE.jwks;
    }
  }

  /** Extracts a bearer token from an Authorization header. */
  static extractBearer(request: Request): string | null {
    const header = request.headers.get("authorization");
    if (!header) return null;
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    return match?.[1]?.trim() ?? null;
  }

  async verify(token: string): Promise<VerifiedUser> {
    if (!token) {
      throw new AuthError("missing_token", "No token supplied.");
    }

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, this.key as never, {
        algorithms: [...this.algorithms],
        clockTolerance: CLOCK_TOLERANCE_SECONDS,
        ...(this.config.issuer ? { issuer: this.config.issuer } : {}),
        ...(this.config.audience ? { audience: this.config.audience } : {}),
      });
      payload = result.payload;
    } catch (error) {
      // Distinguish expiry so the client knows to refresh rather than re-login,
      // but say nothing else about why a token failed: detail here helps an
      // attacker tune forgeries.
      //
      // Matched on jose's structured error code, not the message text. The
      // message for an expired token is 'exp claim timestamp check failed',
      // which does not contain the word "expired" — an earlier message-sniffing
      // check silently misclassified every expired session as invalid, sending
      // users to a login screen instead of a token refresh.
      if (isErrorWithCode(error, "ERR_JWT_EXPIRED")) {
        throw new AuthError("expired", "Session expired.");
      }
      throw new AuthError("invalid_token", "Invalid token.");
    }

    // Supabase puts the user id in `sub`.
    const subject = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!subject) {
      throw new AuthError("invalid_token", "Token has no subject.");
    }
    // The subject becomes the identity RLS trusts, so it must look like the
    // UUID the database expects. A non-UUID would fail at the cast anyway, but
    // rejecting it here keeps malformed input out of the database entirely.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(subject)) {
      throw new AuthError("invalid_token", "Token subject is not a user id.");
    }

    // `exp` is enforced by jwtVerify; this is only for reporting.
    const expiresAt = new Date((typeof payload.exp === "number" ? payload.exp : 0) * 1000);

    return {
      userId: subject,
      ...(typeof payload["email"] === "string" ? { email: payload["email"] as string } : {}),
      expiresAt,
    };
  }

  /** Convenience for wiring straight into `DashboardHttpDeps.resolveUser`. */
  resolveUser = async (request: Request): Promise<string | null> => {
    const token = SupabaseTokenVerifier.extractBearer(request);
    if (!token) return null;
    try {
      const user = await this.verify(token);
      return user.userId;
    } catch {
      // The handler turns null into 401. Returning null rather than throwing
      // keeps a failed login off the error path, where it would be logged as
      // an exception on every unauthenticated request.
      return null;
    }
  };
}

/** Narrow an unknown thrown value to one carrying a specific error code. */
function isErrorWithCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}
