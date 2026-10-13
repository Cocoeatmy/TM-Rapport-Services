/**
 * Prépare le courrier de relance d'UN devis — et n'en envoie aucun.
 *
 * Le destinataire se cherche à deux endroits, dans cet ordre :
 *
 * 1. Le dossier Notion, quand le devis en a un. Ces contacts-là sont tenus à
 *    la main, rangés par famille (grossiste, sanitaire, client final…), et
 *    c'est la même règle que pour les mesures non commandées.
 * 2. Le contact bexio porté par l'offre, sinon. Une offre sur trois n'a pas
 *    de dossier Notion — un devis envoyé sur plan, un client de passage — et
 *    bexio reste alors la seule adresse connue.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { bexioFetch, peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { getAllProjectsRaw, getProject, resolveContactDetails, type ContactDetail } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { devisEnAttente } from "@/lib/signaux";
import {
  destinataireRelance, redigerRelanceDevis,
  type Contact, type ContactsDuProjet, type Destinataire,
} from "@/lib/relance";
import { indexerParOffre, type DossierLie } from "@/lib/devis-attente";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Le contact bexio d'une offre — nom et adresse, rien d'autre. */
async function contactBexio(id: number | null | undefined): Promise<Contact[]> {
  if (!id) return [];
  try {
    const c = await cachedOrFetch(`bexio-contact-${id}`, () =>
      bexioFetch<Record<string, unknown>>(`/2.0/contact/${id}`));
    const mail = String(c?.mail || "").trim();
    if (!mail) return [];
    const nom = [c?.name_2, c?.name_1].map((x) => String(x || "").trim()).filter(Boolean).join(" ");
    return [{ name: nom, email: mail }];
  } catch {
    return [];
  }
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { nr } = await request.json().catch(() => ({ nr: "" }));
  const numero = String(nr || "").trim().toUpperCase();
  if (!numero) return NextResponse.json({ error: "Numéro de devis requis" }, { status: 400 });

  try {
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const copie = await lireCopieBexio();
    const offre = devisEnAttente(copie.offres, aujourdhui)
      .find((o) => String(o.nr || "").trim().toUpperCase() === numero);
    if (!offre) return NextResponse.json({ error: "Devis introuvable ou plus en attente" }, { status: 404 });

    const projets = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
    const dossiers: DossierLie[] = projets.map((p) => ({
      id: p.id, projet: p.projet, ofrTM: p.ofrTM,
      dateMesures: p.dateMesures, etatCMD: p.etatCMD,
      typeClient: p.typeClient, nbCabines: p.nbCabines,
    }));
    const lie = indexerParOffre(dossiers).get(numero);

    let dest: Destinataire = { contacts: [], famille: null, repli: false };
    let complet: Awaited<ReturnType<typeof getProject>> | null = null;

    if (lie) {
      /* La liste brute ne porte que les identifiants des contacts : il faut
         ouvrir la fiche pour avoir les adresses. */
      complet = await cachedOrFetch(`project-${lie.id}`, () => getProject(lie.id));
      const ids = [...new Set([
        ...complet.contactsProjetRelation, ...complet.contactsClientsFinauxRelation,
        ...complet.contactsSanitaireRelation, ...complet.contactsDTRelation,
        ...complet.contactsArchitecteRelation, ...complet.contactsLocatairesRelation,
        ...complet.contactsAutresRelation,
      ])];
      const contacts = ids.length > 0
        ? await resolveContactDetails(ids)
        : ({} as Record<string, ContactDetail>);
      const prend = (rel: string[]) => rel.map((i) => contacts[i])
        .filter((c): c is ContactDetail => !!c).map((c) => ({ name: c.name, email: c.email }));
      const familles: ContactsDuProjet = {
        grossiste: prend(complet.contactsProjetRelation),
        clientsFinaux: prend(complet.contactsClientsFinauxRelation),
        sanitaire: prend(complet.contactsSanitaireRelation),
        dt: prend(complet.contactsDTRelation),
        architecte: prend(complet.contactsArchitecteRelation),
        locataires: prend(complet.contactsLocatairesRelation),
        autres: prend(complet.contactsAutresRelation),
      };
      dest = destinataireRelance(complet.typeClient, familles);
    }

    /* Rien côté Notion : le contact de l'offre bexio prend le relais. */
    let sourceBexio = false;
    if (dest.contacts.length === 0) {
      const depuisBexio = await contactBexio((offre as { contactId?: number | null }).contactId);
      if (depuisBexio.length > 0) {
        dest = { contacts: depuisBexio, famille: null, repli: !!lie };
        sourceBexio = true;
      }
    }

    const mail = redigerRelanceDevis({
      nr: offre.nr,
      titre: offre.titre,
      client: (offre as { client?: string }).client,
      date: offre.date,
      total: offre.total,
      nomChantier: complet?.nomChantier,
      adresseChantier: complet?.adresseChantier,
      dateMesures: complet?.dateMesures,
      nbCabines: complet?.nbCabines,
      typeClient: complet?.typeClient,
      ofrGrossiste: complet?.ofrGrossiste,
    }, dest);

    return NextResponse.json({
      ...mail,
      nr: offre.nr,
      projetId: lie?.id || null,
      etatCMD: complet?.etatCMD || null,
      sourceBexio,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
