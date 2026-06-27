import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllProjectsRaw } from "@/lib/notion";
import { getCached, setCache } from "@/lib/server-cache";
import { getStats } from "@/lib/stats-data";
import { computeMonteurCabStats } from "@/lib/monteur-stats";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // 1er appel : charge tous les projets (mis en cache 5 min)

const TZ = "Europe/Zurich";

// Google Gemini (palier gratuit via Google AI Studio). Clé : GEMINI_API_KEY.
// Modèle surchargeable via GEMINI_MODEL (défaut : gemini-2.5-flash).
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Sites OFFICIELS des fabricants/fournisseurs (adresses fournies par l'admin),
// pour orienter la recherche web vers les bons manuels / vues éclatées.
const SUPPLIER_SITES = [
  "Duka : https://www.duka.it/fr/",
  "Duscholux : https://www.duscholux.com/fr_ch/page-d-accueil/",
  "Koralle : https://www.koralle.ch/shop/fr/",
  "Novellini : https://www.novellini.fr",
  "Nelo (marque Radaway) : https://www.radaway.de",
  "Ronal : https://www.ronalbathrooms.com/en_GB",
  "Samo : https://www.samo.it/it/accessori/cabine-doccia",
  "Vismaravetro : https://www.vismaravetro.it/fr/",
  "Relax : https://relaxsrl.com",
  "Hüppe : https://www.hueppe.com/fr/",
].join("\n");

// Détecte une question TECHNIQUE / documentaire (manuel, notice, vue éclatée,
// pièce détachée, conseil de pose) → on active la recherche web.
function isDocQuestion(message: string): boolean {
  const m = message.toLowerCase();
  if (/(manuel|notice|mode d.emploi|éclat|eclat|pi[èe]ce|sch[ée]ma|r[ée]glage|silicone|[ée]tanch|montage de|notice de)/.test(m)) return true;
  if (/comment\s+(les?\s+|la\s+|l.\s*|une?\s+|des\s+)?(pose|mont|instal|fix|r[ée]gl|remplac|d[ée]pos|chang|coup|d[ée]coup)/.test(m)) return true;
  return false;
}

async function queryGemini(systemPrompt: string, userMessage: string, opts?: { search?: boolean }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Clé API Gemini manquante (GEMINI_API_KEY).");

  const body: Record<string, unknown> = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userMessage }] }],
    generationConfig: {
      // Recherche web : un peu plus de liberté ; sinon factuel strict.
      temperature: opts?.search ? 0.3 : 0.1,
      maxOutputTokens: 2048,
      // Réflexion désactivée : économise le quota gratuit et évite que le
      // budget de sortie soit consommé avant d'écrire la réponse.
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
  // Active la recherche Google (grounding) pour les questions techniques/manuels.
  if (opts?.search) body.tools = [{ google_search: {} }];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("Gemini error", res.status, errBody);
    if (res.status === 429) {
      throw new Error("Limite d'utilisation gratuite de l'IA atteinte. Réessaie dans une minute.");
    }
    throw new Error(`Le service IA est momentanément indisponible (erreur ${res.status}).`);
  }

  const data = await res.json();
  const cand = data.candidates?.[0];
  let content = cand?.content?.parts?.map((p: { text?: string }) => p.text || "").join("");
  if (!content) {
    console.error("Gemini empty response", JSON.stringify(data).slice(0, 500));
    throw new Error("L'IA n'a renvoyé aucune réponse. Reformule ta question.");
  }

  // En mode recherche : ajoute les liens sources (manuels, pages produits…).
  if (opts?.search) {
    const chunks: { web?: { uri?: string; title?: string } }[] =
      cand?.groundingMetadata?.groundingChunks || [];
    const links = chunks
      .map((c) => c.web)
      .filter((w): w is { uri: string; title?: string } => !!w?.uri)
      .map((w) => `- [${w.title || w.uri}](${w.uri})`);
    const uniq = [...new Set(links)].slice(0, 6);
    if (uniq.length) content += `\n\n**Sources :**\n${uniq.join("\n")}`;
  }

  return content;
}

// AAAA-MM-JJ dans le fuseau suisse (en-CA produit ce format).
function isoInTz(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

const MOIS_NOMS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

// Chiffres OFFICIELS des cabines installées (mêmes données que la page Stats,
// base "marques"). Calculés en code car un LLM additionne mal des dizaines de
// nombres — et le contexte projets n'envoie qu'un sous-ensemble.
async function buildStatsSummary(currentYear: number): Promise<string> {
  try {
    const marques = await getStats("marques"); // [{ marque, annee, monthly, total }]
    if (!Array.isArray(marques) || marques.length === 0) return "";
    const byYear: Record<number, number> = {};
    const monthCur: Record<string, number> = {};
    for (const r of marques as { annee: number | null; monthly?: Record<string, number>; total?: number }[]) {
      if (r.annee == null) continue;
      byYear[r.annee] = (byYear[r.annee] || 0) + (r.total || 0);
      if (r.annee === currentYear && r.monthly) {
        for (const m of MOIS_NOMS) monthCur[m] = (monthCur[m] || 0) + (r.monthly[m] || 0);
      }
    }
    const years = Object.keys(byYear).map(Number).sort((a, b) => b - a);
    if (years.length === 0) return "";
    const yearLines = years.map((y) => `  - ${y} : ${byYear[y]} cabines installées`).join("\n");
    const monthLines = MOIS_NOMS
      .filter((m) => (monthCur[m] || 0) > 0)
      .map((m) => `  - ${m} ${currentYear} : ${monthCur[m]} cabines`)
      .join("\n");
    let out = `STATISTIQUES OFFICIELLES — cabines installées (chiffres exacts, identiques à la page Stats) :\n${yearLines}`;
    if (monthLines) out += `\nDétail mensuel ${currentYear} :\n${monthLines}`;
    return out;
  } catch (e) {
    console.error("AI stats summary error", e);
    return "";
  }
}

// minuscules + sans accents, pour la recherche par mot-clé.
const norm = (s: string): string =>
  (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Mots à ignorer dans la question (trop génériques pour cibler un projet).
const STOPWORDS = new Set([
  "les", "des", "une", "est", "sont", "que", "qui", "quoi", "pour", "avec", "dans", "sur",
  "nous", "avons", "encore", "quel", "quels", "quelle", "quelles", "mes", "mon", "ton", "ses",
  "montage", "montages", "projet", "projets", "client", "clients", "entreprise", "entreprises",
  "cabine", "cabines", "prochain", "prochaine", "semaine", "jour", "jours", "aujourd", "hui",
  "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "demain", "fixer",
  "adresse", "info", "infos", "information", "informations", "as", "tu", "le", "la", "et", "ou",
  "du", "de", "au", "aux", "ce", "cette", "ces", "par", "pas", "plus", "fait", "faire",
]);

interface MiniProject {
  ofrTM: string;
  projet: string;
  nomChantier: string;
  adresseChantier: string;
  nbCabines: number | string | null;
  fournisseurs: string;
  seriesCabines: string;
  collaborateurs: string;
  client: string; // contacts + grossistes/fournisseurs/sanitaires (pour affichage)
  etatCMD: string;
  dateMontage: string | null;
  attributionCabines: string; // "Cab1:Micael | Cab2:Claudio & Jacobo" (stats par monteur)
  hay: string; // texte normalisé pour la recherche (mêmes champs que la recherche de l'app)
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { message } = await request.json();
  if (!message) return NextResponse.json({ error: "Message requis" }, { status: 400 });

  // ── Question TECHNIQUE / manuel → recherche web (Gemini grounding) ──────────
  // Pas besoin du contexte projets ici ; on cherche un document fabricant.
  if (isDocQuestion(message)) {
    try {
      const docPrompt = `Tu es l'assistant technique de TM Douche Montage Sàrl (montage de cabines de douche en Suisse). L'utilisateur cherche une information technique : manuel de montage, notice, vue éclatée, pièce détachée, ou conseil de pose.

Utilise la RECHERCHE GOOGLE pour trouver l'information sur les sites OFFICIELS des fabricants. Fournisseurs/marques de l'entreprise (priorise leurs sites officiels) :
${SUPPLIER_SITES}

Règles :
- Donne le(s) LIEN(S) direct(s) vers le manuel / la notice / la vue éclatée officielle quand tu les trouves (idéalement le PDF).
- Privilégie TOUJOURS la source officielle du fabricant ; évite les revendeurs et sites tiers non officiels.
- Si tu ne trouves pas le document exact, dis-le clairement, donne la page produit la plus proche, et suggère de contacter le fournisseur.
- Donne aussi, si utile, un résumé concis des étapes clés de montage.
- Réponds en français, clair et structuré (gras pour les points clés, puces).`;
      const answer = await queryGemini(docPrompt, message, { search: true });
      return NextResponse.json({ answer });
    } catch (error) {
      console.error("AI doc/search error:", error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Erreur IA (recherche)" },
        { status: 500 }
      );
    }
  }

  try {
    const now = new Date();
    const todayIso = isoInTz(now);
    const todayLabel = new Intl.DateTimeFormat("fr-CH", {
      weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ,
    }).format(now);

    // Calendrier de référence : 21 prochains jours (date ↔ jour de la semaine).
    const wdFmt = new Intl.DateTimeFormat("fr-CH", { weekday: "long", timeZone: TZ });
    const refLines: string[] = [];
    for (let i = 0; i < 21; i++) {
      const d = new Date(now.getTime() + i * 86_400_000);
      const tag = i === 0 ? " ← AUJOURD'HUI" : i === 1 ? " (demain)" : "";
      refLines.push(`${isoInTz(d)} = ${wdFmt.format(d)}${tag}`);
    }
    const refCalendar = refLines.join("\n");

    // Bloc statistiques officiel (cabines installées par année/mois).
    const statsSummary = await buildStatsSummary(Number(todayIso.slice(0, 4)));

    // Liste compacte de TOUS les projets (mise en cache 5 min). On y pioche
    // ensuite le sous-ensemble PERTINENT à la question, pour ne pas dépasser
    // les limites de tokens.
    let cachedMini = getCached<MiniProject[]>("ai-projects-all");
    if (!cachedMini) {
      const projects = await getAllProjectsRaw(); // TOUS les projets (toutes étapes/états)
      cachedMini = projects.map((p) => {
        const names = [
          ...(p.grossistesNames || []),
          ...(p.fournisseursNames || []),
          ...(p.sanitaireNames || []),
        ].filter(Boolean);
        const client = [p.contacts, names.join(", ")].filter(Boolean).join(" / ");
        return {
          ofrTM: p.ofrTM,
          projet: p.projet,
          nomChantier: p.nomChantier,
          adresseChantier: p.adresseChantier,
          nbCabines: p.nbCabines,
          fournisseurs: p.fournisseurs.join(","),
          seriesCabines: p.seriesCabines.join(","),
          collaborateurs: p.collaborateurs,
          client,
          etatCMD: p.etatCMD,
          dateMontage: p.dateMontage || null,
          attributionCabines: p.attributionCabines || "",
          // EXACTEMENT les mêmes champs que l'index de la recherche de l'app
          // (sinon « MMT », souvent dans les contacts/grossistes/cmd, restait
          // introuvable alors que la recherche le trouve).
          hay: norm([
            p.projet, p.ofrTM, p.ofrGrossiste, p.nomChantier, p.adresseChantier,
            p.cmdTM, p.cmdTMUsine, p.cmdGrossiste, p.cmdFournisseurs,
            p.servCmdFournisseurs, p.servMesuresFournisseurs, p.bonLivraison,
            p.collaborateurs, p.contacts, p.emplacementCabine,
            ...(p.fournisseurs || []), ...(p.fournisseursNames || []),
            ...(p.grossistesNames || []), ...(p.sanitaireNames || []),
            ...(p.seriesCabines || []),
          ].filter(Boolean).join(" ")),
        };
      });
      setCache("ai-projects-all", cachedMini);
    }
    const mini: MiniProject[] = cachedMini;

    // Cabines installées par monteur (seul / en équipe), depuis toujours.
    const monteurStats = computeMonteurCabStats(mini);
    const monteurSummary = monteurStats.length
      ? "STATISTIQUES MONTEURS — cabines installées (depuis toujours, attribution par cabine) :\n" +
        monteurStats
          .map((m) => `  - ${m.name} : ${m.total} cabines au total (${m.solo} seul, ${m.team} en équipe)`)
          .join("\n")
      : "";

    // 1) Projets correspondant aux mots-clés de la question (ex. « MMT », « Duka »).
    const keywords = [...new Set(norm(message).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOPWORDS.has(w)))];
    const matched = keywords.length
      ? mini.filter((p) => keywords.some((w) => p.hay.includes(w)))
      : [];

    // 2) Montages à venir (triés par date croissante).
    const upcoming = mini
      .filter((p) => p.dateMontage && p.dateMontage.slice(0, 10) >= todayIso)
      .sort((a, b) => ((a.dateMontage as string) < (b.dateMontage as string) ? -1 : 1));

    // Assemble : correspondances (max 70) + montages à venir (max 40), dédupliqués,
    // puis on complète avec d'autres projets si besoin. Plafond global 120.
    const selected: MiniProject[] = [];
    const seen = new Set<string>();
    const push = (arr: MiniProject[], max: number) => {
      let n = 0;
      for (const p of arr) {
        if (n >= max || selected.length >= 120) break;
        const key = p.ofrTM || p.projet;
        if (seen.has(key)) continue;
        seen.add(key);
        selected.push(p);
        n++;
      }
    };
    push(matched, 60);
    push(upcoming, matched.length ? 15 : 35);
    // Ne complète avec des projets non pertinents QUE si le contexte est maigre
    // (question générique). Évite d'envoyer trop de projets sans rapport (→ 413).
    if (selected.length < 30) push(mini, 50);

    const fmtDate = (iso: string | null): string => {
      if (!iso) return "non fixé";
      const dateOnly = iso.slice(0, 10);
      const d = new Date(dateOnly + "T12:00:00");
      if (isNaN(d.getTime())) return dateOnly;
      return `${dateOnly} (${wdFmt.format(d)})`;
    };
    // Lignes COURTES : le nom du projet contient déjà client + lot + adresse.
    // Les lignes longues faisaient dépasser la limite de taille de Groq (413).
    const projectsContext = selected
      .map((p) =>
        `- ${p.ofrTM} | ${p.projet} | Statut: ${p.etatCMD} | Collab: ${p.collaborateurs || "—"} | Montage: ${fmtDate(p.dateMontage)}`
      )
      .join("\n");

    const systemPrompt = `Tu es l'assistant IA de TM Douche Montage Sàrl, entreprise d'installation de cabines de douche en Suisse.

CONTEXTE TEMPOREL
Aujourd'hui nous sommes ${todayLabel} (${todayIso}).
Calendrier de référence (date = jour de la semaine) :
${refCalendar}

UTILISATEUR CONNECTÉ : ${user.name} (${user.email})

${statsSummary ? statsSummary + "\n\n" : ""}${monteurSummary ? monteurSummary + "\n\n" : ""}PROJETS PERTINENTS (sélectionnés selon ta question ; chaque date de montage est suivie de son jour de la semaine) :
${projectsContext}

RÈGLES STRICTES — À RESPECTER ABSOLUMENT :
1. N'INVENTE JAMAIS de date, de numéro de projet (OFR), de nom de chantier, d'adresse ni de collaborateur. Utilise UNIQUEMENT les données ci-dessus.
2. Pour une question de date (« lundi prochain », « demain », « cette semaine »…), convertis-la d'abord en date exacte (AAAA-MM-JJ) à l'aide du calendrier de référence, puis liste UNIQUEMENT les projets dont la « Date montage » correspond EXACTEMENT à cette date.
3. Pour une question sur un client / une entreprise (ex. « MMT », « Duka »…), liste TOUS les projets de la liste ci-dessus dont le nom, le chantier, les contacts ou le fournisseur contient ce terme, avec leur statut. Un projet est « ouvert » / « en cours » sauf si son statut est « Terminé » ou « Annulé ». Si on demande les projets ouverts, exclus les « Terminé » et « Annulé ».
4. Si aucun projet ne correspond, dis-le clairement. Ne comble pas le vide en inventant.
5. La liste de projets fournie est un sous-ensemble pertinent (pas toute la base). Pour LISTER des projets, base-toi dessus et, si pertinent, invite à utiliser la recherche de l'app.
5bis. Pour toute question de TOTAL/COMPTAGE de cabines installées (par année ou par mois — ex. « combien de cabines en 2026 », « combien en juin »), réponds EXCLUSIVEMENT avec les chiffres du bloc « STATISTIQUES OFFICIELLES » ci-dessus. Ne compte JAMAIS les projets toi-même pour ça. Si le bloc statistiques est absent, dis que tu ne peux pas donner le total et renvoie vers la page Stats.
5ter. Pour toute question sur les cabines installées PAR UN MONTEUR (combien X a installé, seul ou en équipe, classement des monteurs…), réponds EXCLUSIVEMENT avec le bloc « STATISTIQUES MONTEURS » ci-dessus (chiffres « depuis toujours »). « Seul » = ce monteur était le seul sur la cabine ; « en équipe » = plusieurs monteurs sur la cabine (chaque participant est crédité de la cabine). Ne recompte jamais toi-même.
6. Réponds toujours en français, de façon concise et pratique (monteurs sur le terrain).
7. Pour les conseils techniques (séries Duka, Koralle, Duscholux, Nelo, Ronal…), donne des conseils généraux mais précise que le manuel officiel du fournisseur fait référence.
8. MISE EN FORME (Markdown) : commence par une courte phrase de réponse, puis liste chaque projet sur sa propre puce « - ». Mets en **gras** les infos clés (numéro OFR, statut, dates importantes). Garde chaque puce concise. N'utilise pas de tableaux.`;

    const answer = await queryGemini(systemPrompt, message);

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error("AI error:", error);
    return NextResponse.json({ error: error.message || "Erreur IA" }, { status: 500 });
  }
}
