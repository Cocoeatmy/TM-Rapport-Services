/**
 * Le périmètre appliqué côté serveur, devant chaque liste de projets.
 *
 * Masquer des projets à l'écran n'est pas une restriction : l'adresse reste
 * joignable et l'application elle-même l'appelle en clair. Le filtre vit donc
 * ici, entre la donnée et la réponse.
 *
 * ── Le piège du cache partagé ──────────────────────────────────────────────
 *
 * Les listes sont servies avec `s-maxage` : le CDN de Vercel en garde une
 * copie pour TOUT LE MONDE. Filtrer sans y penser aurait servi la liste
 * réduite d'un monteur au suivant, ou l'inverse — une restriction qui fuit
 * dans les deux sens.
 *
 * D'où la règle : tant que la personne voit « tous » les projets — c'est le
 * cas par défaut, et celui de tous les comptes aujourd'hui — on ne touche à
 * RIEN, pas même aux en-têtes, et le cache partagé continue de faire son
 * travail. Ce n'est que pour un compte restreint qu'on filtre, et la réponse
 * devient alors privée.
 */
import { getUser } from "./auth";
import { droitsDe } from "./droits-serveur";
import { filtrerPerimetre, type Perimetre, type PorteurDeCollaborateurs } from "./perimetre-projets";
import { NextResponse } from "next/server";
import { cachedJson, type EdgeCacheOptions } from "./edge-cache";

export interface Restriction {
  /** Le nom du compte, pour reconnaître ses chantiers. */
  nom: string;
  perimetre: Perimetre;
  /** Vrai dès qu'il faut filtrer — donc ne plus mettre en cache partagé. */
  restreint: boolean;
}

/**
 * Ce que la session impose, s'il y a une session.
 *
 * Sans session — lien signé, tâche planifiée — on ne restreint pas : ces
 * chemins ont leurs propres contrôles, et les soumettre au périmètre d'un
 * utilisateur qui n'existe pas n'aurait aucun sens.
 */
export async function restrictionDeLaSession(): Promise<Restriction | null> {
  const user = await getUser();
  if (!user) return null;
  const d = await droitsDe(user);
  return {
    nom: user.name || user.email,
    perimetre: d.perimetre,
    restreint: d.perimetre !== "tous",
  };
}

export interface ListeFiltree<T> {
  projets: T[];
  restreint: boolean;
  /** Combien ont été retirés — utile aux journaux, jamais caché. */
  masques: number;
}

/** Applique le périmètre de la session à une liste de projets. */
export async function filtrerListe<T extends PorteurDeCollaborateurs>(
  projets: T[],
): Promise<ListeFiltree<T>> {
  const r = await restrictionDeLaSession();
  if (!r || !r.restreint) return { projets, restreint: false, masques: 0 };
  const gardes = filtrerPerimetre(projets, r.nom, r.perimetre);
  return { projets: gardes, restreint: true, masques: projets.length - gardes.length };
}

/**
 * Ce projet précis est-il visible par la session ?
 *
 * Utilisé devant la fiche d'un projet et devant son écriture : une liste
 * filtrée ne sert à rien si l'adresse directe reste ouverte.
 */
export async function projetVisible(
  projet: PorteurDeCollaborateurs | null | undefined,
): Promise<boolean> {
  if (!projet) return true; // rien à protéger ; la route rendra son 404
  const r = await restrictionDeLaSession();
  if (!r || !r.restreint) return true;
  return filtrerPerimetre([projet], r.nom, r.perimetre).length === 1;
}

/* ───────────────────────────────────────────────────────────────────────────
   La réponse d'une liste de projets
   ─────────────────────────────────────────────────────────────────────────── */

/**
 * Rend une liste de projets en respectant le périmètre de la session.
 *
 * Compte non restreint — le cas de tous les comptes aujourd'hui : la réponse
 * est EXACTEMENT celle d'avant, en-têtes de cache compris. Aucune requête
 * supplémentaire, aucune perte de performance.
 *
 * Compte restreint : la liste est filtrée et la réponse devient privée. Elle
 * ne peut alors plus être servie à quelqu'un d'autre par le CDN — ce qui, à
 * l'inverse, est précisément ce qui serait arrivé si on avait filtré sans
 * toucher aux en-têtes.
 */
export async function reponseProjets<T extends PorteurDeCollaborateurs>(
  projets: T[],
  options: EdgeCacheOptions = {},
): Promise<NextResponse> {
  const { projets: gardes, restreint, masques } = await filtrerListe(projets);
  if (!restreint) return cachedJson(projets, options);
  if (masques > 0) {
    console.log(`[perimetre] ${masques} projet(s) masqué(s) pour cette session`);
  }
  return NextResponse.json(gardes, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * Ce projet, désigné par son identifiant, est-il accessible ?
 *
 * La lecture du projet ne part QUE si la session est restreinte. Sans cette
 * précaution, le contrôle ajoutait un aller-retour Notion à chaque écriture
 * — y compris sur le chemin des heures et des photos, et y compris pour les
 * comptes qui voient tout. On ne fait pas payer à tout le monde une
 * restriction que personne n'a demandée.
 */
export async function accesProjetAutorise(
  id: string,
  lire: (id: string) => Promise<PorteurDeCollaborateurs | null>,
): Promise<boolean> {
  const r = await restrictionDeLaSession();
  if (!r || !r.restreint) return true;
  const projet = await lire(id).catch(() => null);
  if (!projet) return true; // introuvable : la route rendra son propre 404
  return filtrerPerimetre([projet], r.nom, r.perimetre).length === 1;
}
