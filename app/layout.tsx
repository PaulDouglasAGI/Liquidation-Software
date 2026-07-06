import type { Metadata, Viewport } from "next";
// Fonts are self-hosted (bundled from node_modules) so builds never depend on
// reaching Google Fonts — important for Docker and on-phone builds.
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "Liquidation Ops",
  description: "Pallet-to-profit operations platform",
  appleWebApp: { capable: true, title: "LiqOps", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f0f0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
