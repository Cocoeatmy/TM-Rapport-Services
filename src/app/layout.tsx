import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { Toaster } from "sonner";
import { UserMenu } from "@/components/user-menu";
import { SyncButton } from "@/components/sync-button";
import { AIChatbot } from "@/components/ai-chatbot";
import { NotificationBell } from "@/components/notifications";
import { RefreshButton } from "@/components/refresh-button";
import { ForceSyncButton } from "@/components/force-sync-button";
import { SendPendingButton } from "@/components/send-pending-button";
import { CreateProjectButton } from "@/components/create-project-button";
import { ErrorBoundary } from "@/components/error-boundary";
import { OfflineBanner } from "@/components/offline-banner";
import { GlobalSearch } from "@/components/global-search";
import { CmmWindowCorners } from "@/components/cmm-window-corners";
import { BackButton } from "@/components/back-button";
import { HomeButton } from "@/components/home-button";
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
        {/* Économie de batterie : met les animations de fond en pause quand
            l'app n'est pas au premier plan (onglet caché / app en arrière-plan).
            Script inline (avant hydratation) → aucun coût React. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){function u(){document.documentElement.classList.toggle('anim-paused',document.hidden)}document.addEventListener('visibilitychange',u);u();})();",
          }}
        />
        {/* Fluidité au scroll (surtout sur GPU/RAM modestes) : pendant qu'on
            scrolle, on met en pause l'animation du fond dégradé. Le fond paraît
            identique mais on supprime les repaints plein écran continus qui,
            combinés aux backdrop-filter des cartes, provoquent des micro-lags.
            Retour à l'état animé 180 ms après l'arrêt du scroll. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var t,on=false,d=document.documentElement;function off(){on=false;d.classList.remove('is-scrolling');}function s(){if(!on){on=true;d.classList.add('is-scrolling');}clearTimeout(t);t=setTimeout(off,180);}window.addEventListener('scroll',s,{passive:true,capture:true});})();",
          }}
        />
        {/* Applique le thème UI avant l'hydration React pour éviter un flash
            de style au chargement. Lit `tm-ui-mode` (classic|aurora|ocean). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem('tm-ui-mode');if(m==='aurora'||m==='ocean'||m==='cleanmymac'){document.documentElement.setAttribute('data-ui',m);}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col lg-bg">
        {/* Bandeau hors-ligne + header dans un même conteneur sticky : le
            bandeau se place AU-DESSUS du header (plein haut), sans le recouvrir. */}
        <div className="sticky top-0 z-50">
        <OfflineBanner />
        <header id="main-header" className="glass-header text-white">
          <div className="flex items-center justify-between gap-2 px-2 sm:px-4 py-3 overflow-x-auto md:overflow-visible scrollbar-hide">
            <div className="flex items-center gap-2 cmm-header-left shrink-0">
              <HomeButton />
              <BackButton />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <GlobalSearch />
              <CreateProjectButton />
              <NotificationBell />
              {/* RefreshButton masqué sur mobile : le pull-to-refresh (glisser vers
                  le bas) fait déjà « recharger » → moins d'icônes, plus d'espace. */}
              <span className="hidden sm:flex items-center"><RefreshButton /></span>
              <SyncButton />
              <SendPendingButton />
              {/* ForceSyncButton (admin, rare) masqué sur mobile : la synchro
                  personnelle se fait via le nuage. */}
              <span className="hidden sm:flex items-center"><ForceSyncButton /></span>
              <UserMenu />
            </div>
          </div>
        </header>
        </div>
        <CmmWindowCorners />
        <main className="flex-1">
          <ErrorBoundary>{children}</ErrorBoundary>
        </main>
        {/* Assistant IA : bouton flottant fixe (bas à droite), masqué sur la
            page projet. Rendu au niveau page (positionnement fixed). */}
        <AIChatbot />
        <Toaster position="top-center" richColors />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js');
                  // Pré-cache hors-ligne fiable, indépendant du build : on liste
                  // les fichiers de l'app réellement chargés (JS/CSS de Next) et
                  // on demande au service worker de les mettre en cache. Garantit
                  // que l'app rouvre hors-ligne, y compris juste après un déploiement.
                  var precacheApp = function() {
                    try {
                      var urls = {};
                      performance.getEntriesByType('resource').forEach(function(e) {
                        if (e.name && e.name.indexOf('/_next/static/') !== -1) urls[e.name] = 1;
                      });
                      document.querySelectorAll('link[rel="stylesheet"],script[src]').forEach(function(el) {
                        var u = el.href || el.src;
                        if (u && u.indexOf('/_next/static/') !== -1) urls[u] = 1;
                      });
                      urls[location.origin + '/'] = 1; // app shell
                      var list = Object.keys(urls);
                      navigator.serviceWorker.ready.then(function(reg) {
                        var sw = reg.active || navigator.serviceWorker.controller;
                        if (sw) sw.postMessage({ type: 'PRECACHE_URLS', urls: list });
                      });
                    } catch (e) {}
                  };
                  // Laisse le temps aux chunks différés de se charger.
                  setTimeout(precacheApp, 3500);
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
