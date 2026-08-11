# Coding Standards

Applies to all engineering work, regardless of which conceptual department it falls under.

## Language & Style

- **TypeScript everywhere.** No plain JS in new code.
- Meaningful names — no `data2`, `tmp`, `foo`.
- No magic numbers — name the constant.
- Comment **why**, not **what**. If the code needs a comment to explain what it does, prefer rewriting it to be clearer instead.
- Never write placeholder/stub production code unless explicitly asked for a scaffold.

## Architecture

- Clean Architecture, Domain-Driven Design, SOLID, DRY, KISS.
- Composition over inheritance.
- Modular design — everything should be replaceable without a rewrite.
- Never tightly couple systems. In particular:
  - **AI providers:** business logic never calls OpenAI/Anthropic/Gemini/etc. directly — always through an abstraction layer.
  - **Integrations:** each third-party integration (Slack, Stripe, HubSpot, etc.) is an independent module behind a common interface.

## Process

- Before building a feature: explain the goal, architecture, dependencies, risks, and scalability — *then* write code.
- Before touching an existing file: understand why it exists and what depends on it.
- After a work session: update the relevant department doc, record any new decisions, note outstanding tasks.

## Testing

*Status: Not yet decided.* Testing framework/strategy to be defined once real implementation starts (Data Engineering / Infrastructure).
