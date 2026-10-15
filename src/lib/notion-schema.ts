/**
 * Le schéma de la base Notion, lu plutôt que recopié.
 *
 * Jusqu'ici chaque propriété Notion était écrite à la main dans le code :
 * son nom, son type, ses options. Ajouter une colonne dans Notion voulait
 * donc dire modifier l'application — et la page « Nouveau projet » n'en
 * proposait que dix-huit sur cent quarante-deux. D'où l'aller-retour
 * permanent entre les deux outils.
 *
 * On lit désormais le schéma chez Notion. L'application découvre les
 * propriétés, leur type et leurs options ; elle n'a plus à les connaître
 * d'avance.
 *
 * UNE PROPRIÉTÉ SE DÉSIGNE PAR SON IDENTIFIANT, jamais par son nom. Notion
 * garde le même identifiant quand on renomme une colonne : c'est la seule
 * façon qu'un renommage ne casse rien, ne crée pas de doublon et ne fasse
 * pas disparaître une information. Le nom ne sert qu'à l'affichage.
 *
 * Ce que l'API permet réellement, vérifié sur notre base le 16 octobre
 * 2026 et non supposé :
 *
 *   écriture possible   title, rich_text, number, select, multi_select,
 *                       status, date, checkbox, url, email, phone_number,
 *                       people, relation, files, place
 *   lecture seule       formula, rollup, button, created_time, created_by,
 *                       last_edited_time, last_edited_by, unique_id
 *
 * Les deux cas qui surprennent : `place` (l'adresse de chantier, avec ses
 * coordonnées) S'ÉCRIT, alors qu'on pourrait la croire calculée ; et
 * `button` ne se lit ni ne se déclenche — l'API renvoie un objet vide et
 * refuse toute écriture.
 */

/** Types que l'API Notion accepte en écriture. */
export const TYPES_MODIFIABLES = new Set([
  "title", "rich_text", "number", "select", "multi_select", "status",
  "date", "checkbox", "url", "email", "phone_number", "people",
  "relation", "files", "place",
]);

/**
 * Types que l'API ne sait pas écrire, avec la raison à afficher.
 *
 * On ne les cache pas : on les montre en lecture seule, en disant
 * pourquoi. Une propriété passée sous silence est une propriété qu'on
 * croit disparue.
 */
export const RAISON_LECTURE_SEULE: Record<string, string> = {
  formula: "Calculée par Notion",
  rollup: "Calculée à partir d'une autre base",
  button: "Bouton Notion — ne peut être ni lu ni déclenché par l'API",
  created_time: "Date de création, posée par Notion",
  created_by: "Auteur, posé par Notion",
  last_edited_time: "Dernière modification, posée par Notion",
  last_edited_by: "Dernier auteur, posé par Notion",
  unique_id: "Numéro attribué par Notion",
};

export interface OptionChamp {
  id?: string;
  nom: string;
  couleur?: string;
}

export interface ChampNotion {
  /** L'identifiant Notion : stable, insensible aux renommages. */
  id: string;
  /** Le nom affiché, tel qu'il est AUJOURD'HUI dans Notion. */
  nom: string;
  type: string;
  description?: string;
  /** Pour select / multi_select / status. */
  options: OptionChamp[];
  /** Pour status : les options regroupées (À faire / En cours / Terminé). */
  groupes?: { nom: string; options: string[] }[];
  /** Pour relation : la base visée. */
  baseLiee?: string;
  /** Pour formula : l'expression, à titre d'explication. */
  formule?: string;
  /** L'API accepte-t-elle d'écrire ce type ? */
  modifiable: boolean;
  /** Si non : pourquoi, en clair. */
  raison?: string;
}

export interface SchemaNotion {
  baseId: string;
  titre: string;
  champs: ChampNotion[];
  /** Quand le schéma a été relu. */
  luLe: number;
}

/** Forme brute renvoyée par `databases.retrieve`, réduite à l'utile. */
interface BrutProp {
  id: string;
  name?: string;
  type: string;
  description?: unknown;
  select?: { options?: { id?: string; name: string; color?: string }[] };
  multi_select?: { options?: { id?: string; name: string; color?: string }[] };
  status?: {
    options?: { id?: string; name: string; color?: string }[];
    groups?: { name: string; option_ids?: string[] }[];
  };
  relation?: { database_id?: string };
  formula?: { expression?: string };
}

function texteDescription(d: unknown): string | undefined {
  if (typeof d === "string") return d || undefined;
  if (Array.isArray(d)) {
    const t = d.map((x) => (x as { plain_text?: string })?.plain_text || "").join("").trim();
    return t || undefined;
  }
  return undefined;
}

/**
 * Met le schéma brut de Notion en forme, sans rien y ajouter ni en retirer.
 *
 * Toutes les propriétés y figurent — y compris celles que l'API ne sait pas
 * écrire, et y compris celles dont le type n'existait pas encore quand ce
 * code a été écrit. Une propriété inconnue n'est jamais ignorée : elle est
 * marquée non modifiable, avec une raison lisible.
 */
export function normaliserSchema(
  baseId: string,
  titreBrut: unknown,
  proprietes: Record<string, BrutProp>,
  maintenant = Date.now(),
): SchemaNotion {
  const champs: ChampNotion[] = [];
  for (const [nom, p] of Object.entries(proprietes || {})) {
    if (!p?.type) continue;
    const brutOptions =
      p.select?.options || p.multi_select?.options || p.status?.options || [];
    const options: OptionChamp[] = brutOptions.map((o) => ({
      id: o.id, nom: o.name, couleur: o.color,
    }));
    const parId = new Map(brutOptions.map((o) => [o.id, o.name]));
    const groupes = p.status?.groups?.map((g) => ({
      nom: g.name,
      options: (g.option_ids || []).map((i) => parId.get(i) || "").filter(Boolean),
    }));

    const modifiable = TYPES_MODIFIABLES.has(p.type);
    champs.push({
      id: p.id,
      nom: p.name || nom,
      type: p.type,
      description: texteDescription(p.description),
      options,
      groupes: groupes?.length ? groupes : undefined,
      baseLiee: p.relation?.database_id,
      formule: p.formula?.expression,
      modifiable,
      raison: modifiable
        ? undefined
        : RAISON_LECTURE_SEULE[p.type]
          || `Type « ${p.type} » non pris en charge — consultation ou modification indisponible`,
    });
  }
  champs.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  return {
    baseId,
    titre: texteDescription(titreBrut) || "Base de données",
    champs,
    luLe: maintenant,
  };
}

/** Retrouve un champ par son identifiant, puis par son nom en dernier recours. */
export function champPar(
  schema: SchemaNotion | null | undefined,
  idOuNom: string,
): ChampNotion | undefined {
  if (!schema) return undefined;
  return schema.champs.find((c) => c.id === idOuNom)
    || schema.champs.find((c) => c.nom === idOuNom);
}
