"use client";

/**
 * Arrivage — refait le 20.10.2026.
 *
 * Le geste du dépôt : un carton arrive, on tape le numéro de commande qui y
 * est inscrit, on retrouve le chantier et on note son arrivée — sans ouvrir
 * la fiche complète du projet, où ces quelques champs se perdaient parmi
 * cent autres.
 *
 * La page existait (mode « arrivage ») mais rien n'y menait, sa recherche
 * ignorait le n° de commande fournisseur, et les commentaires partaient
 * dans « Commentaires Montages ». Elle devient deux écrans :
 *   1. la recherche, par TOUS les numéros (espaces et tirets ignorés :
 *      « 882 108-323 » trouve « 882108323 »), et ce qui est attendu ;
 *   2. la fiche d'arrivage du projet choisi : ce que Notion sait déjà
 *      (cabines, fournisseur, séries), puis ce qu'on constate à réception.
 *
 * Les fichiers (bon de livraison, photos, dégâts) partent et se rattachent
 * à Notion dès qu'on les choisit ; jamais on ne réécrit la liste entière —
 * c'est ainsi qu'aucune photo existante ne peut disparaître d'ici.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search, X, Loader2, ChevronLeft, Truck, PackageCheck, Package, Camera, FileText, AlertTriangle,
  Check, Minus, Plus, Warehouse, CalendarCheck, Layers, Factory, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/lib/notion";
import { envoyerEtRattacher } from "@/lib/envoi-fichiers";
import { thumbnailUrl } from "@/lib/image-url";
import { STATUS_CMD_COLORS } from "@/lib/constants";
import { ZoneTexte } from "@/components/zone-texte";
import { DommageTransport } from "@/components/dommage-transport";
import "@/app/arrivage.css";

/** Ce qui n'attend plus de carton. */
const FINIS = new Set(["Annulé", "Terminé"]);
/** Les états où un carton est attendu — montrés d'abord. */
const ATTENDUS = ["Cabines à recevoir", "Livraison partielle", "Cabines en CMD", "Cabine à aller chercher"];

/** Les numéros qu'on lit sur un carton, dans l'ordre où on les cherche. */
const NUMEROS: { cle: keyof Project; label: string }[] = [
  { cle: "cmdFournisseurs", label: "CMD fournisseur" },
  { cle: "servCmdFournisseurs", label: "CMD services" },
  { cle: "servMesuresFournisseurs", label: "Serv. mesures" },
  { cle: "cmdGrossiste", label: "CMD grossiste" },
  { cle: "ofrGrossiste", label: "OFR grossiste" },
  { cle: "cmdTMUsine", label: "CMD TM usine" },
  { cle: "cmdTM", label: "CMD TM" },
  { cle: "ofrTM", label: "OFR TM" },
];

const plier = (s: unknown) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const compact = (s: unknown) => plier(s).replace(/[^a-z0-9]/g, "");
const dateCourte = (iso?: string | null) => {
  const d = String(iso || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(d + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" })
    : "";
};
const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const estPdf = (url: string) => /\.pdf($|\?)/i.test(url) || url.includes("/raw/upload/");

type Trouve = { p: Project; ou?: { label: string; valeur: string } };

export default function ArrivagePage() {
  const [projets, setProjets] = useState<Project[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [q, setQ] = useState("");
  const [choisi, setChoisi] = useState<Project | null>(null);
  const [emplacements, setEmplacements] = useState<string[]>([]);
  const champ = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/projects/all-active")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d: Project[]) => setProjets(Array.isArray(d) ? d : []))
      .catch((e) => setErreur(e.message || "Liste indisponible"))
      .finally(() => setChargement(false));
    fetch("/api/projects/field-options?fields=Emplacement+de+cabine")
      .then((r) => r.json())
      .then((d) => setEmplacements(Array.isArray(d?.["Emplacement de cabine"]) ? d["Emplacement de cabine"] : []))
      .catch(() => {});
  }, []);

  /* Le curseur dans la recherche d'emblée — mais pas au doigt : sur iPhone,
     ce focus n'ouvre pas le clavier et faisait disparaître la barre du bas
     (elle s'efface quand un champ est actif). On touche le champ pour taper. */
  useEffect(() => {
    if (choisi) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches) return;
    setTimeout(() => champ.current?.focus(), 60);
  }, [choisi]);

  const ouverts = useMemo(() => projets.filter((p) => !FINIS.has(p.etatCMD)), [projets]);

  const resultats: Trouve[] = useMemo(() => {
    const brut = q.trim();
    if (!brut) return [];
    const c = compact(brut);
    const mots = plier(brut).split(/\s+/).filter(Boolean);
    const out: Trouve[] = [];
    for (const p of ouverts) {
      let ou: Trouve["ou"];
      if (c.length >= 3) {
        for (const n of NUMEROS) {
          const v = String(p[n.cle] ?? "");
          if (v && compact(v).includes(c)) { ou = { label: n.label, valeur: v }; break; }
        }
      }
      const texte = plier(`${p.projet} ${(p.fournisseurs || []).join(" ")} ${(p.seriesCabines || []).join(" ")}`);
      if (ou || mots.every((m) => texte.includes(m))) out.push({ p, ou });
    }
    /* Un numéro trouvé passe avant un mot du titre ; puis ce qui est attendu. */
    const rang = (t: Trouve) => (t.ou ? 0 : 10) + (ATTENDUS.includes(t.p.etatCMD) ? 0 : 1);
    return out.sort((a, b) => rang(a) - rang(b)).slice(0, 40);
  }, [q, ouverts]);

  const attendus = useMemo(() => ouverts
    .filter((p) => ATTENDUS.includes(p.etatCMD))
    .sort((a, b) => String(a.previsionLivraison || "9999").localeCompare(String(b.previsionLivraison || "9999")))
    .slice(0, 12), [ouverts]);

  const majLocale = useCallback((id: string, patch: Partial<Project>) => {
    setProjets((l) => l.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    setChoisi((p) => (p && p.id === id ? { ...p, ...patch } : p));
  }, []);

  if (choisi) {
    return <FicheArrivage p={choisi} emplacements={emplacements} onRetour={() => setChoisi(null)} onMaj={majLocale} />;
  }

  return (
    <div className="ar">
      <header className="ar-hero">
        <span className="ar-hero-icone"><Truck /></span>
        <div>
          <h1>Arrivage</h1>
          <p>Tape le numéro de commande inscrit sur le carton.</p>
        </div>
      </header>

      <label className="ar-recherche">
        <Search className="ar-recherche-loupe" />
        <input ref={champ} value={q} onChange={(e) => setQ(e.target.value)} inputMode="search" enterKeyHint="search"
          autoComplete="off" autoCorrect="off" spellCheck={false}
          placeholder="N° de commande, projet, fournisseur…" aria-label="Rechercher un arrivage" />
        {q && <button type="button" onClick={() => { setQ(""); champ.current?.focus(); }} aria-label="Effacer"><X /></button>}
      </label>

      {chargement && <p className="ar-etat"><Loader2 className="animate-spin" /> Chargement des projets…</p>}
      {erreur && <p className="ar-etat is-erreur"><AlertTriangle /> {erreur}</p>}

      {!chargement && q.trim() && (
        <section className="ar-liste">
          <p className="ar-liste-titre">{resultats.length ? `${resultats.length} projet${resultats.length > 1 ? "s" : ""}` : "Aucun projet ne correspond"}</p>
          {resultats.map(({ p, ou }) => <Carte key={p.id} p={p} ou={ou} onOuvrir={() => setChoisi(p)} />)}
          {!resultats.length && <p className="ar-vide">Vérifie le numéro, ou cherche par le nom du client.</p>}
        </section>
      )}

      {!chargement && !q.trim() && attendus.length > 0 && (
        <section className="ar-liste">
          <p className="ar-liste-titre">Attendus au dépôt</p>
          {attendus.map((p) => <Carte key={p.id} p={p} onOuvrir={() => setChoisi(p)} />)}
        </section>
      )}
    </div>
  );
}

function Carte({ p, ou, onOuvrir }: { p: Project; ou?: { label: string; valeur: string }; onOuvrir: () => void }) {
  const prevu = dateCourte(p.previsionLivraison);
  const recu = dateCourte(p.arrivageTM);
  return (
    <button type="button" className="ar-carte" onClick={onOuvrir}>
      <span className="ar-carte-haut">
        {ou && <em className="ar-num"><b>{ou.label}</b>{ou.valeur}</em>}
        <i className={`ar-statut ${STATUS_CMD_COLORS[p.etatCMD] || "bg-gray-100 text-gray-700"}`}>{p.etatCMD || "—"}</i>
      </span>
      <span className="ar-carte-titre">{p.projet}</span>
      <span className="ar-carte-bas">
        {(p.fournisseurs || []).length > 0 && <span><Factory />{p.fournisseurs.join(", ")}</span>}
        <span><Package />{p.nbCabines || 0} cab.</span>
        {recu ? <span className="is-ok"><PackageCheck />Reçu le {recu}</span> : prevu ? <span><CalendarCheck />Prévu le {prevu}</span> : null}
      </span>
      <ChevronRight className="ar-carte-fleche" />
    </button>
  );
}

/* ── La fiche d'arrivage ─────────────────────────────────────────────── */

function FicheArrivage({ p, emplacements, onRetour, onMaj }: {
  p: Project; emplacements: string[]; onRetour: () => void; onMaj: (id: string, patch: Partial<Project>) => void;
}) {
  const initial = useMemo(() => ({
    arrivageGrossiste: String(p.arrivageGrossiste || "").slice(0, 10),
    arrivageTM: String(p.arrivageTM || "").slice(0, 10),
    emplacement: String(p.emplacementCabine || "").split(",").map((s) => s.trim()).filter(Boolean),
    nbCartons: p.nbCartons ?? null as number | null,
    commentaire: p.commentaireLivraison || "",
  }), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [f, setF] = useState(initial);
  const [envoi, setEnvoi] = useState(false);
  const [abimes, setAbimes] = useState((p.photosCartons || []).length > 0);
  const sale = JSON.stringify(f) !== JSON.stringify(initial);

  useEffect(() => { window.scrollTo({ top: 0 }); }, []);

  const retour = () => {
    if (sale && !confirm("Quitter sans enregistrer ? Les dates, l'emplacement et le commentaire saisis seront perdus (les fichiers, eux, sont déjà envoyés).")) return;
    onRetour();
  };

  const enregistrer = async () => {
    const body: Record<string, unknown> = {};
    if (f.arrivageGrossiste !== initial.arrivageGrossiste) body.arrivageGrossiste = f.arrivageGrossiste || null;
    if (f.arrivageTM !== initial.arrivageTM) body.arrivageTM = f.arrivageTM || null;
    if (f.emplacement.join(", ") !== initial.emplacement.join(", ")) body.emplacementCabine = f.emplacement.join(", ");
    if (f.nbCartons !== initial.nbCartons) body.nbCartons = f.nbCartons;
    if (f.commentaire !== initial.commentaire) body.commentaireLivraison = f.commentaire;
    if (!Object.keys(body).length) { onRetour(); return; }
    setEnvoi(true);
    try {
      const r = await fetch(`/api/projects/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
      onMaj(p.id, {
        arrivageGrossiste: f.arrivageGrossiste || null, arrivageTM: f.arrivageTM || null,
        emplacementCabine: f.emplacement.join(", "), nbCartons: f.nbCartons, commentaireLivraison: f.commentaire,
      });
      toast.success("Arrivage enregistré");
      onRetour();
    } catch (e) {
      toast.error(`Rien n'a été enregistré : ${(e as Error).message}`);
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <div className="ar ar-fiche">
      <button type="button" className="ar-retour" onClick={retour}><ChevronLeft /> Arrivage</button>

      <header className="ar-fiche-tete">
        <p className="ar-fiche-ofr">{p.ofrTM || "—"}</p>
        <h1>{p.projet}</h1>
        <div className="ar-fiche-notion" aria-label="Déjà connu dans Notion">
          <span><Package /><b>{p.nbCabines ?? "—"}</b> cabine{(p.nbCabines || 0) > 1 ? "s" : ""}</span>
          <span><Factory />{(p.fournisseurs || []).join(", ") || "Fournisseur non renseigné"}</span>
          <span><Layers />{(p.seriesCabines || []).join(", ") || "Série non renseignée"}</span>
        </div>
      </header>

      <section className="ar-bloc">
        <h2><CalendarCheck /> Dates d&apos;arrivage</h2>
        <div className="ar-deux">
          <label className="ar-champ">
            <span><Warehouse />Chez le grossiste</span>
            <input type="date" value={f.arrivageGrossiste} onChange={(e) => setF({ ...f, arrivageGrossiste: e.target.value })} />
          </label>
          <label className="ar-champ">
            <span><Truck />Au dépôt TM</span>
            <div className="ar-date-rapide">
              <input type="date" value={f.arrivageTM} onChange={(e) => setF({ ...f, arrivageTM: e.target.value })} />
              {f.arrivageTM !== aujourdhui() && (
                <button type="button" onClick={() => setF({ ...f, arrivageTM: aujourdhui() })}>Aujourd&apos;hui</button>
              )}
            </div>
          </label>
        </div>
      </section>

      <section className="ar-bloc">
        <h2><Package /> Emplacement de cabine</h2>
        <div className="ar-puces">
          {[...new Set([...emplacements, ...f.emplacement])].map((e) => {
            const on = f.emplacement.includes(e);
            return (
              <button key={e} type="button" className={`ar-puce${on ? " is-on" : ""}`} aria-pressed={on}
                onClick={() => setF({ ...f, emplacement: on ? f.emplacement.filter((x) => x !== e) : [...f.emplacement, e] })}>
                {on && <Check />}{e}
              </button>
            );
          })}
          {!emplacements.length && !f.emplacement.length && <p className="ar-vide">Choix indisponibles pour l&apos;instant.</p>}
        </div>
      </section>

      <section className="ar-bloc">
        <h2><PackageCheck /> Cartons</h2>
        <div className="ar-cartons">
          <span>Nombre de cartons</span>
          <div className="ar-compteur">
            <button type="button" aria-label="Un de moins" onClick={() => setF({ ...f, nbCartons: Math.max(0, (f.nbCartons || 0) - 1) })}><Minus /></button>
            <input type="number" min={0} inputMode="numeric" value={f.nbCartons ?? ""} placeholder="0"
              onChange={(e) => setF({ ...f, nbCartons: e.target.value === "" ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })} />
            <button type="button" aria-label="Un de plus" onClick={() => setF({ ...f, nbCartons: (f.nbCartons || 0) + 1 })}><Plus /></button>
          </div>
        </div>
        <Fichiers p={p} titre="Photos des cartons réceptionnés" champ="Photos des cartons récéptionnés" categorie="cartons-recus"
          cle="photosCartonsRecus" icone={<Camera />} onMaj={onMaj} />
        <button type="button" className={`ar-bascule${abimes ? " is-on" : ""}`} onClick={() => setAbimes(!abimes)} aria-pressed={abimes}>
          <AlertTriangle /> Cartons abîmés à la réception ?
          <i>{abimes ? "Oui" : "Non"}</i>
        </button>
        {abimes && (
          <Fichiers p={p} titre="État des cartons réceptionnés" aide="Photographie chaque dégât, carton par carton."
            champ="État des cartons réceptionnés" categorie="cartons" cle="photosCartons" icone={<AlertTriangle />} danger onMaj={onMaj} />
        )}
      </section>

      {/* Un dégât sur la marchandise elle-même : un signalement du projet,
          type « Dommage de transport » (23.10.2026). */}
      <DommageTransport p={p} dateArrivage={f.arrivageTM || undefined} />

      <section className="ar-bloc">
        <h2><FileText /> Bon de livraison</h2>
        <Fichiers p={p} titre="Photo ou PDF du bon" champ="Bon de livraison" categorie="bon-livraison" cle="photosBonLivraison" icone={<FileText />} onMaj={onMaj} />
      </section>

      <section className="ar-bloc">
        <h2><FileText /> Commentaires livraison</h2>
        <ZoneTexte className="ar-texte" rows={3} value={f.commentaire} onChange={(e) => setF({ ...f, commentaire: e.target.value })}
          placeholder="Dégâts constatés, carton manquant, livraison partielle…" />
      </section>

      <div className="ar-pied">
        <button type="button" className="ar-btn is-doux" onClick={retour}>Annuler</button>
        <button type="button" className="ar-btn is-ok" onClick={() => void enregistrer()} disabled={envoi}>
          {envoi ? <Loader2 className="animate-spin" /> : <Check />}{envoi ? "Enregistrement…" : sale ? "Enregistrer l'arrivage" : "Terminé"}
        </button>
      </div>
    </div>
  );
}

/** Une zone de fichiers : ceux déjà dans Notion, et l'ajout — rattaché aussitôt. */
function Fichiers({ p, titre, aide, champ, categorie, cle, icone, danger, onMaj }: {
  p: Project; titre: string; aide?: string; champ: string; categorie: string;
  cle: "photosCartonsRecus" | "photosCartons" | "photosBonLivraison"; icone: React.ReactNode; danger?: boolean;
  onMaj: (id: string, patch: Partial<Project>) => void;
}) {
  const [envoi, setEnvoi] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const liste = (p[cle] || []) as { name: string; url: string }[];

  const ajouter = async (fichiers: FileList | null) => {
    if (!fichiers?.length) return;
    setEnvoi(true);
    try {
      const { envoyes, refuses } = await envoyerEtRattacher(Array.from(fichiers), p.id, categorie, champ);
      if (refuses.length) toast.error(refuses.map((r) => `${r.nom} : ${r.motif}`).join("\n"));
      if (envoyes.length) {
        onMaj(p.id, { [cle]: [...liste, ...envoyes] } as Partial<Project>);
        toast.success(`${envoyes.length} fichier${envoyes.length > 1 ? "s" : ""} ajouté${envoyes.length > 1 ? "s" : ""}`);
      }
    } catch (e) {
      toast.error(`Envoi impossible : ${(e as Error).message}`);
    } finally {
      setEnvoi(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className={`ar-fichiers${danger ? " is-danger" : ""}`}>
      <div className="ar-fichiers-tete">
        <span>{icone}{titre}</span>
        {liste.length > 0 && <em>{liste.length}</em>}
      </div>
      {aide && <p className="ar-aide">{aide}</p>}
      <div className="ar-vignettes">
        {liste.map((f) => (
          <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="ar-vignette" title={f.name}>
            {estPdf(f.url)
              ? <span className="ar-vignette-doc"><FileText /><small>PDF</small></span>
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={thumbnailUrl(f.url)} alt="" loading="lazy" />}
          </a>
        ))}
        <button type="button" className="ar-ajout" onClick={() => input.current?.click()} disabled={envoi}>
          {envoi ? <Loader2 className="animate-spin" /> : <Plus />}
          <small>{envoi ? "Envoi…" : "Ajouter"}</small>
        </button>
        <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => void ajouter(e.target.files)} />
      </div>
    </div>
  );
}
