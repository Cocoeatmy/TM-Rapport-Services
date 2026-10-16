"use client";

/**
 * Les autorisations, telles qu'un administrateur les gère.
 *
 * On choisit une personne, on lit ce qu'elle a le droit de faire, on bascule
 * un interrupteur, on enregistre. Rien d'autre n'apparaît : ni adresse, ni
 * fichier, ni vocabulaire de développeur. L'inventaire technique existe
 * toujours, mais il vit plus bas, replié, là où on ne le croise que lorsqu'on
 * le cherche.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, X, Loader2, RotateCcw, Users, History, ChevronDown, Save, AlertTriangle, Eye,
} from "lucide-react";
import {
  CATALOGUE, PROFILS, TOUS_LES_DROITS, profilEffectif,
  type Niveau, type Perimetre, type Profil, type Reglages, REGLAGES_VIDES,
} from "@/lib/droits";

interface CompteVu {
  email: string;
  nom: string;
  role: string;
  profil: Profil;
  perimetre: Perimetre;
  droits: Record<string, { niveau: Niveau; source: string }>;
}

/** L'état en cours d'édition : ce que l'écran montre, avant enregistrement. */
interface Brouillon {
  profil: Profil;
  perimetre: Perimetre;
  droits: Record<string, Niveau>;
}

type Onglet = "personne" | "general";

export function DroitsView() {
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [comptes, setComptes] = useState<CompteVu[]>([]);
  const [reglages, setReglages] = useState<Reglages>(REGLAGES_VIDES);

  const [onglet, setOnglet] = useState<Onglet>("personne");
  const [email, setEmail] = useState<string>("");
  const [profilEdite, setProfilEdite] = useState<Profil>("collaborateur");

  const [brouillon, setBrouillon] = useState<Brouillon | null>(null);
  const [enregistre, setEnregistre] = useState(false);
  const [confirmation, setConfirmation] = useState<null | "reinit">(null);
  const [histoOuvert, setHistoOuvert] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    try {
      const r = await fetch("/api/droits", { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 403 ? "Vous n'avez pas accès à cet écran." : "Lecture impossible.");
      const d = await r.json();
      setComptes(d.comptes || []);
      setReglages(d.reglages || REGLAGES_VIDES);
      setEmail((prec) => prec || (d.comptes || []).find((c: CompteVu) => c.role !== "admin")?.email || "");
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Lecture impossible.");
    } finally {
      setChargement(false);
    }
  }, []);

  useEffect(() => { charger(); }, [charger]);

  const compte = useMemo(() => comptes.find((c) => c.email === email) || null, [comptes, email]);
  const estAdmin = compte?.role === "admin";

  /** L'état de référence : ce qui est enregistré pour la cible choisie. */
  const reference: Brouillon | null = useMemo(() => {
    if (onglet === "general") {
      const p = profilEffectif(profilEdite, reglages);
      return { profil: profilEdite, perimetre: p.perimetre, droits: { ...p.droits } };
    }
    if (!compte) return null;
    return {
      profil: compte.profil,
      perimetre: compte.perimetre,
      droits: Object.fromEntries(TOUS_LES_DROITS.map((id) => [id, compte.droits[id]?.niveau ?? "non"])),
    };
  }, [onglet, profilEdite, reglages, compte]);

  /* Changer de cible abandonne l'édition en cours : on repart du réel. */
  useEffect(() => { setBrouillon(null); setEnregistre(false); }, [email, onglet, profilEdite]);

  const courant = brouillon ?? reference;
  const modifie = !!brouillon && !!reference && (
    brouillon.perimetre !== reference.perimetre ||
    brouillon.profil !== reference.profil ||
    TOUS_LES_DROITS.some((id) => brouillon.droits[id] !== reference.droits[id])
  );

  /* Quitter la page sans enregistrer : le navigateur demande confirmation. */
  useEffect(() => {
    if (!modifie) return;
    const garde = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", garde);
    return () => window.removeEventListener("beforeunload", garde);
  }, [modifie]);

  const toucher = (maj: Partial<Brouillon>) => {
    if (!courant) return;
    setBrouillon({ ...courant, ...maj });
    setEnregistre(false);
  };

  const basculer = (id: string) => {
    if (!courant) return;
    const suivant: Niveau = courant.droits[id] === "oui" ? "non" : "oui";
    toucher({ droits: { ...courant.droits, [id]: suivant } });
  };

  const choisirProfil = (p: Profil) => {
    if (!courant) return;
    /* Choisir un profil remet les interrupteurs sur ses réglages généraux :
       sinon on garderait des exceptions héritées du profil précédent, sans
       que rien ne le dise à l'écran. */
    const base = profilEffectif(p, reglages);
    setBrouillon({ profil: p, perimetre: base.perimetre, droits: { ...base.droits } });
    setEnregistre(false);
  };

  const [envoi, setEnvoi] = useState(false);
  const enregistrer = async () => {
    if (!courant || !reference) return;
    setEnvoi(true);
    setErreur(null);
    try {
      /* On n'envoie que les écarts au profil : ainsi, modifier plus tard les
         réglages généraux profite à tout le monde, sauf là où une exception a
         été posée volontairement. */
      const base = profilEffectif(courant.profil, reglages).droits;
      const ecarts = Object.fromEntries(
        TOUS_LES_DROITS.filter((id) => courant.droits[id] !== base[id]).map((id) => [id, courant.droits[id]]),
      );
      const corps = onglet === "general"
        ? { cible: "profil", profil: profilEdite, droits: courant.droits, perimetre: courant.perimetre }
        : { cible: "compte", email, profil: courant.profil, droits: ecarts, perimetre: courant.perimetre };
      const r = await fetch("/api/droits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Enregistrement refusé.");
      setBrouillon(null);
      setEnregistre(true);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setEnvoi(false);
    }
  };

  const reinitialiser = async () => {
    setConfirmation(null);
    setEnvoi(true);
    try {
      const r = await fetch("/api/droits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cible: "reinitialiser", email }),
      });
      if (!r.ok) throw new Error("Réinitialisation impossible.");
      setBrouillon(null);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Réinitialisation impossible.");
    } finally {
      setEnvoi(false);
    }
  };

  /* ── Rendu ─────────────────────────────────────────────────────────────── */

  if (chargement) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-gray-400">
        <Loader2 className="w-5 h-5 animate-spin" /> Chargement des autorisations…
      </div>
    );
  }

  const personnalises = courant && reference && onglet === "personne"
    ? TOUS_LES_DROITS.filter((id) => compte?.droits[id]?.source === "personnalise").length
    : 0;

  return (
    <div className="space-y-4">
      {erreur && (
        <div className="dr-alerte flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900/40 p-3 text-sm text-red-700 dark:text-red-300">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {erreur}
        </div>
      )}

      {/* ── Qui ? ───────────────────────────────────────────────────────── */}
      <div className="glass-card dr-bloc rounded-2xl p-4">
        <div className="flex gap-1.5 mb-3">
          {([
            { id: "personne" as const, texte: "Par collaborateur" },
            { id: "general" as const, texte: "Réglages par défaut" },
          ]).map((o) => (
            <button key={o.id} onClick={() => setOnglet(o.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                onglet === o.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
              }`}>
              {o.texte}
            </button>
          ))}
        </div>

        {onglet === "personne" ? (
          <>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Collaborateur
            </label>
            <select value={email} onChange={(e) => setEmail(e.target.value)}
              className="dr-select w-full sm:max-w-sm h-11 px-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-slate-800 text-sm text-gray-900 dark:text-gray-100">
              {comptes.map((c) => (
                <option key={c.email} value={c.email}>
                  {c.nom}{c.role === "admin" ? " — administrateur" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Choisissez une personne pour voir et modifier ce qu&apos;elle a le droit de faire.
            </p>
          </>
        ) : (
          <>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Profil à régler
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {(["responsable", "collaborateur"] as Profil[]).map((p) => (
                <button key={p} onClick={() => setProfilEdite(p)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                    profilEdite === p
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                  }`}>
                  {PROFILS[p].libelle}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              Ces réglages s&apos;appliquent à toutes les personnes de ce profil, et à
              celles qu&apos;on y ajoutera. Une exception posée sur quelqu&apos;un en
              particulier reste prioritaire.
            </p>
          </>
        )}
      </div>

      {estAdmin && onglet === "personne" ? (
        <div className="glass-card dr-bloc rounded-2xl p-4">
          <p className="text-sm text-gray-700 dark:text-gray-200">
            <b>{compte?.nom}</b> est administrateur : il a tous les droits, et cet
            écran ne peut pas les lui retirer.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            C&apos;est volontaire. Sans cette règle, une fausse manœuvre ici pourrait
            fermer la porte de l&apos;administration sans personne pour la rouvrir. Le
            rôle d&apos;un compte se change dans la gestion des comptes.
          </p>
        </div>
      ) : courant ? (
        <>
          {/* ── Profil ──────────────────────────────────────────────────── */}
          {onglet === "personne" && (
            <div className="glass-card dr-bloc rounded-2xl p-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">Profil</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Le point de départ. Vous pourrez ensuite ajuster chaque autorisation.
              </p>
              <div className="grid sm:grid-cols-2 gap-2">
                {(["responsable", "collaborateur"] as Profil[]).map((p) => (
                  <button key={p} onClick={() => choisirProfil(p)}
                    className={`dr-profil text-left rounded-xl border p-3 transition-colors ${
                      courant.profil === p
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-gray-600 hover:border-blue-300"
                    }`}>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{PROFILS[p].libelle}</div>
                    <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{PROFILS[p].description}</div>
                  </button>
                ))}
              </div>
              {personnalises > 0 && (
                <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  {personnalises} autorisation{personnalises > 1 ? "s" : ""} personnalisée{personnalises > 1 ? "s" : ""} pour cette personne : elle{personnalises > 1 ? "s ne suivent" : " ne suit"} plus les réglages par défaut.
                </p>
              )}
            </div>
          )}

          {/* ── Périmètre des projets ───────────────────────────────────── */}
          <div className="glass-card dr-bloc rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-0.5">Quels projets cette personne voit-elle ?</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Voir un projet ne donne pas le droit de le modifier : ce sont deux
              autorisations séparées.
            </p>
            {/* Dire ce qui n'est pas encore vrai vaut mieux qu'un réglage qui
                ne fait rien : le filtrage des listes par collaborateur touche
                seize écrans et reste à poser. Le choix est enregistré. */}
            <p className="text-[11px] text-amber-700 dark:text-amber-300 mb-3 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Ce choix est enregistré mais <b>pas encore appliqué</b> aux listes de
              projets : tout le monde voit encore tous les chantiers. Les autres
              autorisations de cette page, elles, sont bien en vigueur.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {([
                { id: "siens" as const, titre: "Uniquement les siens", texte: "Les chantiers sur lesquels cette personne est inscrite." },
                { id: "tous" as const, titre: "Tous les projets", texte: "Tous les chantiers de l'entreprise." },
              ]).map((o) => (
                <button key={o.id} onClick={() => toucher({ perimetre: o.id })}
                  className={`dr-profil text-left rounded-xl border p-3 transition-colors ${
                    courant.perimetre === o.id
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                      : "border-gray-200 dark:border-gray-600 hover:border-blue-300"
                  }`}>
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{o.titre}</div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">{o.texte}</div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Les autorisations ───────────────────────────────────────── */}
          {CATALOGUE.map((cat) => (
            <div key={cat.id} className="glass-card dr-bloc rounded-2xl p-4">
              <div className="flex items-baseline gap-2 mb-0.5">
                <span className="text-base leading-none">{cat.emoji}</span>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{cat.titre}</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{cat.resume}</p>

              <div className="divide-y divide-gray-100 dark:divide-slate-700">
                {cat.droits.map((d) => {
                  const actif = courant.droits[d.id] === "oui";
                  const perso = onglet === "personne" && compte?.droits[d.id]?.source === "personnalise";
                  return (
                    <div key={d.id} className="flex items-center gap-3 py-2.5 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 dark:text-gray-100 flex items-center gap-1.5 flex-wrap">
                          {d.libelle}
                          {perso && (
                            <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              personnalisé
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{d.description}</div>
                      </div>
                      <button
                        onClick={() => basculer(d.id)}
                        role="switch"
                        aria-checked={actif}
                        aria-label={`${d.libelle} — ${actif ? "autorisé" : "interdit"}`}
                        className={`dr-switch shrink-0 w-[46px] h-[26px] rounded-full relative transition-colors ${
                          actif ? "bg-emerald-500" : "bg-gray-300 dark:bg-slate-600"
                        }`}>
                        <span className={`absolute top-[3px] w-5 h-5 rounded-full bg-white shadow transition-all ${
                          actif ? "left-[23px]" : "left-[3px]"
                        }`} />
                      </button>
                      <span className={`shrink-0 text-[11px] font-semibold w-[58px] text-right ${
                        actif ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"
                      }`}>
                        {actif ? "Autorisé" : "Interdit"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* ── Résumé ──────────────────────────────────────────────────── */}
          {onglet === "personne" && compte && (
            <div className="glass-card dr-bloc rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Ce que {compte.nom.split(" ")[0]} peut faire
                </h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                D&apos;après ce qui est affiché ci-dessus{modifie ? ", enregistrement compris" : ""}.
                {courant.perimetre === "siens"
                  ? " Il ne voit que les chantiers sur lesquels il est inscrit."
                  : " Il voit tous les chantiers de l'entreprise."}
              </p>
              <div className="grid sm:grid-cols-2 gap-x-5 gap-y-1">
                {TOUS_LES_DROITS.map((id) => {
                  const d = CATALOGUE.flatMap((c) => c.droits).find((x) => x.id === id)!;
                  const actif = courant.droits[id] === "oui";
                  return (
                    <div key={id} className="flex items-start gap-1.5 text-xs min-w-0">
                      {actif
                        ? <Check className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-500" />
                        : <X className="w-3.5 h-3.5 shrink-0 mt-0.5 text-gray-300 dark:text-gray-600" />}
                      <span className={actif ? "text-gray-700 dark:text-gray-200" : "text-gray-400 line-through"}>
                        {d.libelle}
                      </span>
                    </div>
                  );
                })}
              </div>

              <button onClick={() => setConfirmation("reinit")} disabled={envoi}
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-red-600 transition-colors">
                <RotateCcw className="w-3.5 h-3.5" />
                Réinitialiser les droits de ce collaborateur
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="glass-card dr-bloc rounded-2xl p-6 text-center text-sm text-gray-400">
          <Users className="w-7 h-7 mx-auto mb-2 opacity-50" />
          Aucun collaborateur à afficher.
        </div>
      )}

      {/* ── Historique ──────────────────────────────────────────────────── */}
      {reglages.historique?.length > 0 && (
        <div className="glass-card dr-bloc rounded-2xl p-4">
          <button onClick={() => setHistoOuvert((v) => !v)}
            className="w-full flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            <History className="w-4 h-4 text-gray-400" />
            Historique des modifications
            <span className="text-xs font-normal text-gray-400">({reglages.historique.length})</span>
            <ChevronDown className={`w-4 h-4 ml-auto text-gray-400 transition-transform ${histoOuvert ? "rotate-180" : ""}`} />
          </button>
          {histoOuvert && (
            <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
              {[...reglages.historique].reverse().map((h, i) => (
                <div key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-2 min-w-0">
                  <span className="shrink-0 text-gray-400 tabular-nums">
                    {new Date(h.quand).toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                  </span>
                  <span className="min-w-0">
                    <b className="text-gray-700 dark:text-gray-300">{h.cible}</b> — {h.resume}
                    <span className="text-gray-400"> · {h.qui}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Barre d'enregistrement ──────────────────────────────────────── */}
      {modifie && (
        <div className="dr-barre sticky bottom-3 z-30 glass-card rounded-2xl p-3 flex items-center gap-2 shadow-xl border-blue-200 dark:border-blue-900/50">
          <span className="text-xs text-gray-600 dark:text-gray-300 flex-1 min-w-0">
            Modifications non enregistrées.
          </span>
          <button onClick={() => setBrouillon(null)} disabled={envoi}
            className="shrink-0 h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-600 dark:text-gray-300">
            Annuler
          </button>
          <button onClick={enregistrer} disabled={envoi}
            className="shrink-0 h-9 px-4 rounded-lg bg-blue-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60">
            {envoi ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Enregistrer les modifications
          </button>
        </div>
      )}
      {enregistre && !modifie && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" /> Enregistré. Les nouvelles autorisations s&apos;appliquent déjà, sans reconnexion.
        </p>
      )}

      {/* ── Confirmation ────────────────────────────────────────────────── */}
      {confirmation === "reinit" && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onPointerDown={() => setConfirmation(null)}>
          <div className="glass-card rounded-2xl p-5 w-full max-w-sm shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
              Réinitialiser les droits
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Les autorisations personnalisées de <b>{compte?.nom}</b> seront effacées.
              Cette personne suivra de nouveau les réglages par défaut de son profil.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmation(null)}
                className="h-9 px-3 rounded-lg border border-gray-200 dark:border-gray-600 text-xs font-medium text-gray-600 dark:text-gray-300">
                Annuler
              </button>
              <button onClick={reinitialiser}
                className="h-9 px-4 rounded-lg bg-red-600 text-white text-xs font-semibold">
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
