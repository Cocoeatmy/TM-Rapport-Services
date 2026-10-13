/**
 * Prépare les courriers de relance — sans en envoyer aucun.
 *
 * L'écran envoie des identifiants de projets ; la route rend, pour chacun, le
 * destinataire trouvé et le message rédigé. Le navigateur n'a plus qu'à ouvrir
 * le logiciel de messagerie, et c'est une personne qui appuie sur « Envoyer ».
 *
 * Pourquoi côté serveur : les adresses des contacts vivent dans une AUTRE base
 * Notion, reliée au projet. Les listes du tableau de bord ne portent que les
 * identifiants de ces relations — résoudre un contact demande une lecture de
 * plus, que l'écran ne peut pas faire sans exposer le jeton Notion.
 *
 * Les contacts changent rarement : chacun est gardé en cache un quart d'heure,
 * ce qui évite de relire quarante fiches pour relancer un mois entier.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getProject, resolveContactDetails, type ContactDetail } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import {
  destinataireRelance, redigerRelance, relanceApplicable,
  type ContactsDuProjet, type RelancePreparee,
} from "@/lib/relance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Au-delà, ce n'est plus une relance mais un publipostage. */
const MAX_PROJETS = 60;

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { ids } = await request.json().catch(() => ({ ids: [] }));
  const liste: string[] = Array.isArray(ids) ? ids.filter((x) => typeof x === "string").slice(0, MAX_PROJETS) : [];
  if (liste.length === 0) {
    return NextResponse.json({ error: "Aucun projet demandé" }, { status: 400 });
  }

  try {
    const projets = await Promise.all(
      liste.map((id) => cachedOrFetch(`project-${id}`, () => getProject(id))),
    );

    /* Une seule résolution pour tout le lot : deux projets du même grossiste
       partagent le même contact, et le relire deux fois serait deux fois le
       délai pour rien. */
    const tousLesIds = [...new Set(projets.flatMap((p) => [
      ...p.contactsProjetRelation, ...p.contactsClientsFinauxRelation,
      ...p.contactsSanitaireRelation, ...p.contactsDTRelation,
      ...p.contactsArchitecteRelation, ...p.contactsLocatairesRelation,
      ...p.contactsAutresRelation,
    ]))];
    const contacts = tousLesIds.length > 0
      ? await cachedOrFetch(`relance-contacts-${empreinte(tousLesIds)}`, () => resolveContactDetails(tousLesIds))
      : ({} as Record<string, ContactDetail>);

    const prend = (relIds: string[]) =>
      relIds.map((id) => contacts[id]).filter((c): c is ContactDetail => !!c)
        .map((c) => ({ name: c.name, email: c.email }));

    const prepares: RelancePreparee[] = projets.map((p) => {
      const base = { id: p.id, projet: p.projet, ofrTM: p.ofrTM || "" };
      if (!relanceApplicable(p.typeClient)) {
        return {
          ...base, objet: "", corps: "", destinataires: [], famille: null,
          repli: false, sansDestinataire: true,
          ecarte: "Client de type « Fournisseurs » — rien à relancer",
        };
      }
      const familles: ContactsDuProjet = {
        grossiste: prend(p.contactsProjetRelation),
        clientsFinaux: prend(p.contactsClientsFinauxRelation),
        sanitaire: prend(p.contactsSanitaireRelation),
        dt: prend(p.contactsDTRelation),
        architecte: prend(p.contactsArchitecteRelation),
        locataires: prend(p.contactsLocatairesRelation),
        autres: prend(p.contactsAutresRelation),
      };
      const mail = redigerRelance(
        {
          id: p.id, projet: p.projet, ofrTM: p.ofrTM, ofrGrossiste: p.ofrGrossiste,
          nomChantier: p.nomChantier, adresseChantier: p.adresseChantier,
          dateOffre: p.dateOffre, dateMesures: p.dateMesures,
          nbCabines: p.nbCabines, typeClient: p.typeClient,
        },
        destinataireRelance(p.typeClient, familles),
      );
      return { ...base, ...mail };
    });

    return NextResponse.json({ prepares });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

/** Une clé de cache courte et stable pour un lot d'identifiants. */
function empreinte(ids: string[]): string {
  const tries = [...ids].sort();
  let h = 0;
  for (const c of tries.join(",")) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `${tries.length}-${(h >>> 0).toString(36)}`;
}
