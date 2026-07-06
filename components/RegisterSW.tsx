"use client";

import { useEffect } from "react";

export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // e.g. insecure origin over LAN — the app works fine without it
      });
    }
  }, []);
  return null;
}
