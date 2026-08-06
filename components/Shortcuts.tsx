"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts (desktop power users):
 *   N = new item (intake), I = inventory, P = pallets, D = dashboard,
 *   L = P&L, U = suppliers, G = insights, R = lot performance, / = focus search
 * Ignored while typing in an input/textarea/select.
 */
export default function Shortcuts() {
  const router = useRouter();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable) return;

      if (e.key === "/") {
        const search = document.querySelector<HTMLInputElement>("input[data-search]");
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        } else {
          router.push("/inventory");
        }
        return;
      }
      const map: Record<string, string> = {
        n: "/intake",
        i: "/inventory",
        p: "/pallets",
        g: "/insights",
        r: "/performance",
        d: "/",
        l: "/pnl",
        u: "/suppliers",
      };
      const dest = map[e.key.toLowerCase()];
      if (dest) router.push(dest);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return null;
}
