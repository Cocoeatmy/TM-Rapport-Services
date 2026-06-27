import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getAllProjectsRaw } from "@/lib/notion";
import { getCached, setCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // 1er appel : charge tous les projets (mis en cache 5 min)

const TZ = "Europe/Zurich";

async function queryGroq(messages: { role: string; content: string }[]) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.1, // factuel : on veut zéro improvisation sur les dates/projets
      max_tokens: 1024,
    }),
  });
  // Remonter une vraie erreur au lieu du message muet « je n'ai pas pu répondre ».
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Groq error", res.status, body);
    if (res.status === 429) {
      throw new Error("Limite d'utilisation de l'IA atteinte pour le moment. Réessaie dans quelques minutes.");
    }
    throw new Error(`Le service IA est momentanément indisponible (erreur ${res.status}).`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("L'IA n'a renvoyé aucune réponse. Réessaie.");
  return content;
}

// AAAA-MM-JJ dans le fuseau suisse (en-CA produit ce format).
function isoInTz(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
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
  hay: string; // texte normalisé pour la recherche (mêmes champs que la recherche de l'app)
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { message } = await request.json();
  if (!message) return NextResponse.json({ error: "Message requis" }, { status: 400 });

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
          // Mêmes champs que l'index de la recherche de l'app (sinon « MMT »,
          // souvent dans les contacts/grossistes, restait introuvable).
          hay: norm([
            p.projet, p.ofrTM, p.ofrGrossiste, p.nomChantier, p.adresseChantier,
            p.collaborateurs, p.contacts,
            ...(p.fournisseurs || []), ...(p.fournisseursNames || []),
            ...(p.grossistesNames || []), ...(p.sanitaireNames || []),
            ...(p.seriesCabines || []),
          ].filter(Boolean).join(" ")),
        };
      });
      setCache("ai-projects-all", cachedMini);
    }
    const mini: MiniProject[] = cachedMini;

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
    push(matched, 80);
    push(upcoming, matched.length ? 20 : 40);
    // Ne complète avec des projets non pertinents QUE si le contexte est maigre
    // (question générique). Évite d'envoyer 120 projets sans rapport.
    if (selected.length < 40) push(mini, 60);

    const fmtDate = (iso: string | null): string => {
      if (!iso) return "non fixé";
      const dateOnly = iso.slice(0, 10);
      const d = new Date(dateOnly + "T12:00:00");
      if (isNaN(d.getTime())) return dateOnly;
      return `${dateOnly} (${wdFmt.format(d)})`;
    };
    const projectsContext = selected
      .map((p) =>
        `- ${p.ofrTM} | ${p.projet} | Chantier: ${p.nomChantier} | Adresse: ${p.adresseChantier} | Client/contacts: ${p.client || "—"} | Cabines: ${p.nbCabines} | Fournisseurs: ${p.fournisseurs} | Séries: ${p.seriesCabines} | Collaborateurs: ${p.collaborateurs} | Statut: ${p.etatCMD} | Date montage: ${fmtDate(p.dateMontage)}`
      )
      .join("\n");

    const systemPrompt = `Tu es l'assistant IA de TM Douche Montage Sàrl, entreprise d'installation de cabines de douche en Suisse.

CONTEXTE TEMPOREL
Aujourd'hui nous sommes ${todayLabel} (${todayIso}).
Calendrier de référence (date = jour de la semaine) :
${refCalendar}

UTILISATEUR CONNECTÉ : ${user.name} (${user.email})

PROJETS PERTINENTS (sélectionnés selon ta question ; chaque date de montage est suivie de son jour de la semaine) :
${projectsContext}

RÈGLES STRICTES — À RESPECTER ABSOLUMENT :
1. N'INVENTE JAMAIS de date, de numéro de projet (OFR), de nom de chantier, d'adresse ni de collaborateur. Utilise UNIQUEMENT les données ci-dessus.
2. Pour une question de date (« lundi prochain », « demain », « cette semaine »…), convertis-la d'abord en date exacte (AAAA-MM-JJ) à l'aide du calendrier de référence, puis liste UNIQUEMENT les projets dont la « Date montage » correspond EXACTEMENT à cette date.
3. Pour une question sur un client / une entreprise (ex. « MMT », « Duka »…), liste TOUS les projets de la liste ci-dessus dont le nom, le chantier, les contacts ou le fournisseur contient ce terme, avec leur statut. Un projet est « ouvert » / « en cours » sauf si son statut est « Terminé » ou « Annulé ». Si on demande les projets ouverts, exclus les « Terminé » et « Annulé ».
4. Si aucun projet ne correspond, dis-le clairement. Ne comble pas le vide en inventant.
5. La liste fournie est un sous-ensemble pertinent (pas toute la base). Si tu penses qu'il pourrait exister d'autres projets non listés, invite l'utilisateur à utiliser la recherche de l'app.
6. Réponds toujours en français, de façon concise et pratique (monteurs sur le terrain).
7. Pour les conseils techniques (séries Duka, Koralle, Duscholux, Nelo, Ronal…), donne des conseils généraux mais précise que le manuel officiel du fournisseur fait référence.`;

    const answer = await queryGroq([
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ]);

    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error("AI error:", error);
    return NextResponse.json({ error: error.message || "Erreur IA" }, { status: 500 });
  }
}
