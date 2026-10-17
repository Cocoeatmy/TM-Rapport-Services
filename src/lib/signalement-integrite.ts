/**
 * Un signalement envoyé plusieurs fois ne doit faire qu'un signalement.
 *
 * Le 15 octobre 2026, un seul constat de Jean-Marc — « Aimant cassé », trois
 * photos — s'est inscrit DOUZE fois sur le chantier Costa SA. Et chaque fois
 * que Micael en effaçait un, il en revenait un autre.
 *
 * Le trajet d'un signalement explique les deux.
 *
 * L'enregistrement est long : le serveur relit la liste entière depuis
 * Notion, la réécrit bloc par bloc, puis reconstruit le texte de la fiche.
 * Le téléphone, lui, coupe au bout de vingt-cinq secondes. Il croit alors
 * l'envoi perdu, le range dans sa file, et le rejoue à la prochaine
 * occasion — alors que le premier avait abouti. Le serveur, n'ayant aucun
 * moyen de reconnaître la même demande, en inscrit un second. Puis un
 * troisième. Les horodatages le disent : 12 h 00, 12 h 03, 12 h 08.
 *
 * Et la file ne se vide pas : tant que le téléphone n'a pas reçu un accusé
 * de réception, il garde la demande. Effacer le signalement ne touche pas à
 * cette file — le rejeu suivant le recrée. D'où le compteur qui MONTE
 * pendant qu'on supprime.
 *
 * Deux garde-fous, donc, et ils vont ensemble :
 *
 *   RECONNAÎTRE LA MÊME DEMANDE — pour répondre « c'est déjà fait » au lieu
 *   d'inscrire un doublon ;
 *
 *   SE SOUVENIR DE CE QU'ON A EFFACÉ — pour qu'une demande rejouée après
 *   coup ne ressuscite pas ce que quelqu'un a volontairement supprimé.
 *
 * Tout est ici, en fonctions pures : c'est la seule façon d'en écrire les
 * règles noir sur blanc et de les vérifier.
 */

export interface SoumissionSignalement {
  /** Fabriqué par le téléphone depuis le 15 octobre 2026. Absent avant. */
  id?: string;
  projectId?: string;
  user?: string;
  description?: string;
  types?: string[];
  typesLabel?: string;
  photoUrls?: string[];
  cabineIdx?: number;
  cabineLabel?: string;
  timestamp?: number;
}

/** Une suppression dont on garde la trace, pour qu'elle tienne. */
export interface PierreTombale {
  id: string;
  empreinte: string;
  quand: number;
  par?: string;
}

/**
 * Deux envois séparés par plus de ça ne sont plus tenus pour le même — sauf
 * si leurs photos sont identiques, ce qui ne laisse aucun doute (voir plus
 * bas). Deux heures couvrent largement une file qui traîne depuis le
 * sous-sol d'un chantier.
 */
export const FENETRE_REJEU_MS = 2 * 60 * 60 * 1000;

/**
 * Combien de temps on se souvient d'une suppression.
 *
 * Assez longtemps pour couvrir la durée de vie d'une file d'attente — deux
 * semaines — avec une marge confortable. Au-delà, plus personne ne rejoue
 * quoi que ce soit, et la liste n'a pas à grossir indéfiniment.
 */
export const DUREE_PIERRE_TOMBALE_MS = 120 * 24 * 60 * 60 * 1000;

function net(v: unknown): string {
  return String(v ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * La signature du CONTENU d'un signalement.
 *
 * Elle ignore ce qui change d'un rejeu à l'autre — l'identifiant, l'heure
 * d'arrivée — et retient ce que le monteur a réellement saisi. L'ordre des
 * photos ne compte pas : seule leur liste compte.
 *
 * Le lot en fait partie. Deux douches peuvent très bien avoir le même aimant
 * cassé : ce sont deux constats, pas un doublon, et rien ne doit les
 * confondre.
 */
export function empreinteSignalement(s: SoumissionSignalement): string {
  const types = [...(s.types || [])].map(net).filter(Boolean).sort();
  const photos = [...(s.photoUrls || [])].map((u) => String(u || "").trim()).filter(Boolean).sort();
  return [
    net(s.projectId),
    /* L'AUTEUR N'EN FAIT PAS PARTIE, et c'est une correction du 17 octobre
       2026. Il y figurait, et cela cassait silencieusement les pierres
       tombales : à la suppression, l'empreinte était calculée sur
       l'enregistrement rangé — qui porte un auteur, posé par le serveur — et
       au rejeu sur le corps envoyé par le téléphone, qui n'en porte pas. Les
       deux ne se ressemblaient donc jamais, et un signalement effacé pouvait
       revenir dès que le client rejouait sans identifiant.

       Le retirer ne rend pas l'empreinte trop large : deux personnes qui
       décrivent le même défaut, sur le même lot, avec les mêmes photos, dans
       la même fenêtre de deux heures, signalent la même chose. */
    net(s.description),
    types.join(","),
    net(s.typesLabel),
    s.cabineIdx ?? "",
    net(s.cabineLabel),
    photos.join(","),
  ].join("|");
}

/** Les photos de deux envois sont-elles exactement les mêmes, et non vides ? */
function memesPhotos(a: SoumissionSignalement, b: SoumissionSignalement): boolean {
  const pa = [...(a.photoUrls || [])].filter(Boolean).sort();
  const pb = [...(b.photoUrls || [])].filter(Boolean).sort();
  return pa.length > 0 && pa.length === pb.length && pa.every((u, i) => u === pb[i]);
}

export type MotifRejeu = "identifiant" | "photos-identiques" | "contenu-recent";

export interface Rejeu<T> {
  existant: T;
  motif: MotifRejeu;
}

/**
 * Cet envoi est-il le rejeu d'un signalement déjà enregistré ?
 *
 * Trois façons de le reconnaître, de la plus sûre à la plus prudente :
 *
 *   • L'IDENTIFIANT. Le téléphone le fabrique une fois et le renvoie à
 *     chaque tentative. C'est la preuve directe, sans limite de temps.
 *
 *   • LES PHOTOS. Chaque envoi vers Cloudinary produit des adresses neuves :
 *     deux constats distincts ne peuvent pas porter exactement les mêmes.
 *     Des photos identiques signifient donc le même envoi, aussi vieux
 *     soit-il. C'est ce qui rattrape les téléphones restés sur l'ancienne
 *     version, qui n'envoient pas d'identifiant.
 *
 *   • LE CONTENU, et seulement pour un envoi SANS identifiant — donc venu
 *     d'un ancien téléphone — dans les deux heures. Une version à jour
 *     envoie toujours son identifiant : un monteur qui saisit volontairement
 *     deux fois le même constat ne passe jamais par ce chemin, et ses deux
 *     constats sont conservés.
 */
export function rejeuDe<T extends SoumissionSignalement>(
  existants: T[],
  entrant: SoumissionSignalement,
  maintenant: number,
): Rejeu<T> | null {
  const id = String(entrant.id || "").trim();
  if (id) {
    const parId = existants.find((x) => String(x.id || "").trim() === id);
    if (parId) return { existant: parId, motif: "identifiant" };
  }

  const memeProjet = existants.filter((x) => net(x.projectId) === net(entrant.projectId));

  const parPhotos = memeProjet.find((x) => memesPhotos(x, entrant));
  if (parPhotos) return { existant: parPhotos, motif: "photos-identiques" };

  if (!id) {
    const empreinte = empreinteSignalement(entrant);
    const recent = memeProjet.find(
      (x) =>
        empreinteSignalement(x) === empreinte &&
        maintenant - (x.timestamp || 0) <= FENETRE_REJEU_MS,
    );
    if (recent) return { existant: recent, motif: "contenu-recent" };
  }

  return null;
}

/**
 * Cet envoi vient-il ressusciter un signalement effacé ?
 *
 * On reconnaît une suppression par l'identifiant, ou — pour les envois sans
 * identifiant — par l'empreinte du contenu, à condition que des photos y
 * figurent : sans elles, l'empreinte ne distingue pas deux constats que le
 * monteur aurait vraiment voulu saisir deux fois.
 */
export function pierreTombaleDe(
  tombes: PierreTombale[],
  entrant: SoumissionSignalement,
): PierreTombale | null {
  const id = String(entrant.id || "").trim();
  if (id) {
    const parId = tombes.find((t) => t.id === id);
    if (parId) return parId;
  }
  if ((entrant.photoUrls || []).filter(Boolean).length > 0) {
    const empreinte = empreinteSignalement(entrant);
    const parEmpreinte = tombes.find((t) => t.empreinte === empreinte);
    if (parEmpreinte) return parEmpreinte;
  }
  return null;
}

/** Oublie les suppressions trop vieilles pour que quiconque les rejoue. */
export function purgerPierresTombales(
  tombes: PierreTombale[],
  maintenant: number,
): PierreTombale[] {
  return tombes.filter((t) => maintenant - (t.quand || 0) <= DUREE_PIERRE_TOMBALE_MS);
}

export interface GroupeDoublons<T> {
  empreinte: string;
  /** Le plus ancien : celui que le monteur a réellement créé. */
  original: T;
  /** Les rejeux du même envoi, à supprimer après validation. */
  rejeux: T[];
}

/**
 * Les doublons déjà enregistrés, pour un audit — JAMAIS pour une suppression
 * automatique.
 *
 * On ne regroupe que ce qui ne laisse aucun doute : même projet et mêmes
 * photos, à l'adresse près. Deux constats qui se ressemblent mais portent
 * des photos différentes restent deux constats, quoi qu'en dise leur texte.
 * Un signalement sans photo n'est jamais regroupé ici : on ne peut pas
 * trancher, et devant le doute on garde.
 */
export function doublonsAvere<T extends SoumissionSignalement>(liste: T[]): GroupeDoublons<T>[] {
  const paquets = new Map<string, T[]>();
  for (const s of liste) {
    const photos = [...(s.photoUrls || [])].filter(Boolean).sort();
    if (photos.length === 0) continue;
    const cle = `${net(s.projectId)}|${photos.join(",")}`;
    if (!paquets.has(cle)) paquets.set(cle, []);
    (paquets.get(cle) as T[]).push(s);
  }
  const groupes: GroupeDoublons<T>[] = [];
  for (const [cle, membres] of paquets) {
    if (membres.length < 2) continue;
    const tries = [...membres].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    groupes.push({ empreinte: cle, original: tries[0], rejeux: tries.slice(1) });
  }
  return groupes;
}
