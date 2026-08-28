import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Handoff — Kiske paas hai?",
  description:
    "The custody ledger for everything ISB Co'27 lends each other — speakers, chairs, cutlery, books. Know who has it, always.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Handoff" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-dvh mx-auto max-w-md bg-background">
        {children}
      </body>
    </html>
  );
}
