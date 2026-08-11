# AI Receptionist

## Status
Approved (DEC-0004)

## Problem
Small/service businesses miss inbound inquiries (calls, WhatsApp, web chat, email) outside working hours or when staff are busy. Missed inquiries are directly lost revenue.

## Customer
Small businesses, service businesses, professional firms (Company Bible initial segment).

## Desired Outcome
Every inbound customer message gets an immediate, accurate, on-brand response 24/7; qualified leads and booking requests are captured and routed; anything the AI can't handle is escalated to a human with full context.

## User Experience
Business owner "hires" a Receptionist in the dashboard: names it, connects channels, uploads/links business knowledge (services, prices, hours, FAQs), sets escalation rules. Then monitors conversations and metrics like managing a human employee — not configuring software.

## Functional Requirements
- FR-1: Receive and respond to inbound messages on connected channels
- FR-2: Answer questions from a business-specific knowledge base
- FR-3: Capture lead contact details into a structured record
- FR-4: Book/propose appointments (calendar integration)
- FR-5: Escalate to a human per configured rules, with conversation context
- FR-6: Full conversation audit log

## Non-Functional Requirements
- Provider-agnostic AI (per Coding Standards — no direct provider coupling)
- Per-business data isolation
- Response latency suitable for live chat (<5s target for text channels)

## Permissions
Read: business knowledge base, calendar availability. Write: leads, bookings, conversation logs. Never: payments, employee/HR data.

## Integrations
Phase 1: web chat widget. Phase 2: WhatsApp (Twilio), email, Calendly/Google Calendar. (Each an independent module per Architecture.)

## AI Behaviour
Professional, concise, on-brand per business configuration. Never invents business facts not in the knowledge base — says it will check and escalates instead. Always identifies itself as an AI assistant when asked directly.

## Success Metrics
- % inquiries answered without human intervention
- Lead capture rate
- Median first-response time
- Escalation accuracy (escalated when it should, not when it shouldn't)

## Risks
- Hallucinated business facts → mitigated by strict knowledge-base grounding + escalation default
- Channel API dependencies (WhatsApp policy, etc.)

## Dependencies
Core domain model, AI provider abstraction (this session), knowledge/RAG layer (next), channel integrations.

## Decision IDs
DEC-0004, DEC-0005

## Engineering Notes
Built on the shared Digital Employee domain model in `src/domain/` — Receptionist is a role configuration of the generic employee, not a hardcoded special case.

## Open Questions
- Voice (phone calls) in scope for v1 or text-only first? (Leaning text-only v1.)
- Which calendar integration ships first?
