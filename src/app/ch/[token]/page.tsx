/**
 * Suivi public d'un chantier PPE — page en lecture seule, sans connexion.
 *
 * Destinée à la régie ou au sanitaire : sur un immeuble de quatre-vingts lots,
 * ils veulent le TABLEAU du chantier, pas quatre-vingts liens de projet. Le lien
 * est signé (HMAC) et ne donne accès qu'à ce chantier-là.
 *
 * Ce qui n'y figure pas est délibéré : ni prix, ni heures, ni notes internes,
 * ni nom de monteur. Uniquement l'avancement — mesuré, commandé, livré, posé —
 * qui est précisément ce qu'on nous demande au téléphone.
 *
 * La page est rendue par le serveur à chaque visite : elle est donc toujours à
 * jour, contrairement à un PDF envoyé une fois.
 */

import { notFound } from "next/navigation";
import { getAllProjectsRaw } from "@/lib/notion";
import { cachedOrFetch } from "@/lib/server-cache";
import { signChantier } from "@/lib/doc-link";
import { construireChantiers, grouperParLot, pct, type Lot } from "@/lib/chantiers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function jour(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function comparer(a: Lot, b: Lot): number {
  return `${a.batiment} ${a.etage} ${a.nom}`.localeCompare(
    `${b.batiment} ${b.etage} ${b.nom}`, "fr", { numeric: true, sensitivity: "base" });
}

function Etape({ label, n, total }: { label: string; n: number; total: number }) {
  const p = pct(n, total);
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wide text-gray-500">{label}</span>
        <span className="text-sm font-semibold text-gray-900 tabular-nums">{n}/{total}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-[#0c1626]" style={{ width: `${p}%` }} />
      </div>
      <span className="mt-1 block text-[10px] text-gray-400 tabular-nums">{p} %</span>
    </div>
  );
}

function Pastille({ faits, total }: { faits: number; total: number }) {
  const ok = faits >= total;
  const partiel = faits > 0 && !ok;
  const cls = ok ? "bg-green-100 text-green-800"
    : partiel ? "bg-amber-100 text-amber-800"
      : "bg-red-50 text-red-700";
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      {ok ? "OUI" : partiel ? `${faits}/${total}` : "NON"}
    </span>
  );
}

export default async function SuiviChantier({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { token } = await params;
  const { s } = await searchParams;

  let signature = "";
  try { signature = Buffer.from(token, "base64url").toString("utf8"); } catch { /* jeton illisible */ }
  // Sans signature valable, la page n'existe pas : on ne dit pas pourquoi.
  if (!signature || !s || s !== signChantier(signature)) notFound();

  const projets = await cachedOrFetch("projects-all-raw", getAllProjectsRaw);
  // Seuil 1 : le lien désigne un chantier précis, déjà jugé digne de suivi au
  // moment où il a été copié. Le filtrer à nouveau le ferait disparaître.
  const chantier = construireChantiers(projets, { seuilCabines: 1 })
    .find((c) => c.id === signature);
  if (!chantier) notFound();

  const lignes = grouperParLot([...chantier.lots].sort(comparer));
  const maj = new Date().toLocaleDateString("fr-CH", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-[#eef1f5] px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500">
            TM Douche Montage — suivi de chantier
          </p>
          <h1 className="mt-1 text-xl font-bold text-gray-900 sm:text-2xl">{chantier.nom}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {[chantier.rue, chantier.localite].filter(Boolean).join(" · ")}
            {" — "}
            {lignes.length} lot{lignes.length > 1 ? "s" : ""} · {chantier.nbLots} cabine
            {chantier.nbLots > 1 ? "s" : ""}
            {chantier.fournisseurs.length > 0 ? ` · ${chantier.fournisseurs.join(", ")}` : ""}
          </p>
        </header>

        <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Etape label="Mesurés" n={chantier.nbMesurees} total={chantier.nbLots} />
          <Etape label="Commandés" n={chantier.nbCommandees} total={chantier.nbLots} />
          <Etape label="Livrés" n={chantier.nbLivrees} total={chantier.nbLots} />
          <Etape label="Posés" n={chantier.nbPosees} total={chantier.nbLots} />
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                {["Lot", "Cab.", "Marque", "Mesuré", "Commandé", "Livré", "Posé", "Statut"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lignes.map((g) => {
                const l = g.chef;
                return (
                  <tr key={g.cle} className="border-t border-gray-100 align-top">
                    <td className="px-3 py-2 font-semibold text-gray-900">
                      {l.nom}
                      {l.batiment ? <span className="block text-[10px] font-normal text-gray-400">Bât. {l.batiment}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-center tabular-nums text-gray-700">{g.qte}</td>
                    <td className="px-3 py-2 text-gray-700">
                      {l.marque || "—"}
                      {l.serie ? <span className="block text-[10px] text-gray-400">{l.serie}</span> : null}
                    </td>
                    <td className="px-3 py-2"><Pastille faits={l.mesure ? 1 : 0} total={1} /></td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{jour(l.dateCMD)}</td>
                    <td className="px-3 py-2 tabular-nums text-gray-600">{jour(l.livraison)}</td>
                    <td className="px-3 py-2">
                      <Pastille faits={g.poses} total={g.qte} />
                      {l.datePose ? <span className="mt-0.5 block text-[10px] tabular-nums text-gray-400">{jour(l.datePose)}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-gray-600">{l.statut || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-gray-500">
          Page mise à jour automatiquement — dernière lecture le {maj}. Les dates
          de livraison et de pose sont celles enregistrées par nos équipes ; une
          date manquante signifie que l&apos;étape n&apos;est pas encore franchie.
          Pour toute question sur un lot, contactez votre interlocuteur habituel
          chez TM Douche Montage.
        </p>
      </div>
    </div>
  );
}
