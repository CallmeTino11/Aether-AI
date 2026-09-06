import Link from "next/link";

export function SiteFooter({ current }: { current: "home" | "pricing" }) {
  return (
    <footer>
      <div className="wrap">
        <div className="mono">© 2026 AETHER AI · DIGITAL WORKFORCE PLATFORM</div>
        <div className="footlinks">
          <Link href={current === "home" ? "#roster" : "/#roster"}>Roster</Link>
          <Link href="/pricing">Pricing</Link>
          <Link href="#">Docs</Link>
        </div>
      </div>
    </footer>
  );
}
