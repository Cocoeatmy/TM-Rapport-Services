/**
 * Le suivi des appels d'un chantier « à fixer » (22.10.2026).
 *
 * Pour fixer un rendez-vous, on appelle — souvent plusieurs fois. Rien dans
 * Notion ne le comptait : le « Journal des échanges » le racontait en texte
 * libre, quand on y pensait. Chaque appel noté ici devient un ÉVÉNEMENT
 * (quand, qui, quelle issue), conservé dans le magasin de l'app (adossé à
 * Notion, voir kv-store) ET recopié en clair dans le journal Notion du projet :
 * la trace se lit des deux côtés et ne peut pas se perdre.
 *
 * Ce fichier ne contient que des règles pures — testées.
 */

export const ISSUES_APPEL = {
  "sans-reponse": "Appel sans réponse",
  message: "Message laissé (combox)",
  sms: "SMS / e-mail envoyé",
  rappeler: "À rappeler",
  joint: "Client joint",
} as const;

export type IssueAppel = keyof typeof ISSUES_APPEL;

export function estIssue(v: unknown): v is IssueAppel {
  return typeof v === "string" && v in ISSUES_APPEL;
}

export interface Appel {
  id: string;
  /** Instant de l'appel (ISO). */
  le: string;
  /** Noté après coup (appel passé en voiture, noté au bureau) : l'instant
      de la saisie, quand il s'écarte de plus de 5 min de l'appel. */
  saisiLe?: string | null;
  issue: IssueAppel;
  /** « À rappeler » : le jour convenu (AAAA-MM-JJ). */
  rappelLe?: string | null;
  note?: string | null;
  par: string;
  /** La liste d'où l'appel a été noté (montage, mesures, services, sav). */
  liste?: string | null;
}

export interface SuiviProjet {
  projectId: string;
  appels: Appel[];
}

export type TonAppel = "aucun" | "essai1" | "essai2" | "essai3" | "message" | "rappel" | "rappel-retard" | "joint";

export interface ResumeAppels {
  ton: TonAppel;
  /** Texte court de la colonne. */
  libelle: string;
  /** Petite précision (quand). */
  quand: string;
  /** Tentatives sans contact depuis le dernier « joint ». */
  tentatives: number;
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** « 22.10 » */
export function jourCourt(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return Number.isNaN(d.getTime()) ? "" : `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`;
}

/** « il y a 3 h », « hier », « il y a 4 j » — pour la colonne. */
export function depuis(iso: string, maintenant = Date.now()): string {
  const ms = maintenant - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const min = Math.round(ms / 60_000);
  if (min < 60) return min <= 1 ? "à l'instant" : `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const j = Math.round(h / 24);
  return j === 1 ? "hier" : `il y a ${j} j`;
}

/**
 * Ce que la colonne dit d'un chantier, d'après ses appels (du plus ancien au
 * plus récent). Les tentatives se comptent depuis le dernier contact réussi :
 * un client joint la semaine passée puis injoignable trois fois cette semaine,
 * c'est « 3× sans réponse ».
 */
export function resumerAppels(appels: Appel[], maintenant = Date.now()): ResumeAppels {
  const tries = [...appels].sort((a, b) => a.le.localeCompare(b.le));
  if (tries.length === 0) return { ton: "aucun", libelle: "Noter un appel", quand: "", tentatives: 0 };
  const dernier = tries[tries.length - 1];
  let tentatives = 0;
  for (let i = tries.length - 1; i >= 0 && tries[i].issue !== "joint"; i--) {
    if (tries[i].issue !== "rappeler") tentatives++;
  }
  const quand = depuis(dernier.le, maintenant);
  if (dernier.issue === "joint") return { ton: "joint", libelle: `Joint le ${jourCourt(dernier.le)}`, quand, tentatives: 0 };
  if (dernier.issue === "rappeler" && dernier.rappelLe) {
    const aujourdhui = new Date(maintenant);
    const auj = `${aujourdhui.getFullYear()}-${p2(aujourdhui.getMonth() + 1)}-${p2(aujourdhui.getDate())}`;
    const retard = dernier.rappelLe < auj;
    return {
      ton: retard ? "rappel-retard" : "rappel",
      libelle: retard ? `Rappel du ${jourCourt(dernier.rappelLe)} en retard` : `Rappeler le ${jourCourt(dernier.rappelLe)}`,
      quand: tentatives ? `${tentatives} essai${tentatives > 1 ? "s" : ""} avant` : "",
      tentatives,
    };
  }
  if (dernier.issue === "message" || dernier.issue === "sms") {
    return { ton: "message", libelle: `${dernier.issue === "sms" ? "Écrit" : "Message laissé"} · ${tentatives} essai${tentatives > 1 ? "s" : ""}`, quand, tentatives };
  }
  const ton: TonAppel = tentatives >= 3 ? "essai3" : tentatives === 2 ? "essai2" : "essai1";
  return { ton, libelle: `${tentatives}× sans réponse`, quand, tentatives };
}

/** La ligne recopiée dans le journal Notion : « 22.10.26 - 16h31 : Appel sans réponse ». */
export function ligneJournal(a: Appel, fuseau = "Europe/Zurich"): string {
  /* Écrite par le SERVEUR, qui vit en UTC : l'heure suisse est demandée
     explicitement, sinon le journal annonçait 14h31 pour un appel de 16h31. */
  const parts = Object.fromEntries(new Intl.DateTimeFormat("fr-CH", {
    timeZone: fuseau, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(a.le)).map((x) => [x.type, x.value]));
  const date = `${parts.day}.${parts.month}.${parts.year}`;
  const heure = `${parts.hour}h${parts.minute}`;
  let texte: string = ISSUES_APPEL[a.issue];
  if (a.issue === "rappeler" && a.rappelLe) texte += ` le ${jourCourt(a.rappelLe)}`;
  if (a.note) texte += ` — ${a.note}`;
  /* Ni l'auteur ni l'heure de saisie dans la ligne (demande du 22.10.2026) :
     ils restent conservés dans l'app (champs `par`, `saisiLe`). */
  return `${date} - ${heure} : ${texte}`;
}

/** L'heure d'appel envoyée par l'app, acceptée si elle est passée (2 min de
    marge d'horloge) et de moins de 14 jours ; sinon null. */
export function heureAppelValide(v: unknown, maintenant = Date.now()): string | null {
  if (typeof v !== "string") return null;
  const t = Date.parse(v);
  if (!Number.isFinite(t) || t > maintenant + 2 * 60_000 || t < maintenant - 14 * 86_400_000) return null;
  return new Date(t).toISOString();
}
