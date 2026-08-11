# Decision Register

**This is the ONE company-wide decision register.** No department keeps its own. Decision IDs are permanent — never reused, never deleted, never silently edited. A changed decision gets a new ID that supersedes the old one.

---

## Decision Template

```markdown
## DEC-XXXX — Title

**Department:**
**Status:** Approved / Rejected / Superseded
**Date:**
**Approved By:**

### Decision
### Reason
### Impact
- CEO / Product / Engineering / Documentation / Marketing / Sales / Customer Success
### Requires Documentation Update
Yes / No
### Requires Engineering Changes
Yes / No
### Implementation Status
Not Started / In Progress / Completed
### Supersedes
None / DEC-XXXX
### Related Decisions
None / DEC-XXXX
### Notes
```

---

## DEC-0001 — Consolidate engineering into five departments

**Department:** Engineering
**Status:** Approved
**Date:** 2026-07-19
**Approved By:** Founder (Tino)

### Decision
Engineering work is organized into five permanent areas: 💻 Frontend Engineering, ⚙️ Platform Engineering, 🤖 AI Engineering, 🗄️ Data Engineering, 🚀 Infrastructure. QA is absorbed into each owning department rather than existing standalone.

### Reason
A single AI engineer switching roles doesn't need six specialized departments (the original Backend/DevOps/QA split added overhead without adding capability).

### Impact
- Engineering
- Documentation

### Requires Documentation Update
Yes

### Requires Engineering Changes
No

### Implementation Status
In Progress

### Supersedes
None

### Related Decisions
DEC-0002

### Notes
Frontend stack (Next.js/React) is provisional, not yet finalized.

---

## DEC-0002 — Claude owns all company departments; ChatGPT deprioritized

**Department:** Company-Wide
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Founder (Tino)

### Decision
All company departments — CEO/Strategy, Product & UX, Marketing & Sales, Engineering, Documentation — now operate under Claude in this repository. The prior split (ChatGPT for product/business/strategy, Claude for engineering only) is discontinued.

### Reason
Founder's explicit instruction: consolidate everything under Claude; ChatGPT's split-workflow arrangement was not adding value.

### Impact
- CEO
- Product
- Engineering
- Documentation
- Marketing
- Sales

### Requires Documentation Update
Yes — `docs/Product-UX.md`, `docs/Marketing-Sales.md`, `docs/Customer-Research.md`, `docs/Competitive-Analysis.md`, and `docs/Roadmap.md` are now created and owned within this repo/Claude workflow rather than left to ChatGPT.

### Requires Engineering Changes
No

### Implementation Status
In Progress

### Supersedes
None (informal split was never a formally recorded decision)

### Related Decisions
DEC-0001

### Notes
Product/Marketing/CEO-strategy content in this repo starts from a genuinely blank slate — no prior ChatGPT-side decisions were carried over because none were shared into this repository. Anything not explicitly approved by the founder is marked **Proposed** or **Unknown**, not invented.

---

## DEC-0003 — Founder delegates day-to-day decision authority to Claude departments

**Department:** Company-Wide
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Founder (Tino)

### Decision
The founder has delegated day-to-day product, engineering, and prioritization decisions to the Claude-operated departments ("i trust you, build from where you think is necessary"). Claude proceeds autonomously and records its decisions here; the founder retains veto and can supersede any decision.

### Reason
Founder is intentionally minimizing administrative involvement; wants execution to proceed.

### Impact
- CEO
- Product
- Engineering
- Documentation

### Requires Documentation Update
Yes

### Requires Engineering Changes
No

### Implementation Status
Completed

### Supersedes
None

### Related Decisions
DEC-0002

### Notes
Decisions made under this delegation are marked "Approved By: Claude (under DEC-0003 delegation)". Anything the founder later disagrees with gets superseded, never rewritten.

---

## DEC-0004 — AI Receptionist is the first Digital Employee

**Department:** Product
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
The first Digital Employee built and shipped is the **AI Receptionist**: answers inbound customer messages, captures leads, answers business-knowledge questions, books appointments, escalates to humans.

### Reason
Smallest coherent scope of the eight employee types; clearest measurable pain for target customers (service businesses lose revenue to missed inquiries); its foundations (identity, permissions, knowledge, channels, escalation, audit) are reused by every other employee type.

### Impact
- Product
- Engineering
- Marketing

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
In Progress

### Supersedes
None

### Related Decisions
DEC-0003

### Notes
Spec: specs/ai-employees/receptionist.md

---

## DEC-0005 — Core technology stack finalized

**Department:** Engineering
**Status:** Approved
**Date:** 2026-08-11
**Approved By:** Claude (under DEC-0003 delegation)

### Decision
Stack: **TypeScript** everywhere; **Next.js/React** frontend (previously provisional, now confirmed); **Supabase (PostgreSQL)** for database/auth; **Vercel** for deployment. Core domain and AI layers are framework-agnostic TypeScript packages so the frontend choice remains replaceable.

### Reason
Closes the open "provisional" frontend question. Next.js/React has the largest ecosystem, first-class Vercel deployment, and no identified alternative offers enough advantage to justify a less-supported choice. Keeping domain/AI logic framework-agnostic preserves replaceability per Coding Standards.

### Impact
- Engineering

### Requires Documentation Update
Yes

### Requires Engineering Changes
Yes

### Implementation Status
In Progress

### Supersedes
None

### Related Decisions
DEC-0001, DEC-0003

### Notes
None.

<!-- Append new decisions below this line, in ascending numeric order -->
