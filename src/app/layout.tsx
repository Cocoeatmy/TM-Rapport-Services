import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import { UserMenu } from "@/components/user-menu";
import { SyncButton } from "@/components/sync-button";
import { QRButton } from "@/components/qr-button";
import { AIChatbot } from "@/components/ai-chatbot";
import { NotificationBell } from "@/components/notifications";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TM Rapport Services",
  description: "Application de rapport de montage - TM Sanitaire",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "TM Rapport Services",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#1e3a5f",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" className={`${geistSans.variable} h-full antialiased`}>
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-startup-image" href="/icons/icon-512.png" />
      </head>
      <body className="min-h-full flex flex-col lg-bg">
        <header className="sticky top-0 z-50 glass-header text-white">
          <div className="flex items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2.5">
              <img src="/icons/logo-app.png?v=4" alt="TM" className="w-9 h-9 rounded-xl shadow-lg" />
              <span className="font-semibold text-lg tracking-tight">TM Rapport Services</span>
            </a>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <QRButton />
              <SyncButton />
              <UserMenu />
              <AIChatbot />
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
