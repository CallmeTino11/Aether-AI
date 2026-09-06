"use client";

import { useState } from "react";
import {
  DEMO_RECEPTIONIST_EMPLOYEE_ID,
  LIVE_DEMO_CONFIGURED,
  sendMessage,
  startConversation,
} from "@/lib/api";

/**
 * "Try before you hire" (web/mockups/aether-ai-landing.html#demo).
 *
 * Support and Sales Rep stay the mockup's scripted, labeled-preview
 * conversations — neither role is a built product yet. Receptionist is: when
 * selected, this renders a real chat backed by the deployed widget API
 * (session-token auth, DEC-0012) against the seeded demo tenant instead of a
 * script (DEC-0027). If the demo isn't configured (no env vars set yet), it
 * falls back to the same scripted preview so the page still renders sensibly.
 */

type DemoKey = "reception" | "support" | "sales";
type ScriptLine = ["system" | "bot" | "user", string];

const SCRIPTS: Record<DemoKey, { name: string; avatar: string; msgs: ScriptLine[] }> = {
  reception: {
    name: "Receptionist",
    avatar: "R",
    msgs: [
      ["system", "Fri, 9:42 PM — after hours"],
      ["bot", "Hi, thanks for reaching out — we're closed right now, but I can still get you booked in."],
      ["user", "Can I get a cleaning appointment for next week?"],
      [
        "bot",
        "Sure — Tuesday or Thursday afternoon both have openings. I'll pencil you in and the front desk will confirm first thing tomorrow.",
      ],
      ["system", "booked · confirmation queued for morning review"],
    ],
  },
  support: {
    name: "Support",
    avatar: "S",
    msgs: [
      ["system", "Mon, 2:15 PM"],
      ["bot", "Hi, I'm the Support desk — what can I help with?"],
      ["user", "Do you cover Delta Dental PPO?"],
      [
        "bot",
        "That's a good one for our front desk to confirm directly — I've flagged this for a team member and they'll follow up by email shortly. Anything else meanwhile?",
      ],
      ["system", "escalated · outside knowledge file, by design"],
    ],
  },
  sales: {
    name: "Sales Rep",
    avatar: "SR",
    msgs: [
      ["system", "Wed, 11:03 AM"],
      ["bot", "Hey there — what brought you to us today?"],
      ["user", "Looking into Invisalign, not sure if I'm a candidate."],
      [
        "bot",
        "Good news — that's exactly what a free consult is for. I can get you on the calendar and pass your details to our treatment coordinator so they're ready for you.",
      ],
      ["system", "lead qualified · handed off to Sales"],
    ],
  },
};

const PICKERS: { key: DemoKey; avatar: string; name: string; scenario: string; liveScenario: string }[] = [
  {
    key: "reception",
    avatar: "R",
    name: "Receptionist",
    scenario: "Scenario: after-hours booking request",
    liveScenario: "Live — ask it anything about this demo business",
  },
  { key: "support", avatar: "S", name: "Support", scenario: "Scenario: a question outside its file", liveScenario: "" },
  { key: "sales", avatar: "SR", name: "Sales Rep", scenario: "Scenario: qualifying an inbound lead", liveScenario: "" },
];

function ScriptedDemo({ demoKey, replayNonce }: { demoKey: DemoKey; replayNonce: number }) {
  const script = SCRIPTS[demoKey];
  return (
    <div className="demo-body" key={replayNonce}>
      {script.msgs.map(([role, text], i) => (
        <div
          key={i}
          className={`demo-msg ${role === "system" ? "tag" : role}`}
          style={{ animationDelay: `${i * 0.45}s` }}
        >
          {text}
        </div>
      ))}
    </div>
  );
}

interface LiveMsg {
  role: "bot" | "user" | "system";
  text: string;
}

function LiveReceptionistDemo() {
  const [messages, setMessages] = useState<LiveMsg[]>([]);
  const [conversation, setConversation] = useState<{ id: string; token: string } | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ensureConversation(): Promise<{ id: string; token: string }> {
    if (conversation) return conversation;
    const started = await startConversation(DEMO_RECEPTIONIST_EMPLOYEE_ID as string);
    const next = { id: started.conversationId, token: started.sessionToken };
    setConversation(next);
    setMessages([{ role: "bot", text: started.greeting }]);
    return next;
  }

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError(null);
    setMessages((m) => [...m, { role: "user", text }]);
    setSending(true);
    try {
      const { id, token } = await ensureConversation();
      const result = await sendMessage(id, token, text);
      setMessages((m) => [...m, { role: "bot", text: result.reply }]);
      if (result.escalated) {
        setMessages((m) => [
          ...m,
          {
            role: "system",
            text: result.teamNotified ? "escalated · a team member was notified" : "escalated · flagged for review",
          },
        ]);
      }
    } catch {
      setError("The live demo is unavailable right now — please try again in a moment.");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <div className="demo-body">
        {messages.length === 0 && !error && (
          <div className="demo-msg tag">Ask this real, grounded Receptionist about the demo business.</div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`demo-msg ${m.role === "system" ? "tag" : m.role}`}>
            {m.text}
          </div>
        ))}
        {error && <div className="demo-msg tag">{error}</div>}
      </div>
      <div className="demo-input-row">
        <input
          type="text"
          placeholder="Ask about hours, pricing, or policies…"
          value={input}
          maxLength={2000}
          disabled={sending}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
        />
        <button onClick={() => void send()} disabled={sending || input.trim().length === 0}>
          {sending ? "…" : "Send"}
        </button>
      </div>
    </>
  );
}

export function TryBeforeYouHire() {
  const [selected, setSelected] = useState<DemoKey>("reception");
  const [replayNonce, setReplayNonce] = useState(0);

  const active = PICKERS.find((p) => p.key === selected) ?? PICKERS[0]!;
  const isLive = selected === "reception" && LIVE_DEMO_CONFIGURED;

  return (
    <section className="demo" id="demo">
      <div className="wrap">
        <div className="section-label">
          <span className="rule" />
          TRY BEFORE YOU HIRE
        </div>
        <h2 className="section-title">See a shift before you commit to one</h2>
        <p className="section-sub">
          Pick a role and watch a real scenario play out. No account, no card — the Receptionist is a real,
          working employee; the rest are previews of roles still coming.
        </p>

        <div className="demo-layout">
          <div className="picker-list">
            {PICKERS.map((p) => (
              <button
                key={p.key}
                className={`picker-card${selected === p.key ? " selected" : ""}`}
                onClick={() => setSelected(p.key)}
              >
                <div className="picker-avatar">{p.avatar}</div>
                <div>
                  <div className="picker-name">{p.name}</div>
                  <div className="picker-scenario">
                    {p.key === "reception" && LIVE_DEMO_CONFIGURED ? p.liveScenario : p.scenario}
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="demo-frame">
            <div className="demo-head">
              <div className="demo-head-avatar">{active.avatar}</div>
              <div>
                <div className="demo-head-name">{active.name}</div>
                <div className="demo-head-status">● Active now</div>
              </div>
              <span className={`demo-badge${isLive ? " live" : ""}`}>{isLive ? "LIVE DEMO" : "PREVIEW · SCRIPTED"}</span>
            </div>

            {isLive ? (
              <LiveReceptionistDemo key="live" />
            ) : (
              <ScriptedDemo demoKey={selected} replayNonce={replayNonce} />
            )}

            {!isLive && (
              <div className="demo-foot">
                <span className="mono">Not a live business — sample data only</span>
                <button className="demo-replay" onClick={() => setReplayNonce((n) => n + 1)}>
                  Replay ↻
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
