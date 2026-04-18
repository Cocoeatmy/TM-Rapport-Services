import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import { UserMenu } from "@/components/user-menu";
import { SyncButton } from "@/components/sync-button";
import { QRButton } from "@/components/qr-button";
import { AIChatbot } from "@/components/ai-chatbot";
import { NotificationBell } from "@/components/notifications";
import { ErrorBoundary } from "@/components/error-boundary";
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
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-startup-image" href="/icons/icon-512.png" />
      </head>
      <body className="min-h-full flex flex-col lg-bg">
        <header id="main-header" className="sticky top-0 z-50 glass-header text-white">
          <div className="flex items-center justify-between px-4 py-3">
            <a href="/" className="flex items-center gap-2.5">
              <img src="/icons/logo-app.png?v=5" alt="TM" className="w-9 h-9 rounded-xl shadow-lg" />
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
        <main className="flex-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        <Toaster position="top-center" richColors />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                });
              }

              window.addEventListener('unhandledrejection', function(event) {
                var msg = event.reason && event.reason.message ? event.reason.message : String(event.reason);
                console.error('[UnhandledRejection]', msg);
                try {
                  fetch('/api/logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'ERROR',
                      details: '[UnhandledRejection] ' + msg.slice(0, 500),
                      projectId: '',
                      projectName: ''
                    })
                  }).catch(function() {});
                } catch(e) {}
              });

              window.addEventListener('error', function(event) {
                var msg = event.message || 'Unknown error';
                console.error('[GlobalError]', msg);
                try {
                  fetch('/api/logs', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      action: 'ERROR',
                      details: '[GlobalError] ' + msg.slice(0, 500),
                      projectId: '',
                      projectName: ''
                    })
                  }).catch(function() {});
                } catch(e) {}
              });
            `,
          }}
        />
      </body>
    </html>
  );
}
