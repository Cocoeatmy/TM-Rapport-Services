"use client";

/**
 * Les autorisations du compte connecté, côté écran.
 *
 * Elles servent à ne pas proposer un bouton qui finira par un refus. Elles ne
 * protègent rien : la décision appartient aux contrôles posés devant chaque
 * opération, côté serveur. Si ce crochet se trompe, on verra un bouton de
 * trop ; si le serveur se trompait, on ouvrirait une porte.
 *
 * Tant que la réponse n'est pas arrivée, tout est considéré comme autorisé :
 * le cas de loin le plus fréquent, et un écran qui se vide une seconde avant
 * de se remplir est pire qu'un bouton qui s'efface discrètement.
 */
import { useEffect, useState } from "react";

type Niveau = "oui" | "lecture" | "non";

interface MesDroits {
  email: string;
  nom: string;
  profil: string;
  perimetre: "siens" | "tous";
  droits: Record<string, Niveau>;
}

let enCache: MesDroits | null = null;
let enCours: Promise<MesDroits | null> | null = null;

async function charger(): Promise<MesDroits | null> {
  if (enCache) return enCache;
  if (!enCours) {
    enCours = fetch("/api/droits/moi", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MesDroits | null) => { enCache = d; return d; })
      .catch(() => null)
      .finally(() => { enCours = null; });
  }
  return enCours;
}

/** Oublie la réponse en cache : après un changement de droits, ou de compte. */
export function oublierMesDroits(): void {
  enCache = null;
}

export function useDroits() {
  const [mes, setMes] = useState<MesDroits | null>(enCache);

  useEffect(() => {
    let vivant = true;
    charger().then((d) => { if (vivant && d) setMes(d); });
    return () => { vivant = false; };
  }, []);

  return {
    mes,
    /** Avant la réponse : on suppose autorisé — voir l'en-tête du fichier. */
    peut: (id: string, mini: "lecture" | "oui" = "oui") => {
      if (!mes) return true;
      const n = mes.droits[id] ?? "non";
      if (n === "non") return false;
      return mini === "lecture" ? true : n === "oui";
    },
  };
}
