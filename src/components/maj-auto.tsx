"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getQueue } from "@/lib/offline";

/**
 * Mise à jour automatique de l'app installée.
 *
 * Sur iPhone, l'app ajoutée à l'écran d'accueil pouvait tourner des jours sur un
 * ancien bundle : le service worker sert la coquille HTML en cache dès que le
 * réseau dépasse son délai (6 s), et cette coquille référence les anciens
 * fichiers JS, servis eux aussi depuis le cache. Les données arrivaient fraîches
 * mais le CODE restait vieux — le tableau de bord affichait alors d'autres
 * chiffres que sur le Mac, sans aucun moyen de s'en apercevoir.
 *
 * On compare donc la version inscrite dans la page (`<meta name="tm-build">`,
 * donc celle du bundle réellement exécuté) à la version déployée (/api/build).
 * Si elles diffèrent, on purge la coquille et les fichiers du build, puis on
 * recharge.
 *
 * Le rechargement attend un moment propice : jamais pendant une saisie, jamais
 * s'il reste des modifications à envoyer. Et une seule tentative par version,
 * pour qu'un cas limite ne puisse pas boucler.
 */

const PERIODE_MS = 90_000;

function versionEmbarquee(): string {
  return (
    document.querySelector('meta[name="tm-build"]')?.getAttribute("content") || ""
  );
}

/** Recharger sous les doigts de quelqu'un n'est jamais acceptable. */
function momentPropice(): boolean {
  const actif = document.activeElement as HTMLElement | null;
  if (actif) {
    const t = actif.tagName;
    if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || actif.isContentEditable) return false;
  }
  try {
    if (getQueue().length > 0) return false; // envois en attente : on ne risque rien
  } catch {}
  return true;
}

/** Vide la coquille HTML et les fichiers du build (les données restent en cache). */
async function purgeCoquille(): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => null);
  const sw = reg?.active;
  if (!sw) return;
  await new Promise<void>((fini) => {
    const secours = setTimeout(fini, 2000);
    const ecoute = (e: MessageEvent) => {
      if (e.data?.type === "APP_SHELL_PURGED") {
        clearTimeout(secours);
        navigator.serviceWorker.removeEventListener("message", ecoute);
        fini();
      }
    };
    navigator.serviceWorker.addEventListener("message", ecoute);
    sw.postMessage({ type: "PURGE_APP_SHELL" });
  });
  await reg!.update().catch(() => {});
}

export function MajAuto() {
  const enCours = useRef(false);

  useEffect(() => {
    const embarquee = versionEmbarquee();
    if (!embarquee || embarquee === "dev") return; // dev local : rien à surveiller
    let arrete = false;

    const verifie = async () => {
      if (arrete || enCours.current) return;
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      let deployee = "";
      try {
        const r = await fetch("/api/build", { cache: "no-store" });
        if (!r.ok) return;
        deployee = (await r.json())?.build || "";
      } catch {
        return; // hors-ligne ou session expirée : on ne touche à rien
      }
      if (!deployee || deployee === "dev" || deployee === embarquee) return;
      if (!momentPropice()) return; // on retentera au prochain passage
      try {
        if (sessionStorage.getItem("tm-maj") === deployee) return; // déjà tenté
        sessionStorage.setItem("tm-maj", deployee);
      } catch {}
      enCours.current = true;
      try { toast.loading("Nouvelle version — mise à jour…", { id: "tm-maj", duration: 4000 }); } catch {}
      await purgeCoquille();
      location.reload();
    };

    verifie();
    const minuterie = setInterval(verifie, PERIODE_MS);
    const auRetour = () => { if (document.visibilityState === "visible") verifie(); };
    document.addEventListener("visibilitychange", auRetour);
    window.addEventListener("focus", auRetour);
    return () => {
      arrete = true;
      clearInterval(minuterie);
      document.removeEventListener("visibilitychange", auRetour);
      window.removeEventListener("focus", auRetour);
    };
  }, []);

  return null;
}
