"use client";

/**
 * Le formulaire qui se construit tout seul à partir de la base Notion.
 *
 * Il ne connaît aucune propriété. Il reçoit le schéma — nom, type,
 * options, section, droits — et en déduit quoi afficher. Une colonne
 * ajoutée demain dans Notion apparaît ici sans qu'on touche à ce fichier.
 *
 * Le même composant sert à CRÉER et à MODIFIER : c'est la seule façon
 * qu'un champ se trouve au même endroit dans les deux écrans.
 *
 * Deux refus assumés :
 *
 *   ON N'INVENTE PAS CE QU'ON NE SAIT PAS FAIRE. Une propriété calculée,
 *   un bouton Notion, un type inconnu : le champ s'affiche, grisé, avec la
 *   raison écrite à côté. Jamais de case de saisie qui n'enregistre rien.
 *
 *   ON NE TOUCHE PAS À CE QUI APPARTIENT AUX RAPPORTS. Les colonnes que
 *   l'assistant de saisie écrit dans son propre format sont en lecture
 *   seule ici — les corriger à la main casserait le suivi par cabine.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Lock, Search, X, Paperclip, ExternalLink } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { ValeurChamp, ValeurFichier, ValeurRelation } from "@/lib/notion-valeurs";
import { estTexteLong } from "@/lib/champs-sections";

export interface ChampAffichable {
  id: string;
  nom: string;
  type: string;
  description?: string;
  options: { nom: string; couleur?: string }[];
  baseLiee?: string;
  formule?: string;
  section: string;
  lectureSeule: boolean;
  masque: boolean;
  motif?: string;
}

export interface SectionAffichable {
  id: string;
  titre: string;
  repliee: boolean;
}

export interface SchemaAffichable {
  champs: ChampAffichable[];
  sections: SectionAffichable[];
}

/* ── Primitives ───────────────────────────────────────────────────────── */

const CLASSE_SAISIE =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 " +
  "px-3 py-2 text-sm text-gray-900 dark:text-gray-100 outline-none transition-colors " +
  "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 " +
  "disabled:bg-gray-50 dark:disabled:bg-gray-800/50 disabled:text-gray-500 disabled:cursor-not-allowed";

function Etiquette({ champ }: { champ: ChampAffichable }) {
  return (
    <label className="flex items-start gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
      <span className="uppercase tracking-wide">{champ.nom}</span>
      {champ.lectureSeule && (
        <span title={champ.motif} className="inline-flex items-center gap-0.5 text-gray-400 normal-case">
          <Lock className="w-3 h-3" />
        </span>
      )}
    </label>
  );
}

/** Liste de choix avec recherche — indispensable au-delà d'une dizaine d'options. */
function ChoixCherchable({
  valeur, options, onChange, multiple, disabled, placeholder,
}: {
  valeur: string[];
  options: { nom: string }[];
  onChange: (v: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");
  const boite = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? options.filter((o) => o.nom.toLowerCase().includes(n)) : options;
  }, [q, options]);

  const basculer = (nom: string) => {
    if (multiple) onChange(valeur.includes(nom) ? valeur.filter((v) => v !== nom) : [...valeur, nom]);
    else { onChange(valeur[0] === nom ? [] : [nom]); setOuvert(false); }
  };

  return (
    <div ref={boite} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOuvert((v) => !v)}
        className={`${CLASSE_SAISIE} flex items-center justify-between gap-2 text-left`}
      >
        <span className={`flex-1 min-w-0 ${valeur.length ? "" : "text-gray-400"}`}>
          {valeur.length === 0
            ? (placeholder || "— Aucun —")
            : multiple
              ? <span className="flex flex-wrap gap-1">{valeur.map((v) => (
                  <span key={v} className="inline-block rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 text-xs">{v}</span>
                ))}</span>
              : <span className="truncate block">{valeur[0]}</span>}
        </span>
        {!disabled && <ChevronDown className="w-4 h-4 shrink-0 text-gray-400" />}
      </button>

      {ouvert && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl max-h-72 overflow-hidden flex flex-col">
          {options.length > 8 && (
            <div className="relative shrink-0 border-b border-gray-100 dark:border-gray-800">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Rechercher…"
                className="w-full pl-8 pr-2 py-2 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100"
              />
            </div>
          )}
          <div className="overflow-y-auto">
            {valeur.length > 0 && (
              <button type="button" onClick={() => { onChange([]); if (!multiple) setOuvert(false); }}
                className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800">
                Effacer la sélection
              </button>
            )}
            {filtrees.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">Aucune option</p>}
            {filtrees.map((o) => (
              <button key={o.nom} type="button" onClick={() => basculer(o.nom)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-2 ${
                  valeur.includes(o.nom) ? "text-blue-700 dark:text-blue-300 font-medium" : "text-gray-700 dark:text-gray-200"}`}>
                <span className={`w-3.5 h-3.5 shrink-0 rounded border ${valeur.includes(o.nom) ? "bg-blue-600 border-blue-600" : "border-gray-300 dark:border-gray-600"}`} />
                <span className="truncate">{o.nom}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Sélecteur de fiches liées : la recherche se fait côté serveur. */
function ChoixRelation({
  valeur, base, onChange, disabled,
}: {
  valeur: ValeurRelation[];
  base?: string;
  onChange: (v: ValeurRelation[]) => void;
  disabled?: boolean;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [q, setQ] = useState("");
  const [entrees, setEntrees] = useState<{ id: string; titre: string }[]>([]);
  const [chargement, setChargement] = useState(false);
  const [titres, setTitres] = useState<Record<string, string>>({});
  const boite = useRef<HTMLDivElement>(null);

  /* Le nom des fiches DÉJÀ liées : sans lui, on afficherait des
     identifiants à l'écran, ce qui ne veut rien dire pour personne. */
  useEffect(() => {
    const manquants = valeur.map((v) => v.id).filter((id) => !titres[id]);
    if (manquants.length === 0) return;
    fetch(`/api/notion/relations?ids=${encodeURIComponent(manquants.join(","))}`)
      .then((r) => (r.ok ? r.json() : { entrees: [] }))
      .then((d) => setTitres((t) => ({ ...t, ...Object.fromEntries((d.entrees || []).map((e: { id: string; titre: string }) => [e.id, e.titre])) })))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valeur.map((v) => v.id).join(",")]);

  useEffect(() => {
    if (!ouvert || !base) return;
    setChargement(true);
    const t = setTimeout(() => {
      fetch(`/api/notion/relations?base=${encodeURIComponent(base)}&q=${encodeURIComponent(q)}`)
        .then((r) => (r.ok ? r.json() : { entrees: [] }))
        .then((d) => setEntrees(d.entrees || []))
        .catch(() => setEntrees([]))
        .finally(() => setChargement(false));
    }, 250);
    return () => clearTimeout(t);
  }, [ouvert, base, q]);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  const retirer = (id: string) => onChange(valeur.filter((v) => v.id !== id));
  const ajouter = (e: { id: string; titre: string }) => {
    if (valeur.some((v) => v.id === e.id)) retirer(e.id);
    else { setTitres((t) => ({ ...t, [e.id]: e.titre })); onChange([...valeur, { id: e.id }]); }
  };

  return (
    <div ref={boite} className="relative">
      <div className={`${CLASSE_SAISIE} min-h-[38px] flex flex-wrap items-center gap-1`}>
        {valeur.length === 0 && <span className="text-gray-400">— Aucune fiche liée —</span>}
        {valeur.map((v) => (
          <span key={v.id} className="inline-flex items-center gap-1 rounded-md bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 text-xs">
            {titres[v.id] || "…"}
            {!disabled && (
              <button type="button" onClick={() => retirer(v.id)} aria-label="Retirer">
                <X className="w-3 h-3" />
              </button>
            )}
          </span>
        ))}
        {!disabled && base && (
          <button type="button" onClick={() => setOuvert((o) => !o)}
            className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0">
            Lier une fiche
          </button>
        )}
      </div>

      {ouvert && !disabled && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl max-h-72 overflow-hidden flex flex-col">
          <div className="relative shrink-0 border-b border-gray-100 dark:border-gray-800">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une fiche…"
              className="w-full pl-8 pr-2 py-2 text-sm bg-transparent outline-none text-gray-900 dark:text-gray-100" />
          </div>
          <div className="overflow-y-auto">
            {chargement && <p className="px-3 py-3 text-xs text-gray-400">Recherche…</p>}
            {!chargement && entrees.length === 0 && <p className="px-3 py-3 text-xs text-gray-400">Aucune fiche</p>}
            {entrees.map((e) => (
              <button key={e.id} type="button" onClick={() => ajouter(e)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-violet-50 dark:hover:bg-violet-900/20 ${
                  valeur.some((v) => v.id === e.id) ? "text-violet-700 dark:text-violet-300 font-medium" : "text-gray-700 dark:text-gray-200"}`}>
                {e.titre}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Pièces jointes : on montre et on retire ; l'ajout passe par les écrans photo. */
function Fichiers({ valeur, onChange, disabled }: {
  valeur: ValeurFichier[]; onChange: (v: ValeurFichier[]) => void; disabled?: boolean;
}) {
  if (valeur.length === 0) {
    return <p className={`${CLASSE_SAISIE} text-gray-400`}>— Aucun fichier —</p>;
  }
  return (
    <ul className="space-y-1">
      {valeur.map((f, i) => (
        <li key={`${f.url}-${i}`} className="flex items-center gap-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5">
          <Paperclip className="w-3.5 h-3.5 shrink-0 text-gray-400" />
          <a href={f.url} target="_blank" rel="noopener noreferrer"
            className="flex-1 min-w-0 truncate text-blue-600 dark:text-blue-400 hover:underline">
            {f.nom}
          </a>
          <ExternalLink className="w-3 h-3 shrink-0 text-gray-300" />
          {!disabled && (
            <button type="button" aria-label="Retirer le fichier"
              onClick={() => onChange(valeur.filter((_, j) => j !== i))}
              className="shrink-0 text-gray-400 hover:text-red-500">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ── Un champ, selon son type ─────────────────────────────────────────── */

function Champ({ champ, valeur, onChange }: {
  champ: ChampAffichable;
  valeur: ValeurChamp;
  onChange: (v: ValeurChamp) => void;
}) {
  const ls = champ.lectureSeule;

  const corps = (() => {
    switch (champ.type) {
      case "title":
      case "url":
      case "email":
      case "phone_number":
        return <input type={champ.type === "email" ? "email" : champ.type === "url" ? "url" : "text"}
          className={CLASSE_SAISIE} disabled={ls}
          value={typeof valeur === "string" ? valeur : ""}
          onChange={(e) => onChange(e.target.value)} />;

      case "rich_text":
        /* Un numéro de commande sur une ligne, un commentaire sur
           plusieurs : le type Notion ne les distingue pas, le nom si. */
        return estTexteLong(champ.nom)
          ? <Textarea rows={2} disabled={ls}
              value={typeof valeur === "string" ? valeur : ""}
              onChange={(e) => onChange(e.target.value)} />
          : <input type="text" className={CLASSE_SAISIE} disabled={ls}
              value={typeof valeur === "string" ? valeur : ""}
              onChange={(e) => onChange(e.target.value)} />;

      case "number":
        return <input type="text" inputMode="decimal" className={CLASSE_SAISIE} disabled={ls}
          value={valeur === null || valeur === undefined ? "" : String(valeur)}
          onChange={(e) => onChange(e.target.value)} />;

      case "checkbox":
        return (
          <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input type="checkbox" disabled={ls} checked={valeur === true}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-gray-500 dark:text-gray-400">{valeur === true ? "Oui" : "Non"}</span>
          </label>
        );

      case "select":
      case "status":
        return <ChoixCherchable disabled={ls} options={champ.options}
          valeur={typeof valeur === "string" && valeur ? [valeur] : []}
          onChange={(v) => onChange(v[0] ?? "")} />;

      case "multi_select":
        return <ChoixCherchable multiple disabled={ls} options={champ.options}
          valeur={Array.isArray(valeur) ? (valeur as string[]) : []}
          onChange={(v) => onChange(v)} />;

      case "date": {
        const d = (valeur && typeof valeur === "object" && "debut" in valeur)
          ? (valeur as { debut: string; fin?: string | null }) : null;
        return <input type="date" className={CLASSE_SAISIE} disabled={ls}
          value={d?.debut ? d.debut.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value ? { debut: e.target.value, fin: d?.fin ?? null } : null)} />;
      }

      case "relation":
        return <ChoixRelation disabled={ls} base={champ.baseLiee}
          valeur={Array.isArray(valeur) ? (valeur as ValeurRelation[]) : []}
          onChange={(v) => onChange(v)} />;

      case "files":
        return <Fichiers disabled={ls}
          valeur={Array.isArray(valeur) ? (valeur as ValeurFichier[]) : []}
          onChange={(v) => onChange(v)} />;

      case "place": {
        const p = (valeur && typeof valeur === "object" && !Array.isArray(valeur))
          ? (valeur as { nom?: string; adresse?: string; lat?: number; lon?: number }) : null;
        return (
          <>
            <input type="text" className={CLASSE_SAISIE} disabled={ls}
              placeholder="Rue, numéro, code postal, localité"
              value={p?.adresse || p?.nom || ""}
              onChange={(e) => onChange(e.target.value ? { nom: e.target.value, adresse: e.target.value, lat: p?.lat, lon: p?.lon } : null)} />
            {p?.lat != null && (
              <p className="mt-1 text-[11px] text-gray-400">
                Coordonnées conservées : {p.lat.toFixed(5)}, {p.lon?.toFixed(5)}
              </p>
            )}
          </>
        );
      }

      default:
        /* Formules, boutons, types inconnus : on montre ce que Notion
           calcule, sans prétendre pouvoir l'écrire. */
        return (
          <p className={`${CLASSE_SAISIE} text-gray-500 dark:text-gray-400 min-h-[38px]`}>
            {valeur === null || valeur === undefined || valeur === ""
              ? <span className="text-gray-400">—</span>
              : Array.isArray(valeur) ? valeur.join(", ") : String(valeur)}
          </p>
        );
    }
  })();

  const pleineLargeur =
    champ.type === "title"
    || champ.type === "files"
    || champ.type === "relation"
    || (champ.type === "rich_text" && estTexteLong(champ.nom));

  return (
    <div className={pleineLargeur ? "sm:col-span-2" : ""}>
      <Etiquette champ={champ} />
      {corps}
      {champ.lectureSeule && champ.motif && (
        <p className="mt-1 text-[11px] text-gray-400">{champ.motif}</p>
      )}
      {champ.description && !champ.lectureSeule && (
        <p className="mt-1 text-[11px] text-gray-400">{champ.description}</p>
      )}
    </div>
  );
}

/* ── Le formulaire complet ────────────────────────────────────────────── */

export function ChampsNotion({
  schema, valeurs, onChange, afficherLectureSeule = true, sectionsOuvertes,
}: {
  schema: SchemaAffichable;
  valeurs: Record<string, ValeurChamp>;
  onChange: (id: string, v: ValeurChamp) => void;
  /** À la création, les champs non saisissables n'ont rien à dire. */
  afficherLectureSeule?: boolean;
  /** Forcer l'ouverture de certaines sections. */
  sectionsOuvertes?: string[];
}) {
  const [ouvertes, setOuvertes] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(schema.sections.map((s) => [s.id, sectionsOuvertes?.includes(s.id) ?? !s.repliee])));
  const [recherche, setRecherche] = useState("");

  const basculer = useCallback((id: string) => setOuvertes((o) => ({ ...o, [id]: !o[id] })), []);

  const nettoyer = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = nettoyer(recherche.trim());

  const parSection = useMemo(() => {
    const m: Record<string, ChampAffichable[]> = {};
    for (const c of schema.champs) {
      if (c.masque) continue;
      if (!afficherLectureSeule && c.lectureSeule) continue;
      if (q && !nettoyer(c.nom).includes(q)) continue;
      (m[c.section] ||= []).push(c);
    }
    return m;
  }, [schema.champs, afficherLectureSeule, q]);

  const total = Object.values(parSection).reduce((n, l) => n + l.length, 0);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={recherche} onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher un champ…"
          className={`${CLASSE_SAISIE} pl-9`}
        />
        {recherche && (
          <button type="button" onClick={() => setRecherche("")} aria-label="Effacer"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {q && <p className="text-xs text-gray-400">{total} champ{total > 1 ? "s" : ""} trouvé{total > 1 ? "s" : ""}</p>}

      {schema.sections.map((s) => {
        const champs = parSection[s.id];
        if (!champs?.length) return null;
        /* Une recherche en cours ouvre tout : chercher puis devoir déplier
           n'aurait aucun sens. */
        const ouvert = q ? true : ouvertes[s.id];
        return (
          <section key={s.id} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <button type="button" onClick={() => basculer(s.id)}
              className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${ouvert ? "" : "-rotate-90"}`} />
              <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{s.titre}</span>
              <span className="ml-auto text-xs text-gray-400">{champs.length}</span>
            </button>
            {ouvert && (
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3">
                {champs.map((c) => (
                  <Champ key={c.id} champ={c} valeur={valeurs[c.id] ?? null}
                    onChange={(v) => onChange(c.id, v)} />
                ))}
              </div>
            )}
          </section>
        );
      })}

      {total === 0 && (
        <p className="text-sm text-gray-400 py-4 text-center">
          {q ? `Aucun champ ne correspond à « ${recherche} ».` : "Aucun champ à afficher."}
        </p>
      )}
    </div>
  );
}
