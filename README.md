# Aether AI

**Aether AI is a Digital Workforce platform.** Businesses hire AI-powered "Digital Employees" (Receptionist, Secretary, Sales Rep, Support, HR, Finance, Marketing, Ops Manager) that run inside a dedicated operating system — not a chatbot bolted onto a website.

This repository is the **single source of truth** for company knowledge, engineering, and documentation. Individual AI conversations (Claude, ChatGPT, etc.) are temporary working environments — anything approved must eventually live here.

## Start Here

| Doc | What it's for |
|---|---|
| [`docs/Aether-AI-Bible.md`](docs/Aether-AI-Bible.md) | Highest-level company knowledge: mission, vision, product, principles |
| [`docs/Architecture.md`](docs/Architecture.md) | Technical architecture, strategic and implementation level |
| [`docs/Decision-Register.md`](docs/Decision-Register.md) | Every approved company decision, permanent record |
| [`docs/Decision-Log.md`](docs/Decision-Log.md) | Session-by-session log of what changed |
| [`docs/Roadmap.md`](docs/Roadmap.md) | Vision → near-term → backlog |
| [`docs/Deployment.md`](docs/Deployment.md) | How to take this live, step by step |
| [`docs/Folder-Structure.md`](docs/Folder-Structure.md) | What lives where and why |
| [`docs/Coding-Standards.md`](docs/Coding-Standards.md) | Engineering conventions |
| [`docs/API-Standards.md`](docs/API-Standards.md) | API design conventions |
| [`docs/Conversation-Compression.md`](docs/Conversation-Compression.md) | How long AI sessions hand off context cleanly |
| [`docs/Product-UX.md`](docs/Product-UX.md) | Product/UX decisions and specs |
| [`docs/Marketing-Sales.md`](docs/Marketing-Sales.md) | Positioning, GTM, sales |
| [`docs/Customer-Research.md`](docs/Customer-Research.md) | Customer research findings |
| [`docs/Competitive-Analysis.md`](docs/Competitive-Analysis.md) | Competitive landscape |

## Repository Layout

```
/
├── README.md
├── docs/                  ← company-wide source-of-truth documents
├── departments/           ← per-department working notes (ceo, product, marketing, engineering, documentation)
├── specs/
│   ├── features/          ← feature specifications
│   ├── integrations/      ← integration specs (Google Workspace, Slack, Stripe, etc.)
│   └── ai-employees/      ← conceptual AI employee architecture (Receptionist, Sales Rep, etc.)
├── sessions/              ← dated session records
└── .github/workflows/     ← documentation & decision validation automation
```

## Running it

```bash
npm ci
cp .env.example .env        # fill in DATABASE_URL, ANTHROPIC_API_KEY, etc.
npm test                    # unit tests, no database needed
```

With a database:

```bash
for m in supabase/migrations/*.sql; do psql -d aether -v ON_ERROR_STOP=1 -f "$m"; done
DATABASE_URL=postgres://... npm run test:integration
```

Configuration is validated at startup and the app refuses to run half-configured — see `.env.example` and `docs/Architecture.md`.

## Operating Model

- **All departments — CEO/Strategy, Product, Marketing, Engineering, Documentation — currently operate under Claude.** (See `DEC-0002` in the Decision Register.)
- Decisions are permanent once recorded in `docs/Decision-Register.md`. They're never edited or deleted — only superseded.
- Every meaningful work session gets a record in `sessions/`.
- Nothing is marked "Approved" unless the founder has actually approved it. Unclear or proposed items are labeled as such — never invented.

See [`docs/Aether-AI-Bible.md`](docs/Aether-AI-Bible.md) for full context.
