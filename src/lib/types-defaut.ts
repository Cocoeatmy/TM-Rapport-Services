/**
 * La nature d'un signalement, pour les statistiques (22.10.2026).
 *
 * Les dégâts se lisent dans les SIGNALEMENTS, type « Défaut d'usine » ou
 * « Dommage de transport » — jamais dans les photos « État des cartons
 * réceptionnés » : un carton abîmé n'est pas forcément une cabine abîmée, et
 * la statistique qui s'y fiait était fausse d'office.
 *
 * Le formulaire standard enregistre les identifiants (« usine »,
 * « transport »), un formulaire personnalisé les libellés : on reconnaît les
 * deux, accents et majuscules ignorés.
 */

export type NatureDefaut = "usine" | "transport";

export interface SignalementPourStats {
  projectId: string;
  types?: string[] | null;
  typesLabel?: string | null;
  cabineIdx?: number | null;
  cabineLabel?: string | null;
}

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function naturesDefaut(d: SignalementPourStats): Set<NatureDefaut> {
  const out = new Set<NatureDefaut>();
  const morceaux = [...(d.types || []), ...String(d.typesLabel || "").split(",")].map((x) => sansAccent(String(x)));
  for (const t of morceaux) {
    if (t === "usine" || t.includes("defaut d'usine") || t.includes("defaut d usine")) out.add("usine");
    if (t === "transport" || t.includes("dommage de transport")) out.add("transport");
  }
  return out;
}

/** Par projet et par nature : les lots touchés (un signalement sans lot
    compte pour un lot à lui seul). */
export type DefautsParProjet = Map<string, Record<NatureDefaut, Set<string>>>;

export function defautsParProjet(liste: SignalementPourStats[]): DefautsParProjet {
  const m: DefautsParProjet = new Map();
  liste.forEach((d, i) => {
    if (!d?.projectId) return;
    const natures = naturesDefaut(d);
    if (!natures.size) return;
    const lot = d.cabineIdx ? `lot-${d.cabineIdx}` : d.cabineLabel ? `nom-${d.cabineLabel}` : `sans-lot-${i}`;
    const e = m.get(d.projectId) || { usine: new Set<string>(), transport: new Set<string>() };
    natures.forEach((n) => e[n].add(lot));
    m.set(d.projectId, e);
  });
  return m;
}
