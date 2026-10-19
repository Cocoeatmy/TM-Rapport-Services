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
import { memeVersion, normaliserVersion, versionNativePlusAncienne, type VersionWeb } from "./version-web";

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
  /** La version Web que l'onglet qui a battu exécute (balise tm-version). */
  versionWeb?: VersionWeb | null;
  /** L'app Apple, si c'en est une : ce que son pont a dit d'elle. */
  natif?: SuiviNatif | null;
  plateforme?: Plateforme;
  /** Système vu par le navigateur, quand l'app native ne l'a pas dit. */
  systemeNavigateur?: string | null;
  maj?: { etat: string; verifieLe: number | null } | null;
  /** Dernier battement, horloge du serveur. */
  vu: number;
}

export const PLATEFORMES = ["iPhone", "iPad", "Mac", "Windows", "Android", "Linux", "autre"] as const;
export type Plateforme = typeof PLATEFORMES[number];

export interface SuiviNatif {
  coque: string | null;
  build: string | null;
  systeme: string | null;
  versionSysteme: string | null;
  modele: string | null;
}

export const ETATS_MAJ = ["a-jour", "disponible", "preparation", "prete", "en-attente-synchro", "hors-ligne", "inconnu"] as const;

const court = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;

/**
 * Ce que le battement dit de la version et de l'appareil, validé champ par
 * champ : types, longueurs, valeurs permises. Rien d'autre n'est recopié —
 * ni nom d'appareil, ni identifiant matériel.
 */
export function validerSuivi(corps: Record<string, unknown>): Pick<EtatAppareil, "versionWeb" | "natif" | "plateforme" | "systemeNavigateur" | "maj"> {
  const n = corps.natif && typeof corps.natif === "object" ? corps.natif as Record<string, unknown> : null;
  const natif: SuiviNatif | null = n ? {
    coque: court(n.coque, 16), build: court(n.build, 16), systeme: court(n.systeme, 16),
    versionSysteme: court(n.versionSysteme, 16), modele: court(n.modele, 16),
  } : null;
  const p = court(corps.plateforme, 10);
  const m = corps.maj && typeof corps.maj === "object" ? corps.maj as Record<string, unknown> : null;
  const etat = court(m?.etat, 24);
  return {
    versionWeb: normaliserVersion(corps.versionWeb),
    natif: natif && Object.values(natif).some(Boolean) ? natif : null,
    plateforme: (PLATEFORMES as readonly string[]).includes(p || "") ? p as Plateforme : "autre",
    systemeNavigateur: court(corps.systemeNavigateur, 24),
    maj: m ? {
      etat: etat && (ETATS_MAJ as readonly string[]).includes(etat) ? etat : "inconnu",
      verifieLe: typeof m.verifieLe === "number" && Number.isFinite(m.verifieLe) ? Math.floor(m.verifieLe) : null,
    } : null,
  };
}

/** Au-delà, ce qu'on affiche d'un appareil est son « dernier état connu ». */
export const DERNIER_ETAT_CONNU_MS = 30 * 60_000;

export type StatutVersion = "a-jour" | "web-en-retard" | "natif-ancien" | "inconnu";

/**
 * Où en est un appareil, vu du bureau. Comparaison PAR IDENTITÉ avec la
 * version que sert le déploiement qui répond — jamais par ordre de libellé.
 */
export function statutVersion(a: Pick<EtatAppareil, "versionWeb" | "natif" | "build">, disponible: VersionWeb | null, coqueMinimum: string): StatutVersion {
  if (a.natif?.coque && versionNativePlusAncienne(a.natif.coque, coqueMinimum) === true) return "natif-ancien";
  const executee = a.versionWeb ?? (a.build ? normaliserVersion({ sha: a.build }) : null);
  const meme = memeVersion(executee, disponible);
  if (meme === null) return "inconnu";
  return meme ? "a-jour" : "web-en-retard";
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
