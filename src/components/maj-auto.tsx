"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { appliquer, preparer, suivreInteractions, verifier } from "@/lib/etat-mise-a-jour";
import { versionDuDocument } from "@/lib/version-web";

/**
 * Mise à jour automatique de l'app installée.
 *
 * Sur iPhone, l'app ajoutée à l'écran d'accueil pouvait tourner des jours sur un
 * ancien bundle : le service worker sert la coquille HTML en cache dès que le
 * réseau dépasse son délai (6 s), et cette coquille référence les anciens
 * fichiers JS, servis eux aussi depuis le cache. Les données arrivaient fraîches
 * mais le CODE restait vieux — sans aucun moyen de s'en apercevoir.
 *
 * On compare donc la version inscrite dans la page (balise `tm-version`, donc
 * celle réellement exécutée) à la version déployée (/api/build), par identité
 * de déploiement. Si elles diffèrent : on fait TÉLÉCHARGER la nouvelle version
 * au service worker (tout ou rien, sans rien effacer), puis on recharge au
 * premier moment propice — voir src/lib/etat-mise-a-jour.ts pour la liste.
 * Sinon, une pastille discrète propose « appliquer maintenant ».
 *
 * Ancien comportement abandonné : vider la coquille avant de recharger. Une
 * coupure pendant le rechargement laissait alors l'appareil sans coquille, et
 * les autres onglets perdaient leurs fichiers.
 */

const PERIODE_MS = 90_000;
const SIGNAL_USAGE_MS = 5 * 60_000;

/** Dit au service worker quelle version CETTE page exécute, et ce qu'elle a chargé. */
function signalerUsage(): void {
  const v = versionDuDocument();
  const id = v?.deploiement || v?.sha;
  const sw = navigator.serviceWorker?.controller;
  if (!id || !sw) return;
  const racines = new Set<string>();
  document.querySelectorAll<HTMLScriptElement>("script[src]").forEach((s) => racines.add(s.src));
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"][href], link[rel="preload"][href]').forEach((l) => racines.add(l.href));
  const utiles = [...racines].filter((u) => {
    try { const x = new URL(u); return x.origin === location.origin && x.pathname.startsWith("/_next/static/"); } catch { return false; }
  });
  try { sw.postMessage({ type: "VERSION_EN_USAGE", deploiement: id, racines: utiles.slice(0, 400) }); } catch { /* sans effet */ }
}

export function MajAuto() {
  const enCours = useRef(false);
  const pastilleVue = useRef<string | null>(null);
  const echecs = useRef<{ id: string; n: number }>({ id: "", n: 0 });

  useEffect(() => {
    const executee = versionDuDocument();
    if (!executee || executee.env === "local" || executee.env === "development") return; // poste local : rien à surveiller
    let arrete = false;
    const finInteractions = suivreInteractions();

    const proposer = (id: string, prete: boolean) => {
      const cle = `${id}:${prete}`;
      if (pastilleVue.current === cle) return; // une fois par version et par page
      pastilleVue.current = cle;
      try {
        toast(prete ? "Mise à jour prête" : "Mise à jour disponible", {
          id: "tm-maj",
          description: prete
            ? "Elle s'appliquera d'elle-même au prochain moment calme."
            : "Elle n'a pas pu être téléchargée d'avance ; vous pouvez l'appliquer maintenant (réseau requis).",
          duration: 12_000,
          action: {
            label: "Appliquer maintenant",
            onClick: async () => {
              if (location.pathname.startsWith("/projet/")
                && !window.confirm("Recharger l'application maintenant ? Les saisies déjà faites sont conservées et reprendront leur envoi.")) return;
              const refus = await appliquer("manuel");
              if (refus) toast.error(`Mise à jour impossible pour l'instant : ${refus}.`, { id: "tm-maj" });
            },
          },
        });
      } catch { /* sans effet */ }
    };

    const tour = async () => {
      if (arrete || enCours.current) return;
      if (document.visibilityState !== "visible") return;
      enCours.current = true;
      try {
        const e = await verifier();
        if (e.etat === "a-jour" || e.etat === "hors-ligne" || e.etat === "inconnu") return;
        const id = e.disponible?.deploiement || e.disponible?.sha || null;
        if (!id) return;
        const prete = await preparer(e.disponible);
        if (!prete) {
          /* Nouvel essai au prochain tour, rien n'a été modifié. Mais une
             préparation qui échoue sans cesse ne doit pas laisser l'appareil
             des jours sur l'ancien code sans le dire : au troisième échec,
             on propose l'application manuelle (par le réseau). */
          echecs.current = echecs.current.id === id ? { id, n: echecs.current.n + 1 } : { id, n: 1 };
          if (echecs.current.n >= 3) proposer(id, false);
          return;
        }
        const refus = await appliquer("auto");
        if (refus) proposer(id, true);
      } finally {
        enCours.current = false;
      }
    };

    tour();
    signalerUsage();
    const minuterie = setInterval(tour, PERIODE_MS);
    const usage = setInterval(signalerUsage, SIGNAL_USAGE_MS);
    const auRetour = () => { if (document.visibilityState === "visible") { tour(); signalerUsage(); } };
    const auReseau = () => tour();
    /* Un nouveau service worker vient de prendre la main : il ne recharge plus
       les pages lui-même. On lui redit seulement ce que celle-ci utilise. */
    const auMessageSw = (ev: MessageEvent) => { if (ev.data?.type === "SW_ACTIVE") signalerUsage(); };
    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener("focus", auRetour);
    window.addEventListener("online", auReseau);
    navigator.serviceWorker?.addEventListener("message", auMessageSw);
    return () => {
      arrete = true;
      clearInterval(minuterie);
      clearInterval(usage);
      finInteractions();
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("focus", auRetour);
      window.removeEventListener("online", auReseau);
      navigator.serviceWorker?.removeEventListener("message", auMessageSw);
    };
  }, []);

  return null;
}
