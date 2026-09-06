import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteChatWidget } from "@/components/SiteChatWidget";
import { TryBeforeYouHire } from "@/components/TryBeforeYouHire";

const ROSTER = [
  { code: "AR-01", status: "ACTIVE" as const, name: "Receptionist", duty: "Answers, routes, and books — on the site and the phone line." },
  { code: "AS-02", status: "HIRING" as const, name: "Secretary", duty: "Calendars, follow-ups, and the paperwork no one wants to own." },
  { code: "SR-03", status: "HIRING" as const, name: "Sales Rep", duty: "Qualifies inbound leads and hands warm ones to your team." },
  { code: "CS-04", status: "HIRING" as const, name: "Support", duty: "Handles tickets, checks order status, knows when to escalate." },
  { code: "HR-05", status: "HIRING" as const, name: "HR", duty: "Onboarding checklists, policy Q&A, time-off requests." },
  { code: "FN-06", status: "HIRING" as const, name: "Finance", duty: "Invoices, expense triage, and a running tab on cash flow." },
  { code: "MK-07", status: "HIRING" as const, name: "Marketing", duty: "Drafts campaigns, schedules posts, reports what worked." },
  { code: "OM-08", status: "HIRING" as const, name: "Ops Manager", duty: "Watches the rest of the team and flags what needs you." },
];

const INDUSTRIES = [
  "Dental & medical practices",
  "Home services (HVAC, plumbing, electrical)",
  "Legal & professional services",
  "Salons & wellness studios",
  "Local retail & specialty shops",
  "Auto & repair shops",
];

export default function HomePage() {
  return (
    <div data-page="home">
      <SiteNav current="home" />

      <header className="hero">
        <div className="wrap hero-grid">
          <div>
            <div className="eyebrow-row">
              <span className="dot" />
              Built for small &amp; growing teams
            </div>
            <h1 className="hero-title">
              Hire your next employee. <em>They just happen to be AI.</em>
            </h1>
            <p className="hero-sub">
              Too small for a full front desk, too busy to miss another call — Aether AI is a digital workforce
              sized for small and medium businesses. Each hire has a job title, a reporting line, and a record of
              everything they&apos;ve done. Bring one on in an afternoon, no IT team required.
            </p>
            <div className="hero-actions">
              <Link className="btn-primary" href="#roster">
                Meet the roster
              </Link>
              <Link className="btn-ghost" href="#onboarding">
                See how onboarding works
              </Link>
            </div>
          </div>
          <div className="id-card">
            <div className="id-top">
              <div className="mono">
                AETHER AI · PERSONNEL FILE
                <br />
                NO. AR-0001
              </div>
              <div className="id-status">ACTIVE</div>
            </div>
            <div className="id-photo">R</div>
            <div className="id-name">Receptionist</div>
            <div className="id-role">Front desk · answers, books, escalates</div>
            <div className="id-meta">
              <div>
                <div className="label">CLOCKED IN</div>
                <div className="val">24 / 7</div>
              </div>
              <div>
                <div className="label">CHANNEL</div>
                <div className="val">Web + Phone</div>
              </div>
              <div>
                <div className="label">ESCALATES TO</div>
                <div className="val">You</div>
              </div>
              <div>
                <div className="label">AUDIT LOG</div>
                <div className="val">Full trail</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="roster" id="roster">
        <div className="wrap">
          <div className="section-label">
            <span className="rule" />
            THE ROSTER
          </div>
          <h2 className="section-title">One team, eight desks, zero HR paperwork</h2>
          <p className="section-sub">
            Every Digital Employee ships with a defined job — nothing invents facts about your business, and
            everything they do is logged, escalated, and reviewable. No hiring pipeline, no benefits, no desk to
            find.
          </p>

          <div className="roster-grid">
            {ROSTER.map((role) => (
              <div className="role-card" key={role.code}>
                <div className="role-top">
                  <span className="role-code">{role.code}</span>
                  <span className={`role-pill${role.status === "ACTIVE" ? " active" : ""}`}>{role.status}</span>
                </div>
                <div>
                  <div className="role-name">{role.name}</div>
                  <div className="role-duty">{role.duty}</div>
                </div>
              </div>
            ))}
          </div>
          <p className="roster-footnote">
            The roster keeps growing — dev, design, and content roles are next in line, added as each one clears
            the same bar: does it do the job better, or at least as well, as a person could, with a low enough
            error rate to trust it.
          </p>
        </div>
      </section>

      <TryBeforeYouHire />

      <section className="onboarding" id="onboarding">
        <div className="wrap">
          <div className="section-label">
            <span className="rule" />
            ONBOARDING
          </div>
          <h2 className="section-title">Four steps, one afternoon</h2>
          <div className="steps">
            <div className="step">
              <div className="step-num">01</div>
              <div className="step-title">Interview</div>
              <div className="step-desc">
                Tell us the role, the facts they should know, and where the line to a human sits.
              </div>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <div className="step-title">Train</div>
              <div className="step-desc">
                We ground them in your business — hours, pricing, policies. Nothing outside that file.
              </div>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <div className="step-title">Clock in</div>
              <div className="step-desc">Drop them onto your site, phone line, or inbox. They start working the same day.</div>
            </div>
            <div className="step">
              <div className="step-num">04</div>
              <div className="step-title">Manage</div>
              <div className="step-desc">Every conversation is logged. Review, correct, and adjust their file any time.</div>
            </div>
          </div>
        </div>
      </section>

      <section className="trust">
        <div className="wrap">
          <div className="section-label">
            <span className="rule" />
            WHY IT HOLDS UP
          </div>
          <h2 className="section-title">You don&apos;t need to trust us blindly — you can check its work</h2>
          <p className="section-sub">
            No IT department, no procurement process. Every reply is checked against what you told it, and
            everything it does is written down where you can see it.
          </p>
          <div className="trust-grid">
            <div className="trust-item">
              <div className="mono">GROUNDED ANSWERS</div>
              <p>
                Every reply is checked against your business facts. If it doesn&apos;t know, it escalates instead
                of guessing — no made-up prices or policies.
              </p>
            </div>
            <div className="trust-item">
              <div className="mono">FULL AUDIT TRAIL</div>
              <p>Every conversation, decision, and escalation is logged. Spot-check it whenever you want, no dashboard training required.</p>
            </div>
            <div className="trust-item">
              <div className="mono">YOUR DATA, FENCED</div>
              <p>
                Row-level security keeps your records separate from every other business on the platform —
                nothing crosses between accounts.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="industries">
        <div className="wrap">
          <div className="section-label">
            <span className="rule" />
            WHO IT&apos;S BUILT FOR
          </div>
          <h2 className="section-title">Built for the businesses that answer their own phones</h2>
          <p className="industries-note">
            Aether is new — we&apos;re not going to invent a client count or logos we don&apos;t have. What we can
            tell you is the kind of business this is built for: appointment-driven, front-desk-heavy, too lean to
            staff every desk full time.
          </p>
          <div className="industry-row">
            {INDUSTRIES.map((industry) => (
              <div className="industry-chip" key={industry}>
                <span className="ic" />
                {industry}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="pricing-teaser" id="pricing">
        <div className="wrap">
          <div className="section-label">
            <span className="rule" />
            PAYROLL
          </div>
          <h2 className="section-title">Pay a salary, not a software bill</h2>
          <div className="pricing-teaser-grid">
            <div className="pay-card">
              <div className="pay-role">ESSENTIALS</div>
              <div className="pay-amount">
                $X<span>/month</span>
              </div>
              <div className="pay-desc">One role, always on. Good starting point for a single front desk.</div>
              <Link className="pay-cta" href="/pricing">
                Hire this role →
              </Link>
            </div>
            <div className="pay-card highlight">
              <div className="pay-role">MANAGED</div>
              <div className="pay-amount">
                $X<span>/month</span>
              </div>
              <div className="pay-desc">Receptionist + Support + Sales Rep, working together from day one.</div>
              <Link className="pay-cta" href="/pricing">
                Build my team →
              </Link>
            </div>
            <div className="pay-card">
              <div className="pay-role">DEDICATED</div>
              <div className="pay-amount">Custom</div>
              <div className="pay-desc">All eight roles, tuned to your business, with a dedicated setup call.</div>
              <Link className="pay-cta" href="/pricing">
                Talk to us →
              </Link>
            </div>
          </div>
          <p className="pricing-teaser-more">
            <Link className="btn-ghost" href="/pricing">
              See full plan comparison →
            </Link>
          </p>
        </div>
      </section>

      <section className="final-cta">
        <div className="wrap cta-inner">
          <h2>Your first hire can start today.</h2>
          <div className="actions">
            <Link className="btn-primary" href="/pricing">
              Hire your Receptionist
            </Link>
            <Link className="btn-ghost" href="#roster">
              Or browse the roster
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter current="home" />
      <SiteChatWidget />
    </div>
  );
}
