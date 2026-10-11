/**
 * Les chantiers terminés qu'aucune facture ne couvre, en fiches de rappel.
 *
 * C'est la liste la plus chère de l'app : un montage posé, encaissé nulle
 * part. Elle existe parce que ni Notion ni bexio ne peuvent la produire seuls
 * — Notion ignore la facturation, bexio ignore qu'un chantier a eu lieu.
 *
 * UNE SEULE SITUATION y entre : « aucune facture trouvée » (`sans`). Le
 * rapprochement sait aussi dire « probable » ou « même montant, même client »,
 * et ces cas-là n'ont rien à faire ici : la première version de l'analyse
 * annonçait cent cinquante-cinq chantiers et soixante-huit mille francs
 * manquants ; après vérification il en restait six, pour dix mille. Une liste
 * de tâches qui se trompe vingt fois sur vingt-et-un ne se lit plus au bout
 * d'une semaine. Mieux vaut six lignes vraies que cent cinquante prudentes.
 *
 * De même, une décision prise à la main dans l'app — facturé au client final,
 * payé en main propre, offert — sort le chantier de la liste : c'est
 * exactement ce que l'automatisme ne pouvait pas savoir.
 */

import {
  type Rappel, type OptionsRappels,
  ageEnJours, prioriteSelonAge, court, francs, jourSuisse,
} from "@/lib/rappels";

/** Un chantier terminé, vu par le rapprochement bexio. */
export interface ChantierAFacturer {
  id: string;
  ofrTM?: string;
  projet?: string;
  nomChantier?: string;
  adresseChantier?: string;
  nbCabines?: number;
  dateMontage?: string | null;
  collaborateurs?: string;
  /** État du rapprochement : seul « sans » donne lieu à un rappel. */
  etat: string;
  /** L'offre bexio retrouvée pour ce n° TM. */
  offre?: { nr: string; total: number; date: string } | null;
}

export { prioriteSelonAge };

/** Date de montage en millisecondes — base de l'ancienneté. */
function instantMontage(iso: string | null | undefined): number | undefined {
  const j = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(j)) return undefined;
  const t = Date.parse(`${j}T12:00:00Z`);
  return Number.isFinite(t) ? t : undefined;
}

/** Met un chantier non facturé en fiche de rappel. */
export function enRappelFacture(c: ChantierAFacturer, o: OptionsRappels): Rappel {
  const maintenant = o.maintenant ?? Date.now();
  const origine = o.origine.replace(/\/+$/, "");
  const tm = String(c.ofrTM || "").split(/[\n,;]+/)[0].trim();
  const chantier = c.projet || c.nomChantier || "Chantier sans nom";
  const montant = c.offre?.total || 0;
  const jours = ageEnJours(instantMontage(c.dateMontage), maintenant);
  const url = `${origine}/projet/${c.id}?mode=dashboard`;

  const tete = tm || court(chantier, 22);
  const titre = `${tete} · À facturer${montant > 0 ? ` — CHF ${francs(montant)}` : ""}`;

  const l: string[] = [];
  /* Le lien d'abord : le champ « URL » de l'app Rappels n'est pilotable par
     rien, la note l'est — et Rappels y rend les adresses cliquables. */
  l.push(`→ Ouvrir le chantier : ${url}`);
  l.push("");
  l.push(`Chantier : ${chantier}`);
  if (c.adresseChantier && c.adresseChantier.trim()) l.push(`Adresse : ${c.adresseChantier.trim()}`);
  if (tm) l.push(`N° OFR : ${tm}`);
  if (c.offre?.nr) {
    const d = jourSuisse(c.offre.date);
    l.push(`Offre bexio n° ${c.offre.nr}${d ? ` du ${d}` : ""}${montant > 0 ? ` — CHF ${francs(montant)}` : ""}`);
  }
  if (c.nbCabines) l.push(`Cabines : ${c.nbCabines}`);
  if (c.collaborateurs && c.collaborateurs.trim()) l.push(`Monteurs : ${c.collaborateurs.trim()}`);
  const dm = jourSuisse(c.dateMontage);
  if (dm) {
    l.push(`Montage terminé le ${dm}${jours > 0 ? ` (il y a ${jours} jour${jours > 1 ? "s" : ""})` : ""}`);
  }

  l.push("");
  /* Dire sur quoi l'alerte se fonde, et ce qui la ferait disparaître : sans
     cela, on ne sait pas s'il faut facturer ou corriger une saisie. */
  l.push("Aucune facture bexio ne correspond à ce chantier :");
  l.push("ni par le titre, ni par le montant, ni par le client.");
  l.push("");
  l.push("Facture-le dans bexio et le rappel se cochera tout seul.");
  l.push("S'il ne doit pas être facturé (client final, main propre, offert),");
  l.push("note-le sur la page Facturation de l'app : il sortira de la liste.");
  l.push("");
  const cle = `tm:facture:${c.id}`;
  l.push(`[${cle}]`);

  return { cle, titre, notes: l.join("\n"), url, priorite: prioriteSelonAge(jours) };
}

/**
 * La liste, du plus ancien montage au plus récent.
 *
 * Le plus vieux en haut : plus un chantier s'éloigne, moins le client se
 * souvient, et plus la facture est difficile à faire passer.
 */
export function listeDesFactures(
  chantiers: ChantierAFacturer[],
  o: OptionsRappels,
): Rappel[] {
  return chantiers
    .filter((c) => c.etat === "sans")
    .sort((a, b) => String(a.dateMontage || "").localeCompare(String(b.dateMontage || "")))
    .map((c) => enRappelFacture(c, o));
}
