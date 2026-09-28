/**
 * Ce que les pièces manquantes font attendre.
 *
 * Les signalements de pièces vivent dans l'application, pas dans Notion, et
 * aucune statistique ne les regardait. Ils disent pourtant quelque chose que
 * rien d'autre ne dit : un chantier bloqué, une cabine inachevée, un client
 * qui patiente — et un fournisseur qui met trois semaines là où un autre en
 * met trois.
 *
 * Deux mesures, et elles ne se valent pas :
 *
 *   • CE QUI ATTEND — l'âge des pièces encore ouvertes. Disponible tout de
 *     suite, sur tout l'historique, parce que la date du signalement a
 *     toujours été enregistrée. C'est aussi la seule qui appelle une action.
 *   • CE QUE ÇA A PRIS — le délai entre le signalement et la réception. Il
 *     n'existe que depuis qu'on horodate le règlement : les pièces réglées
 *     avant n'ont pas de date de clôture et sont donc comptées à part, jamais
 *     mélangées à la moyenne.
 */

export interface Signalement {
  id: string;
  projectId: string;
  projectName?: string;
  description?: string;
  reference?: string;
  cabineLabel?: string;
  status?: "demande" | "commande" | "recu";
  resolved?: boolean;
  timestamp: number;
  resolvedAt?: number;
}

export interface LigneAttente {
  /** Fournisseur, ou « Non renseigné ». */
  cle: string;
  /** Pièces encore en attente. */
  ouvertes: number;
  /** Âge de la plus ancienne, en jours. */
  plusAncienne: number;
  /** Âge médian des pièces ouvertes, en jours. */
  ageMedian: number;
  /** Chantiers concernés — c'est le vrai coût, pas le nombre de pièces. */
  chantiers: number;
  /** Pièces réglées dont on connaît la durée d'attente. */
  regleesMesurees: number;
  /** Jours médians entre le signalement et la réception, ou null. */
  delaiMedian: number | null;
  /** Les pièces ouvertes, de la plus ancienne à la plus récente. */
  details: { id: string; projectId: string; projet: string; quoi: string; jours: number }[];
}

function mediane(v: number[]): number | null {
  if (v.length === 0) return null;
  const t = [...v].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
}

function estOuverte(s: Signalement): boolean {
  return !(s.status === "recu" || s.resolved === true);
}

/** Au-dessous, une médiane de délai ne dit rien. */
const MINIMUM_REGLEES = 3;

/**
 * Regroupe les signalements par fournisseur du chantier.
 *
 * @param fournisseurDe  Fournisseur d'un projet, par son identifiant. Les
 *                       signalements ne portent pas cette information : elle
 *                       vit sur le projet.
 */
export function attentePieces(
  signalements: Signalement[],
  fournisseurDe: (projectId: string) => string,
  maintenant: Date = new Date(),
): LigneAttente[] {
  const jours = (t: number) => Math.max(0, Math.floor((maintenant.getTime() - t) / 86400000));

  const brut = new Map<string, {
    ouvertes: Signalement[];
    delais: number[];
    chantiers: Set<string>;
  }>();

  signalements.forEach((s) => {
    if (!s || !s.timestamp) return;
    const cle = fournisseurDe(s.projectId) || "Non renseigné";
    const cur = brut.get(cle) || { ouvertes: [], delais: [], chantiers: new Set<string>() };
    if (estOuverte(s)) {
      cur.ouvertes.push(s);
      cur.chantiers.add(s.projectId);
    } else if (s.resolvedAt && s.resolvedAt > s.timestamp) {
      /* Seules les pièces réglées DEPUIS l'horodatage comptent : les autres
         n'ont pas de date de clôture, et inventer une durée serait pire que
         ne rien dire. */
      cur.delais.push(Math.max(0, Math.floor((s.resolvedAt - s.timestamp) / 86400000)));
    }
    brut.set(cle, cur);
  });

  return [...brut.entries()]
    .filter(([, v]) => v.ouvertes.length > 0 || v.delais.length > 0)
    .map(([cle, v]) => {
      const ages = v.ouvertes.map((s) => jours(s.timestamp));
      return {
        cle,
        ouvertes: v.ouvertes.length,
        plusAncienne: ages.length ? Math.max(...ages) : 0,
        ageMedian: mediane(ages) ?? 0,
        chantiers: v.chantiers.size,
        regleesMesurees: v.delais.length,
        delaiMedian: v.delais.length >= MINIMUM_REGLEES ? mediane(v.delais) : null,
        details: v.ouvertes
          .map((s) => ({
            id: s.id,
            projectId: s.projectId,
            projet: s.projectName || "Sans nom",
            quoi: [s.cabineLabel, s.description || s.reference].filter(Boolean).join(" — ") || "pièce",
            jours: jours(s.timestamp),
          }))
          .sort((a, b) => b.jours - a.jours),
      };
    })
    /* Le plus vieux en tête : c'est lui qu'on appelle en premier. */
    .sort((a, b) => b.plusAncienne - a.plusAncienne || b.ouvertes - a.ouvertes);
}
