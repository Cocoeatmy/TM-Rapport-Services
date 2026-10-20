/**
 * Le moteur de recherche de l'assistant IA — déterministe, AVANT le modèle.
 *
 * Le modèle ne cherche plus rien lui-même : il reçoit ce que ce moteur a
 * trouvé. Ordre de confiance :
 *   1. EXACT — numéro de téléphone (E.164), e-mail, référence (TM-2600895,
 *      2600895, tm2600895…), numéro de commande ;
 *   2. MOTS — tous les mots de la question, dans n'importe quel ordre, sans
 *      majuscules, accents ni ponctuation (« Jacquaz Thierry » = « Thierry
 *      Jacquaz ») ;
 *   3. APPROCHÉ — un mot à une lettre près, un numéro à un chiffre près :
 *      toujours marqué « approché », jamais présenté comme certain.
 */
import { telephonesDans, telephonesVoisins } from "./telephone";

export interface DocRecherche {
  /** Identifiant Notion (sans tirets). */
  id: string;
  /** « Contacts », « Entreprises », « Projets »… */
  source: string;
  titre: string;
  champs: [string, string][];
  tels: { e164: string; colonne: string }[];
  emails: string[];
  liens: string[];
  /** Références exactes : chiffres des OFR / commandes, sans séparateurs. */
  refs?: string[];
}

export interface Resultat {
  doc: DocRecherche;
  score: number;
  /** Pourquoi il est sorti — « téléphone (Portable) », « mots : jacquaz »… */
  raisons: string[];
  /** Correspondance EXACTE sur un identifiant (téléphone, e-mail, référence). */
  exact: boolean;
  /** Ressemblance seulement : à vérifier. */
  approche: boolean;
  /** Pour un numéro approché : le numéro demandé et celui trouvé. */
  voisin?: { demande: string; trouve: string };
}

export interface Question {
  telephones: string[];
  emails: string[];
  refs: string[];
  mots: string[];
}

/** minuscules, sans accents ni ponctuation, espaces simples. */
export function normaliser(s: string): string {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’'`]/g, " ").replace(/[^a-z0-9@.+]+/g, " ").replace(/\s+/g, " ").trim();
}

/* Les mots qui disent ce qu'on veut, pas de quoi on parle. */
const VIDES = new Set(`a à au aux avec ce ces cet cette chez combien comment dans de des du elle en est et il la le les leur lui ma mais me mes moi mon ne ni nous on ou où par pas pour qu que quel quelle quelles quels qui quoi sa se ses si son sont sur ta te tes toi ton tu un une vos votre vous y c d j l m n s t
appartient appartenir apartient retrouve retrouver trouve trouver cherche chercher donne donner dis dire sais savoir connais peux peut pourrais montre montrer liste lister affiche afficher
numero numeros num no tel telephone telephones portable natel mobile fixe contact contacts coordonnees fiche fiches info infos information informations
projet projets dossier dossiers chantier chantiers client clients entreprise entreprises societe fournisseur fournisseurs grossiste grossistes
statut etat etats encore ouvert ouverts ouverte ouvertes prevu prevus prevue prevues rendez vous rdv sav intervention interventions commande commandes
adresse situe situee affecte affectes affectee cette cela ca ici la-bas oui non merci bonjour stp svp quand date dates aujourd hui demain`.split(/\s+/));

/** Ce que la question contient d'exact et ses mots utiles. */
export function analyserQuestion(texte: string): Question {
  const t = String(texte || "");
  const telephones = telephonesDans(t);
  const emails = [...t.matchAll(/[\w.+-]+@[\w-]+\.[\w.-]+/g)].map((m) => m[0].toLowerCase());
  const refs = new Set<string>();
  // TM-2600895, TM 2600895, tm2600895, OFR 2600895…
  for (const m of t.matchAll(/\b(?:tm|ofr|cmd|ks)\s*[-_ ]?\s*(\d{5,10})\b/gi)) refs.add(m[1]);
  // Une longue suite de chiffres qui n'est pas un téléphone : une commande, un bon.
  const chiffresTel = new Set(telephones.map((x) => x.replace(/\D/g, "")));
  for (const m of t.matchAll(/\b\d{5,12}\b/g)) {
    const d = m[0];
    if ([...chiffresTel].some((c) => c.endsWith(d.replace(/^0+/, "")))) continue;
    refs.add(d);
  }
  // Les mots, une fois retirés numéros, e-mails et références.
  let reste = t;
  for (const e of emails) reste = reste.replace(new RegExp(e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
  reste = reste.replace(/(?:\+|00)?\d[\d  .\/()-]{6,}\d/g, " ").replace(/\b(?:tm|ofr|cmd)\s*[-_ ]?\s*\d{5,10}\b/gi, " ");
  const mots = [...new Set(normaliser(reste).split(" ").filter((w) => w.length >= 2 && !VIDES.has(w) && !/^\d{1,4}$/.test(w)))];
  return { telephones, emails, refs: [...refs], mots };
}

/** Distance d'édition bornée (on ne veut savoir que « 0, 1 ou plus »). */
function distanceAuPlus1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, ecarts = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++ecarts > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return ecarts + (a.length - i) + (b.length - j) <= 1;
}

interface Prepare { doc: DocRecherche; motsTitre: Set<string>; motsTout: Set<string>; refs: Set<string> }

export function preparer(docs: DocRecherche[]): Prepare[] {
  return docs.map((doc) => {
    const motsTitre = new Set(normaliser(doc.titre).split(" ").filter(Boolean));
    const motsTout = new Set(motsTitre);
    for (const [, v] of doc.champs) for (const w of normaliser(v).split(" ")) if (w) motsTout.add(w);
    const refs = new Set<string>(doc.refs || []);
    // Toute suite de 5 chiffres et plus, dans le titre ou une colonne, est une référence possible.
    for (const s of [doc.titre, ...doc.champs.map(([, v]) => v)]) for (const m of s.matchAll(/\d{5,12}/g)) refs.add(m[0]);
    return { doc, motsTitre, motsTout, refs };
  });
}

/**
 * Cherche. Les résultats EXACTS d'abord ; les mots ensuite (tous les mots
 * de la question doivent être trouvés, sinon au moins les deux tiers) ; les
 * ressemblances en dernier, et seulement si rien d'exact n'est sorti.
 */
export function chercher(index: Prepare[], q: Question, max = 25): Resultat[] {
  const res = new Map<string, Resultat>();
  const ajouter = (p: Prepare, score: number, raison: string, exact: boolean, approche = false, voisin?: Resultat["voisin"]) => {
    const r = res.get(p.doc.id) || { doc: p.doc, score: 0, raisons: [], exact: false, approche: false };
    r.score += score; r.raisons.push(raison);
    r.exact = r.exact || exact;
    r.approche = !r.exact && (r.approche || approche);
    if (voisin) r.voisin = voisin;
    res.set(p.doc.id, r);
  };

  // 1. Exact : téléphones, e-mails, références.
  for (const p of index) {
    for (const t of q.telephones) {
      const h = p.doc.tels.find((x) => x.e164 === t);
      if (h) ajouter(p, 100, `téléphone (${h.colonne})`, true);
    }
    for (const e of q.emails) if (p.doc.emails.includes(e)) ajouter(p, 90, "e-mail", true);
    for (const r of q.refs) if (p.refs.has(r) || p.refs.has(r.replace(/^0+/, ""))) ajouter(p, 90, `référence ${r}`, true);
  }

  // 2. Mots, dans n'importe quel ordre.
  if (q.mots.length > 0) {
    const seuil = q.mots.length <= 2 ? q.mots.length : Math.ceil(q.mots.length * 2 / 3);
    for (const p of index) {
      let trouves = 0, score = 0, approche = false;
      const vus: string[] = [];
      for (const w of q.mots) {
        if (p.motsTitre.has(w)) { trouves++; score += 12; vus.push(w); continue; }
        if (p.motsTout.has(w)) { trouves++; score += 6; vus.push(w); continue; }
        if (w.length >= 4) {
          const prefixe = [...p.motsTitre].some((m) => m.startsWith(w)) || [...p.motsTout].some((m) => m.startsWith(w));
          if (prefixe) { trouves++; score += 4; vus.push(`${w}…`); continue; }
        }
        if (w.length >= 5 && [...p.motsTout].some((m) => m.length >= 5 && distanceAuPlus1(m, w))) {
          trouves++; score += 2; approche = true; vus.push(`≈${w}`);
        }
      }
      if (trouves >= seuil && trouves > 0) ajouter(p, score, `mots : ${vus.join(", ")}`, false, approche);
    }
  }

  // 3. Numéro à un chiffre près — seulement si le numéro exact n'existe nulle part.
  for (const t of q.telephones) {
    if ([...res.values()].some((r) => r.doc.tels.some((x) => x.e164 === t))) continue;
    for (const p of index) {
      const h = p.doc.tels.find((x) => telephonesVoisins(t, x.e164));
      if (h) ajouter(p, 40, `téléphone APPROCHÉ (${h.colonne}) : un seul chiffre diffère`, false, true, { demande: t, trouve: h.e164 });
    }
  }

  return [...res.values()]
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.score - a.score)
    .slice(0, max);
}
