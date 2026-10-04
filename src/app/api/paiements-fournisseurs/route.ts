/**
 * /api/paiements-fournisseurs — les lignes pointées comme payées.
 *
 * Pointer une facture fournisseur, c'est cocher ligne à ligne ce qui a été
 * réglé. Rien dans Notion ne le dit : le paiement est un fait comptable, pas
 * un état du chantier, et l'y inscrire mélangerait deux choses qui n'ont pas
 * le même cycle de vie.
 *
 * La coche porte sur un COUPLE projet + prestation : un même chantier donne
 * une ligne de mesures et une ligne de montage, facturées séparément et
 * souvent à des mois d'écart. Une coche par projet aurait fait passer les
 * deux pour réglées d'un seul geste.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, getDataFresh, setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const CLE = "paiements-fournisseurs";

export interface LignePayee {
  /** « <id projet>:<prestation> » — mesures, montage, services, sav, soucis. */
  cle: string;
  par: string;
  quand: number;
}

async function utilisateur(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  return token ? await verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  if (!(await utilisateur(req))) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  try {
    return NextResponse.json(await getData<LignePayee>(CLE));
  } catch {
    /* Stockage indisponible : la liste s'affiche sans les coches plutôt que
       de ne pas s'afficher du tout. */
    return NextResponse.json([]);
  }
}

/** Une coche, ou son retrait. */
interface Delta { cle: string; paye: boolean }

/**
 * Applique un paquet de coches.
 *
 * La lecture se fait TOUJOURS fraîche, jamais sur le cache mémoire : une
 * instance qui vient de démarrer a un cache vide, et réécrire la liste à
 * partir de là effaçait tout ce qui avait été pointé auparavant. `getDataFresh`
 * lève plutôt que de rendre une liste vide, et l'on préfère un échec visible à
 * une perte silencieuse.
 *
 * Deux tentatives : l'écriture passe par Notion, qui refuse au-delà de trois
 * requêtes par seconde. Pointer une facture, c'est cocher vite plusieurs
 * lignes de suite.
 */
async function appliquer(deltas: Delta[], par: string): Promise<number> {
  let derniere: unknown;
  for (let essai = 0; essai < 3; essai++) {
    try {
      const liste = await getDataFresh<LignePayee>(CLE);
      const parCle = new Map(liste.map((x) => [x.cle, x]));
      for (const d of deltas) {
        if (d.paye) parCle.set(d.cle, { cle: d.cle, par, quand: Date.now() });
        else parCle.delete(d.cle);
      }
      const suivante = [...parCle.values()];
      await setData(CLE, suivante);
      return suivante.length;
    } catch (e) {
      derniere = e;
      await new Promise((r) => setTimeout(r, 400 * (essai + 1)));
    }
  }
  throw derniere;
}

export async function POST(req: NextRequest) {
  const user = await utilisateur(req);
  if (!user || (user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }
  try {
    const body = await req.json();
    /* Un clic isolé ou un paquet : le client regroupe les coches rapprochées
       en un seul envoi, pour qu'elles ne se marchent pas dessus. */
    const bruts: Delta[] = Array.isArray(body?.deltas)
      ? body.deltas
      : [{ cle: body?.cle, paye: !!body?.paye }];
    const deltas = bruts
      .map((d) => ({ cle: String(d?.cle || "").trim(), paye: !!d?.paye }))
      .filter((d) => d.cle);
    if (deltas.length === 0) return NextResponse.json({ error: "cle requise" }, { status: 400 });

    const total = await appliquer(deltas, String((user as { name?: string }).name || ""));
    return NextResponse.json({ ok: true, total });
  } catch (e) {
    /* 503 et non 500 : l'écriture n'a pas abouti mais rien n'est corrompu, et
       le client peut réessayer sans risque. */
    return NextResponse.json(
      { error: String((e as Error)?.message || e) },
      { status: 503, headers: { "Retry-After": "3" } },
    );
  }
}
