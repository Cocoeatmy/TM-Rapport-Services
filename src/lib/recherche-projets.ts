/**
 * Retrouver un projet à partir de n'importe quoi.
 *
 * Ce code vivait caché dans `page.tsx`, où lui seul pouvait s'en servir. Le
 * Kanban en a besoin aussi, et recopier un moteur de recherche est le plus sûr
 * moyen d'avoir un jour deux comportements différents pour la même frappe. Il
 * est donc sorti ici, tel quel, et les deux écrans l'appellent.
 *
 * Deux règles, toutes deux voulues :
 *   — insensible à la casse ET aux accents, parce que « corminboeuf » doit
 *     trouver « Corminbœuf » et que personne ne tape les accents dans une
 *     barre de recherche ;
 *   — multi-mots en ET, dans n'importe quel ordre, et les mots peuvent tomber
 *     dans des propriétés différentes : « getaz lausanne » trouve le projet
 *     dont le grossiste est Getaz et le chantier à Lausanne.
 */
import type { Project } from "./notion";

/** Minuscules, sans accents, avec « œ » ramené à « oe ». */
export function foldSearch(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    /* « œ » et « æ » survivent à la décomposition NFD : ce sont des lettres à
       part entière, pas des lettres accentuées. Sans cette ligne, « coeur »
       ne trouvait pas « cœur » — ni « Corminbœuf ». */
    .replace(/œ/gi, "oe")
    .replace(/æ/gi, "ae")
    .toLowerCase();
}

/**
 * Le texte dans lequel on cherche, pour un projet donné.
 *
 * Volontairement limité aux informations qui servent à RETROUVER un dossier.
 * Y verser toutes les propriétés rendrait la recherche bruyante — et y verser
 * les colonnes financières la rendrait indiscrète.
 */
export function indexDeProjet(p: Project): string {
  return foldSearch(
    [
      p.projet,
      p.ofrTM,
      p.ofrGrossiste,
      p.nomChantier,
      p.adresseChantier,
      p.cmdTM,
      p.cmdTMUsine,
      p.cmdGrossiste,
      p.cmdFournisseurs,
      p.servCmdFournisseurs,
      p.servMesuresFournisseurs,
      p.bonLivraison,
      p.collaborateurs,
      p.contacts,
      p.emplacementCabine,
      ...(p.fournisseurs || []),
      ...(p.fournisseursNames || []),
      ...(p.grossistesNames || []),
      ...(p.sanitaireNames || []),
      ...(p.seriesCabines || []),
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/**
 * Le projet répond-il à la recherche ?
 *
 * `index` est le texte pré-calculé par `indexDeProjet` : avec plusieurs
 * centaines de cartes et une recherche qui se relance à chaque lettre, le
 * recalculer à chaque frappe se sent tout de suite.
 */
export function correspond(p: Project, q: string, index?: string): boolean {
  const mots = foldSearch(q).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return true;
  const foin = index ?? indexDeProjet(p);
  return mots.every((m) => foin.includes(m));
}
