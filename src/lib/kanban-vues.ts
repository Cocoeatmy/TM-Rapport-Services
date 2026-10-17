/**
 * Les vues enregistrées : une configuration du Kanban qu'on retrouve d'un clic.
 *
 * Une vue retient tout ce qui compose un regard sur le tableau — la propriété
 * mise en colonnes, les filtres, les couleurs retenues, le tri, les colonnes
 * masquées. Ouvrir « À traiter aujourd'hui » doit donner exactement le même
 * écran qu'hier matin, sans avoir à recomposer six réglages.
 *
 * Les vues fournies d'origine ne sont pas modifiables : elles servent de
 * point de repère, et un utilisateur qui en abîme une ne doit pas se
 * retrouver sans. Il peut en revanche partir de l'une d'elles et enregistrer
 * la sienne.
 */
import {
  FILTRES_VIDES, REGLAGES_COLONNES_PAR_DEFAUT,
  type Filtres, type ReglagesColonnes, type Vue,
} from "./kanban";

export interface VueEnregistree {
  id: string;
  nom: string;
  vue: Vue;
  filtres: Filtres;
  reglages: ReglagesColonnes;
  /** Fournie avec l'application : on peut s'en servir, pas la modifier. */
  integree?: boolean;
}

function v(
  id: string,
  nom: string,
  vue: Vue,
  filtres: Partial<Filtres> = {},
  reglages: Partial<ReglagesColonnes> = {},
): VueEnregistree {
  return {
    id,
    nom,
    vue,
    filtres: { ...FILTRES_VIDES, ...filtres },
    reglages: { ...REGLAGES_COLONNES_PAR_DEFAUT, ...reglages },
    integree: true,
  };
}

/**
 * Les vues fournies.
 *
 * Chacune répond à une question qu'on se pose vraiment le matin, et aucune
 * n'invente de critère : toutes se composent des filtres qui existent.
 */
export const VUES_INTEGREES: VueEnregistree[] = [
  v("tous", "Tous les projets", "mesures"),
  v("aujourdhui", "À traiter aujourd'hui", "mesures",
    { mesPriorites: true },
    { masquerVides: true, tri: "recent" }),
  v("urgents", "Projets urgents", "mesures",
    { indicateurs: ["urgent"] },
    { masquerVides: true }),
  v("relancer", "Projets à relancer", "cmd",
    { indicateurs: ["relancer"] },
    { masquerVides: true }),
  v("bloques", "Projets bloqués", "cmd",
    { indicateurs: ["bloque"] },
    { masquerVides: true }),
  v("sans-responsable", "Projets sans responsable", "mesures",
    { sansResponsable: true },
    { masquerVides: true }),
  v("mesures-a-organiser", "Mesures à organiser", "mesures",
    {},
    { masquerVides: true, tri: "ancien" }),
  v("commandes", "Commandes à effectuer", "cmd",
    {},
    { masquerVides: true, tri: "ancien" }),
];

/** La vue « Mes projets », qui dépend de qui regarde. */
export function vueMesProjets(prenom: string): VueEnregistree {
  return {
    ...v("mes-projets", "Mes projets", "mesures", { collaborateur: prenom }, { masquerVides: true }),
    integree: true,
  };
}

/* ───────────────────────────────────────────────────────────────────────────
   Les vues de l'utilisateur
   ─────────────────────────────────────────────────────────────────────────── */

export const CLE_VUES = "tm-kanban-vues";

export function lireVues(): VueEnregistree[] {
  try {
    const brut = localStorage.getItem(CLE_VUES);
    if (!brut) return [];
    const liste = JSON.parse(brut);
    if (!Array.isArray(liste)) return [];
    /* On complète ce qui manque : une vue enregistrée avant l'ajout d'un
       filtre ne doit pas faire planter l'écran, elle doit simplement ignorer
       le filtre qu'elle ne connaît pas. */
    return liste
      .filter((x) => x?.id && x?.nom)
      .map((x) => ({
        id: String(x.id),
        nom: String(x.nom),
        vue: x.vue === "cmd" ? "cmd" : "mesures",
        filtres: { ...FILTRES_VIDES, ...(x.filtres || {}) },
        reglages: { ...REGLAGES_COLONNES_PAR_DEFAUT, ...(x.reglages || {}) },
      }));
  } catch {
    return [];
  }
}

export function ecrireVues(liste: VueEnregistree[]): void {
  try {
    localStorage.setItem(CLE_VUES, JSON.stringify(liste.filter((x) => !x.integree)));
  } catch { /* stockage indisponible : la vue vit le temps de la session */ }
}

/** Un identifiant stable et lisible, dérivé du nom. */
export function idDepuisNom(nom: string): string {
  return (
    nom
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || `vue-${Date.now()}`
  );
}
