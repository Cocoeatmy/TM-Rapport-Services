/**
 * L'annuaire de l'assistant IA : qui est derrière un numéro, un nom, une
 * entreprise — et sur quels dossiers on le retrouve.
 *
 * L'assistant ne connaissait que la liste des projets, en une ligne chacun :
 * à « qui est le 079 839 68 17 ? », il ne savait rien dire, alors que le
 * numéro est dans Notion (base Contacts, fiche d'une entreprise, ou noté en
 * clair sur un chantier). On lit donc les quatre bases du carnet d'adresses
 * — les mêmes que la page CRM — et on rapproche un numéro sous toutes ses
 * écritures : « 0798396817 », « +41 79 839 68 17 », « 0041 79… ».
 *
 * LECTURE SEULE : rien n'est écrit dans Notion.
 *
 * L'argent n'entre jamais ici : ni montant, ni facturation, ni chiffre
 * d'affaires — l'assistant n'en parle pas (voir `estQuestionArgent`).
 */

/* ── Numéros de téléphone ─────────────────────────────────────────────── */

/**
 * La clé d'un numéro : ses neuf derniers chiffres. Un numéro suisse s'écrit
 * « 079 839 68 17 », « +41 79 839 68 17 » ou « 0041 79 839 68 17 » : seuls
 * l'indicatif et le zéro changent, les neuf derniers chiffres restent.
 * Moins de neuf chiffres : pas un numéro complet, pas de clé.
 */
export function cleTelephone(brut: string | null | undefined): string | null {
  const chiffres = String(brut || "").replace(/\D/g, "");
  if (chiffres.length < 9 || chiffres.length > 15) return null;
  return chiffres.slice(-9);
}

/**
 * Les numéros écrits dans un texte libre (question, commentaire, contact
 * noté à la main), sous forme de clés. Les dates (« 2026-10-20 ») et les
 * numéros de dossier (« TM-2600825 ») n'ont pas assez de chiffres d'affilée.
 */
export function numerosDans(texte: string | null | undefined): string[] {
  const out = new Set<string>();
  const re = /(?:\+|00)?\d[\d  .\/-]{7,}\d/g;
  let m: RegExpExecArray | null;
  const t = String(texte || "");
  while ((m = re.exec(t))) {
    const bloc = m[0];
    // Un numéro ne mélange pas les séparateurs au point d'en avoir 6 de suite.
    if (/[ .\/-]{2,}/.test(bloc)) continue;
    const cle = cleTelephone(bloc);
    if (cle) { out.add(cle); continue; }
    // Deux numéros collés par une espace : chacun pour soi.
    for (const morceau of bloc.split(/\s+(?=(?:\+|00|0)\d)/)) {
      const c = cleTelephone(morceau);
      if (c) out.add(c);
    }
  }
  return [...out];
}

/* ── Questions d'argent ───────────────────────────────────────────────── */

/**
 * Une question sur l'argent : chiffre d'affaires, prix, montants, factures,
 * paiements, marge, salaires… L'assistant n'y répond JAMAIS — même à
 * l'administrateur : c'est la consigne. Le refus est décidé ici, avant
 * l'appel au modèle, pour ne pas dépendre de sa bonne volonté.
 *
 * « OFR » (le numéro de dossier) et « offre » ne déclenchent rien : on parle
 * tous les jours du dossier TM-OFR sans parler d'argent.
 */
export function estQuestionArgent(question: string): boolean {
  const brut = String(question || "");
  if (/\bCA\b/.test(brut)) return true; // « le CA de 2025 » (majuscules : « ça » n'est pas visé)
  if (/[€$£]|\bCHF\b|\bFr\.\s*\d/i.test(brut)) return true;
  const q = brut.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return /(chiffre[s]? d.affaire|\bargent\b|\bprix\b|\btarif|\bmontant|\bfactur|\bpaiement|\bpaye[rsz]?\b|\bpayee?s?\b|\bimpaye|\bencaiss|\bmarge[s]?\b|\bbenefice|\brentab|\bsalaire|\bcout(e|ent|s)?\b|\bcoute\b|\bbudget|\bbexio\b|\bfrancs?\b|\brabais|\bacompte|\bpaie\b|\bfinanc|\btresorerie|\bcombien (ca|cela) (coute|fait|vaut)|\bvaleur (du|des|de la) (projet|dossier|commande|chantier)|\bdepense)/.test(q);
}

export const REFUS_ARGENT =
  "Je ne réponds pas aux questions d'argent : chiffre d'affaires, prix, montants, factures ou paiements. "
  + "Je peux en revanche tout te dire sur un dossier — client, adresse, contacts et numéros, états, dates, collaborateurs, commandes, livraisons, SAV.";

/**
 * Retire les montants d'un texte libre (commentaire, journal) avant de le
 * donner au modèle : « 1'250.– CHF », « Fr. 300 », « 45 € »… Le reste du
 * texte garde son sens ; seul le chiffre de l'argent disparaît.
 */
export function sansMontants(texte: string): string {
  return String(texte || "")
    .replace(/(?:\bCHF|\bFrs?\.?|€)\s*-?\d[\d'’ .,]*(?:[.,]-+|\.–)?/gi, "[montant retiré]")
    .replace(/-?\d[\d'’ .,]*(?:[.,]-+|\.–)?\s*(?:CHF|Frs?\b\.?|francs?\b|€|EUR\b)/gi, "[montant retiré]");
}

/* ── L'annuaire ───────────────────────────────────────────────────────── */

export type SorteFiche = "contact" | "entreprise" | "fournisseur" | "grossiste";

export interface FicheAnnuaire {
  id: string;
  sorte: SorteFiche;
  nom: string;
  telephones: string[];
  emails: string[];
  /** Entreprise(s) d'un contact — identifiants, résolus en noms à l'affichage. */
  entreprises: string[];
  etiquette: string;
  adresse: string;
  /** Fonction, rôle, remarque courte — ce qui dit « qui est-ce ». */
  role: string;
}

const BASES: { sorte: SorteFiche; id: string }[] = [
  { sorte: "contact", id: "28a1895b9179811e98efc8848571d8db" },
  { sorte: "entreprise", id: "28a1895b9179811fb736eca6c8e2ffb3" },
  { sorte: "fournisseur", id: "2d11895b9179807b988df489cfdc469d" },
  { sorte: "grossiste", id: "2d11895b917980a1a202fa866102e0e5" },
];

const texteDe = (pr: any): string => {
  if (!pr) return "";
  switch (pr.type) {
    case "title": return (pr.title || []).map((t: any) => t.plain_text).join("").trim();
    case "rich_text": return (pr.rich_text || []).map((t: any) => t.plain_text).join("").trim();
    case "select": return pr.select?.name || "";
    case "status": return pr.status?.name || "";
    case "multi_select": return (pr.multi_select || []).map((s: any) => s.name).join(", ");
    case "phone_number": return pr.phone_number || "";
    case "email": return pr.email || "";
    case "url": return pr.url || "";
    case "formula": return pr.formula?.type === "string" ? (pr.formula.string || "").trim() : "";
    default: return "";
  }
};

/** Une page Notion d'une des bases du carnet → une fiche d'annuaire. */
export function ficheDePage(page: any, sorte: SorteFiche): FicheAnnuaire | null {
  const props: Record<string, any> = page?.properties || {};
  let nom = "", prenom = "", nomFamille = "", etiquette = "", adresse = "";
  const telephones = new Set<string>(), emails = new Set<string>(), entreprises: string[] = [], role: string[] = [];
  for (const [cle, pr] of Object.entries(props)) {
    if (!pr) continue;
    const k = cle.toLowerCase();
    if (pr.type === "title") { nom = texteDe(pr); continue; }
    if (pr.type === "relation") {
      if (/entreprise|soci[ée]t[ée]|client|fournisseur|grossiste/.test(k)) entreprises.push(...(pr.relation || []).map((r: any) => r.id));
      continue;
    }
    const v = texteDe(pr);
    if (!v) continue;
    if (pr.type === "phone_number" || /t[ée]l|phone|natel|mobile|portable|gsm/.test(k)) {
      for (const morceau of v.split(/[,;\/]|\s{2,}|\bet\b/)) if (cleTelephone(morceau)) telephones.add(morceau.trim());
      continue;
    }
    if (pr.type === "email" || /mail|courriel/.test(k)) { emails.add(v.replace(/^mailto:/i, "")); continue; }
    if (/pr[ée]nom/.test(k)) { prenom = v; continue; }
    if (/^nom/.test(k)) { nomFamille = v; continue; }
    if (/adresse|address|\bnpa\b|localit|ville/.test(k)) { adresse = adresse ? `${adresse}, ${v}` : v; continue; }
    if (/[ée]tiquette|\btags?\b|cat[ée]gorie|\btype\b/.test(k)) { etiquette = etiquette ? `${etiquette}, ${v}` : v; continue; }
    if (/fonction|r[ôo]le|poste|titre|remarque|note|description/.test(k) && !/prix|montant|tarif|factur|chiffre|rabais|remise|marge/.test(k)) {
      role.push(v.slice(0, 160));
      continue;
    }
    // Un numéro rangé dans une colonne au nom quelconque.
    if (pr.type === "rich_text" && /^[+(]?\d[\d\s().\/-]{7,}$/.test(v) && cleTelephone(v)) telephones.add(v);
  }
  const nomComplet = nom || [prenom, nomFamille].filter(Boolean).join(" ");
  if (!nomComplet.trim()) return null;
  return {
    id: page.id, sorte, nom: nomComplet.trim(),
    telephones: [...telephones], emails: [...emails], entreprises,
    etiquette, adresse, role: role.join(" · "),
  };
}

/** Lit les quatre bases du carnet d'adresses (lecture seule). */
export async function chargerAnnuaire(): Promise<FicheAnnuaire[]> {
  const { notion } = await import("./notion");
  const parBase = await Promise.all(BASES.map(async ({ sorte, id }) => {
    const out: FicheAnnuaire[] = [];
    let curseur: string | undefined;
    try {
      do {
        const r: any = await notion.databases.query({ database_id: id, start_cursor: curseur, page_size: 100 });
        for (const page of r.results || []) {
          const f = ficheDePage(page, sorte);
          if (f) out.push(f);
        }
        curseur = r.has_more ? r.next_cursor : undefined;
      } while (curseur);
    } catch (e) {
      // Une base illisible n'empêche pas les autres de répondre.
      console.error(`[annuaire-ia] base ${sorte} illisible :`, (e as Error).message);
    }
    return out;
  }));
  return parBase.flat();
}

/* ── Rapprochements ───────────────────────────────────────────────────── */

const normal = (s: string): string => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Les fiches qui portent l'un de ces numéros. */
export function fichesParNumero(annuaire: FicheAnnuaire[], cles: string[]): FicheAnnuaire[] {
  if (cles.length === 0) return [];
  const voulu = new Set(cles);
  return annuaire.filter((f) => f.telephones.some((t) => { const c = cleTelephone(t); return !!c && voulu.has(c); }));
}

/**
 * Les fiches que la question désigne par leur nom, leur e-mail ou leur
 * entreprise : celles qui reprennent le plus de mots de la question. Un mot
 * seul et banal (« Jean ») ne suffit pas quand la question en donne deux.
 */
export function fichesParMots(annuaire: FicheAnnuaire[], mots: string[], max = 12): FicheAnnuaire[] {
  if (mots.length === 0) return [];
  const notes = annuaire.map((f) => {
    const texte = normal(`${f.nom} ${f.emails.join(" ")}`);
    const n = mots.filter((m) => new RegExp(`(^|[^a-z0-9])${m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(texte)).length;
    return { f, n };
  }).filter((x) => x.n > 0);
  if (notes.length === 0) return [];
  const meilleur = Math.max(...notes.map((x) => x.n));
  return notes.filter((x) => x.n === meilleur).slice(0, max).map((x) => x.f);
}

/** « Contact » / « Entreprise »… pour l'affichage. */
export const LIBELLE_SORTE: Record<SorteFiche, string> = {
  contact: "Contact", entreprise: "Entreprise", fournisseur: "Fournisseur", grossiste: "Grossiste",
};
