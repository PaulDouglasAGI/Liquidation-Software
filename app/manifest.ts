import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Liquidation Ops",
    short_name: "LiqOps",
    description: "Pallet-to-profit operations platform for liquidation resellers",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0f0f0f",
    theme_color: "#0f0f0f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
