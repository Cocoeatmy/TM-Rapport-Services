// Préférences d'e-mails de notification (réservées aux admin).
// Chaque catégorie d'e-mail informatif peut être activée / désactivée.
// Par défaut TOUT est désactivé pour l'admin (ferreira@…) : les e-mails de
// notification ne partent que si l'admin a explicitement coché la case.
// Les rapports quotidiens des COLLABORATEURS restent activés par défaut
// (ils n'ont pas d'interface de réglage) — voir `defaultOn` à l'appel.
import { getData, getDataFresh, setData } from "@/lib/kv-store";

export interface EmailCategory {
  id: string;
  label: string;
  desc: string;
}

// Source unique des catégories (renvoyée au client par l'API).
export const EMAIL_CATEGORIES: EmailCategory[] = [
  { id: "rapport_genere",    label: "Rapport de montage envoyé",       desc: "Copie quand un rapport est envoyé au client (bouton « Envoyer »)." },
  { id: "rapport_envoye",    label: "Confirmation d'envoi",             desc: "Accusé « Rapport envoyé » lorsqu'un collaborateur envoie un rapport." },
  { id: "rapport_consulte",  label: "Rapport consulté par le client",   desc: "Quand un client ouvre le rapport PDF ou son portail." },
  { id: "modifications",     label: "Modifications sur l'app",          desc: "Signalements, pièces, défauts… modifiés par un collaborateur." },
  { id: "rapport_quotidien", label: "Rapport quotidien (matin)",        desc: "Récapitulatif des montages du jour." },
  { id: "rapport_hebdo",     label: "Rapport hebdomadaire",             desc: "Récapitulatif hebdomadaire des montages." },
];

interface PrefRow { email: string; cats: Record<string, boolean>; }
const KEY = "email-prefs";
const norm = (e: string) => (e || "").trim().toLowerCase();

async function readRows(fresh = false): Promise<PrefRow[]> {
  try { return fresh ? await getDataFresh<PrefRow>(KEY) : await getData<PrefRow>(KEY); }
  catch { return []; }
}

/** Préférences enregistrées pour un e-mail donné (vide = aucune enregistrée). */
export async function getEmailPrefsFor(email: string): Promise<Record<string, boolean>> {
  const rows = await readRows(true);
  return rows.find((r) => norm(r.email) === norm(email))?.cats || {};
}

/** Enregistre (remplace) les préférences d'un e-mail. */
export async function setEmailPrefsFor(email: string, cats: Record<string, boolean>): Promise<void> {
  const rows = await readRows(true);
  const clean: Record<string, boolean> = {};
  for (const c of EMAIL_CATEGORIES) clean[c.id] = cats[c.id] === true;
  const i = rows.findIndex((r) => norm(r.email) === norm(email));
  if (i >= 0) rows[i] = { email: norm(email), cats: clean };
  else rows.push({ email: norm(email), cats: clean });
  await setData(KEY, rows);
}

/**
 * Faut-il envoyer l'e-mail de catégorie `cat` à `email` ?
 * `defaultOn` = valeur par défaut si l'utilisateur n'a rien enregistré
 * (false pour l'admin, true pour un collaborateur sur les rapports quotidiens).
 */
export async function emailEnabled(email: string, cat: string, defaultOn: boolean): Promise<boolean> {
  try {
    const rows = await readRows(false); // cache 60 s : OK pour un garde d'envoi
    const row = rows.find((r) => norm(r.email) === norm(email));
    const v = row?.cats?.[cat];
    return typeof v === "boolean" ? v : defaultOn;
  } catch {
    return defaultOn;
  }
}
