"use client";

/**
 * Les rapports finalisés sans réseau — et leur envoi, plus tard, d'où qu'on soit.
 *
 * ── Le trou que ce fichier bouche ───────────────────────────────────────
 *
 * Le rapport se finalise très bien hors ligne : les heures et le texte
 * partent dans la file, le rapport passe « finalisé — synchronisation en
 * attente ». Mais le PDF et le courriel au client se fabriquent sur le
 * serveur, donc après coup. Et la reprise de cet envoi vivait DANS LA PAGE
 * DU CHANTIER : elle ne se déclenchait que si le monteur rouvrait cette
 * fiche-là, avec du réseau, la file vidée. S'il refermait l'application
 * dans la camionnette, le rapport restait « en attente » pour toujours, et
 * le client ne recevait rien. Personne ne s'en apercevait.
 *
 * Ici, la reprise part de N'IMPORTE OÙ : le bouton de synchro l'appelle à
 * chaque battement (toutes les trente secondes, sur toutes les pages) et au
 * retour du réseau. Elle balaie tous les rapports finalisés non envoyés de
 * l'appareil, et pour chacun dont les photos et les écritures sont arrivées,
 * demande le PDF.
 *
 * ── Prudence sur le double envoi ────────────────────────────────────────
 *
 * Le serveur refuse un second envoi du même chantier dans les trois
 * minutes. On garde donc CINQ minutes entre deux tentatives pour un même
 * rapport : si la première a réussi sans qu'on ait reçu la réponse (réseau
 * coupé juste après), la seconde tombe sous l'anti-doublon serveur… à
 * condition d'arriver dans sa fenêtre. Cinq minutes, c'est hors fenêtre —
 * d'où la règle complémentaire : on marque « envoyé » dès que la réponse
 * est bonne, et JAMAIS on ne réessaie un rapport marqué envoyé.
 */
import { getQueue, isOnline } from "./offline";
import { getPendingUploads } from "./idb-uploads";
import { lireToutesLesFinalisations, marquerEnvoye, type Finalisation } from "./rapport-finalise";

/** Entre deux tentatives pour un MÊME rapport. Supérieur à l'anti-doublon serveur (3 min). */
export const DELAI_ENTRE_TENTATIVES_MS = 5 * 60_000;
/** Au-delà, un rapport finalisé non envoyé est un problème, pas un délai. */
export const SEUIL_BLOCAGE_MS = 24 * 3600_000;

/** Dernière tentative par chantier, pour cet onglet. */
const dernieresTentatives = new Map<string, number>();
let balayageEnCours = false;

export interface RapportEnAttente {
  projectId: string;
  finalisation: Finalisation;
  photosEnAttente: number;
  requetesEnAttente: number;
  /** Depuis combien de temps il attend. */
  depuisMs: number;
  /** Plus de 24 h : à signaler. */
  bloque: boolean;
}

/** Ce qui attend encore sur cet appareil, avec ce qui le retient. */
export async function rapportsEnAttente(maintenant = Date.now()): Promise<RapportEnAttente[]> {
  const finalises = lireToutesLesFinalisations().filter((x) => !x.finalisation.envoye);
  if (finalises.length === 0) return [];
  let uploads: { projectId: string }[] = [];
  try { uploads = await getPendingUploads({ status: "all" }); } catch { /* stockage indisponible */ }
  const file = getQueue();
  return finalises.map(({ projectId, finalisation }) => {
    const depuisMs = maintenant - finalisation.quand;
    return {
      projectId,
      finalisation,
      photosEnAttente: uploads.filter((u) => u.projectId === projectId).length,
      requetesEnAttente: file.filter((i) => String(i.url || "").includes(projectId)).length,
      depuisMs,
      bloque: depuisMs > SEUIL_BLOCAGE_MS,
    };
  });
}

export interface ResultatBalayage {
  examines: number;
  envoyes: string[];
  /** Encore retenus par des photos ou des écritures en attente. */
  retenus: string[];
  /** Tentés, mais le serveur n'a pas répondu bon. */
  echoues: string[];
}

/**
 * Relance ce qui peut l'être. Sans réseau, ne fait rien.
 *
 * `demanderPdf` est injectable pour les tests ; par défaut, c'est le vrai
 * appel au serveur, le même que faisait la page du chantier.
 */
export async function relancerEnvoisDifferes(
  options: {
    maintenant?: number;
    demanderPdf?: (projectId: string, params: string) => Promise<boolean>;
    surEnvoi?: (projectId: string) => void;
  } = {},
): Promise<ResultatBalayage> {
  const resultat: ResultatBalayage = { examines: 0, envoyes: [], retenus: [], echoues: [] };
  if (balayageEnCours || !isOnline()) return resultat;
  balayageEnCours = true;
  const maintenant = options.maintenant ?? Date.now();
  const demander = options.demanderPdf ?? (async (id, params) => {
    const r = await fetch(`/api/pdf/${id}?${params}`);
    return r.ok;
  });

  try {
    const attente = await rapportsEnAttente(maintenant);
    for (const r of attente) {
      resultat.examines += 1;
      if (r.photosEnAttente > 0 || r.requetesEnAttente > 0) {
        resultat.retenus.push(r.projectId);
        continue;
      }
      const derniere = dernieresTentatives.get(r.projectId) || 0;
      if (maintenant - derniere < DELAI_ENTRE_TENTATIVES_MS) continue;
      dernieresTentatives.set(r.projectId, maintenant);

      /* Les paramètres persistés d'abord ; sinon le repli minimal, qui dit au
         moins au serveur qu'il s'agit d'un envoi délibéré. */
      const params = r.finalisation.params || `client=${r.finalisation.client ? "1" : "0"}&send=1`;
      try {
        if (await demander(r.projectId, params)) {
          marquerEnvoye(r.projectId);
          resultat.envoyes.push(r.projectId);
          options.surEnvoi?.(r.projectId);
        } else {
          resultat.echoues.push(r.projectId);
        }
      } catch {
        resultat.echoues.push(r.projectId);
      }
    }
  } finally {
    balayageEnCours = false;
  }
  return resultat;
}

/** Pour les tests : repartir d'un onglet neuf. */
export function oublierLesTentatives(): void {
  dernieresTentatives.clear();
  balayageEnCours = false;
}
