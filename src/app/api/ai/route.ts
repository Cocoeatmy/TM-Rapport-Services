import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getProjects } from "@/lib/notion";
import { getCached, setCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

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
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Désolé, je n'ai pas pu répondre.";
}

// AAAA-MM-JJ dans le fuseau suisse (en-CA produit ce format).
function isoInTz(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
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
    // Permet au modèle de convertir « lundi prochain / demain » en date exacte
    // sans faire de calcul (source d'erreurs).
    const wdFmt = new Intl.DateTimeFormat("fr-CH", { weekday: "long", timeZone: TZ });
    const refLines: string[] = [];
    for (let i = 0; i < 21; i++) {
      const d = new Date(now.getTime() + i * 86_400_000);
      const iso = isoInTz(d);
      const wd = wdFmt.format(d);
      const tag = i === 0 ? " ← AUJOURD'HUI" : i === 1 ? " (demain)" : "";
      refLines.push(`${iso} = ${wd}${tag}`);
    }
    const refCalendar = refLines.join("\n");

    // Contexte projets : trié (montages à venir d'abord), avec le jour de la
    // semaine précalculé pour chaque date de montage. Mis en cache 5 min.
    let projectsContext = getCached<string>("ai-context");
    if (!projectsContext) {
      const projects = await getProjects();
      const fmtDate = (iso: string | null | undefined): string => {
        if (!iso) return "non fixé";
        const dateOnly = iso.slice(0, 10);
        const d = new Date(dateOnly + "T12:00:00");
        if (isNaN(d.getTime())) return dateOnly;
        return `${dateOnly} (${wdFmt.format(d)})`;
      };
      const line = (p: (typeof projects)[number]) =>
        `- ${p.ofrTM} | ${p.projet} | Chantier: ${p.nomChantier} | Adresse: ${p.adresseChantier} | Cabines: ${p.nbCabines} | Fournisseurs: ${p.fournisseurs.join(",")} | Séries: ${p.seriesCabines.join(",")} | Collaborateurs: ${p.collaborateurs} | Statut: ${p.etatCMD} | Date montage: ${fmtDate(p.dateMontage)}`;

      const withDate = projects.filter((p) => p.dateMontage);
      const noDate = projects.filter((p) => !p.dateMontage);
      const future = withDate
        .filter((p) => (p.dateMontage as string).slice(0, 10) >= todayIso)
        .sort((a, b) => ((a.dateMontage as string) < (b.dateMontage as string) ? -1 : 1));
      const past = withDate
        .filter((p) => (p.dateMontage as string).slice(0, 10) < todayIso)
        .sort((a, b) => ((a.dateMontage as string) > (b.dateMontage as string) ? -1 : 1));

      projectsContext = [...future, ...past, ...noDate].slice(0, 60).map(line).join("\n");
      setCache("ai-context", projectsContext);
    }

    const systemPrompt = `Tu es l'assistant IA de TM Douche Montage Sàrl, entreprise d'installation de cabines de douche en Suisse.

CONTEXTE TEMPOREL
Aujourd'hui nous sommes ${todayLabel} (${todayIso}).
Calendrier de référence (date = jour de la semaine) :
${refCalendar}

UTILISATEUR CONNECTÉ : ${user.name} (${user.email})

PROJETS (triés : montages à venir d'abord ; chaque date de montage est suivie de son jour de la semaine) :
${projectsContext}

RÈGLES STRICTES — À RESPECTER ABSOLUMENT :
1. N'INVENTE JAMAIS de date, de numéro de projet (OFR), de nom de chantier, d'adresse ni de collaborateur. Utilise UNIQUEMENT les données ci-dessus.
2. Pour une question de date (« lundi prochain », « demain », « cette semaine »…), convertis-la d'abord en date exacte (AAAA-MM-JJ) à l'aide du calendrier de référence, puis liste UNIQUEMENT les projets dont la « Date montage » correspond EXACTEMENT à cette date.
3. Un projet n'est concerné par une date QUE si sa « Date montage » est exactement celle-ci. Ne propose jamais un projet dont la date est différente.
4. Si aucun projet ne correspond, dis clairement qu'il n'y a aucun montage à cette/ces date(s). Ne comble pas le vide en inventant.
5. Réponds toujours en français, de façon concise et pratique (monteurs sur le terrain).
6. Pour les conseils techniques (séries Duka, Koralle, Duscholux, Nelo, Ronal…), tu peux donner des conseils généraux mais précise que le manuel officiel du fournisseur fait référence.
7. Si une information demandée n'est pas dans les données, dis honnêtement que tu ne l'as pas.`;

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
