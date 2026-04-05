// Constantes partagées dans toute l'app

export const COLLABORATEURS_LIST = ["Micael", "Claudio", "Jean-Marc", "Jacobo", "Miguel", "Loïc"] as const;

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

export const CHECKLIST_ITEMS = [
  { id: "protection-sol", label: "Protection du sol mise en place" },
  { id: "verification-mesures", label: "Vérification des mesures avant montage" },
  { id: "pieces-completes", label: "Toutes les pièces sont présentes" },
  { id: "fixation-murale", label: "Fixations murales posées et vérifiées" },
  { id: "etancheite", label: "Étanchéité vérifiée (joints silicone)" },
  { id: "porte-reglage", label: "Porte(s) réglée(s) et fonctionnelle(s)" },
  { id: "vitrages-propres", label: "Vitrages nettoyés" },
  { id: "evacuation-eau", label: "Évacuation d'eau testée" },
  { id: "nettoyage-chantier", label: "Nettoyage du chantier effectué" },
  { id: "emballages-evacues", label: "Emballages évacués" },
  { id: "fonctionnement-client", label: "Fonctionnement expliqué au client" },
  { id: "photos-prises", label: "Photos avant/après prises" },
];

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
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateLong(dateStr: string | null): string {
  if (!dateStr) return "Non planifié";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
