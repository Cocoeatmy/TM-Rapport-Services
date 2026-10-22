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

/** Les trois sortes de signalements suivies dans les statistiques : les
    deux natures de défaut, et les pièces manquantes (leur propre liste). */
export type NatureSignalement = NatureDefaut | "piece";

export const LIBELLES_SIGNALEMENT: Record<NatureSignalement, string> = {
  usine: "Défauts d'usine",
  transport: "Dommages de transport",
  piece: "Pièces manquantes",
};

/** Par projet : le NOMBRE de signalements de chaque sorte. */
export type DefautsParProjet = Map<string, Record<NatureSignalement, number>>;

/**
 * @param defauts  la liste « defauts » (défauts signalés, typés)
 * @param pieces   la liste « pieces » (signalements de pièces manquantes)
 */
export function defautsParProjet(
  defauts: SignalementPourStats[],
  pieces: { projectId?: string | null }[] = [],
): DefautsParProjet {
  const m: DefautsParProjet = new Map();
  const e = (id: string) => {
    const x = m.get(id) || { usine: 0, transport: 0, piece: 0 };
    m.set(id, x);
    return x;
  };
  for (const d of defauts) {
    if (!d?.projectId) continue;
    const natures = naturesDefaut(d);
    if (natures.size) natures.forEach((n) => { e(d.projectId)[n] += 1; });
  }
  for (const p of pieces) if (p?.projectId) e(p.projectId).piece += 1;
  return m;
}
