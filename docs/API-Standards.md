# API Standards

*Status: Proposed defaults — not yet formally approved. No APIs have been built yet.*

## Defaults (pending approval)

- REST over GraphQL unless a specific use case justifies GraphQL (to be revisited once real endpoints are designed).
- Versioned routes (`/api/v1/...`).
- Consistent error shape: `{ error: { code, message, details? } }`.
- Auth via bearer tokens; no API logic assumes a specific auth provider (see `docs/Architecture.md`).
- Every integration module exposes the same internal contract regardless of the underlying third-party API (Slack vs. WhatsApp vs. Twilio, etc.) — the rest of the platform should not need to know which provider is behind an integration.

## Open Questions

- REST vs. GraphQL — not decided.
- Rate limiting strategy — not decided.
- Internal vs. public API surface — not decided.

Nothing in this file should be treated as locked until it has a Decision ID in `docs/Decision-Register.md`.
