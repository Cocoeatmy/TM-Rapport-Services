"use client";

/**
 * Ce que chaque téléphone dit de lui au bureau — et ce que le bureau peut lui demander.
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────
 *
 * « Il n'a pas pu envoyer ses photos » s'apprenait le lendemain, par
 * hasard, quand le client appelait. L'application savait pourtant tout :
 * combien de photos dormaient dans la file, lesquelles avaient échoué pour
 * de bon, quel rapport attendait son PDF. Elle le savait SUR LE TÉLÉPHONE,
 * et nulle part ailleurs.
 *
 * Toutes les trente secondes, quand l'application est ouverte et en ligne,
 * l'appareil envoie donc un BATTEMENT au serveur : son état, en chiffres.
 * Aucune donnée de chantier n'y transite — des compteurs, des identifiants
 * de projet, des horodatages. Le bureau les voit dans « Signaux » et sur la
 * page Appareils.
 *
 * ── Et dans l'autre sens ────────────────────────────────────────────────
 *
 * La réponse au battement peut porter un SIGNAL : « relance tout ». Le
 * téléphone remet alors en jeu ses échecs, vide ses files et demande les
 * PDF qui attendent. C'est le geste de l'administrateur à distance.
 *
 * Il faut être honnête sur sa portée : une application web fermée ne bat
 * pas. Le signal attend le prochain battement, c'est-à-dire la prochaine
 * ouverture. C'est pourquoi le bureau envoie EN MÊME TEMPS une notification
 * push : touchée, elle rouvre l'application, qui bat, qui lit le signal,
 * qui envoie. Sur iOS, c'est le seul fil qui atteigne une app fermée.
 */
import { getQueue, isOnline, processQueue } from "./offline";
import {
  getPendingUploads, processPendingUploads, resetBackoffForAll, retryAllFailedUploads,
} from "./idb-uploads";
import { lireEtat } from "./offline-prefetch";
import { rapportsEnAttente, relancerEnvoisDifferes } from "./envois-differes";

const CLE_APPAREIL = "tm-appareil-id";
const CLE_SIGNAL_VU = "tm-appareil-signal-vu";

/** Un identifiant stable par navigateur — pas l'User-Agent, que cinq iPhone partagent. */
export function identifiantAppareil(): string {
  if (typeof localStorage === "undefined") return "serveur";
  try {
    let id = localStorage.getItem(CLE_APPAREIL);
    if (!id) {
      id = (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(CLE_APPAREIL, id);
    }
    return id;
  } catch {
    return "sans-stockage";
  }
}

export interface InstantaneAppareil {
  appareil: string;
  /** Le navigateur, en clair, pour reconnaître un iPhone d'un Mac. */
  navigateur: string;
  enLigne: boolean;
  photosEnAttente: number;
  photosEnEchec: number;
  requetesEnAttente: number;
  rapportsNonEnvoyes: { projectId: string; depuis: number; client: boolean; retenuPar: number }[];
  preparesHorsLigne: number;
  preparesQuand: number;
  build: string;
}

/** L'état de l'appareil, en chiffres. Rien d'autre. */
export async function instantane(build = ""): Promise<InstantaneAppareil> {
  let uploads: { status?: string }[] = [];
  try { uploads = await getPendingUploads({ status: "all" }); } catch { /* stockage indisponible */ }
  const attente = await rapportsEnAttente();
  const prep = lireEtat();
  return {
    appareil: identifiantAppareil(),
    navigateur: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 80) : "",
    enLigne: isOnline(),
    photosEnAttente: uploads.filter((u) => u.status !== "permanently-failed").length,
    photosEnEchec: uploads.filter((u) => u.status === "permanently-failed").length,
    requetesEnAttente: getQueue().length,
    rapportsNonEnvoyes: attente.map((r) => ({
      projectId: r.projectId,
      depuis: r.finalisation.quand,
      client: r.finalisation.client,
      retenuPar: r.photosEnAttente + r.requetesEnAttente,
    })),
    preparesHorsLigne: prep.projets,
    preparesQuand: prep.quand,
    build,
  };
}

export interface ReponseBattement {
  ok: boolean;
  /** Un ordre du bureau, s'il y en a un : « relance tout ». */
  signal?: { requestedAt: number; par?: string } | null;
}

/**
 * Relance tout ce qui peut partir. C'est ce que fait le bouton de synchro ;
 * c'est aussi ce que déclenche un signal du bureau.
 */
export async function toutRelancer(): Promise<void> {
  if (!isOnline()) return;
  try { await resetBackoffForAll(); } catch { /* ignore */ }
  try { await retryAllFailedUploads(); } catch { /* ignore */ }
  try { await processQueue(); } catch { /* ignore */ }
  try { await processPendingUploads(); } catch { /* ignore */ }
  try { await relancerEnvoisDifferes(); } catch { /* ignore */ }
}

/**
 * Un battement : envoyer l'état, lire la réponse, obéir au signal.
 *
 * Silencieux par construction : il ne doit jamais gêner le travail. Toute
 * erreur est avalée — le battement suivant arrive dans trente secondes.
 */
export async function battre(build = ""): Promise<ReponseBattement | null> {
  if (!isOnline()) return null;
  try {
    const corps = await instantane(build);
    const r = await fetch("/api/appareils/etat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
      keepalive: true,
    });
    if (!r.ok) return null;
    const reponse = (await r.json()) as ReponseBattement;

    const demande = reponse.signal?.requestedAt || 0;
    if (demande > 0) {
      let vu = 0;
      try { vu = parseInt(localStorage.getItem(CLE_SIGNAL_VU) || "0", 10) || 0; } catch { /* ignore */ }
      if (demande > vu) {
        try { localStorage.setItem(CLE_SIGNAL_VU, String(demande)); } catch { /* ignore */ }
        /* Le signal est pris en compte UNE fois, même si le bureau l'a posé
           avant plusieurs battements : on retient sa date. */
        await toutRelancer();
        /* Et l'on rend compte aussitôt, pour que le bureau voie l'effet
           sans attendre trente secondes. */
        try {
          const apres = await instantane(build);
          await fetch("/api/appareils/etat", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apres), keepalive: true,
          });
        } catch { /* ignore */ }
      }
    }
    return reponse;
  } catch {
    return null;
  }
}
