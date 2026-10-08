import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { peutVoirBexio } from "@/lib/bexio";
import { lireCopieBexio } from "@/lib/bexio-donnees";
import { indexerFacturation, rapprocher, numerosTM } from "@/lib/bexio-rapprochement";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Chiffre d'affaires, lu dans bexio — et dans bexio seulement.
 *
 * La page « Stats » de l'app compte des cabines, des chantiers, des heures :
 * ce que Notion sait. Celle-ci compte des francs facturés, ce que seul bexio
 * sait. Les deux ne doivent pas être mélangées : un chiffre d'affaires qui
 * ne vient pas de la comptabilité n'est pas un chiffre d'affaires.
 *
 * Plusieurs répartitions n'existent nulle part telles quelles — par
 * fournisseur, par série de cabine — et se reconstituent en remontant de la
 * facture à l'offre, de l'offre au chantier, puis à ce que le chantier sait
 * de lui-même. Ce qui ne se rattache à aucun chantier est compté à part
 * plutôt que réparti au jugé.
 */

const r2 = (n: number) => Math.round((n || 0) * 100) / 100;

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || user.role !== "admin" || !(await peutVoirBexio(user))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const q = request.nextUrl.searchParams;
  /* Fenêtre demandée. Sans bornes : tout l'historique — c'est la vue qu'on
     veut par défaut quand on cherche une tendance, pas une année isolée. */
  const de = (q.get("de") || "").slice(0, 10);
  const a = (q.get("a") || "").slice(0, 10);
  const client = q.get("client") || "";   // détail d'un client (par contactId)

  try {
    const [projets, copie] = await Promise.all([
      cachedOrFetch<Record<string, unknown>[]>(
        "projects-all-raw",
        getAllProjectsRaw as unknown as () => Promise<Record<string, unknown>[]>,
      ),
      lireCopieBexio(),
    ]);
    const idx = indexerFacturation(copie.offres, copie.factures);

    /* Facture → chantier. Une facture ne peut être rattachée qu'à UN
       chantier : sans cette précaution, deux chantiers de même titre
       compteraient deux fois le même argent. */
    const chantierParFacture = new Map<number, Record<string, any>>();
    const offreParProjet = new Map<string, string>();
    for (const p of projets as Array<Record<string, any>>) {
      const r = rapprocher(p.ofrTM, idx);
      if (r.offre) offreParProjet.set(String(p.id), r.offre.nr);
      for (const f of r.factures) {
        if (!chantierParFacture.has(f.id)) chantierParFacture.set(f.id, p);
      }
    }

    const dans = (d: string) => (!de || d >= de) && (!a || d <= a);
    const retenues = copie.factures.filter((f) => dans(f.date));
    const offresPeriode = copie.offres.filter((o) => dans(o.date));

    /* ── Détail d'UN client ────────────────────────────────────────────── */
    if (client) {
      const cid = Number(client);
      const sesFactures = copie.factures.filter((f) => f.contactId === cid);
      const sesOffres = copie.offres.filter((o) => o.contactId === cid);
      const nom = sesFactures.find((f) => f.client)?.client
        || sesOffres.find((o) => o.client)?.client || "Client";
      const nrs = new Set(sesOffres.map((o) => o.nr.toUpperCase()));
      const chantiers = (projets as Array<Record<string, any>>)
        .filter((p) => numerosTM(p.ofrTM).some((n) => nrs.has(n)))
        .map((p) => ({
          id: p.id, ofrTM: p.ofrTM || "", projet: p.projet || "",
          adresseChantier: p.adresseChantier || "", nbCabines: p.nbCabines || 0,
          dateMontage: p.dateMontage || null, etatCMD: p.etatCMD || "",
          fournisseurs: Array.isArray(p.fournisseurs) ? p.fournisseurs : [],
          series: Array.isArray(p.seriesCabines) ? p.seriesCabines : [],
        }))
        .sort((x, y) => String(y.dateMontage || "").localeCompare(String(x.dateMontage || "")));
      const total = sesFactures.reduce((s, f) => s + f.total, 0);
      const restant = sesFactures.reduce((s, f) => s + f.restant, 0);
      const parAn = new Map<string, number>();
      for (const f of sesFactures) {
        const k = (f.date || "").slice(0, 4);
        if (k) parAn.set(k, (parAn.get(k) || 0) + f.total);
      }
      return NextResponse.json({
        client: { id: cid, nom },
        total: r2(total), restant: r2(restant), encaisse: r2(total - restant),
        nbFactures: sesFactures.length,
        nbOffres: sesOffres.length,
        nbChantiers: chantiers.length,
        cabines: chantiers.reduce((s, c) => s + (c.nbCabines || 0), 0),
        parAnnee: [...parAn.entries()].map(([nom2, t]) => ({ nom: nom2, total: r2(t), nb: 0 }))
          .sort((x, y) => y.nom.localeCompare(x.nom)),
        factures: sesFactures
          .slice().sort((x, y) => y.date.localeCompare(x.date))
          .map((f) => ({ nr: f.nr, titre: f.titre, total: r2(f.total), restant: r2(f.restant), date: f.date })),
        chantiers,
      });
    }

    /* ── Vue d'ensemble ────────────────────────────────────────────────── */
    const cumul = (cle: (f: typeof retenues[number]) => string[]) => {
      const m = new Map<string, { total: number; nb: number }>();
      for (const f of retenues) {
        const cles = cle(f);
        for (const k of cles) {
          const cur = m.get(k) || { total: 0, nb: 0 };
          /* Une facture qui porte plusieurs marques ne vaut pas plusieurs
             fois son montant : il est partagé entre elles. */
          cur.total += (f.total || 0) / Math.max(1, cles.length);
          cur.nb += 1;
          m.set(k, cur);
        }
      }
      return [...m.entries()]
        .map(([nom, v]) => ({ nom, total: r2(v.total), nb: v.nb }))
        .sort((x, y) => y.total - x.total);
    };

    const marquesDe = (f: typeof retenues[number]) => {
      const p = chantierParFacture.get(f.id);
      if (!p) return ["Non rattaché"];
      const m = Array.isArray(p.fournisseurs) ? p.fournisseurs.filter(Boolean) : [];
      return m.length ? m : ["Sans marque"];
    };
    const seriesDe = (f: typeof retenues[number]) => {
      const p = chantierParFacture.get(f.id);
      if (!p) return ["Non rattaché"];
      const m = Array.isArray(p.seriesCabines) ? p.seriesCabines.filter(Boolean) : [];
      return m.length ? m : ["Sans série"];
    };

    const parMois = (() => {
      const m = new Map<string, { total: number; nb: number; restant: number }>();
      for (const f of retenues) {
        const k = (f.date || "").slice(0, 7);
        if (!k) continue;
        const cur = m.get(k) || { total: 0, nb: 0, restant: 0 };
        cur.total += f.total || 0;
        cur.restant += f.restant || 0;
        cur.nb += 1;
        m.set(k, cur);
      }
      return [...m.entries()]
        .map(([mois, v]) => ({
          mois, nb: v.nb, total: r2(v.total), restant: r2(v.restant), encaisse: r2(v.total - v.restant),
        }))
        .sort((x, y) => x.mois.localeCompare(y.mois));
    })();

    const parAnnee = (() => {
      const m = new Map<string, { total: number; nb: number }>();
      for (const f of copie.factures) {
        const k = (f.date || "").slice(0, 4);
        if (!k) continue;
        const cur = m.get(k) || { total: 0, nb: 0 };
        cur.total += f.total || 0; cur.nb += 1;
        m.set(k, cur);
      }
      return [...m.entries()]
        .map(([nom, v]) => ({ nom, total: r2(v.total), nb: v.nb }))
        .sort((x, y) => y.nom.localeCompare(x.nom));
    })();

    /* ── Impayés, par ancienneté ───────────────────────────────────────────
       Une facture ouverte depuis trois mois n'a pas le même poids qu'une
       facture de la semaine : c'est l'âge qui dit s'il faut relancer. */
    const aujourdhui = new Date().toISOString().slice(0, 10);
    const jours = (d: string) => {
      if (!d) return 0;
      return Math.max(0, Math.round((Date.parse(aujourdhui) - Date.parse(d)) / 86400000));
    };
    const ouvertes = copie.factures
      .filter((f) => f.restant > 0.01)
      .map((f) => ({
        nr: f.nr, titre: f.titre, client: f.client || "—",
        total: r2(f.total), restant: r2(f.restant), date: f.date, jours: jours(f.date),
        chantier: chantierParFacture.get(f.id)?.id || null,
        ofrTM: chantierParFacture.get(f.id)?.ofrTM || "",
      }))
      .sort((x, y) => y.jours - x.jours);
    const tranche = (j: number) => (j <= 30 ? "0-30" : j <= 60 ? "31-60" : j <= 90 ? "61-90" : "90+");
    const impayesParAge = ["0-30", "31-60", "61-90", "90+"].map((t) => {
      const l = ouvertes.filter((f) => tranche(f.jours) === t);
      return { nom: t, total: r2(l.reduce((s, f) => s + f.restant, 0)), nb: l.length };
    });

    /* ── Dépenses ──────────────────────────────────────────────────────
       Les factures FOURNISSEURS, en regard du chiffre d'affaires. Sans
       elles, la page disait ce qui rentre sans rien dire de ce qui sort —
       et c'est l'écart entre les deux qui décide de la santé de
       l'entreprise. Tout est en TTC des deux côtés : comparer un HT à un
       TTC fausserait la marge de huit pour cent. */
    const nomCompte = new Map(copie.comptes.map((c) => [c.id, `${c.no} ${c.nom}`.trim()]));
    const achatsPeriode = copie.achats.filter((b) => dans(b.date));
    const cumulAchats = (cle: (b: typeof achatsPeriode[number]) => string[]) => {
      const m = new Map<string, { total: number; nb: number }>();
      for (const b of achatsPeriode) {
        const cles = cle(b);
        for (const k of cles) {
          const cur = m.get(k) || { total: 0, nb: 0 };
          cur.total += (b.ttc || 0) / Math.max(1, cles.length);
          cur.nb += 1;
          m.set(k, cur);
        }
      }
      return [...m.entries()]
        .map(([nom, v]) => ({ nom, total: r2(v.total), nb: v.nb }))
        .sort((x, y) => y.total - x.total);
    };
    const achatsParMois = (() => {
      const m = new Map<string, number>();
      for (const b of achatsPeriode) {
        const k = (b.date || "").slice(0, 7);
        if (k) m.set(k, (m.get(k) || 0) + (b.ttc || 0));
      }
      return m;
    })();
    /* Toutes les factures reçues ne sont pas des CHARGES.
     *
     * Plan comptable suisse PME : la classe 4 est le coût direct (marchandise,
     * sous-traitance), la 5 le personnel, la 6 les autres charges
     * d'exploitation. Mais les classes 1 et 2 sont des comptes de BILAN — le
     * décompte TVA, les comptes courants LPP et SUVA y passent. Les compter
     * comme des dépenses gonflait les charges de plus de soixante-dix mille
     * francs et faisait mentir la marge. */
    const classeDe = (b: typeof achatsPeriode[number]): string => {
      const no = b.comptes.map((c) => nomCompte.get(c) || "").find((n) => /^\d/.test(n));
      return no ? no[0] : "?";
    };
    const sommeClasse = (...cl: string[]) =>
      achatsPeriode.filter((b) => cl.includes(classeDe(b))).reduce((t, b) => t + (b.ttc || 0), 0);
    const coutDirect = sommeClasse("4");
    const personnel = sommeClasse("5");
    const autresCharges = sommeClasse("6");
    const mouvementsBilan = sommeClasse("1", "2", "3");
    const totalAchats = achatsPeriode.reduce((s, b) => s + (b.ttc || 0), 0);

    /* Clients dont la toute PREMIÈRE facture tombe dans la fenêtre : la seule
       définition d'un « nouveau client » qui ne demande rien à personne. */
    const premiereFacture = new Map<number, string>();
    for (const f of copie.factures) {
      const id = f.contactId ?? -1;
      const d0 = f.date || "9999";
      if (!premiereFacture.has(id) || d0 < (premiereFacture.get(id) as string)) premiereFacture.set(id, d0);
    }
    const nouveauxClients = [...premiereFacture.entries()].filter(([, d0]) => dans(d0)).length;
    const duFournisseurs = copie.achats.filter((b) => (b.du || 0) > 0.01);
    const achatsEnRetard = duFournisseurs.filter((b) => b.enRetard);

    const total = retenues.reduce((s, f) => s + f.total, 0);
    const restant = retenues.reduce((s, f) => s + f.restant, 0);
    const nonRattache = retenues.filter((f) => !chantierParFacture.has(f.id));
    const clientsActifs = new Set(retenues.map((f) => f.contactId ?? -1)).size;
    const totalOffres = offresPeriode.reduce((s, o) => s + o.total, 0);

    return NextResponse.json({
      le: copie.le,
      de, a,
      annees: parAnnee.map((x) => x.nom),
      total: r2(total),
      restant: r2(restant),
      encaisse: r2(total - restant),
      factures: retenues.length,
      clientsActifs,
      offres: offresPeriode.length,
      totalOffres: r2(totalOffres),
      /* Ce que les offres émises sont devenues en francs. Au-dessus de 100 %,
         on facture des chantiers offerts plus tôt : c'est normal sur une
         fenêtre courte, et c'est pourquoi le chiffre est donné brut. */
      transformation: totalOffres > 0 ? Math.round((total / totalOffres) * 100) : null,
      parMois: parMois.map((m) => ({ ...m, achats: r2(achatsParMois.get(m.mois) || 0) })),
      parAnnee,
      depenses: {
        total: r2(totalAchats),
        nb: achatsPeriode.length,
        /* Marge brute : ce qui reste une fois les fournisseurs payés. Elle ne
           tient pas compte des salaires ni des charges fixes, qui ne passent
           pas tous par une facture fournisseur. */
        /* Marge brute = chiffre d'affaires moins le COÛT DIRECT (classe 4) :
           la marchandise et la sous-traitance des chantiers. */
        marge: r2(total - coutDirect),
        margePct: total > 0 ? Math.round(((total - coutDirect) / total) * 100) : null,
        coutDirect: r2(coutDirect),
        personnel: r2(personnel),
        autresCharges: r2(autresCharges),
        /* Ni charges ni produits : TVA à reverser, comptes courants sociaux. */
        mouvementsBilan: r2(mouvementsBilan),
        /* Ce qui reste une fois TOUTES les charges d'exploitation passées —
           sans les salaires nets, qui ne transitent pas par une facture. */
        resultat: r2(total - coutDirect - personnel - autresCharges),
        parFournisseur: cumulAchats((b) => [b.fournisseur]),
        parCompte: cumulAchats((b) =>
          b.comptes.length ? b.comptes.map((c) => nomCompte.get(c) || `Compte ${c}`) : ["Sans compte"]),
        du: r2(duFournisseurs.reduce((s2, b) => s2 + (b.du || 0), 0)),
        duNb: duFournisseurs.length,
        enRetard: {
          nb: achatsEnRetard.length,
          total: r2(achatsEnRetard.reduce((s2, b) => s2 + (b.du || 0), 0)),
        },
        /* Les plus grosses lignes : c'est là qu'une économie se voit. */
        lignes: achatsPeriode
          .slice().sort((x, y) => (y.ttc || 0) - (x.ttc || 0)).slice(0, 60)
          .map((b) => ({
            no: b.no, fournisseur: b.fournisseur, titre: b.titre,
            ttc: r2(b.ttc), du: r2(b.du), date: b.date, enRetard: b.enRetard,
            compte: b.comptes.map((c) => nomCompte.get(c) || "").filter(Boolean).join(" · "),
          })),
      },
      parClient: cumul((f) => [f.client?.trim() || "Client inconnu"]),
      /* Les mêmes, par identifiant : c'est lui qui ouvre la fiche client. */
      clients: (() => {
        const m = new Map<number, { nom: string; total: number; nb: number; restant: number }>();
        for (const f of retenues) {
          const id = f.contactId ?? -1;
          const cur = m.get(id) || { nom: f.client?.trim() || "Client inconnu", total: 0, nb: 0, restant: 0 };
          cur.total += f.total || 0; cur.restant += f.restant || 0; cur.nb += 1;
          if (!cur.nom && f.client) cur.nom = f.client;
          m.set(id, cur);
        }
        return [...m.entries()]
          .map(([id, v]) => ({ id, nom: v.nom, total: r2(v.total), nb: v.nb, restant: r2(v.restant) }))
          .sort((x, y) => y.total - x.total);
      })(),
      parFournisseur: cumul(marquesDe),
      parSerie: cumul(seriesDe).slice(0, 25),
      impayes: { parAge: impayesParAge, total: r2(ouvertes.reduce((s, f) => s + f.restant, 0)), lignes: ouvertes.slice(0, 200) },
      nonRattache: { nb: nonRattache.length, total: r2(nonRattache.reduce((s, f) => s + f.total, 0)) },
      /* Prêt à être recopié dans « Indicateurs financiers ». Les montants
         mensuels sont ramenés sur la durée RÉELLE de la fenêtre, pas sur un
         douzième arbitraire. */
      suggestions: (() => {
        const jourDebut = de || copie.factures.reduce((m, f) => (f.date && f.date < m ? f.date : m), "9999-12-31");
        const jourFin = a || new Date().toISOString().slice(0, 10);
        const nbMois = Math.max(1, Math.round(
          (Date.parse(jourFin) - Date.parse(jourDebut)) / (30.44 * 86400000),
        ));
        return {
          mois: nbMois,
          salaires: r2(personnel / nbMois),
          chargesFixes: r2(autresCharges / nbMois),
          autresCharges: r2(coutDirect / nbMois),
          creances: r2(ouvertes.reduce((s2, f) => s2 + f.restant, 0)),
          dettes: r2(duFournisseurs.reduce((s2, b) => s2 + (b.du || 0), 0)),
          nbClients: clientsActifs,
          nouveauxClients,
        };
      })(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
