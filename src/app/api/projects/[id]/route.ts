import { NextRequest, NextResponse } from "next/server";
import { exigerDroit } from "@/lib/droits-serveur";
import { projetVisible, accesProjetAutorise } from "@/lib/perimetre-serveur";
import { verifierHeuresEntrantes, toucheDesHeures, COUPLES_HEURES } from "@/lib/heures-coherentes";
import { getProject, updateProject } from "@/lib/notion";
import { cachedOrFetch, invalidateCache } from "@/lib/server-cache";
import { onStatusChange } from "@/lib/projets-cache";
import { besoinDeFusion, fusionnerAvecExistant } from "@/lib/fusion-cabines";
import { sansArgent } from "@/lib/argent-projets";
import { estProprietaire } from "@/lib/droits-serveur";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;




// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await cachedOrFetch(`project-${id}`, () => getProject(id));

    /* Une liste filtrée ne sert à rien si l'adresse directe reste ouverte :
       il suffirait de taper l'identifiant. Le contrôle est donc ici aussi,
       et la réponse d'un compte restreint cesse d'être mise en cache
       partagé — sinon le CDN la servirait à quelqu'un d'autre. */
    if (!(await projetVisible(project))) {
      return NextResponse.json(
        { error: "Ce projet ne vous est pas accessible." },
        { status: 403, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    /* PAS de cache CDN (22.10.2026). Il resservait la fiche d'avant pendant
       15 s (+ 30 s « stale ») après un enregistrement : la saisie disparaissait
       puis revenait à la relecture suivante. Il servait aussi la réponse sans
       repasser par le contrôle d'accès ci-dessus. La charge Notion reste
       bornée par le cache serveur (server-cache, avec ses garde-fous
       d'écriture). */
    // L'argent du projet : au propriétaire seulement (voir argent-projets).
    const lisible = (await estProprietaire(await getUser())) ? project : sansArgent(project);
    return NextResponse.json(lisible, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error: any) {
    const isRateLimit = error?.status === 429 || error?.code === "rate_limited";
    if (isRateLimit) {
      console.warn("[GET /api/projects/[id]] Notion rate limit, retrying later");
      return NextResponse.json(
        { error: "Service temporairement surchargé. Réessayez dans quelques secondes." },
        { status: 503, headers: { "Retry-After": "15", "Cache-Control": "no-store" } }
      );
    }
    console.error("Error fetching project:", error);
    return NextResponse.json(
      { error: error.message || "Projet introuvable" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  /* Le contrôle vit ICI, pas seulement dans l'écran : sans lui, l'adresse
     restait ouverte en écriture à n'importe quel compte connecté, et un
     bouton masqué n'a jamais empêché personne d'appeler l'adresse. */
  const v = await exigerDroit("projets.modifier");
  if ("refus" in v) return v.refus;
  let id = "unknown";
  try {
    id = (await params).id;
    const body = await request.json();

    /* Les deux états du Kanban se verrouillent séparément : on peut confier à
       quelqu'un l'avancement des mesures sans lui confier celui des
       commandes. Le contrôle est ici, et non dans le Kanban, parce que ces
       deux propriétés se modifient aussi depuis d'autres écrans. */
    /* L'argent ne se modifie que par le propriétaire (montant de l'offre,
       état de facturation). */
    if ("montantOFR" in body || "facturations" in body) {
      const a = await exigerDroit("argent.voir");
      if ("refus" in a) return a.refus;
    }
    if ("etatMesures" in body) {
      const m = await exigerDroit("kanban.mesures");
      if ("refus" in m) return m.refus;
    }
    if ("etatCMD" in body) {
      const c = await exigerDroit("kanban.cmd");
      if ("refus" in c) return c.refus;
    }

    /* Hors de son périmètre, on ne modifie pas non plus. Voir, c'est une
       chose ; écrire dans le chantier d'un collègue en est une autre.
       La lecture du projet ne part que pour un compte restreint. */
    if (!(await accesProjetAutorise(id, (x) => getProject(x)))) {
      return NextResponse.json(
        { error: "Ce projet ne vous est pas accessible." },
        { status: 403 },
      );
    }

    // ── Merge heureArrivee / heureDepart / nomsCabines / attributionCabines ─
    // Invalider le cache d'abord pour forcer un fetch frais depuis Notion,
    // puis merger : les cabines présentes dans Notion mais absentes du payload
    // client (cache incomplet) sont préservées.
    const needsMerge = besoinDeFusion(body);

    /* La fiche telle qu'elle est en base : il faut la connaître pour juger
       une arrivée envoyée seule, sans son départ. */
    let existantPourHeures: Record<string, unknown> | null = null;
    if (needsMerge) {
      invalidateCache(`project-${id}`);
      let existing: any;
      try {
        existing = await cachedOrFetch(`project-${id}`, () => getProject(id));
      } catch {
        existing = null;
      }
      existantPourHeures = existing as Record<string, unknown> | null;
      if (existing) {
        fusionnerAvecExistant(existing, body);
      }
    }
    // Ne pas transmettre ces champs de contrôle à updateProject.
    delete body.clearAttributionCabs;
    delete body.nomsCabinesForces;

    /* ── UN DÉPART NE PRÉCÈDE PAS UNE ARRIVÉE ───────────────────────────
       Le 16 octobre 2026, un rapport est parti chez le client en annonçant
       une équipe arrivée à 9 h 00 et repartie à 8 h 52. Les écrans
       contrôlaient le champ DÉPART ; il suffisait de remplir les deux
       champs dans l'autre ordre pour les contourner.

       Le contrôle est donc ici aussi : c'est le seul endroit que TOUS les
       chemins traversent — les trois éditeurs, le minuteur, et la file
       d'attente hors ligne, qui rejoue des saisies faites sans écran. */
    if (toucheDesHeures(body)) {
      /* On ne relit la fiche que si l'écriture ne porte qu'un côté du
         couple : avec les deux, le jugement se fait sans aller-retour. */
      let reference = existantPourHeures;
      const partiel = COUPLES_HEURES.some(([a, d]) =>
        (body[a] !== undefined) !== (body[d] !== undefined));
      if (!reference && partiel) {
        /* Lecture FRAÎCHE : le cache (par instance, ou Redis) pouvait dater
           d'avant le départ — une arrivée envoyée seule passait alors sans
           être comparée au vrai départ (TM-2600765, 22.10.2026 : arrivée
           15:06, départ 14:53). */
        try {
          reference = (await getProject(id)) as unknown as Record<string, unknown>;
        } catch {
          reference = null;
        }
      }
      const refus = verifierHeuresEntrantes(body, reference);
      if (refus) return NextResponse.json({ error: refus }, { status: 400 });
    }

    await updateProject(id, body);
    // Invalider le cache après mise à jour — ATTENDU : l'heure de l'écriture
    // doit être publiée avant de répondre, sinon une relecture immédiate sur
    // une autre instance servirait encore l'ancienne fiche.
    await invalidateCache(`project-${id}`);
    invalidateCache("projects");
    invalidateCache("projects-mesures");
    /* La relance se lit sur l'écran « Mesures non commandées » : sans cette
       ligne, la pastille « Dossier relancé » disparaissait au rechargement
       jusqu'au prochain cycle de cache. */
    if (Object.prototype.hasOwnProperty.call(body, "relanceDossier")) {
      invalidateCache("projects-mesures-sans-commande");
    }

    // Si un ÉTAT a changé (clôture, passage en "RDV à fixer", etc.) → mise à
    // jour INSTANTANÉE du cache partagé Redis + réconciliation en arrière-plan,
    // pour zéro latence app ↔ Notion sur ce qui alimente les panneaux.
    const statusUpdates: Record<string, unknown> = {};
    for (const f of ["etatCMD", "etatMesures", "etatSAV"]) {
      if (Object.prototype.hasOwnProperty.call(body, f)) {
        statusUpdates[f] = (body as Record<string, unknown>)[f];
      }
    }
    if (Object.keys(statusUpdates).length > 0) {
      await onStatusChange(id, statusUpdates);
      // Un changement d'état (CMD / Mesures / SAV) DÉPLACE le projet entre les
      // listes (à commander ↔ annulées ↔ terminé…) → invalider ces listes
      // (mémoire + snapshot Redis partagé) pour zéro latence app ↔ Notion.
      for (const k of [
        "projects-mesures-sans-commande", "projects-mesures-annulees",
        "projects-all-active", "projects-cmd-termine", "projects-mesures-termine",
        "projects-services", "projects-services-termine", "projects-sav", "projects-sav-termine",
      ]) invalidateCache(k);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    const isRateLimit = error?.status === 429 || error?.code === "rate_limited";
    const isTimeout = error?.code === "notionhq_client_request_timeout";
    // Erreur client Notion NON transitoire (404 page inexistante/supprimée,
    // 400 validation, 403…) : on renvoie le VRAI statut 4xx pour que la file
    // offline traite l'item comme PERMANENT et l'abandonne, au lieu de le
    // rejouer indéfiniment (cause d'une synchro « coincée à vie »).
    const isPermanentClientError =
      typeof error?.status === "number" && error.status >= 400 && error.status < 500 && error.status !== 429 && error.status !== 408;
    const status = isRateLimit ? 429 : isTimeout ? 504 : isPermanentClientError ? error.status : 500;
    const message = isRateLimit
      ? "Notion est momentanément surchargé. Réessayez dans quelques secondes."
      : isTimeout
      ? "La requête a expiré. Réessayez."
      : isPermanentClientError
      ? `Mise à jour impossible (${error.status}) : ${error?.message || "élément introuvable ou invalide"}`
      : error.message || "Erreur lors de la mise à jour";
    // Les erreurs « client » (404/400 : projet supprimé, données invalides) sont
    // attendues et non-critiques → warn, pas error (évite les fausses alertes).
    const log = isPermanentClientError ? console.warn : console.error;
    log(`[PATCH /api/projects/${id}] ${status}:`, error?.message || error);
    return NextResponse.json({ error: message }, { status });
  }
}
