/**
 * Aether AI — Tests: Supabase JWT Verification
 *
 * This is the gate in front of every RLS-scoped query, so these tests forge
 * tokens rather than merely validating good ones. Each case is a documented
 * real-world JWT bypass.
 *
 * No database needed — these run in the fast unit suite.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPair, SignJWT, exportJWK, type JWK } from "jose";
import { createServer, type Server } from "node:http";

import { AuthError, SupabaseTokenVerifier } from "../infrastructure/auth/supabase-jwt.js";

const SECRET = "a-test-jwt-secret-long-enough-to-be-accepted-32+";
const USER_ID = "11111111-2222-4333-8444-555555555555";
const ISSUER = "https://project.supabase.co/auth/v1";
const AUDIENCE = "authenticated";

function verifier(): SupabaseTokenVerifier {
  return new SupabaseTokenVerifier({
    mode: "shared_secret",
    jwtSecret: SECRET,
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

async function signHs256(
  payload: Record<string, unknown>,
  options: { secret?: string; expiresIn?: string } = {},
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setExpirationTime(options.expiresIn ?? "1h")
    .sign(new TextEncoder().encode(options.secret ?? SECRET));
}

/** Builds a token by hand so malformed/hostile headers can be tested. */
function craft(header: object, payload: object, signature = ""): string {
  const encode = (value: object): string =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode(header)}.${encode(payload)}.${signature}`;
}

// ---------------------------------------------------------------------------
// Configuration guards
// ---------------------------------------------------------------------------

test("a short or missing JWT secret is refused at construction", () => {
  assert.throws(
    () => new SupabaseTokenVerifier({ mode: "shared_secret", jwtSecret: "" }),
    (error: unknown) => error instanceof AuthError && error.code === "misconfigured",
  );
  // Brute-forceable offline; refusing to start beats accepting forgeries.
  assert.throws(
    () => new SupabaseTokenVerifier({ mode: "shared_secret", jwtSecret: "short" }),
    (error: unknown) => error instanceof AuthError && error.code === "misconfigured",
  );
});

// ---------------------------------------------------------------------------
// Valid tokens
// ---------------------------------------------------------------------------

test("a valid token yields the user id", async () => {
  const token = await signHs256({ sub: USER_ID, email: "owner@clinic.example" });
  const user = await verifier().verify(token);
  assert.equal(user.userId, USER_ID);
  assert.equal(user.email, "owner@clinic.example");
  assert.ok(user.expiresAt.getTime() > Date.now());
});

test("a bearer header is parsed, case-insensitively", () => {
  const request = new Request("http://x/", { headers: { authorization: "bearer abc.def.ghi" } });
  assert.equal(SupabaseTokenVerifier.extractBearer(request), "abc.def.ghi");

  assert.equal(SupabaseTokenVerifier.extractBearer(new Request("http://x/")), null);
  // A raw token without the scheme is not a bearer token.
  assert.equal(
    SupabaseTokenVerifier.extractBearer(new Request("http://x/", { headers: { authorization: "abc" } })),
    null,
  );
});

// ---------------------------------------------------------------------------
// Forgeries
// ---------------------------------------------------------------------------

test("alg:none is rejected", async () => {
  // The classic bypass: declare no algorithm, send no signature, and a naive
  // verifier that trusts the header skips verification entirely.
  const forged = craft({ alg: "none", typ: "JWT" }, { sub: USER_ID, iss: ISSUER, aud: AUDIENCE, exp: Math.floor(Date.now() / 1000) + 3600 });
  await assert.rejects(
    () => verifier().verify(forged),
    (error: unknown) => error instanceof AuthError && error.code === "invalid_token",
  );
});

test("a token signed with the wrong secret is rejected", async () => {
  const forged = await signHs256({ sub: USER_ID }, { secret: "a-different-secret-that-is-also-long-enough!!" });
  await assert.rejects(() => verifier().verify(forged), AuthError);
});

test("a tampered payload is rejected even with a real signature", async () => {
  const token = await signHs256({ sub: USER_ID });
  const [header, , signature] = token.split(".");
  // Swap in a different user while keeping the original signature.
  const swapped = Buffer.from(
    JSON.stringify({
      sub: "99999999-9999-4999-8999-999999999999",
      iss: ISSUER,
      aud: AUDIENCE,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString("base64url");
  await assert.rejects(() => verifier().verify(`${header}.${swapped}.${signature}`), AuthError);
});

test("an expired token is reported as expired, not merely invalid", async () => {
  const token = await signHs256({ sub: USER_ID }, { expiresIn: "-5m" });
  await assert.rejects(
    () => verifier().verify(token),
    (error: unknown) => error instanceof AuthError && error.code === "expired",
  );
});

test("a token from another issuer or audience is rejected", async () => {
  const wrongIssuer = await new SignJWT({ sub: USER_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("https://attacker.example/auth/v1")
    .setAudience(AUDIENCE)
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
  await assert.rejects(() => verifier().verify(wrongIssuer), AuthError);

  const wrongAudience = await new SignJWT({ sub: USER_ID })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer(ISSUER)
    .setAudience("some-other-service")
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(SECRET));
  await assert.rejects(() => verifier().verify(wrongAudience), AuthError);
});

test("a token with no subject, or a non-uuid subject, is rejected", async () => {
  const noSubject = await signHs256({});
  // A non-uuid subject would reach the database as an identity; reject early.
  const namedSubject = await signHs256({ sub: "admin" });
  const blankSubject = await signHs256({ sub: "   " });

  await assert.rejects(() => verifier().verify(noSubject), AuthError);
  await assert.rejects(() => verifier().verify(namedSubject), AuthError);
  await assert.rejects(() => verifier().verify(blankSubject), AuthError);
});

test("garbage input is rejected without throwing an unexpected error type", async () => {
  for (const bad of ["", "not-a-token", "a.b", "a.b.c.d", "...", "eyJhbGciOiJIUzI1NiJ9"]) {
    await assert.rejects(() => verifier().verify(bad), AuthError, `expected rejection for: ${bad}`);
  }
});

// ---------------------------------------------------------------------------
// Algorithm confusion — the subtle one
// ---------------------------------------------------------------------------

test("an asymmetric project rejects an HS256 token signed with its public key", async () => {
  // The attack: a project verifies with a PUBLIC RSA key. An attacker takes
  // that public key (it is public), signs an HS256 token using it as the HMAC
  // secret, and a verifier that trusts the token's own `alg` header will happily
  // check the HMAC with the same public material — forging any user.
  const { publicKey } = await generateKeyPair("RS256");
  const publicJwk: JWK = await exportJWK(publicKey);

  // Serve the public key as a JWKS endpoint.
  const server: Server = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ keys: [{ ...publicJwk, alg: "RS256", use: "sig", kid: "test-key" }] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("no address");

  try {
    const jwksVerifier = new SupabaseTokenVerifier({
      mode: "jwks",
      jwksUrl: `http://127.0.0.1:${address.port}/jwks.json`,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const publicKeyAsSecret = new TextEncoder().encode(JSON.stringify(publicJwk));
    const forged = await new SignJWT({ sub: USER_ID })
      .setProtectedHeader({ alg: "HS256", kid: "test-key" })
      .setIssuedAt()
      .setIssuer(ISSUER)
      .setAudience(AUDIENCE)
      .setExpirationTime("1h")
      .sign(publicKeyAsSecret);

    // Algorithms are pinned to RS256/ES256 in jwks mode, so HS256 never gets
    // a chance to be checked at all.
    await assert.rejects(
      () => jwksVerifier.verify(forged),
      (error: unknown) => error instanceof AuthError && error.code === "invalid_token",
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("resolveUser returns null rather than throwing on a bad token", async () => {
  const auth = verifier();
  assert.equal(await auth.resolveUser(new Request("http://x/")), null);
  assert.equal(
    await auth.resolveUser(new Request("http://x/", { headers: { authorization: "Bearer nonsense" } })),
    null,
  );

  const token = await signHs256({ sub: USER_ID });
  assert.equal(
    await auth.resolveUser(new Request("http://x/", { headers: { authorization: `Bearer ${token}` } })),
    USER_ID,
  );
});
