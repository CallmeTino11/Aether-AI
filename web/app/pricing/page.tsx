"use client";

import { useState } from "react";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
import { SiteFooter } from "@/components/SiteFooter";
import { LeadModal } from "@/components/LeadModal";
import type { PlanInterest } from "@/lib/api";

const FAQ: { q: string; a: string }[] = [
  {
    q: "What happens when it doesn't know something?",
    a: "It says so, and hands off — to your team on Essentials, or to Aether on Managed and Dedicated. It never invents an answer about your business.",
  },
  {
    q: "Can I change roles later?",
    a: "Yes — add, pause, or upgrade any Digital Employee's tier at any time from their personnel file.",
  },
  {
    q: "Is my data shared across accounts?",
    a: "No. Every account's data is fenced off at the database level — nothing crosses between clients.",
  },
  {
    q: "How fast can I go live?",
    a: "Most single-role setups are live the same day — you're mainly filling in what the employee should know.",
  },
  {
    q: "Do I need an IT team to set this up?",
    a: "No. If you can fill out a form describing your hours, pricing, and policies, you can hire a Digital Employee — no developer or IT department needed.",
  },
  {
    q: "Is this only for big companies?",
    a: "The opposite — Aether is built for small and medium businesses that need front-desk coverage but don't have (or can't yet afford) a full team for it.",
  },
];

export default function PricingPage() {
  const [billing, setBilling] = useState<"m" | "a">("m");
  const [leadPlan, setLeadPlan] = useState<PlanInterest | null>(null);
  const [leadSource, setLeadSource] = useState<string>("");

  function openLead(plan: PlanInterest, source: string) {
    setLeadPlan(plan);
    setLeadSource(source);
  }

  return (
    <div data-page="pricing">
      <SiteNav current="pricing" />

      <header className="page-head">
        <div className="wrap">
          <div className="eyebrow-row">
            <span className="dot" />
            PRICING FOR SMALL &amp; GROWING TEAMS
          </div>
          <h1 className="page-title">Pay a salary, not a licence fee.</h1>
          <p className="page-sub">
            Built for small and growing businesses — no enterprise contract, no IT team required. Every tier runs
            on the same grounded, audited engine; the difference is how much of the judgment call is handled by a
            person at Aether versus your own team.
          </p>
        </div>
      </header>

      <section className="plans" id="plans">
        <div className="wrap">
          <div className="toggle-row">
            <div className="toggle-pill">
              <button className={billing === "m" ? "active" : ""} onClick={() => setBilling("m")}>
                Monthly
              </button>
              <button className={billing === "a" ? "active" : ""} onClick={() => setBilling("a")}>
                Annual
              </button>
            </div>
            <span className="save-badge">Save 15% billed annually</span>
          </div>

          <div className="plans-grid">
            <div className="plan-card">
              <div className="plan-name">ESSENTIALS</div>
              <div className="plan-price">
                <span>$X</span>
                <span>/mo per role</span>
              </div>
              <div className="plan-desc">
                The starting point for most small businesses. Fully autonomous within its file, escalates
                straight to you when it hits the edge of what it knows.
              </div>
              <div className="split-badges">
                <span className="split-badge ai">95% AI</span>
                <span className="split-badge human">5% you</span>
              </div>
              <ul className="plan-list">
                <li>1 Digital Employee</li>
                <li>Grounded answers only — no guessing</li>
                <li>Full audit log, 30-day retention</li>
                <li>Web chat + email</li>
              </ul>
              <button className="btn-outline" onClick={() => openLead("essentials", "pricing_essentials_cta")}>
                Choose Essentials
              </button>
            </div>

            <div className="plan-card feat">
              <div className="plan-name">MANAGED</div>
              <div className="plan-price">
                <span>$X</span>
                <span>/mo per role</span>
              </div>
              <div className="plan-desc">
                For a growing team ready to hand off more than one desk. Aether reviews flagged conversations
                weekly, so each employee&apos;s file keeps getting sharper.
              </div>
              <div className="split-badges">
                <span className="split-badge ai">85% AI</span>
                <span className="split-badge human">15% Aether</span>
              </div>
              <ul className="plan-list">
                <li>Up to 3 Digital Employees</li>
                <li>Weekly review of edge cases</li>
                <li>Priority escalation routing</li>
                <li>Phone + web chat + email</li>
              </ul>
              <button className="btn-primary" onClick={() => openLead("managed", "pricing_managed_cta")}>
                Choose Managed
              </button>
            </div>

            <div className="plan-card">
              <div className="plan-name">DEDICATED</div>
              <div className="plan-price">
                <span>Custom</span>
              </div>
              <div className="plan-desc">The full roster, tuned monthly by a dedicated account manager who knows your business.</div>
              <div className="split-badges">
                <span className="split-badge ai">70% AI</span>
                <span className="split-badge human">30% Aether</span>
              </div>
              <ul className="plan-list">
                <li>All 8 roles</li>
                <li>Dedicated account manager</li>
                <li>Monthly tuning &amp; reporting</li>
                <li>All channels + custom integrations</li>
              </ul>
              <button className="btn-outline" onClick={() => openLead("dedicated", "pricing_dedicated_cta")}>
                Talk to us
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="compare">
        <div className="wrap">
          <div className="section-label">
            <span className="rule" />
            FULL COMPARISON
          </div>
          <table className="compare-table">
            <tbody>
              <tr>
                <th>Feature</th>
                <th>Essentials</th>
                <th>Managed</th>
                <th>Dedicated</th>
              </tr>
              <tr>
                <td>Digital Employees included</td>
                <td>1</td>
                <td>Up to 3</td>
                <td>All 8</td>
              </tr>
              <tr>
                <td>Human review of edge cases</td>
                <td>—</td>
                <td>Weekly</td>
                <td>Continuous</td>
              </tr>
              <tr>
                <td>Dedicated account manager</td>
                <td>—</td>
                <td>—</td>
                <td>✓</td>
              </tr>
              <tr>
                <td>Audit log retention</td>
                <td>30 days</td>
                <td>90 days</td>
                <td>Unlimited</td>
              </tr>
              <tr>
                <td>Channels</td>
                <td>Web chat, email</td>
                <td>+ Phone</td>
                <td>+ Custom integrations</td>
              </tr>
              <tr>
                <td>Support SLA</td>
                <td>Email, 48h</td>
                <td>Email, 24h</td>
                <td>Priority, 4h</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="faq">
        <div className="wrap">
          <div className="section-label">
            <span className="rule" />
            QUESTIONS
          </div>
          <h2 className="faq-title">Before you hire</h2>
          <div className="faq-grid">
            {FAQ.map((item) => (
              <div className="faq-item" key={item.q}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta">
        <div className="wrap cta-inner">
          <h2>Ready to make your first hire?</h2>
          <div className="actions">
            <button className="btn-primary" onClick={() => openLead("managed", "pricing_final_cta")}>
              Hire your Receptionist
            </button>
            <Link className="btn-outline" href="/">
              Back to overview
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter current="pricing" />

      {leadPlan && <LeadModal planInterest={leadPlan} source={leadSource} onClose={() => setLeadPlan(null)} />}
    </div>
  );
}
