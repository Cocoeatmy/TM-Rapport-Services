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
  /** Quand le signalement a été fait (ms). */
  timestamp?: number | null;
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

/** Par projet : le NOMBRE de signalements de chaque sorte, et leurs dates
    (AAAA-MM-JJ, "" si inconnue) pour les compter dans une période. */
export type DefautsParProjet = Map<string, Record<NatureSignalement, number> & { dates: Record<NatureSignalement, string[]> }>;

const jourDe = (t?: number | null) => (t && Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : "");

/** Nombre de signalements d'une sorte dont la date tombe entre les bornes
    (bornes absentes = tout ; date inconnue = comptée seulement sans bornes). */
export function signalementsDansPeriode(
  e: { dates: Record<NatureSignalement, string[]> } | undefined,
  n: NatureSignalement,
  bornes?: { de?: string; a?: string },
): number {
  if (!e) return 0;
  if (!bornes?.de && !bornes?.a) return e.dates[n].length;
  return e.dates[n].filter((d) => d && (!bornes.de || d >= bornes.de) && (!bornes.a || d <= bornes.a)).length;
}

/**
 * @param defauts  la liste « defauts » (défauts signalés, typés)
 * @param pieces   la liste « pieces » (signalements de pièces manquantes)
 */
export function defautsParProjet(
  defauts: SignalementPourStats[],
  pieces: { projectId?: string | null; timestamp?: number | null }[] = [],
): DefautsParProjet {
  const m: DefautsParProjet = new Map();
  const e = (id: string) => {
    const x = m.get(id) || { usine: 0, transport: 0, piece: 0, dates: { usine: [], transport: [], piece: [] } };
    m.set(id, x);
    return x;
  };
  for (const d of defauts) {
    if (!d?.projectId) continue;
    const natures = naturesDefaut(d);
    natures.forEach((n) => { const x = e(d.projectId); x[n] += 1; x.dates[n].push(jourDe(d.timestamp)); });
  }
  for (const p of pieces) {
    if (!p?.projectId) continue;
    const x = e(p.projectId);
    x.piece += 1;
    x.dates.piece.push(jourDe(p.timestamp));
  }
  return m;
}
