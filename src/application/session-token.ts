/**
 * Aether AI — Application: Widget Session Tokens
 *
 * Authorizes an anonymous website visitor to continue their own conversation
 * and no one else's.
 *
 * Design notes:
 *  - The token is generated with a CSPRNG, not Math.random.
 *  - Only a SHA-256 hash is persisted; the plaintext is returned to the widget
 *    once and never stored or logged, so a database leak yields no live
 *    credentials.
 *  - Comparison is by hash lookup, so no user-supplied value is ever compared
 *    against a secret with a short-circuiting string equality.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** 32 bytes = 256 bits of entropy; unguessable and short enough for a header. */
const TOKEN_BYTES = 32;

export interface IssuedSessionToken {
  /** Returned to the client once. Never persist this. */
  readonly plaintext: string;
  /** Stored in `conversations.session_token_hash`. */
  readonly hash: string;
}

export function issueSessionToken(): IssuedSessionToken {
  const plaintext = randomBytes(TOKEN_BYTES).toString("base64url");
  return { plaintext, hash: hashSessionToken(plaintext) };
}

export function hashSessionToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/**
 * Compares two hex hashes in constant time.
 *
 * Lookups are by hash so this is defence in depth rather than the primary
 * control, but a timing-variable comparison anywhere near a session secret is
 * the kind of detail that gets copied into a place where it does matter.
 */
export function sessionTokenMatches(expectedHash: string, providedPlaintext: string): boolean {
  const providedHash = hashSessionToken(providedPlaintext);
  const expected = Buffer.from(expectedHash, "hex");
  const provided = Buffer.from(providedHash, "hex");
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
