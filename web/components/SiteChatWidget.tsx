"use client";

import { useState } from "react";

/**
 * The site's own pre-sales chat, framed as Aether's Sales Rep (DEC-0027).
 * Scripted on purpose: the Sales Rep role isn't a built product yet, only the
 * Receptionist is (see components/TryBeforeYouHire.tsx for the one live
 * conversation on this page). Ported from
 * web/mockups/aether-ai-landing.html's siteChatPick script, copy unchanged.
 */

type Msg = { role: "bot" | "user"; text: string };

const REPLIES: Record<string, string> = {
  reception:
    "Makes sense — that's usually the Receptionist role. It answers on your site (and eventually your phone line) so nothing slips through after hours.",
  support:
    "Got it — Support handles tickets and known issues, and hands off anything outside its file instead of guessing.",
  leads:
    "That's the Sales Rep's job — it qualifies inbound leads right away and passes warm ones straight to your team.",
  browsing: "All good — feel free to poke at the roster above, or try the live demo a bit further down the page.",
};

const HEARD_OPTIONS = ["Search / Google", "Referral", "Social media", "Other"];

export function SiteChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "bot",
      text: "Hi — I'm Aether's own Sales Rep, actually running on this site right now. What's the business you're looking to bring on help for?",
    },
  ]);
  const [stage, setStage] = useState<"pick" | "waiting" | "heard" | "done">("pick");

  function pick(key: keyof typeof REPLIES, label: string) {
    const wasFirstPick = stage === "pick";
    setMessages((m) => [...m, { role: "user", text: label }]);
    setStage("waiting");
    window.setTimeout(() => {
      setMessages((m) => [...m, { role: "bot", text: REPLIES[key] ?? "" }]);
      if (wasFirstPick) {
        window.setTimeout(() => {
          setMessages((m) => [...m, { role: "bot", text: "One last thing — how did you hear about us?" }]);
          setStage("heard");
        }, 600);
      }
    }, 550);
  }

  function pickHeard(label: string) {
    setMessages((m) => [...m, { role: "user", text: label }]);
    setStage("done");
    window.setTimeout(() => {
      setMessages((m) => [
        ...m,
        { role: "bot", text: "Thanks — that helps us a lot. Take a look at the roster and pricing below, and reach out any time." },
      ]);
    }, 500);
  }

  return (
    <>
      <button className="site-chat-launcher" onClick={() => setOpen((v) => !v)} aria-label="Open chat">
        💬<span className="pulse" />
      </button>
      <div className={`site-chat-panel${open ? " open" : ""}`}>
        <div className="site-chat-head">
          <div className="site-chat-avatar">SR</div>
          <div>
            <div className="site-chat-title">Sales Rep · Aether AI</div>
            <div className="site-chat-sub">● Active now</div>
          </div>
          <button className="site-chat-close" onClick={() => setOpen(false)} aria-label="Close chat">
            ✕
          </button>
        </div>
        <div className="site-chat-body">
          {messages.map((m, i) => (
            <div key={i} className={`site-msg ${m.role}`}>
              {m.text}
            </div>
          ))}
        </div>
        {stage === "pick" && (
          <div className="site-chat-options">
            <button onClick={() => pick("reception", "We're missing calls / bookings")}>
              We&apos;re missing calls / bookings
            </button>
            <button onClick={() => pick("support", "Support tickets pile up")}>Support tickets pile up</button>
            <button onClick={() => pick("leads", "Leads go cold before we follow up")}>
              Leads go cold before we follow up
            </button>
            <button onClick={() => pick("browsing", "Just looking around")}>Just looking around</button>
          </div>
        )}
        {stage === "heard" && (
          <div className="site-chat-options">
            {HEARD_OPTIONS.map((label) => (
              <button key={label} onClick={() => pickHeard(label)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <div className="site-chat-foot">SCRIPTED PREVIEW · POWERED BY AETHER AI</div>
      </div>
    </>
  );
}
