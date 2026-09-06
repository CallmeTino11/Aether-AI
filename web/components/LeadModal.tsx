"use client";

import { useState } from "react";
import { AetherApiError, submitLead, type PlanInterest } from "@/lib/api";

/**
 * Lead capture behind the pricing CTAs (DEC-0027 / FR-3, "arriving through
 * the site instead of the dashboard"). Writes to Postgres and fires through
 * the existing notification outbox via POST /api/leads.
 */

const PLAN_LABEL: Record<PlanInterest, string> = {
  essentials: "Essentials",
  managed: "Managed",
  dedicated: "Dedicated",
};

export function LeadModal({
  planInterest,
  source,
  onClose,
}: {
  planInterest: PlanInterest;
  source: string;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() && !phone.trim()) {
      setError("Please provide an email address or a phone number.");
      return;
    }
    setError(null);
    setStatus("sending");
    try {
      await submitLead({
        planInterest,
        source,
        ...(name.trim() ? { name: name.trim() } : {}),
        ...(companyName.trim() ? { companyName: companyName.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setStatus("sent");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof AetherApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="lead-modal-backdrop" onClick={onClose}>
      <div className="lead-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lead-modal-head">
          <div className="lead-modal-title">
            {planInterest === "dedicated" ? "Talk to us" : `Choose ${PLAN_LABEL[planInterest]}`}
          </div>
          <button className="lead-modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {status === "sent" ? (
          <p className="lead-form-success">
            Thanks — we&apos;ve got your details and will reach out shortly.
          </p>
        ) : (
          <>
            <p className="lead-modal-sub">
              Tell us a bit about your business and we&apos;ll follow up about the {PLAN_LABEL[planInterest]} plan.
            </p>
            <form onSubmit={submit}>
              <div className="lead-form-field">
                <label>YOUR NAME</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
              </div>
              <div className="lead-form-field">
                <label>BUSINESS NAME</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  maxLength={200}
                />
              </div>
              <div className="lead-form-field">
                <label>EMAIL</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} />
              </div>
              <div className="lead-form-field">
                <label>PHONE (OPTIONAL IF YOU GAVE AN EMAIL)</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={200} />
              </div>
              <div className="lead-form-field">
                <label>ANYTHING ELSE WE SHOULD KNOW?</label>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} />
              </div>
              {error && <div className="lead-form-error">{error}</div>}
              <button type="submit" className="btn-primary" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
