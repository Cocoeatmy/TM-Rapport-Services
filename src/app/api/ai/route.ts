import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getProjects } from "@/lib/notion";
import { getCached, setCache } from "@/lib/server-cache";

export const dynamic = "force-dynamic";

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
      temperature: 0.3,
      max_tokens: 1024,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Désolé, je n'ai pas pu répondre.";
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { message } = await request.json();
  if (!message) return NextResponse.json({ error: "Message requis" }, { status: 400 });

  try {
    // Charger le contexte Notion (projets en cache)
    let projectsContext = getCached<string>("ai-context");
    if (!projectsContext) {
      const projects = await getProjects();
      projectsContext = projects.slice(0, 30).map((p) =>
        `- ${p.ofrTM} | ${p.projet} | Chantier: ${p.nomChantier} | Adresse: ${p.adresseChantier} | Cabines: ${p.nbCabines} | Fournisseurs: ${p.fournisseurs.join(",")} | Séries: ${p.seriesCabines.join(",")} | Collaborateurs: ${p.collaborateurs} | Statut: ${p.etatCMD} | Date montage: ${p.dateMontage || "non fixé"}`
      ).join("\n");
      setCache("ai-context", projectsContext);
    }

    const systemPrompt = `Tu es l'assistant IA de TM Douche Montage Sàrl, une entreprise spécialisée dans l'installation de cabines de douche en Suisse.

Tu aides les monteurs sur le terrain avec :
- Des informations sur les projets en cours
- Des conseils techniques de montage
- La recherche d'informations sur les séries de cabines (Duka, Koralle, Duscholux, Nelo, Ronal, etc.)
- Des réponses aux questions pratiques

L'utilisateur connecté est : ${user.name} (${user.email})

Voici les projets en cours dans la base de données :
${projectsContext}

Règles :
- Réponds TOUJOURS en français
- Sois concis et pratique (les monteurs sont sur le terrain)
- Si tu ne connais pas la réponse, dis-le honnêtement
- Pour les manuels de montage, indique que tu peux donner des conseils généraux mais que le manuel officiel du fournisseur fait référence
- Si on te demande des infos sur un projet, cherche dans la liste ci-dessus`;

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
