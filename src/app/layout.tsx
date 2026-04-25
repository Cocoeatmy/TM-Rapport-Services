import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import { UserMenu } from "@/components/user-menu";
import { SyncButton } from "@/components/sync-button";
import { QRButton } from "@/components/qr-button";
import { AIChatbot } from "@/components/ai-chatbot";
import { NotificationBell } from "@/components/notifications";
import { RefreshButton } from "@/components/refresh-button";
import { ErrorBoundary } from "@/components/error-boundary";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
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
        {/* Preconnect : ouvre la connexion TCP+TLS en avance pour les hôtes critiques.
            Gain : 100-300 ms sur la 1ère requête image distante. */}
        <link rel="preconnect" href="https://res.cloudinary.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        {/* Applique le thème UI avant l'hydration React pour éviter un flash
            de style au chargement. Lit `tm-ui-mode` (classic|aurora|ocean). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('tm-ui-mode');if(m==='aurora'||m==='ocean'){document.documentElement.setAttribute('data-ui',m);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col lg-bg">
        <header id="main-header" className="sticky top-0 z-50 glass-header text-white">
          <div className="flex items-center justify-between px-4 py-3">
            <a
              href="/"
              aria-label="Accueil"
              className="home-badge inline-flex items-center justify-center w-9 h-9 rounded-xl shadow-lg text-white"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5"
              >
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </a>
            <div className="flex items-center gap-2">
              <NotificationBell />
              <RefreshButton />
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
