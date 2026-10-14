import { NextRequest, NextResponse } from "next/server";
import { descripteurFichier } from "@/lib/notion-fichiers";
import { verifyToken } from "@/lib/auth";
import { getData, getDataFresh, setData } from "@/lib/kv-store";
import { notion } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";

interface DefautComment {
  user: string;
  message: string;
  timestamp: number;
}

interface DefautRequest {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  types: string[];
  typesLabel: string;
  description: string;
  photoUrls: string[];
  status: "signale" | "en-cours" | "resolu";
  timestamp: number;
  comments: DefautComment[];
  // Indique si le défaut doit apparaître dans le rapport PDF envoyé
  // au client. Par défaut true (rétro-compat : les anciens défauts
  // sans ce champ sont traités comme "à afficher").
  displayInRapport?: boolean;
  cabineLabel?: string;
  /** Défaut réglé (par défaut, indépendant). Rollup projet = tous réglés. */
  resolved?: boolean;
}

const KEY = "defauts";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const projectId = request.nextUrl.searchParams.get("projectId");
  /* Lecture FRAÎCHE, et non le cache mémoire de l'instance.
     Ce cache dure soixante secondes et vit DANS CHAQUE instance serverless.
     Après une modification enregistrée par l'instance A, une relecture servie
     par l'instance B rendait la liste d'AVANT pendant une minute : le texte
     qu'on venait d'ajouter à un signalement disparaissait de l'écran tout
     seul, puis revenait. En cas d'erreur Notion on retombe sur le cache —
     mieux vaut une liste d'il y a une minute que pas de liste. */
  const defauts = await getDataFresh<DefautRequest>(KEY)
    .catch(() => getData<DefautRequest>(KEY));
  return NextResponse.json(projectId ? defauts.filter((d) => d.projectId === projectId) : defauts);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  /* Lecture FRAÎCHE avant d'écrire : on réécrit la LISTE ENTIÈRE, donc partir
     d'une copie en cache ferait perdre toute modification enregistrée depuis
     moins d'une minute par une autre instance. En cas d'erreur Notion on
     abandonne plutôt que d'écrire du périmé. */
  let defauts: DefautRequest[];
  try {
    defauts = await getDataFresh<DefautRequest>(KEY);
  } catch {
    return NextResponse.json({ error: "Notion indisponible, réessayez" }, { status: 503 });
  }
  defauts.push({
    id: Math.random().toString(36).slice(2),
    ...body,
    user: user.name,
    status: "signale",
    timestamp: Date.now(),
    comments: [],
    // Si le client n'a pas envoyé le flag, on considère que oui (par défaut
    // on affiche dans le rapport, c'est le comportement attendu).
    displayInRapport: body.displayInRapport !== false,
  });
  await setData(KEY, defauts);

  // Write to Notion project page (primary storage)
  if (body.projectId) {
    try {
      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const typesStr = Array.isArray(body.types) ? body.types.join(", ") : (body.typesLabel || "-");
      const summary = `Types: ${typesStr} | Description: ${body.description || "-"} | Par: ${user.name} | Date: ${dateStr}`;

      // Read existing text to append
      const page = await notion.pages.retrieve({ page_id: body.projectId });
      const existingText = (page as any).properties["Infos - Défauts signalé"]?.rich_text?.map((t: any) => t.plain_text).join("") || "";
      const newText = existingText ? `${existingText}\n${summary}` : summary;

      const properties: any = {
        "Infos - Défauts signalé": {
          rich_text: [{ text: { content: newText.slice(0, 2000) } }],
        },
      };

      // Add photos if present → colonne UNIFIÉE « Photos pour signalements ».
      if (body.photoUrls?.length > 0) {
        const existingFiles = (page as any).properties["Photos pour signalements"]?.files || [];
        /* Chaque fichier repart sous le type que Notion lui connaît : une photo
           déposée à la main dans la fiche est hébergée par Notion, qui refuse
           de la reprendre en « external » et rejette alors la propriété
           entière (voir src/lib/notion-fichiers.ts). */
        const mappedExisting = existingFiles
          .map((f: any) => ({
            nom: f.name || "photo.jpg",
            url: (f.type === "external" ? f.external?.url : f.file?.url) || "",
          }))
          .filter((f: any) => f.url)
          .map((f: any) => descripteurFichier(f.nom, f.url));

        const newFiles = body.photoUrls.map((url: string, i: number) => ({
          type: "external" as const,
          name: `defaut-${dateStr}-${i + 1}.jpg`,
          external: { url },
        }));

        properties["Photos pour signalements"] = {
          files: [...mappedExisting, ...newFiles],
        };
      }

      await notion.pages.update({ page_id: body.projectId, properties });
      invalidateCache(`project-${body.projectId}`);
    } catch (err) {
      console.error("Notion defaut sync error:", err);
      // kv-store already saved as backup, continue
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  /* Lecture FRAÎCHE avant d'écrire : on réécrit la LISTE ENTIÈRE, donc partir
     d'une copie en cache ferait perdre toute modification enregistrée depuis
     moins d'une minute par une autre instance. En cas d'erreur Notion on
     abandonne plutôt que d'écrire du périmé. */
  let defauts: DefautRequest[];
  try {
    defauts = await getDataFresh<DefautRequest>(KEY);
  } catch {
    return NextResponse.json({ error: "Notion indisponible, réessayez" }, { status: 503 });
  }
  const defaut = defauts.find((d) => d.id === id);
  const updated = defauts.filter((d) => d.id !== id);
  await setData(KEY, updated);

  // Rebuild the Notion "Infos - Défauts signalé" field from remaining KV entries for this project
  if (defaut?.projectId) {
    try {
      const remaining = updated.filter((d) => d.projectId === defaut.projectId);
      const newText = remaining.map((d) => {
        const typesStr = d.types?.join(", ") || d.typesLabel || "-";
        return `Types: ${typesStr} | Description: ${d.description || "-"} | Par: ${d.user} | Date: ${d.timestamp ? new Date(d.timestamp).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""}`;
      }).join("\n");

      await notion.pages.update({
        page_id: defaut.projectId,
        properties: {
          "Infos - Défauts signalé": {
            rich_text: newText ? [{ text: { content: newText.slice(0, 2000) } }] : [],
          },
        },
      });
      invalidateCache(`project-${defaut.projectId}`);
    } catch (err) {
      console.error("Notion defaut delete sync error:", err);
    }
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const { id, status, comment, displayInRapport, description, resolved, cabineLabel, photoUrls, types, typesLabel } = body;
  // Lecture FRAÎCHE (bypass cache) : évite qu'une instance au cache périmé ne
  // trouve pas le défaut (→ 404 silencieux) ou n'écrase des modifications
  // récentes. En cas d'erreur Notion, on abandonne (pas d'écrasement).
  let defauts: DefautRequest[];
  try {
    defauts = await getDataFresh<DefautRequest>(KEY);
  } catch {
    return NextResponse.json({ error: "Notion indisponible, réessayez" }, { status: 503 });
  }
  const idx = defauts.findIndex((d) => d.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if (comment) {
    if (!defauts[idx].comments) defauts[idx].comments = [];
    defauts[idx].comments.push({ user: user.name, message: comment, timestamp: Date.now() });
  }
  if (status) defauts[idx].status = status;
  if (typeof displayInRapport === "boolean") defauts[idx].displayInRapport = displayInRapport;
  if (typeof description === "string") defauts[idx].description = description;
  if (typeof resolved === "boolean") defauts[idx].resolved = resolved;
  // Édition : ajout de photos + re-choix des types.
  if (Array.isArray(photoUrls)) defauts[idx].photoUrls = photoUrls;
  if (Array.isArray(types)) defauts[idx].types = types;
  if (typeof typesLabel === "string") defauts[idx].typesLabel = typesLabel;
  // Renommage d'une cabine : on met à jour le libellé rattaché pour que le
  // signalement reste relié au bon lot (icône dans l'app + titre dans le PDF).
  if (typeof cabineLabel === "string" && cabineLabel.trim()) defauts[idx].cabineLabel = cabineLabel.trim();

  await setData(KEY, defauts);

  // Rollup vers la case Notion PROJET « Soucis montages clôturé » : cochée
  // uniquement quand TOUS les défauts du projet sont réglés. (Non bloquant.)
  if (typeof resolved === "boolean") {
    const projectId = defauts[idx].projectId;
    if (projectId) {
      try {
        const projectDefauts = defauts.filter((d) => d.projectId === projectId);
        const allResolved = projectDefauts.length > 0 && projectDefauts.every((d) => d.resolved);
        await notion.pages.update({
          page_id: projectId,
          properties: { "Soucis montages clôturé": { checkbox: allResolved } },
        });
        invalidateCache(`project-${projectId}`);
      } catch (err) {
        console.error("Notion soucis-cloture rollup error:", err);
      }
    }
  }

  return NextResponse.json({ success: true });
}
