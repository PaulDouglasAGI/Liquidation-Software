"use client";

import { btnPrimaryCls } from "@/components/ui";

/** Print trigger for server-rendered print views (packing slips, labels). */
export default function PrintButton({ label = "Print" }: { label?: string }) {
  return (
    <button className={btnPrimaryCls} onClick={() => window.print()}>
      {label}
    </button>
  );
}
