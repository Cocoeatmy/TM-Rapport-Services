/**
 * L'état des appareils, côté serveur : où il est rangé, et sous quelle forme.
 *
 * Partagé par la route du battement (ce que les téléphones déposent) et la
 * route d'administration (ce que le bureau lit et les signaux qu'il pose).
 * Les deux doivent parler du même hachage Redis et de la même forme : c'est
 * ici, et nulle part ailleurs, pour qu'elles ne puissent pas diverger.
 *
 * Un fichier de route n'est pas un module d'utilitaires — Next restreint
 * ses exports — d'où cette bibliothèque à part.
 */
import { redisEnabled, redisHGetAll, redisHSet } from "./redis-cache";

export const CLE_APPAREILS = "appareils";
export const CLE_SIGNAUX = "appareils-signaux";

/** Au-delà, un appareil qui ne bat plus n'est plus un appareil : il n'est plus affiché. */
export const PEREMPTION_APPAREIL_MS = 14 * 24 * 3600_000;
/** Au-delà, un rapport finalisé non envoyé est un problème, pas un délai. */
export const SEUIL_BLOCAGE_MS = 24 * 3600_000;

export interface RapportNonEnvoye {
  projectId: string;
  /** Quand le monteur l'a finalisé. */
  depuis: number;
  client: boolean;
  /** Photos + écritures qui le retiennent encore. 0 = ne tient qu'au PDF. */
  retenuPar: number;
}

export interface EtatAppareil {
  appareil: string;
  email: string;
  nom: string;
  role: string;
  navigateur: string;
  enLigne: boolean;
  photosEnAttente: number;
  photosEnEchec: number;
  requetesEnAttente: number;
  rapportsNonEnvoyes: RapportNonEnvoye[];
  preparesHorsLigne: number;
  preparesQuand: number;
  build: string;
  /** Dernier battement, horloge du serveur. */
  vu: number;
}

export interface SignalAppareil {
  requestedAt: number;
  par: string;
}

/* Repli sans Redis : la mémoire de l'instance. Suffisant pour le poste de
   développement, insuffisant en production — Redis y est actif, et la
   réponse du battement dit explicitement quand on est en repli. */
const memoire: Record<string, Map<string, string>> = {
  [CLE_APPAREILS]: new Map(),
  [CLE_SIGNAUX]: new Map(),
};

export async function lireHash(cle: string): Promise<Record<string, string>> {
  if (redisEnabled) {
    try { return await redisHGetAll(cle); } catch { /* Redis muet : repli */ }
  }
  return Object.fromEntries(memoire[cle] || new Map());
}

export async function ecrireChamp(cle: string, champ: string, valeur: string): Promise<void> {
  if (redisEnabled) {
    try { await redisHSet(cle, champ, valeur); return; } catch { /* repli */ }
  }
  (memoire[cle] ||= new Map()).set(champ, valeur);
}

/** Pour les tests : repartir à vide. */
export function viderLaMemoire(): void {
  for (const m of Object.values(memoire)) m.clear();
}

/** Les appareils connus, les plus récents d'abord, sans les disparus. */
export async function listerAppareils(maintenant = Date.now()): Promise<EtatAppareil[]> {
  const brut = await lireHash(CLE_APPAREILS);
  const out: EtatAppareil[] = [];
  for (const v of Object.values(brut)) {
    try {
      const e = JSON.parse(v) as EtatAppareil;
      if (e && typeof e.vu === "number" && maintenant - e.vu <= PEREMPTION_APPAREIL_MS) out.push(e);
    } catch { /* une entrée illisible ne bloque pas la liste */ }
  }
  return out.sort((a, b) => b.vu - a.vu);
}

/** Ce que le bureau doit voir d'un coup d'œil. */
export function resumer(appareils: EtatAppareil[], maintenant = Date.now()) {
  let photosEnAttente = 0, photosEnEchec = 0, requetesEnAttente = 0, rapportsNonEnvoyes = 0;
  const bloques: { appareil: string; nom: string; projectId: string; depuis: number; retenuPar: number }[] = [];
  for (const a of appareils) {
    photosEnAttente += a.photosEnAttente;
    photosEnEchec += a.photosEnEchec;
    requetesEnAttente += a.requetesEnAttente;
    rapportsNonEnvoyes += a.rapportsNonEnvoyes.length;
    for (const r of a.rapportsNonEnvoyes) {
      if (maintenant - r.depuis > SEUIL_BLOCAGE_MS) {
        bloques.push({ appareil: a.appareil, nom: a.nom, projectId: r.projectId, depuis: r.depuis, retenuPar: r.retenuPar });
      }
    }
  }
  return { appareils: appareils.length, photosEnAttente, photosEnEchec, requetesEnAttente, rapportsNonEnvoyes, bloques };
}
