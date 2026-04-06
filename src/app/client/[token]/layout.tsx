import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Suivi de projet | TM Douche Montage",
  description: "Suivez l'avancement de votre projet de montage de cabine de douche.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1e3a5f",
};

export default function ClientPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout intentionally does NOT include the main app header/nav
  // so the client portal is a standalone public page
  return children;
}
