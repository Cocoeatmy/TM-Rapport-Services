// Constantes partagées dans toute l'app

export const COLLABORATEURS_LIST = ["Micael", "Claudio", "Jean-Marc", "Jacobo", "Miguel", "Loïc"] as const;

/** Prénoms exclus des montages "Team" (administrateurs non-monteurs).
 *  Les nouveaux collaborateurs monteurs ajoutés via l'interface admin
 *  reçoivent automatiquement les montages Team sans modification ici. */
export const TEAM_EXCLUDED_COLLABORATORS = ["Micael"] as const;

export const STATUS_CMD_COLORS: Record<string, string> = {
  "Cabines en CMD": "bg-gray-100 text-gray-700",
  "Cabines à recevoir": "bg-yellow-100 text-yellow-800",
  "Livraison partielle": "bg-orange-100 text-orange-800",
  "Cabine à aller chercher": "bg-blue-100 text-blue-800",
  "Récéptionné - RDV à fixer": "bg-blue-100 text-blue-800",
  "RDV - fixé": "bg-green-100 text-green-800",
  "RDV - Attendre news": "bg-purple-100 text-purple-800",
  "Montage partiel": "bg-amber-100 text-amber-800",
  "Soucis montage": "bg-red-100 text-red-800",
};

export const STATUS_MESURES_COLORS: Record<string, string> = {
  "Pas contacté": "bg-gray-100 text-gray-700",
  "Contact sans réponse": "bg-yellow-100 text-yellow-800",
  "OFR envoyée sans mesures": "bg-cyan-100 text-cyan-800",
  "Mesures non relevées - attendre news": "bg-orange-100 text-orange-800",
  "RDV - Fixé": "bg-green-100 text-green-800",
  "RDV - Attendre news": "bg-purple-100 text-purple-800",
  "Mesures partielles": "bg-amber-100 text-amber-800",
  "Mesures relevées - attente news": "bg-blue-100 text-blue-800",
};

export const STATUS_SORT_ORDER: Record<string, number> = {
  "Montage partiel": 1,
  "Livraison partielle": 2,
  "Cabine à aller chercher": 3,
  "Récéptionné - RDV à fixer": 4,
  "RDV - Attendre news": 5,
  "Cabines à recevoir": 6,
  "Soucis montage": 7,
};

export const STATUS_MESURES_SORT_ORDER: Record<string, number> = {
  "RDV - Fixé": 1,
  "RDV - Attendre news": 2,
  "Contact sans réponse": 3,
  "Pas contacté": 4,
  "Mesures partielles": 5,
  "Mesures relevées - attente news": 6,
  "OFR envoyée sans mesures": 7,
  "Mesures non relevées - attendre news": 8,
};

/** Item d'une section de check-list. L'id sert de clé de stockage
 *  d'état (cochée / pas cochée) et reste stable même si le label change. */
export interface ChecklistItem {
  id: string;
  label: string;
}

/** Section thématique de la check-list. */
export interface ChecklistSection {
  id: string;
  icon: string;
  title: string;
  items: ChecklistItem[];
}

/** Check-list officielle du montage cabine de douche, organisée en
 *  sections. Mise à jour 2026 : regroupe ce qui était auparavant
 *  des items séparés "Duka" en sections génériques (alignement,
 *  joints magnétiques, charnières) qui s'appliquent à tous les
 *  fournisseurs. */
export const BASE_CHECKLIST_SECTIONS: ChecklistSection[] = [
  {
    id: "avant-intervention",
    icon: "✅",
    title: "Avant intervention",
    items: [
      { id: "controle-avant", label: "Contrôle de l'état avant intervention" },
      { id: "verification-mesures", label: "Vérification des mesures avant montage" },
      { id: "controle-niveaux", label: "Contrôle des niveaux (horizontal / vertical)" },
    ],
  },
  {
    id: "preparation",
    icon: "🧱",
    title: "Préparation du chantier",
    items: [
      { id: "protection-sol", label: "Protection du sol mise en place" },
      { id: "deballage-controle", label: "Déballage et contrôle visuel des éléments" },
      { id: "pieces-completes", label: "Toutes les pièces sont présentes" },
    ],
  },
  {
    id: "montage",
    icon: "🛠️",
    title: "Montage",
    items: [
      { id: "alignement-rails", label: "Alignement des rails vérifié" },
      { id: "tolerances-fabricant", label: "Respect des tolérances fabricant" },
      { id: "parallelisme", label: "Vérification du parallélisme des éléments" },
      { id: "stabilite", label: "Stabilité générale de la structure" },
    ],
  },
  {
    id: "reglages",
    icon: "🚪",
    title: "Réglages",
    items: [
      { id: "porte-reglage", label: "Porte(s) réglée(s) et fonctionnelle(s)" },
      { id: "verification-jeux", label: "Vérification des jeux (aucun frottement)" },
      { id: "tension-charnieres", label: "Tension des charnières vérifiée" },
      { id: "joints-magnetiques", label: "Joints magnétiques vérifiés" },
      { id: "butees-amortisseurs", label: "Réglage des butées / amortisseurs (si présents)" },
    ],
  },
  {
    id: "etancheite",
    icon: "💧",
    title: "Étanchéité",
    items: [
      { id: "joints-silicone-conforme", label: "Application des joints silicone conforme" },
      { id: "silicone-int-ext", label: "Respect silicone intérieur / extérieur selon norme" },
    ],
  },
  {
    id: "finitions",
    icon: "🧼",
    title: "Finitions",
    items: [
      { id: "vitrages-propres", label: "Vitrages nettoyés" },
      { id: "retrait-films", label: "Retrait des films de protection" },
      { id: "nettoyage-traces", label: "Nettoyage des traces (silicone, poussière, doigts)" },
      { id: "controle-visuel-finitions", label: "Contrôle visuel (rayures, éclats, défauts)" },
    ],
  },
  {
    id: "fin-chantier",
    icon: "🧹",
    title: "Fin de chantier",
    items: [
      { id: "nettoyage-zone", label: "Nettoyage de la zone de travail effectué" },
      { id: "evacuation-dechets", label: "Évacuation des déchets" },
      { id: "zone-utilisable", label: "Zone laissée propre et utilisable" },
    ],
  },
  {
    id: "suivi-client",
    icon: "📋",
    title: "Suivi / client",
    items: [
      { id: "photos-fin-chantier", label: "Photos de fin de chantier" },
      { id: "explication-utilisation", label: "Explication au client : utilisation" },
      { id: "explication-entretien", label: "Explication au client : entretien" },
      { id: "explication-sechage", label: "Explication au client : temps de séchage silicone" },
      { id: "validation-signature", label: "Validation / signature client (si nécessaire)" },
    ],
  },
];

/** Liste plate des items pour compatibilité avec les callers qui
 *  ne consomment pas la structure en sections. */
export const BASE_CHECKLIST_ITEMS: ChecklistItem[] = BASE_CHECKLIST_SECTIONS.flatMap((s) => s.items);

/**
 * Retourne la check-list complète pour un fournisseur.
 * Depuis la refonte 2026, les items sont déjà génériques — la notion
 * de "checklist par fournisseur" n'a plus d'extras. La signature est
 * conservée pour ne pas casser les imports existants.
 */
export function getChecklistForSupplier(_fournisseur?: string): ChecklistItem[] {
  return BASE_CHECKLIST_ITEMS;
}

/** Retourne les sections complètes pour un fournisseur. */
export function getChecklistSectionsForSupplier(_fournisseur?: string): ChecklistSection[] {
  return BASE_CHECKLIST_SECTIONS;
}

/** @deprecated Use getChecklistForSupplier() instead */
export const CHECKLIST_ITEMS = BASE_CHECKLIST_ITEMS;
/** @deprecated Anciennement utilisé pour des items spécifiques par
 *  fournisseur. Conservé vide pour compatibilité de code legacy. */
export const SUPPLIER_CHECKLIST_ITEMS: Record<string, ChecklistItem[]> = {};

export const RAPPORT_OPTIONS_SINGLE = [
  "L'installation s'est déroulée sans encombre.",
  "Nous avons rencontré quelques difficultés à l'assemblage de la cabine.",
  "Client présent lors du montage, travaux validés par client.",
  "Personne sur site lors du montage.",
];

export const RAPPORT_OPTIONS_MULTI = [
  "Les installations se sont déroulées sans encombre.",
  "Nous avons rencontré quelques difficultés à l'assemblage de la cabine.",
  "Client présent lors des montages, travaux validés par client.",
  "Personne sur site lors du montage.",
];

export const RAPPORT_OPTIONS_CABINE = [
  "L'installation s'est déroulée sans encombre.",
  "Nous avons rencontré quelques difficultés à l'assemblage de la cabine.",
];

export function formatDateFR(dateStr: string | null): string {
  if (!dateStr) return "Non planifié";
  const d = new Date(dateStr);
  const datePart = d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" });
  if (dateStr.includes("T")) {
    const timePart = d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
    return `${datePart} à ${timePart}`;
  }
  return datePart;
}

export function formatDateLong(dateStr: string | null): string {
  if (!dateStr) return "Non planifié";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

/** Numéro de semaine ISO 8601 (1 à 53). Les semaines commencent le lundi,
 *  la semaine 1 est celle qui contient le 1er jeudi de l'année. */
export function getISOWeek(d: Date = new Date()): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Aligne sur le jeudi le plus proche (jour médian de la semaine ISO).
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}
