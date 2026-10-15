import { NextRequest, NextResponse } from "next/server";
import { descripteurFichier } from "@/lib/notion-fichiers";
import { verifyToken } from "@/lib/auth";
import { getData, getDataFresh, setData } from "@/lib/kv-store";
import { notion } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";
import { redisEnabled, redisLockAcquire, redisLockRelease } from "@/lib/redis-cache";
import {
  empreinteSignalement, rejeuDe, pierreTombaleDe, purgerPierresTombales,
  type PierreTombale,
} from "@/lib/signalement-integrite";

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
  /** Numéro du lot concerné (1, 2, 3…). Seule référence fiable : deux lots
   *  peuvent porter le MÊME nom (« SDD » au rez et à l'étage), et le
   *  signalement apparaissait alors sur les deux. */
  cabineIdx?: number;
  /** Défaut réglé (par défaut, indépendant). Rollup projet = tous réglés. */
  resolved?: boolean;
}

const KEY = "defauts";
/** Les suppressions dont on garde la trace, pour qu'elles tiennent. */
const KEY_TOMBES = "defauts-supprimes";

/**
 * Un seul serveur à la fois sur la liste des signalements.
 *
 * Chaque écriture relit la liste ENTIÈRE et la réécrit. Deux serveurs qui
 * s'en occupent en même temps lisent le même état de départ, et le second
 * efface le travail du premier : une suppression annulée par un ajout, un
 * ajout annulé par une suppression. Le verrou existant dans kv-store ne vaut
 * que dans un seul processus — or Vercel en lance autant qu'il veut.
 *
 * Si Redis n'est pas joignable, on travaille sans : mieux vaut un risque de
 * collision qu'un signalement refusé.
 */
const VERROU = "lock:defauts";
export class VerrouIndisponible extends Error {}

/**
 * Prendre le verrou veut dire ATTENDRE son tour, pas renoncer.
 *
 * Première version de ce garde-fou, le 15 octobre : elle demandait le
 * verrou une fois et, s'il était déjà pris, continuait quand même. Elle ne
 * protégeait donc que lorsqu'il n'y avait rien à protéger. Micael
 * supprimait ses doublons les uns après les autres sans attendre — le
 * navigateur n'attend pas non plus —, deux effacements partaient ensemble,
 * relisaient la même liste, et le second réécrivait le premier : la ligne
 * revenait. Huit tours de ménage pour ce motif.
 *
 * On réessaie donc, brièvement, jusqu'à l'obtenir. Et si vraiment on n'y
 * arrive pas, on le DIT — le navigateur remet la ligne et affiche que
 * l'effacement a échoué — plutôt que de travailler à l'aveugle et de
 * laisser croire que c'est fait.
 */
/**
 * Le verrou doit survivre à l'écriture qu'il protège.
 *
 * Il expirait au bout de trente secondes, alors qu'une écriture en prenait
 * dix-neuf : une écriture un peu lente perdait sa protection EN COURS DE
 * ROUTE, un second serveur prenait le verrou, et les deux réécrivaient la
 * liste chacun de son côté. Démontré le 16 octobre en production, à mes
 * dépens — une ligne effacée, une autre ressuscitée.
 *
 * L'écriture est tombée à trois secondes (voir CLES_CONTENEUR dans
 * kv-store). Une minute laisse vingt fois la marge nécessaire, et borne
 * tout de même un blocage si un serveur meurt sans relâcher.
 */
const DUREE_VERROU_MS = 60_000;
const ATTENTE_VERROU_MS = 25_000;
async function avecVerrou<T>(faire: () => Promise<T>): Promise<T> {
  let jeton: string | null = null;
  if (redisEnabled) {
    const limite = Date.now() + ATTENTE_VERROU_MS;
    for (;;) {
      jeton = await redisLockAcquire(VERROU, DUREE_VERROU_MS);
      if (jeton) break;
      if (Date.now() >= limite) throw new VerrouIndisponible();
      await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 150)));
    }
  }
  try {
    return await faire();
  } finally {
    if (jeton) await redisLockRelease(VERROU, jeton).catch(() => {});
  }
}

/** Réponse commune quand le verrou n'a pas pu être pris. */
function occupe() {
  return NextResponse.json(
    { error: "Une autre écriture est en cours, réessayez" },
    { status: 503 },
  );
}

async function lireTombes(): Promise<PierreTombale[]> {
  try {
    return await getDataFresh<PierreTombale>(KEY_TOMBES);
  } catch {
    /* Pas de trace des suppressions : on continue sans. Le pire qui puisse
       arriver est qu'un rejeu recrée un signalement effacé — visible, et
       rattrapable — alors que refuser l'enregistrement perdrait une saisie. */
    return [];
  }
}

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
  try {
    return await avecVerrou(() => enregistrer(body, user.name));
  } catch (err) {
    if (err instanceof VerrouIndisponible) return occupe();
    throw err;
  }
}

async function enregistrer(body: Partial<DefautRequest>, nomUtilisateur: string) {
  /* Lecture FRAÎCHE avant d'écrire : on réécrit la LISTE ENTIÈRE, donc partir
     d'une copie en cache ferait perdre toute modification enregistrée depuis
     moins d'une minute par une autre instance. En cas d'erreur Notion on
     abandonne plutôt que d'écrire du périmé. */
  /* Les deux LECTURES sont indépendantes — la liste des signalements d'un
     côté, la fiche du chantier de l'autre — et chacune est un aller-retour
     chez Notion. Les enchaîner, puis enchaîner encore les deux écritures,
     faisait quatre attentes bout à bout pour un simple signalement. */
  const [resListe, resPage, tombes] = await Promise.all([
    Promise.allSettled([getDataFresh<DefautRequest>(KEY)]).then((r) => r[0]),
    Promise.allSettled([
      body.projectId ? notion.pages.retrieve({ page_id: body.projectId }) : Promise.resolve(null),
    ]).then((r) => r[0]),
    lireTombes(),
  ]);
  if (resListe.status === "rejected") {
    return NextResponse.json({ error: "Notion indisponible, réessayez" }, { status: 503 });
  }
  const defauts: DefautRequest[] = resListe.value;
  const pageProjet = resPage.status === "fulfilled" ? resPage.value : null;
  const maintenant = Date.now();

  /* GARDE-FOU 1 — EST-CE DÉJÀ ENREGISTRÉ ?
     L'enregistrement dure plus longtemps que les vingt-cinq secondes que le
     téléphone accorde : il croit l'envoi perdu, le range dans sa file et le
     rejoue, alors que le premier avait abouti. Douze inscriptions pour un
     constat, le 15 octobre 2026. Les règles — identifiant, photos
     identiques, contenu récent — sont dans lib/signalement-integrite. */
  const rejeu = rejeuDe(defauts, { ...body, timestamp: maintenant }, maintenant);
  if (rejeu) {
    return NextResponse.json({ success: true, deja: true, motif: rejeu.motif, defaut: rejeu.existant });
  }

  /* GARDE-FOU 2 — A-T-IL ÉTÉ EFFACÉ ?
     Effacer un signalement ne vide pas la file du téléphone : le rejeu
     suivant le recréait. C'est ce qui faisait MONTER le compteur pendant
     qu'on supprimait. On répond que c'est fait — la file se vide — et on
     n'inscrit rien. */
  const tombe = pierreTombaleDe(tombes, body);
  if (tombe) {
    return NextResponse.json({ success: true, supprime: true, quand: tombe.quand });
  }

  const idClient = typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
  defauts.push({
    ...(body as DefautRequest),
    id: idClient || Math.random().toString(36).slice(2),
    user: nomUtilisateur,
    status: "signale",
    timestamp: maintenant,
    comments: [],
    // Si le client n'a pas envoyé le flag, on considère que oui (par défaut
    // on affiche dans le rapport, c'est le comportement attendu).
    displayInRapport: body.displayInRapport !== false,
  });
  const majFiche = async () => {
  // Write to Notion project page (primary storage)
  if (body.projectId && pageProjet) {
    try {
      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const typesStr = Array.isArray(body.types) ? body.types.join(", ") : (body.typesLabel || "-");
      const summary = `Types: ${typesStr} | Description: ${body.description || "-"} | Par: ${nomUtilisateur} | Date: ${dateStr}`;

      const page = pageProjet;
      const existingText = (page as any).properties["Infos - Défauts signalé"]?.rich_text?.map((t: any) => t.plain_text).join("") || "";
      const newText = existingText ? `${existingText}\n${summary}` : summary;

      const properties: any = {
        "Infos - Défauts signalé": {
          rich_text: [{ text: { content: newText.slice(0, 2000) } }],
        },
      };

      // Add photos if present → colonne UNIFIÉE « Photos pour signalements ».
      const photos = body.photoUrls || [];
      if (photos.length > 0) {
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

        const newFiles = photos.map((url: string, i: number) => ({
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
  };
  await Promise.all([setData(KEY, defauts), majFiche()]);

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  try {
    return await avecVerrou(() => effacer(id, user.name));
  } catch (err) {
    if (err instanceof VerrouIndisponible) return occupe();
    throw err;
  }
}

async function effacer(id: string, nomUtilisateur: string) {
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

  /* LA TRACE DE LA SUPPRESSION.
     Sans elle, effacer ne suffisait pas : le téléphone garde sa demande tant
     qu'il n'a pas reçu d'accusé de réception, et le rejeu suivant recréait
     le signalement. On écrit donc ce qu'on vient d'effacer, et le POST s'y
     réfère avant d'inscrire quoi que ce soit.

     Si cette écriture échoue, la suppression a tout de même lieu : perdre la
     trace fait au pire revenir une ligne, qu'on voit et qu'on efface à
     nouveau. Refuser la suppression, lui, ne réglerait rien. */
  const poserLaPierre = async () => {
    if (!defaut) return;
    try {
      const avant = await lireTombes();
      const tombe: PierreTombale = {
        id: defaut.id,
        empreinte: empreinteSignalement(defaut),
        quand: Date.now(),
        par: nomUtilisateur,
      };
      await setData(KEY_TOMBES, [...purgerPierresTombales(avant, Date.now()), tombe]);
    } catch (err) {
      console.error("[defauts] trace de suppression non enregistrée:", err);
    }
  };

  /* Les deux écritures sont indépendantes — la liste d'un côté, le texte de
     la fiche de l'autre — et chacune prend plusieurs secondes chez Notion.
     Les enchaîner doublait l'attente pour rien. */
  const majFiche = async () => {
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
  };
  await Promise.all([setData(KEY, updated), majFiche(), poserLaPierre()]);

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  /* Une modification relit et réécrit la liste ENTIÈRE, comme les autres :
     sans le même verrou, elle écraserait une création ou une suppression
     faite au même instant par un autre serveur. */
  try {
    return await avecVerrou(() => modifier(body, user.name));
  } catch (err) {
    if (err instanceof VerrouIndisponible) return occupe();
    throw err;
  }
}

async function modifier(body: Partial<DefautRequest> & { comment?: string }, nomUtilisateur: string) {
  const { id, status, comment, displayInRapport, description, resolved, cabineLabel, photoUrls, types, typesLabel, cabineIdx} = body;
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
    defauts[idx].comments.push({ user: nomUtilisateur, message: comment, timestamp: Date.now() });
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
  /* Rattacher un signalement au bon lot APRÈS coup : ceux d'avant le
     16 octobre 2026 n'ont pas de numéro et s'affichent donc sur tous les
     lots qui portent le même nom. */
  if (typeof cabineIdx === "number" && cabineIdx > 0) defauts[idx].cabineIdx = cabineIdx;

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
