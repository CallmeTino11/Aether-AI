# Folder Structure

What lives where, and why.

```
/
├── README.md                Entry point — read this first
├── docs/                    Company-wide source-of-truth documents (this folder)
├── departments/
│   ├── ceo/                 Strategy notes, roadmap-in-progress thinking
│   ├── product/             Product/UX working notes feeding into docs/Product-UX.md
│   ├── marketing/            Marketing/sales working notes feeding into docs/Marketing-Sales.md
│   ├── engineering/          Engineering working notes (architecture drafts, spikes)
│   └── documentation/        Meta: doc-standards working notes
├── specs/
│   ├── features/             One file per feature spec (Status: Proposed/Approved/etc.)
│   ├── integrations/         One file per integration (Slack, Stripe, HubSpot, etc.)
│   └── ai-employees/         One file per Digital Employee type (Receptionist, Sales Rep, etc.)
├── sessions/                 One dated file per meaningful work session
└── .github/workflows/        Automation: doc/decision/repo validation, CI
```

## Rules

- `docs/` files are the **official record**. `departments/*` are working notes that feed into `docs/` — they're allowed to be messier and more provisional.
- A file in `specs/` isn't "real" until its `Status:` field says `Approved`.
- Nothing in `sessions/` should be created for trivial changes — only meaningful work sessions.
- Decision IDs live in exactly one place: `docs/Decision-Register.md`. Never create a second register anywhere else in the repo.
