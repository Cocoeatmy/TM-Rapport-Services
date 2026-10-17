import { NextRequest, NextResponse } from "next/server";
import { descripteurFichier } from "@/lib/notion-fichiers";
import { exigerDroit } from "@/lib/droits-serveur";
import { getData, getDataFresh, setData } from "@/lib/kv-store";
import { notion } from "@/lib/notion";
import { invalidateCache } from "@/lib/server-cache";
import { avecVerrou, VerrouIndisponible } from "@/lib/verrou-liste";
import {
  empreinteSignalement, rejeuDe, pierreTombaleDe, purgerPierresTombales,
  type PierreTombale,
} from "@/lib/signalement-integrite";

interface PieceComment {
  user: string;
  message: string;
  timestamp: number;
}

interface PieceRequest {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  description: string;
  reference: string;
  photoUrl?: string;
  photoUrls?: string[];
  status: "demande" | "commande" | "recu";
  timestamp: number;
  comments: PieceComment[];
  cabineLabel?: string;
  /** Numéro du lot concerné (1, 2, 3…). Seule référence fiable : deux lots
   *  peuvent porter le MÊME nom (« SDD » au rez et à l'étage), et le
   *  signalement apparaissait alors sur les deux. */
  cabineIdx?: number;
  /** Afficher cette pièce sur le rapport client (PDF). Absent/true = affichée. */
  displayInRapport?: boolean;
  /** Pièce manquante RÉGLÉE (reçue/posée). Passe le signalement en vert. */
  resolved?: boolean;
  /**
   * Horodatage du règlement — pièce reçue ou posée.
   *
   * Sans lui, on ne savait mesurer que l'âge de ce qui ATTEND encore : une
   * fois la pièce reçue, la durée d'attente disparaissait avec le statut.
   * Impossible, donc, de dire qu'un fournisseur met trois semaines quand un
   * autre en met trois jours. Il est posé automatiquement au passage en
   * « reçu », et retiré si le signalement est rouvert.
   */
  resolvedAt?: number;
}

const KEY = "pieces";
/**
 * Les pièces effacées laissent une trace.
 *
 * Effacer ne vide pas la file du téléphone : tant qu'il n'a pas reçu
 * d'accusé de réception, il rejoue sa demande — et le signalement
 * réapparaît. C'est ce qui faisait MONTER le compteur pendant qu'on
 * supprimait, sur les défauts, en octobre 2026. Les pièces manquantes
 * partageaient la même architecture sans partager la parade (audit A3).
 */
const KEY_TOMBES = "pieces-supprimees";
/** Un seul verrou pour toute la liste : elle se réécrit en entier. */
const VERROU = "lock:pieces";

async function lireTombes(): Promise<PierreTombale[]> {
  try {
    return await getDataFresh<PierreTombale>(KEY_TOMBES);
  } catch {
    /* Pas de trace des suppressions : on continue sans. Au pire un rejeu
       recrée une ligne effacée — visible et rattrapable — là où refuser
       l'enregistrement perdrait une saisie de chantier. */
    return [];
  }
}

/** Réponse commune quand le verrou n'a pas pu être pris. */
function occupe() {
  return NextResponse.json(
    { error: "Une autre écriture est en cours, réessayez" },
    { status: 503 },
  );
}

export async function GET(request: NextRequest) {
  const v = await exigerDroit("signalements.voir");
  if ("refus" in v) return v.refus;

  const projectId = request.nextUrl.searchParams.get("projectId");
  /* Lecture FRAÎCHE, et non le cache mémoire de l'instance : il dure soixante
     secondes et vit DANS CHAQUE instance serverless. Après une modification
     enregistrée par l'instance A, une relecture servie par l'instance B
     rendait la liste d'AVANT pendant une minute — le texte qu'on venait
     d'ajouter disparaissait de l'écran tout seul, puis revenait. En cas
     d'erreur Notion on retombe sur le cache. */
  const pieces = await getDataFresh<PieceRequest>(KEY)
    .catch(() => getData<PieceRequest>(KEY));
  return NextResponse.json(projectId ? pieces.filter((p) => p.projectId === projectId) : pieces);
}

export async function POST(request: NextRequest) {
  const v = await exigerDroit("signalements.creer");
  if ("refus" in v) return v.refus;
  const user = v.user;

  const body = await request.json();
  try {
    return await avecVerrou(VERROU, () => enregistrer(body, user.name));
  } catch (err) {
    if (err instanceof VerrouIndisponible) return occupe();
    throw err;
  }
}

async function enregistrer(body: Record<string, unknown>, nomUtilisateur: string) {
  /* Lecture FRAÎCHE avant d'écrire : on réécrit la LISTE ENTIÈRE, donc partir
     d'une copie en cache ferait perdre toute modification enregistrée depuis
     moins d'une minute par une autre instance. En cas d'erreur Notion on
     abandonne plutôt que d'écrire du périmé. */
  /* Les deux LECTURES sont indépendantes — la liste d'un côté, la fiche du
     chantier de l'autre. Les enchaîner, puis enchaîner les deux écritures,
     faisait quatre attentes bout à bout. */
  const [resListe, resPage, resTombes] = await Promise.allSettled([
    getDataFresh<PieceRequest>(KEY),
    body.projectId
      ? notion.pages.retrieve({ page_id: body.projectId as string })
      : Promise.resolve(null),
    lireTombes(),
  ]);
  if (resListe.status === "rejected") {
    return NextResponse.json({ error: "Notion indisponible, réessayez" }, { status: 503 });
  }
  const pieces: PieceRequest[] = resListe.value;
  const pageProjet = resPage.status === "fulfilled" ? resPage.value : null;
  const tombes: PierreTombale[] = resTombes.status === "fulfilled" ? resTombes.value : [];
  const maintenant = Date.now();
  /* ANTI-DOUBLON. Le client fabrique l'identifiant et le renvoie à chaque
     tentative : une requête lente coupée au bout de quelques secondes repart
     dans la file et revient ici, alors que la première avait abouti. Sans ce
     garde-fou, un seul signalement s'inscrivait deux ou trois fois —
     constaté le 16 octobre 2026, trois exemplaires par douche. */
  /* GARDE-FOU 1 — EST-CE DÉJÀ ENREGISTRÉ ?
     L'identifiant fabriqué par le client couvrait le cas le plus courant.
     Il ne couvre pas celui d'un client qui n'en envoie pas : mêmes photos,
     ou même contenu à quelques minutes d'intervalle. Les mêmes règles que
     pour les défauts, et la même implémentation. */
  const rejeu = rejeuDe(pieces, { ...body, timestamp: maintenant }, maintenant);
  if (rejeu) {
    return NextResponse.json({ success: true, deja: true, motif: rejeu.motif, piece: rejeu.existant });
  }

  /* GARDE-FOU 2 — A-T-ELLE ÉTÉ EFFACÉE ?
     On répond que c'est fait — la file du téléphone se vide — et on
     n'inscrit rien. Sans cela, supprimer faisait remonter le compteur. */
  const tombe = pierreTombaleDe(tombes, body);
  if (tombe) {
    return NextResponse.json({ success: true, supprime: true, quand: tombe.quand });
  }

  const idClient = typeof body.id === "string" && body.id.trim() ? body.id.trim() : "";
  pieces.push({
    ...(body as unknown as PieceRequest),
    id: idClient || Math.random().toString(36).slice(2),
    user: nomUtilisateur,
    status: "demande",
    timestamp: maintenant,
    comments: [],
  });
  const majFiche = async () => {
  // Write to Notion project page (primary storage)
  if (body.projectId && pageProjet) {
    try {
      const now = new Date();
      const dateStr = `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`;
      const summary = `Description: ${body.description || "-"} | Référence: ${body.reference || "-"} | Statut: demande | Par: ${nomUtilisateur} | Date: ${dateStr}`;

      const page = pageProjet;
      const existingText = (page as any).properties["Infos - Pièces manquantes"]?.rich_text?.map((t: any) => t.plain_text).join("") || "";
      const newText = existingText ? `${existingText}\n${summary}` : summary;

      const properties: any = {
        "Infos - Pièces manquantes": {
          rich_text: [{ text: { content: newText.slice(0, 2000) } }],
        },
      };

      // Add photos if present (support single photoUrl or array photoUrls)
      /* `body` est maintenant typé `Record<string, unknown>` : on nomme ce
         qu'on y lit plutôt que de le supposer. */
      const urlsEnvoyees = Array.isArray(body.photoUrls) ? (body.photoUrls as string[]) : [];
      const urlSeule = typeof body.photoUrl === "string" ? body.photoUrl : "";
      const newPhotoUrls: string[] = urlsEnvoyees.length > 0
        ? urlsEnvoyees
        : urlSeule ? [urlSeule] : [];

      if (newPhotoUrls.length > 0) {
        // Colonne UNIFIÉE des photos de signalement (pièces + défauts).
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

        properties["Photos pour signalements"] = {
          files: [
            ...mappedExisting,
            ...newPhotoUrls.map((url, i) => ({
              type: "external" as const,
              name: `piece-${dateStr}-${i + 1}.jpg`,
              external: { url },
            })),
          ],
        };
      }

      await notion.pages.update({ page_id: body.projectId as string, properties });
      invalidateCache(`project-${body.projectId as string}`);
    } catch (err) {
      console.error("Notion piece sync error:", err);
      // kv-store already saved as backup, continue
    }
  }
  };
  await Promise.all([setData(KEY, pieces), majFiche()]);

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const v = await exigerDroit("signalements.supprimer");
  if ("refus" in v) return v.refus;

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  try {
    return await avecVerrou(VERROU, () => effacer(id, v.user.name));
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
  let pieces: PieceRequest[];
  try {
    pieces = await getDataFresh<PieceRequest>(KEY);
  } catch {
    return NextResponse.json({ error: "Notion indisponible, réessayez" }, { status: 503 });
  }
  const piece = pieces.find((p) => p.id === id);
  const updated = pieces.filter((p) => p.id !== id);

  /* LA TRACE DE LA SUPPRESSION.
     Le téléphone garde sa demande tant qu'il n'a pas reçu d'accusé de
     réception : sans cette trace, le rejeu suivant recrée la pièce qu'on
     vient d'effacer. Si l'écriture de la trace échoue, la suppression a
     quand même lieu — perdre la trace fait au pire revenir une ligne, qu'on
     voit et qu'on efface à nouveau. */
  const poserLaPierre = async () => {
    if (!piece) return;
    try {
      const avant = await lireTombes();
      const tombe: PierreTombale = {
        id: piece.id,
        empreinte: empreinteSignalement(piece),
        quand: Date.now(),
        par: nomUtilisateur,
      };
      await setData(KEY_TOMBES, [...purgerPierresTombales(avant, Date.now()), tombe]);
    } catch (err) {
      console.error("[pieces] trace de suppression non enregistrée:", err);
    }
  };

  /* Les deux écritures sont indépendantes — la liste d'un côté, le texte de
     la fiche de l'autre — et chacune prend plusieurs secondes chez Notion.
     Les enchaîner doublait l'attente pour rien. */
  const majFiche = async () => {
  // Rebuild Notion "Infos - Pièces manquantes" from remaining entries for this project
  if (piece?.projectId) {
    try {
      const remaining = updated.filter((p) => p.projectId === piece.projectId);
      const newText = remaining.map((p) => {
        const dateStr = p.timestamp
          ? new Date(p.timestamp).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "";
        return `Description: ${p.description || "-"} | Référence: ${p.reference || "-"} | Statut: ${p.status || "demande"} | Par: ${p.user} | Date: ${dateStr}`;
      }).join("\n");

      await notion.pages.update({
        page_id: piece.projectId,
        properties: {
          "Infos - Pièces manquantes": {
            rich_text: newText ? [{ text: { content: newText.slice(0, 2000) } }] : [],
          },
        },
      });
      invalidateCache(`project-${piece.projectId}`);
    } catch (err) {
      console.error("Notion piece delete sync error:", err);
    }
  }
  };
  await Promise.all([setData(KEY, updated), majFiche(), poserLaPierre()]);

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const v = await exigerDroit("signalements.modifier");
  if ("refus" in v) return v.refus;

  const body = await request.json();
  /* Une modification relit et réécrit la liste ENTIÈRE, comme les autres :
     sans le même verrou, elle écraserait une création ou une suppression
     faite au même instant par un autre serveur. */
  try {
    return await avecVerrou(VERROU, () => modifier(body, v.user.name));
  } catch (err) {
    if (err instanceof VerrouIndisponible) return occupe();
    throw err;
  }
}

async function modifier(body: Record<string, any>, nomUtilisateur: string) {
  const { id, status, comment, description, reference, displayInRapport, resolved, cabineLabel, photoUrls, cabineIdx} = body;
  /* Lecture FRAÎCHE avant d'écrire : on réécrit la LISTE ENTIÈRE, donc partir
     d'une copie en cache ferait perdre toute modification enregistrée depuis
     moins d'une minute par une autre instance. En cas d'erreur Notion on
     abandonne plutôt que d'écrire du périmé. */
  let pieces: PieceRequest[];
  try {
    pieces = await getDataFresh<PieceRequest>(KEY);
  } catch {
    return NextResponse.json({ error: "Notion indisponible, réessayez" }, { status: 503 });
  }
  const idx = pieces.findIndex((p) => p.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if (comment) {
    if (!pieces[idx].comments) pieces[idx].comments = [];
    pieces[idx].comments.push({ user: nomUtilisateur, message: comment, timestamp: Date.now() });
  }
  if (status) pieces[idx].status = status;
  if (typeof description === "string") pieces[idx].description = description;
  if (typeof reference === "string") pieces[idx].reference = reference;
  if (typeof displayInRapport === "boolean") pieces[idx].displayInRapport = displayInRapport;
  if (typeof resolved === "boolean") pieces[idx].resolved = resolved;
  // Ajout/modification de photos après coup (édition).
  if (Array.isArray(photoUrls)) pieces[idx].photoUrls = photoUrls;
  // Renommage d'une cabine : garde la pièce reliée au bon lot.
  if (typeof cabineLabel === "string" && cabineLabel.trim()) pieces[idx].cabineLabel = cabineLabel.trim();
  /* Rattacher un signalement au bon lot APRÈS coup : ceux d'avant le
     16 octobre 2026 n'ont pas de numéro et s'affichent donc sur tous les
     lots qui portent le même nom. */
  if (typeof cabineIdx === "number" && cabineIdx > 0) pieces[idx].cabineIdx = cabineIdx;

  /* Le règlement s'horodate tout seul : demander la date à celui qui clique
     ferait manquer la moitié des cas. « Reçu » ou « réglé » vaut règlement ;
     rouvrir efface la date, sans quoi un aller-retour laisserait derrière lui
     une durée d'attente fausse. Calculé APRÈS statut et `resolved`, qui
     peuvent arriver dans la même requête. */
  const regle = pieces[idx].status === "recu" || pieces[idx].resolved === true;
  if (regle && !pieces[idx].resolvedAt) pieces[idx].resolvedAt = Date.now();
  if (!regle && pieces[idx].resolvedAt) delete pieces[idx].resolvedAt;

  await setData(KEY, pieces);
  return NextResponse.json({ success: true });
}
