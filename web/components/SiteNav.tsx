"use client";

import Link from "next/link";

export function SiteNav({ current }: { current: "home" | "pricing" }) {
  return (
    <nav className="topbar">
      <div className="wrap">
        <div className="brand">
          <span className="brand-mark">Æ</span>Aether AI
        </div>
        <div className="navlinks">
          <Link href={current === "home" ? "#roster" : "/#roster"}>Roster</Link>
          {current === "home" && <Link href="#demo">Try it</Link>}
          <Link href={current === "home" ? "#onboarding" : "/#onboarding"}>How it works</Link>
          <Link href="/pricing" className={current === "pricing" ? "current" : ""}>
            Pricing
          </Link>
        </div>
        <Link href={current === "home" ? "/pricing" : "#plans"} className="nav-cta">
          Hire now
        </Link>
      </div>
    </nav>
  );
}
