"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard", key: "D" },
  { href: "/intake", label: "Item Intake", key: "N" },
  { href: "/inventory", label: "Inventory", key: "I" },
  { href: "/pallets", label: "Pallets", key: "P" },
  { href: "/pnl", label: "P&L", key: "L" },
  { href: "/suppliers", label: "Suppliers", key: "U" },
  { href: "/settings", label: "Settings", key: "" },
];

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-full shrink-0 flex-row items-center justify-between border-b border-edge bg-surface md:min-h-screen md:w-44 md:flex-col md:items-stretch md:justify-start md:border-b-0 md:border-r">
      <div className="flex items-baseline gap-1.5 px-3 py-3 md:border-b md:border-edge">
        <Link href="/" className="font-mono text-base font-bold text-accent">LIQ-OPS</Link>
        <span className="font-mono text-[10px] text-muted">v2</span>
      </div>
      <nav className="flex flex-row gap-0 overflow-x-auto md:flex-1 md:flex-col md:py-2">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center justify-between px-3 py-2 text-[13px] whitespace-nowrap ${
                active
                  ? "bg-raised text-accent md:border-l-2 md:border-accent"
                  : "text-zinc-400 hover:bg-raised hover:text-zinc-200 md:border-l-2 md:border-transparent"
              }`}
            >
              <span>{n.label}</span>
              {n.key ? <span className="hidden font-mono text-[10px] text-muted md:inline">{n.key}</span> : null}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2 px-3 py-2 md:border-t md:border-edge">
        <span className="hidden truncate text-[12px] text-muted md:inline" title={userName}>{userName}</span>
        <button onClick={logout} className="text-[12px] text-zinc-400 underline-offset-2 hover:text-danger hover:underline cursor-pointer">
          Logout
        </button>
      </div>
    </aside>
  );
}
