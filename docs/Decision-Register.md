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

<!-- Append new decisions below this line, in ascending numeric order -->
