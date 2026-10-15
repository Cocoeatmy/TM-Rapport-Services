/**
 * Traduire entre une valeur Notion et une valeur d'écran, dans les deux
 * sens, sans rien perdre en route.
 *
 * Chaque type Notion a sa forme propre : un texte est une liste de
 * fragments, une date un objet à deux bornes, une relation une liste
 * d'identifiants de pages. L'écran, lui, veut une chaîne, un nombre, une
 * liste de choix.
 *
 * Deux règles tiennent tout le reste.
 *
 * ON N'ÉCRIT QUE CE QU'ON A TOUCHÉ. Les écritures ne portent jamais sur la
 * fiche entière : seulement sur les propriétés modifiées. Renvoyer les
 * autres « telles qu'on les avait lues » écraserait ce qu'un collègue
 * aurait changé entre-temps.
 *
 * VIDE VEUT DIRE VIDE, et c'est voulu. Effacer un champ doit pouvoir
 * effacer la valeur dans Notion — sinon on ne peut jamais corriger une
 * saisie. Un champ qu'on n'envoie pas, lui, n'est pas touché. La
 * différence se fait en amont : l'écran n'envoie que ce qui a changé.
 */

import { TYPES_MODIFIABLES } from "./notion-schema";

export interface ValeurFichier {
  nom: string;
  url: string;
  /** Hébergé par Notion : on ne peut que le relire, pas le replacer. */
  interne?: boolean;
}

export interface ValeurRelation {
  id: string;
  titre?: string;
}

/** Ce que l'écran manipule, selon le type. */
export type ValeurChamp =
  | string | number | boolean | null
  | string[]
  | ValeurFichier[]
  | ValeurRelation[]
  | { debut: string; fin?: string | null }
  | { nom?: string; adresse?: string; lat?: number; lon?: number };

type Brut = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function texte(rt: Brut[] | undefined): string {
  return (rt || []).map((t) => t.plain_text || "").join("");
}

/** La valeur d'une propriété Notion, mise dans la forme de l'écran. */
export function lireValeur(prop: Brut | undefined | null): ValeurChamp {
  if (!prop) return null;
  switch (prop.type) {
    case "title": return texte(prop.title);
    case "rich_text": return texte(prop.rich_text);
    case "number": return prop.number ?? null;
    case "checkbox": return !!prop.checkbox;
    case "url": return prop.url ?? "";
    case "email": return prop.email ?? "";
    case "phone_number": return prop.phone_number ?? "";
    case "select": return prop.select?.name ?? "";
    case "status": return prop.status?.name ?? "";
    case "multi_select": return (prop.multi_select || []).map((o: Brut) => o.name);
    case "people": return (prop.people || []).map((p: Brut) => p.id);
    case "date":
      return prop.date?.start ? { debut: prop.date.start, fin: prop.date.end ?? null } : null;
    case "relation":
      return (prop.relation || []).map((r: Brut) => ({ id: r.id }));
    case "files":
      return (prop.files || []).map((f: Brut) => ({
        nom: f.name || "fichier",
        url: (f.type === "external" ? f.external?.url : f.file?.url) || "",
        interne: f.type === "file",
      })).filter((f: ValeurFichier) => f.url);
    case "place":
      return prop.place
        ? { nom: prop.place.name, adresse: prop.place.address, lat: prop.place.lat, lon: prop.place.lon }
        : null;
    case "formula": {
      const f = prop.formula || {};
      if (f.type === "date") return f.date?.start ? { debut: f.date.start, fin: f.date.end ?? null } : null;
      return f.string ?? f.number ?? f.boolean ?? null;
    }
    case "rollup": {
      const r = prop.rollup || {};
      if (r.type === "number") return r.number ?? null;
      if (r.type === "date") return r.date?.start ? { debut: r.date.start, fin: r.date.end ?? null } : null;
      if (r.type === "array") return (r.array || []).map((x: Brut) => String(lireValeur(x) ?? ""));
      return null;
    }
    case "unique_id":
      return prop.unique_id ? `${prop.unique_id.prefix ? prop.unique_id.prefix + "-" : ""}${prop.unique_id.number}` : "";
    case "created_time": return prop.created_time ?? "";
    case "last_edited_time": return prop.last_edited_time ?? "";
    case "created_by": return prop.created_by?.id ?? "";
    case "last_edited_by": return prop.last_edited_by?.id ?? "";
    case "button": return null; // l'API renvoie un objet vide
    default: return null;
  }
}

export class TypeNonEcrivable extends Error {}

/**
 * La valeur d'écran, remise dans la forme que Notion attend pour l'écrire.
 *
 * Lève pour un type que l'API ne sait pas écrire : mieux vaut refuser
 * bruyamment que laisser croire à un enregistrement qui n'a pas eu lieu.
 */
export function ecrireValeur(type: string, v: ValeurChamp): Brut {
  if (!TYPES_MODIFIABLES.has(type)) {
    throw new TypeNonEcrivable(`Le type « ${type} » ne peut pas être écrit par l'API Notion`);
  }
  const vide = v === null || v === undefined || v === "";
  switch (type) {
    case "title":
      return { title: vide ? [] : [{ text: { content: String(v).slice(0, 2000) } }] };
    case "rich_text":
      return { rich_text: vide ? [] : [{ text: { content: String(v).slice(0, 2000) } }] };
    case "number": {
      if (vide) return { number: null };
      const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
      return { number: Number.isFinite(n) ? n : null };
    }
    case "checkbox": return { checkbox: v === true || v === "true" };
    case "url": return { url: vide ? null : String(v) };
    case "email": return { email: vide ? null : String(v) };
    case "phone_number": return { phone_number: vide ? null : String(v) };
    case "select": return { select: vide ? null : { name: String(v) } };
    case "status": return { status: vide ? null : { name: String(v) } };
    case "multi_select":
      return { multi_select: (Array.isArray(v) ? v : []).filter(Boolean).map((n) => ({ name: String(n) })) };
    case "people":
      return { people: (Array.isArray(v) ? v : []).filter(Boolean).map((id) => ({ object: "user", id: String(id) })) };
    case "relation":
      return {
        relation: (Array.isArray(v) ? v : [])
          .map((r) => (typeof r === "string" ? r : (r as ValeurRelation)?.id))
          .filter(Boolean)
          .map((id) => ({ id: String(id) })),
      };
    case "date": {
      if (vide) return { date: null };
      if (typeof v === "string") return { date: { start: v } };
      const d = v as { debut?: string; fin?: string | null };
      if (!d?.debut) return { date: null };
      return { date: { start: d.debut, ...(d.fin ? { end: d.fin } : {}) } };
    }
    case "place": {
      if (vide) return { place: null };
      const p = v as { nom?: string; adresse?: string; lat?: number; lon?: number };
      if (!p?.nom && !p?.adresse) return { place: null };
      return { place: { name: p.nom || p.adresse, address: p.adresse || p.nom, lat: p.lat, lon: p.lon } };
    }
    case "files": {
      /* Chaque fichier repart sous le type que Notion lui connaît : une
         pièce jointe déposée à la main est hébergée PAR Notion, qui refuse
         de la reprendre en « external » et rejette alors la propriété
         entière — tout le champ disparaîtrait. */
      const liste = (Array.isArray(v) ? v : []) as ValeurFichier[];
      return {
        files: liste.filter((f) => f?.url).map((f) => (
          f.interne
            ? { type: "file", name: f.nom || "fichier", file: { url: f.url } }
            : { type: "external", name: f.nom || "fichier", external: { url: f.url } }
        )),
      };
    }
    default:
      throw new TypeNonEcrivable(`Type « ${type} » non géré`);
  }
}

/** Deux valeurs d'écran sont-elles la même chose ? (pour n'écrire que le modifié) */
export function memeValeur(a: ValeurChamp, b: ValeurChamp): boolean {
  if (a === b) return true;
  const vide = (x: ValeurChamp) =>
    x === null || x === undefined || x === "" || (Array.isArray(x) && x.length === 0);
  if (vide(a) && vide(b)) return true;
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}
