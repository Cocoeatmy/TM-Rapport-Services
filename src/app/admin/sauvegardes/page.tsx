"use client";

/**
 * Page « Sauvegardes » — voir les copies, en télécharger une, la remettre.
 *
 * Elle existe parce qu'une sauvegarde qu'on ne sait pas restaurer n'est pas
 * une sauvegarde. Les routes faisaient déjà le travail, mais il fallait les
 * appeler à la main : le jour d'une vraie panne, personne ne compose une
 * requête JSON. Ici tout tient en trois gestes — regarder, télécharger,
 * réinstaller — et chaque geste destructeur annonce d'abord ce qu'il ferait.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Download, Upload, Database, AlertTriangle, CheckCircle2, Loader2, KeyRound,
} from "lucide-react";

interface EtatSauvegarde { emplacement: string; jour: string; lignes: number | null; lisible: boolean }
interface LigneComparaison { cle: string; actuel: number | null; archive: number; delta: number | null; perteNette: boolean }
interface Simulation {
  simulation: true;
  archive: { genereLe: string; par: string; version: number };
  listes: LigneComparaison[];
  inconnues: string[];
  illisibles: Record<string, string>;
  confirmationAttendue: string;
  avertissements: string[];
}

const JOURS: Record<string, string> = {
  lun: "Lundi", mar: "Mardi", mer: "Mercredi", jeu: "Jeudi",
  ven: "Vendredi", sam: "Samedi", dim: "Dimanche",
};

export default function SauvegardesPage() {
  const router = useRouter();
  const [autorise, setAutorise] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.role !== "admin") { router.replace("/"); setAutorise(false); }
        else setAutorise(true);
      })
      .catch(() => { router.replace("/"); setAutorise(false); });
  }, [router]);

  const [inventaire, setInventaire] = useState<Record<string, EtatSauvegarde[]>>({});
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setChargement(true);
    setErreur(null);
    fetch("/api/admin/sauvegardes")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => setInventaire(d.inventaire || {}))
      .catch((e) => setErreur(String(e.message || e)))
      .finally(() => setChargement(false));
  }, []);
  useEffect(() => { if (autorise) charger(); }, [autorise, charger]);

  /* ── Téléchargement ─────────────────────────────────────────────────── */
  const [telechargement, setTelechargement] = useState(false);
  async function telecharger() {
    setTelechargement(true);
    setErreur(null);
    try {
      const r = await fetch("/api/admin/sauvegardes/export");
      if (!r.ok && r.status !== 206) throw new Error(`HTTP ${r.status}`);
      const texte = await r.text();
      const nom = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") || "")?.[1]
        || "tm-rapport-export.json";
      const url = URL.createObjectURL(new Blob([texte], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = nom; a.click();
      URL.revokeObjectURL(url);
      if (r.status === 206) {
        setErreur("Archive PARTIELLE : une ou plusieurs listes n'ont pas pu être lues. Le détail est dans le fichier, sous « manquantes ».");
      }
    } catch (e) {
      setErreur(`Téléchargement impossible : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTelechargement(false);
    }
  }

  /* ── Réinstallation ─────────────────────────────────────────────────── */
  const fichierRef = useRef<HTMLInputElement>(null);
  const [archive, setArchive] = useState<unknown | null>(null);
  /* Pour une enveloppe chiffrée : les octets en base64, et la phrase.
     Ni l'une ni l'autre ne sont conservées ailleurs que dans cet écran. */
  const [fichierChiffre, setFichierChiffre] = useState<string | null>(null);
  const [phraseSecrete, setPhraseSecrete] = useState("");
  const [enAttenteDePhrase, setEnAttenteDePhrase] = useState(false);
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [phrase, setPhrase] = useState("");
  const [accepterPerte, setAccepterPerte] = useState(false);
  const [travail, setTravail] = useState(false);
  const [resultat, setResultat] = useState<string | null>(null);

  function reinitialiser() {
    setArchive(null); setSimulation(null); setPhrase("");
    setAccepterPerte(false); setResultat(null);
    setFichierChiffre(null); setPhraseSecrete(""); setEnAttenteDePhrase(false);
    if (fichierRef.current) fichierRef.current.value = "";
  }

  /** Le corps commun à la simulation et à l'application. */
  function corpsDeRequete(extra: Record<string, unknown> = {}) {
    return fichierChiffre
      ? { fichierChiffre, phraseSecrete, ...extra }
      : { archive, ...extra };
  }

  async function choisirFichier(f: File) {
    setErreur(null); setResultat(null); setSimulation(null); setPhrase("");
    setAccepterPerte(false); setFichierChiffre(null); setPhraseSecrete("");
    setEnAttenteDePhrase(false); setArchive(null);
    setTravail(true);
    try {
      const octets = new Uint8Array(await f.arrayBuffer());
      /* Une enveloppe chiffrée commence par « TMENC1 ». On ne peut pas
         l'ouvrir ici : la phrase secrète est nécessaire, et c'est le
         serveur qui déchiffre. */
      const repere = new TextDecoder().decode(octets.slice(0, 6));
      if (repere === "TMENC1") {
        let b = "";
        for (let i = 0; i < octets.length; i += 0x8000) {
          b += String.fromCharCode(...octets.subarray(i, i + 0x8000));
        }
        setFichierChiffre(btoa(b));
        setEnAttenteDePhrase(true);
        return; // on attend la phrase avant toute simulation
      }
      const contenu = JSON.parse(new TextDecoder().decode(octets));
      setArchive(contenu);
      await simuler({ archive: contenu });
    } catch (e) {
      setArchive(null);
      setErreur(`Archive refusée : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTravail(false);
    }
  }

  /** Demande au serveur ce que cette archive changerait. N'écrit rien. */
  async function simuler(corps: Record<string, unknown>) {
    const r = await fetch("/api/admin/sauvegardes/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corps),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
    setSimulation(d as Simulation);
    setEnAttenteDePhrase(false);
  }

  /** Ouvre l'enveloppe avec la phrase saisie, puis simule. */
  async function ouvrirEnveloppe() {
    setTravail(true); setErreur(null);
    try {
      await simuler({ fichierChiffre, phraseSecrete });
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setTravail(false);
    }
  }

  async function appliquer() {
    if ((!archive && !fichierChiffre) || !simulation) return;
    setTravail(true); setErreur(null); setResultat(null);
    try {
      const r = await fetch("/api/admin/sauvegardes/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpsDeRequete({
          appliquer: true, confirmation: phrase, accepterPerte,
        })),
      });
      const d = await r.json();
      if (!r.ok && r.status !== 207) throw new Error(d.error || `HTTP ${r.status}`);
      const lignes = (d.resultats as { cle: string; archive: number; etat: string }[]) || [];
      setResultat(
        lignes.map((l) => `${l.cle} : ${l.etat === "ok" ? `${l.archive} lignes remises` : "REFUSÉE"}`).join(" · "),
      );
      reinitialiser();
      charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setTravail(false);
    }
  }

  if (autorise === false) return null;

  const pertes = simulation?.listes.filter((l) => l.perteNette) || [];
  const pretAAppliquer =
    !!simulation && phrase === simulation.confirmationAttendue &&
    (pertes.length === 0 || accepterPerte) &&
    Object.keys(simulation.illisibles).length === 0;

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="sgch-entete mb-4">
        <h2 className="flex items-center gap-2">
          <Database className="w-5 h-5" /> Sauvegardes
        </h2>
      </div>

      {erreur && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-900 p-3 text-sm text-red-700 dark:text-red-300 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> <span>{erreur}</span>
        </div>
      )}
      {resultat && (
        <div className="mb-4 rounded-xl border border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-900 p-3 text-sm text-green-800 dark:text-green-300 flex gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> <span>{resultat}</span>
        </div>
      )}

      {/* ── Une copie hors de l'application ──────────────────────────── */}
      <section className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-1">Une copie hors de l&apos;application</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Les sauvegardes ci-dessous vivent dans Notion, comme les données
          d&apos;origine. Ce fichier-ci n&apos;en dépend plus : rangez-le où
          vous voulez. Il se remet en place depuis cette même page.
        </p>
        <button
          onClick={telecharger}
          disabled={telechargement}
          className="inline-flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {telechargement ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Télécharger une copie
        </button>
      </section>

      {/* ── Réinstaller une archive ──────────────────────────────────── */}
      <section className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-1">Réinstaller une archive</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Choisissez un fichier téléchargé plus tôt, ou la pièce jointe
          <code className="mx-1 text-xs">.tmenc</code> d&apos;une copie
          hebdomadaire. Rien n&apos;est écrit avant que vous n&apos;ayez vu
          ce qui changerait, puis recopié la phrase de confirmation.
        </p>
        <input
          ref={fichierRef}
          type="file"
          accept=".json,.tmenc,.gz,application/json,application/octet-stream"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) choisirFichier(f); }}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 dark:file:bg-gray-700 file:px-3 file:py-2 file:text-sm"
        />

        {enAttenteDePhrase && (
          <div className="mt-4 rounded-lg border border-amber-300 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3">
            <p className="text-sm text-amber-900 dark:text-amber-200 flex gap-2 mb-2">
              <KeyRound className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Cette archive est <b>chiffrée</b>. Entrez la phrase secrète
                (celle de <code>BACKUP_PASSPHRASE</code>). Elle sert à ouvrir
                le fichier et n&apos;est pas conservée.
              </span>
            </p>
            <div className="flex gap-2">
              <input
                type="password"
                value={phraseSecrete}
                onChange={(e) => setPhraseSecrete(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && phraseSecrete) ouvrirEnveloppe(); }}
                autoComplete="off"
                className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm"
                placeholder="Phrase secrète"
              />
              <button
                onClick={ouvrirEnveloppe}
                disabled={!phraseSecrete || travail}
                className="rounded-lg bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {travail ? <Loader2 className="w-4 h-4 animate-spin" /> : "Ouvrir"}
              </button>
            </div>
          </div>
        )}

        {travail && !simulation && !enAttenteDePhrase && (
          <p className="mt-3 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Lecture de l&apos;archive…
          </p>
        )}

        {simulation && (
          <div className="mt-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Archive du{" "}
              <b>{new Date(simulation.archive.genereLe).toLocaleString("fr-CH")}</b>
              {simulation.archive.par ? ` — ${simulation.archive.par}` : ""}
            </p>

            <table className="w-full text-sm mb-3">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="py-1">Liste</th>
                  <th className="py-1 text-right">Aujourd&apos;hui</th>
                  <th className="py-1 text-right">Archive</th>
                  <th className="py-1 text-right">Écart</th>
                </tr>
              </thead>
              <tbody>
                {simulation.listes.map((l) => (
                  <tr key={l.cle} className="border-t border-gray-100 dark:border-gray-800">
                    <td className="py-1.5">{l.cle}</td>
                    <td className="py-1.5 text-right">{l.actuel ?? "?"}</td>
                    <td className="py-1.5 text-right font-semibold">{l.archive}</td>
                    <td className={`py-1.5 text-right font-semibold ${l.perteNette ? "text-red-600" : "text-gray-500"}`}>
                      {l.delta === null ? "?" : l.delta > 0 ? `+${l.delta}` : l.delta}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {simulation.avertissements.map((a) => (
              <p key={a} className="text-sm text-amber-700 dark:text-amber-400 flex gap-2 mb-1">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {a}
              </p>
            ))}

            {pertes.length > 0 && (
              <label className="flex items-start gap-2 text-sm my-3">
                <input
                  type="checkbox"
                  checked={accepterPerte}
                  onChange={(e) => setAccepterPerte(e.target.checked)}
                  className="mt-1"
                />
                <span>
                  J&apos;accepte de perdre{" "}
                  {pertes.map((p) => `${Math.abs(p.delta || 0)} ligne(s) de « ${p.cle} »`).join(", ")}.
                </span>
              </label>
            )}

            <label className="block text-sm mt-3 mb-1">
              Recopiez exactement : <code className="font-mono text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{simulation.confirmationAttendue}</code>
            </label>
            <input
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-3 py-2 text-sm font-mono"
              placeholder="…"
            />

            <div className="flex gap-2 mt-3">
              <button
                onClick={appliquer}
                disabled={!pretAAppliquer || travail}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {travail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Réinstaller
              </button>
              <button
                onClick={reinitialiser}
                className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Les copies internes ───────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-1">Les copies de la semaine</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Une copie par jour, réécrite en rotation. Elles vivent dans Notion :
          utiles contre une fausse manœuvre de l&apos;application, inutiles si
          Notion lui-même disparaît — d&apos;où le fichier ci-dessus.
        </p>
        {chargement ? (
          <p className="text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Lecture…
          </p>
        ) : (
          <div className="space-y-3">
            {Object.entries(inventaire).map(([cle, etats]) => (
              <div key={cle}>
                <div className="text-sm font-semibold mb-1">{cle}</div>
                <div className="flex flex-wrap gap-1.5">
                  {etats.map((e) => (
                    <span
                      key={e.emplacement}
                      className={`text-xs rounded-md px-2 py-1 ${
                        e.lisible
                          ? "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                          : "bg-gray-100 text-gray-400 dark:bg-gray-800"
                      }`}
                      title={e.emplacement}
                    >
                      {JOURS[e.jour] || e.jour} · {e.lisible ? `${e.lignes}` : "—"}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
