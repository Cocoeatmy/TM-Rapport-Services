"use client";

/**
 * Créer un projet — refait le 20.10.2026.
 *
 * L'ancienne fenêtre alignait dix-huit cases sur une seule colonne : on ne
 * savait ni par où commencer ni ce qui comptait. Elle devient un parcours en
 * quatre étapes — Projet, Références, Planning, Chantier — avec, à gauche,
 * la fiche qui se construit en direct (logo du client, titre, dates, équipe).
 *
 * Le titre se compose tout seul, dans l'ordre de la maison :
 *   « Client - Sanitaire - Client final, adresse ».
 * Taper directement dans le titre reprend la main ; le composeur se tait.
 *
 * Seule l'étape « Projet » demande quelque chose (le titre) : « Créer » reste
 * disponible partout, on ne force personne à tout parcourir.
 *
 * Ce qui part au serveur est exactement ce que l'ancienne fenêtre envoyait —
 * plus les sept champs qu'elle proposait sans jamais les enregistrer.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  X, Loader2, Check, ChevronLeft, ChevronRight, FileText, Hash, CalendarDays, Box,
  Minus, Plus, Ruler, Wrench, Building2, Factory, Warehouse, Sparkles, AlertCircle, Users, MapPin, Layers, Search,
} from "lucide-react";
import { COLLABORATEURS_LIST, STATUS_CMD_COLORS, STATUS_MESURES_COLORS } from "@/lib/constants";
import { getCollaboratorColor } from "@/lib/collaborators";
import { supplierLogo } from "@/lib/supplier-logos";
import { ZoneTexte } from "@/components/zone-texte";
import "@/app/nouveau-projet.css";

const VIDE = {
  projet: "", client: "", sanitaire: "", clientFinal: "",
  ofrTM: "", cmdTM: "", cmdTMUsine: "", ofrGrossiste: "", cmdGrossiste: "",
  cmdFournisseurs: "", servMesuresFournisseurs: "", servCmdFournisseurs: "",
  nomChantier: "", adresseChantier: "", emplacementCabine: [] as string[], nbCabines: 0,
  typeClient: "", contactsRDV: "", commentairesMesures: "", commentairesMontages: "",
  dateMontage: "", dateMesures: "", collaborateurs: [] as string[], mesuresTraiteePar: [] as string[],
  status: "",
  /** Colonne-relation Notion → fiches choisies. */
  relations: {} as Record<string, Lien[]>,
  /** Les familles de contacts cochées (étape Contacts). */
  familles: [] as string[],
};
interface Lien { id: string; titre: string }
type Form = typeof VIDE;

const ETAPES = [
  { id: "projet", label: "Projet", aide: "Le client et le chantier", Icon: FileText },
  { id: "refs", label: "Références", aide: "Offres et commandes", Icon: Hash },
  { id: "cabines", label: "Cabines", aide: "Nombre, fournisseur, séries", Icon: Box },
  { id: "contacts", label: "Contacts", aide: "Type de client, interlocuteurs", Icon: Users },
  { id: "planning", label: "Planning", aide: "Statut, dates et équipe", Icon: CalendarDays },
  { id: "chantier", label: "Chantier", aide: "Emplacement, RDV, notes", Icon: MapPin },
] as const;

/** Les familles de contacts : une case, puis seulement ses champs (20.10.2026). */
const FAMILLES: { id: string; label: string; champs: { nom: string; label: string }[] }[] = [
  { id: "grossiste", label: "Grossiste", champs: [{ nom: "Grossistes", label: "Grossiste" }, { nom: "Contact Grossiste", label: "Contact grossiste" }] },
  { id: "sanitaire", label: "Sanitaire", champs: [{ nom: "Sanitaire", label: "Sanitaire" }, { nom: "Contacts Sanitaire", label: "Contacts sanitaire" }] },
  { id: "dt", label: "DT", champs: [{ nom: "DT", label: "Direction des travaux" }, { nom: "Contacts DT", label: "Contacts DT" }] },
  { id: "architecte", label: "Architecte", champs: [{ nom: "Architecte", label: "Architecte" }, { nom: "Contacts Architecte", label: "Contacts architecte" }] },
  { id: "final", label: "Client final", champs: [{ nom: "Contacts Clients finaux", label: "Contacts clients finaux" }] },
  { id: "locataire", label: "Locataires", champs: [{ nom: "Contacts Locataires", label: "Contacts locataires" }] },
  { id: "autres", label: "Autres", champs: [{ nom: "Contacts Autres", label: "Contacts autres" }] },
];
type Etape = (typeof ETAPES)[number]["id"];

/** Les maisons dont l'app connaît le logo : proposées en saisie du client. */
const CLIENTS_CONNUS = ["Dubat", "BMS", "Getaz", "Tema Sàrl", "MatWay", "Bringhen", "Duka.ch AG", "Duscholux", "Ronal", "Nelo", "Novellini", "Samo", "Kermi", "Koralle", "Vismaravetro"];

/** « Client - Sanitaire - Client final, adresse » — sans tiret orphelin. */
export function composerTitre(f: Pick<Form, "client" | "sanitaire" | "clientFinal" | "adresseChantier">): string {
  const fin = [f.clientFinal.trim(), f.adresseChantier.trim()].filter(Boolean).join(", ");
  return [f.client.trim(), f.sanitaire.trim(), fin].filter(Boolean).join(" - ");
}

const dateLisible = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return new Date(iso + "T12:00:00").toLocaleDateString("fr-CH", { weekday: "short", day: "numeric", month: "short" });
};

export function NouveauProjet({ open, onClose, onCreated, currentMode, onTousLesChamps }: {
  open: boolean; onClose: () => void; onCreated: (pageId?: string) => void; currentMode: string;
  /** Le formulaire complet, construit sur les 142 colonnes de Notion. */
  onTousLesChamps?: () => void;
}) {
  const [f, setF] = useState<Form>(VIDE);
  const [etape, setEtape] = useState<Etape>("projet");
  const [titreManuel, setTitreManuel] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState("");
  const [depart, setDepart] = useState<"mesures" | "commande">(currentMode.startsWith("mesures") ? "mesures" : "commande");
  const [typesClient, setTypesClient] = useState<string[]>([]);
  const [emplacements, setEmplacements] = useState<string[]>([]);
  /** Colonne-relation → la base Notion où chercher. */
  const [bases, setBases] = useState<Record<string, string>>({});
  const [nouvelEmplacement, setNouvelEmplacement] = useState("");
  const titreRef = useRef<HTMLInputElement>(null);

  const set = useCallback(<K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v })), []);

  /* À l'ouverture : on repart de zéro, au bon point de départ. */
  useEffect(() => {
    if (!open) return;
    setDepart(currentMode.startsWith("mesures") ? "mesures" : "commande");
    setTimeout(() => titreRef.current?.focus(), 80);
  }, [open, currentMode]);

  /* Les choix de Notion (types de client, emplacements) : lus une fois. Sans
     eux, la saisie reste libre — rien ne bloque. */
  useEffect(() => {
    if (!open || typesClient.length) return;
    fetch("/api/notion/schema").then((r) => (r.ok ? r.json() : null)).then((d) => {
      const champs: { nom: string; options?: { nom: string }[]; baseLiee?: string }[] = d?.champs || [];
      const opts = (nom: string) => (champs.find((c) => c.nom === nom)?.options || []).map((o) => o.nom).filter(Boolean);
      setTypesClient(opts("Type de client"));
      setEmplacements(opts("Emplacement de cabine"));
      setBases(Object.fromEntries(champs.filter((c) => c.baseLiee).map((c) => [c.nom, c.baseLiee as string])));
    }).catch(() => {});
  }, [open, typesClient.length]);

  /* Le titre suit le composeur tant qu'on ne l'a pas repris à la main. */
  const titreCompose = composerTitre(f);
  const titre = titreManuel ? f.projet : titreCompose;

  const sale = useMemo(() => JSON.stringify({ ...f, projet: titre }) !== JSON.stringify({ ...VIDE }), [f, titre]);

  const fermer = useCallback(() => {
    if (envoi) return;
    if (sale && !confirm("Abandonner ce nouveau projet ? Ce qui a été saisi sera perdu.")) return;
    setF(VIDE); setEtape("projet"); setTitreManuel(false); setErreur("");
    onClose();
  }, [envoi, sale, onClose]);

  const statuts = depart === "mesures" ? STATUS_MESURES_COLORS : STATUS_CMD_COLORS;

  const creer = useCallback(async () => {
    if (!titre.trim()) {
      setErreur("Donne un nom au projet : le client suffit pour commencer.");
      setEtape("projet");
      setTimeout(() => titreRef.current?.focus(), 50);
      return;
    }
    setEnvoi(true); setErreur("");
    try {
      const body: Record<string, unknown> = { projet: titre.trim() };
      const txt = ["ofrTM", "cmdTM", "cmdTMUsine", "ofrGrossiste", "cmdGrossiste", "cmdFournisseurs",
        "servMesuresFournisseurs", "servCmdFournisseurs", "nomChantier", "adresseChantier", "contactsRDV",
        "commentairesMesures", "commentairesMontages", "dateMontage", "dateMesures", "typeClient"] as const;
      for (const k of txt) if (String(f[k]).trim()) body[k] = String(f[k]).trim();
      if (f.nbCabines > 0) body.nbCabines = f.nbCabines;
      if (f.emplacementCabine.length) body.emplacementCabine = f.emplacementCabine.join(", ");
      if (f.collaborateurs.length) body.collaborateurs = f.collaborateurs.join(" & ");
      if (f.mesuresTraiteePar.length) body.mesuresTraiteePar = f.mesuresTraiteePar.join(" & ");
      /* Les relations : fournisseur et séries toujours ; les contacts
         seulement pour les familles cochées — décocher, c'est retirer. */
      const permises = new Set(["Fournisseurs", "Séries Cabines",
        ...FAMILLES.filter((x) => f.familles.includes(x.id)).flatMap((x) => x.champs.map((c) => c.nom))]);
      const relations = Object.fromEntries(Object.entries(f.relations)
        .filter(([nom, l]) => permises.has(nom) && l.length)
        .map(([nom, l]) => [nom, l.map((x) => x.id)]));
      if (Object.keys(relations).length) body.relations = relations;
      if (f.status) {
        if (depart === "mesures") { body.etatMesures = f.status; body.etatCMD = "En attente de mesures"; }
        else body.etatCMD = f.status;
      }
      const res = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setErreur(data.error || "La création a échoué"); return; }
      fetch("/api/notify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectName: titre.trim(), action: "Nouveau projet créé", details: `Par un collaborateur — ${f.nomChantier || titre.trim()}`, projectId: data?.pageId }),
      }).catch(() => {});
      setF(VIDE); setEtape("projet"); setTitreManuel(false);
      onCreated(data?.pageId);
      onClose();
    } catch {
      setErreur("Pas de réseau : rien n'a été créé. Réessaie dans un instant.");
    } finally {
      setEnvoi(false);
    }
  }, [titre, f, depart, onCreated, onClose]);

  /* Clavier : Échap ferme, ⌘/Ctrl + Entrée crée. */
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); fermer(); }
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void creer(); }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, fermer, creer]);

  if (!open || typeof document === "undefined") return null;

  const idx = ETAPES.findIndex((e) => e.id === etape);
  const nbLiens = (noms: string[]) => noms.reduce((n, nom) => n + (f.relations[nom]?.length || 0), 0);
  const remplis: Record<Etape, number> = {
    projet: [titre, f.nomChantier, f.adresseChantier].filter((x) => String(x).trim()).length,
    cabines: (f.nbCabines ? 1 : 0) + nbLiens(["Fournisseurs", "Séries Cabines"]),
    contacts: (f.typeClient ? 1 : 0) + nbLiens(FAMILLES.filter((x) => f.familles.includes(x.id)).flatMap((x) => x.champs.map((c) => c.nom))),
    refs: [f.ofrTM, f.cmdTM, f.cmdTMUsine, f.ofrGrossiste, f.cmdGrossiste, f.cmdFournisseurs, f.servMesuresFournisseurs, f.servCmdFournisseurs].filter((x) => x.trim()).length,
    planning: [f.status, f.dateMesures, f.dateMontage].filter(Boolean).length + (f.collaborateurs.length ? 1 : 0) + (f.mesuresTraiteePar.length ? 1 : 0),
    chantier: (f.emplacementCabine.length ? 1 : 0) + [f.contactsRDV, f.commentairesMesures, f.commentairesMontages].filter((x) => x.trim()).length,
  };
  const logo = supplierLogo(f.client || titre);

  const champ = (k: keyof Form, label: string, props: { placeholder?: string; mono?: boolean } = {}) => (
    <label className="np-champ">
      <span>{label}</span>
      <input value={String(f[k])} onChange={(e) => set(k, e.target.value as never)} placeholder={props.placeholder}
        className={props.mono ? "is-mono" : undefined} />
    </label>
  );

  const equipe = (k: "collaborateurs" | "mesuresTraiteePar") => (
    <div className="np-equipe" role="group">
      {COLLABORATEURS_LIST.map((nom) => {
        const on = f[k].includes(nom);
        const c = getCollaboratorColor(nom);
        return (
          <button key={nom} type="button" className={`np-avatar${on ? " is-on" : ""}`} aria-pressed={on}
            style={{ ["--c" as string]: c.dot } as React.CSSProperties}
            onClick={() => set(k, on ? f[k].filter((n) => n !== nom) : [...f[k], nom])}>
            <i>{nom.slice(0, 2)}</i>{nom}
          </button>
        );
      })}
    </div>
  );

  return createPortal(
    <div className="np-fond" onMouseDown={(e) => { if (e.target === e.currentTarget) fermer(); }}>
      <div className="np" role="dialog" aria-modal="true" aria-label="Nouveau projet">

        {/* ── La fiche qui se construit ─────────────────────────────── */}
        <aside className="np-cote">
          <div className="np-cote-tete">
            <Sparkles className="w-4 h-4" /> Nouveau projet
          </div>
          <div className="np-apercu">
            <div className="np-apercu-logo">
              {logo
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={logo.src.replace(/\.jpg$/, ".png").replace("duka.ch-logo.png", "Duka-logo.png").replace("ronal-logo-v2.png", "ronal-logo.png")} alt="" />
                : <span>{(f.client || titre || "?").trim().slice(0, 1).toUpperCase() || "?"}</span>}
            </div>
            <p className={`np-apercu-titre${titre ? "" : " is-vide"}`}>{titre || "Le titre se compose ici"}</p>
            <div className="np-apercu-puces">
              {f.typeClient && <em>{f.typeClient}</em>}
              {(f.relations["Fournisseurs"] || []).map((x) => <em key={x.id}>{x.titre}</em>)}
              {f.nbCabines > 0 && <em>{f.nbCabines} cabine{f.nbCabines > 1 ? "s" : ""}</em>}
              {f.status && <em>{f.status}</em>}
            </div>
            {(f.dateMesures || f.dateMontage) && (
              <div className="np-apercu-dates">
                {f.dateMesures && <span><Ruler className="w-3.5 h-3.5" />Mesures · {dateLisible(f.dateMesures)}</span>}
                {f.dateMontage && <span><Wrench className="w-3.5 h-3.5" />Montage · {dateLisible(f.dateMontage)}</span>}
              </div>
            )}
          </div>

          <nav className="np-etapes" aria-label="Étapes">
            {ETAPES.map((e, i) => (
              <button key={e.id} type="button" className={`np-etape${e.id === etape ? " is-on" : ""}${remplis[e.id] ? " is-fait" : ""}`}
                onClick={() => setEtape(e.id)} aria-current={e.id === etape ? "step" : undefined}>
                <i>{remplis[e.id] && e.id !== etape ? <Check className="w-3.5 h-3.5" /> : i + 1}</i>
                <span><b>{e.label}</b><small>{e.aide}</small></span>
                {remplis[e.id] > 0 && <em>{remplis[e.id]}</em>}
              </button>
            ))}
          </nav>
          {onTousLesChamps && (
            <button type="button" className="np-tous" onClick={() => { setF(VIDE); setEtape("projet"); setTitreManuel(false); onTousLesChamps(); }}>
              Tous les champs Notion <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
          <p className="np-raccourci"><kbd>⌘</kbd><kbd>↵</kbd> créer · <kbd>esc</kbd> fermer</p>
        </aside>

        {/* ── Le contenu de l'étape ─────────────────────────────────── */}
        <section className="np-corps">
          <header className="np-tete">
            <div>
              <p className="np-tete-num">Étape {idx + 1} sur {ETAPES.length}</p>
              <h2>{ETAPES[idx].label}</h2>
            </div>
            <button type="button" className="np-fermer" onClick={fermer} aria-label="Fermer"><X className="w-4 h-4" /></button>
          </header>
          <div className="np-barre" aria-hidden="true"><i style={{ width: `${((idx + 1) / ETAPES.length) * 100}%` }} /></div>

          <div className="np-contenu" key={etape}>
            {erreur && <p className="np-erreur" role="alert"><AlertCircle className="w-4 h-4" />{erreur}</p>}

            {etape === "projet" && (
              <>
                <label className="np-titre">
                  <span>Nom du projet <b>*</b></span>
                  <input ref={titreRef} value={titre} placeholder="Dubat - Gestims Sàrl - Dupont, Rue des Cygnes 4 à Yverdon"
                    onChange={(e) => { setTitreManuel(true); set("projet", e.target.value); }} />
                  <small>
                    {titreManuel
                      ? <>Saisi à la main. <button type="button" onClick={() => { setTitreManuel(false); set("projet", ""); }}>Revenir au titre composé</button></>
                      : "Se compose à partir des champs ci-dessous — ou tape-le directement."}
                  </small>
                </label>
                <div className={`np-composeur${titreManuel ? " is-muet" : ""}`}>
                  <label className="np-champ">
                    <span><Warehouse className="w-3.5 h-3.5" />Client</span>
                    <input list="np-clients" value={f.client} onChange={(e) => set("client", e.target.value)} placeholder="Dubat, BMS, Duka…" />
                    <datalist id="np-clients">{CLIENTS_CONNUS.map((c) => <option key={c} value={c} />)}</datalist>
                  </label>
                  {champ("sanitaire", "Sanitaire", { placeholder: "Gestims Sàrl" })}
                  {champ("clientFinal", "Client final", { placeholder: "Dupont" })}
                  {champ("adresseChantier", "Adresse du chantier", { placeholder: "Rue des Cygnes 4 à 1400 Yverdon" })}
                </div>
                {champ("nomChantier", "Nom du chantier", { placeholder: "Facultatif — PPE Les Cèdres, Villa A…" })}
              </>
            )}

            {etape === "refs" && (
              <div className="np-cartes">
                <div className="np-carte">
                  <p className="np-carte-titre"><i className="is-tm">TM</i>TM Douche Montage</p>
                  {champ("ofrTM", "N° OFR TM", { placeholder: "TM-2600…", mono: true })}
                  {champ("cmdTM", "N° CMD TM", { mono: true })}
                  {champ("cmdTMUsine", "N° CMD TM - Usine", { mono: true })}
                </div>
                <div className="np-carte">
                  <p className="np-carte-titre"><i className="is-gros"><Warehouse className="w-3.5 h-3.5" /></i>Grossiste</p>
                  {champ("ofrGrossiste", "N° OFR Grossiste", { mono: true })}
                  {champ("cmdGrossiste", "N° CMD Grossiste", { mono: true })}
                </div>
                <div className="np-carte">
                  <p className="np-carte-titre"><i className="is-four"><Factory className="w-3.5 h-3.5" /></i>Fournisseur</p>
                  {champ("cmdFournisseurs", "N° CMD Fournisseurs", { mono: true })}
                  {champ("servMesuresFournisseurs", "N° Serv. Mesures", { mono: true })}
                  {champ("servCmdFournisseurs", "N° CMD Services", { mono: true })}
                </div>
              </div>
            )}

            {etape === "cabines" && (
              <>
                <div className="np-groupe np-cabines">
                  <p className="np-groupe-titre">Nombre de cabines</p>
                  <div className="np-compteur">
                    <button type="button" aria-label="Une de moins" onClick={() => set("nbCabines", Math.max(0, f.nbCabines - 1))}><Minus className="w-4 h-4" /></button>
                    <input type="number" min={0} inputMode="numeric" value={f.nbCabines || ""} placeholder="0"
                      onChange={(e) => set("nbCabines", Math.max(0, parseInt(e.target.value || "0", 10) || 0))} />
                    <button type="button" aria-label="Une de plus" onClick={() => set("nbCabines", f.nbCabines + 1)}><Plus className="w-4 h-4" /></button>
                  </div>
                </div>
                <ChoixLie label="Fournisseurs" icone={<Factory className="w-3.5 h-3.5" />} base={bases["Fournisseurs"]}
                  valeur={f.relations["Fournisseurs"] || []} onChange={(l) => set("relations", { ...f.relations, Fournisseurs: l })} />
                <ChoixLie label="Séries de cabines" icone={<Layers className="w-3.5 h-3.5" />} base={bases["Séries Cabines"]}
                  valeur={f.relations["Séries Cabines"] || []} onChange={(l) => set("relations", { ...f.relations, "Séries Cabines": l })} />
              </>
            )}

            {etape === "contacts" && (
              <>
                {typesClient.length > 0 && (
                  <div className="np-groupe">
                    <p className="np-groupe-titre">Type de client</p>
                    <div className="np-pastilles">
                      {typesClient.map((t) => (
                        <button key={t} type="button" className={`np-pastille${f.typeClient === t ? " is-on" : ""}`}
                          onClick={() => set("typeClient", f.typeClient === t ? "" : t)}>{t}</button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="np-groupe">
                  <p className="np-groupe-titre">Interlocuteurs du projet</p>
                  <div className="np-familles">
                    {FAMILLES.map((fam) => {
                      const on = f.familles.includes(fam.id);
                      const n = fam.champs.reduce((k, c) => k + (f.relations[c.nom]?.length || 0), 0);
                      return (
                        <div key={fam.id} className={`np-famille${on ? " is-on" : ""}`}>
                          <button type="button" className="np-famille-case" aria-pressed={on}
                            onClick={() => set("familles", on ? f.familles.filter((x) => x !== fam.id) : [...f.familles, fam.id])}>
                            <i>{on && <Check className="w-3.5 h-3.5" />}</i>
                            <span>{fam.label}</span>
                            {on && n > 0 && <em>{n}</em>}
                          </button>
                          {on && (
                            <div className="np-famille-champs">
                              {fam.champs.map((c) => (
                                <ChoixLie key={c.nom} label={c.label} base={bases[c.nom]} valeur={f.relations[c.nom] || []}
                                  onChange={(l) => set("relations", { ...f.relations, [c.nom]: l })} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {etape === "planning" && (
              <>
                <div className="np-groupe">
                  <div className="np-groupe-ligne">
                    <p className="np-groupe-titre">Statut de départ</p>
                    <div className="np-bascule" role="tablist">
                      {(["mesures", "commande"] as const).map((d) => (
                        <button key={d} type="button" role="tab" aria-selected={depart === d} className={depart === d ? "is-on" : ""}
                          onClick={() => { setDepart(d); set("status", ""); }}>
                          {d === "mesures" ? <><Ruler className="w-3.5 h-3.5" />Mesures</> : <><Building2 className="w-3.5 h-3.5" />Commande</>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="np-pastilles">
                    {Object.entries(statuts).map(([s, cls]) => (
                      <button key={s} type="button" className={`np-statut ${cls}${f.status === s ? " is-on" : ""}`}
                        onClick={() => set("status", f.status === s ? "" : s)}>{s}</button>
                    ))}
                  </div>
                  <small className="np-note">Rien de choisi : le statut par défaut de Notion.</small>
                </div>
                <div className="np-cartes is-deux">
                  <div className="np-carte">
                    <p className="np-carte-titre"><i className="is-mes"><Ruler className="w-3.5 h-3.5" /></i>Mesures</p>
                    <label className="np-champ"><span>Date</span>
                      <input type="date" value={f.dateMesures} onChange={(e) => set("dateMesures", e.target.value)} />
                    </label>
                    <p className="np-mini">Traitées par</p>
                    {equipe("mesuresTraiteePar")}
                  </div>
                  <div className="np-carte">
                    <p className="np-carte-titre"><i className="is-mon"><Wrench className="w-3.5 h-3.5" /></i>Montage</p>
                    <label className="np-champ"><span>Date</span>
                      <input type="date" value={f.dateMontage} onChange={(e) => set("dateMontage", e.target.value)} />
                    </label>
                    <p className="np-mini">Équipe{f.collaborateurs.length > 1 ? ` · ${f.collaborateurs.length > 2 ? "équipe" : "binôme"}` : ""}</p>
                    {equipe("collaborateurs")}
                  </div>
                </div>
              </>
            )}

            {etape === "chantier" && (
              <>
                <div className="np-groupe">
                  <p className="np-groupe-titre">Emplacement des cabines</p>
                  <div className="np-pastilles">
                    {[...new Set([...emplacements, ...f.emplacementCabine])].map((e) => {
                      const on = f.emplacementCabine.includes(e);
                      return (
                        <button key={e} type="button" className={`np-pastille${on ? " is-on" : ""}`}
                          onClick={() => set("emplacementCabine", on ? f.emplacementCabine.filter((x) => x !== e) : [...f.emplacementCabine, e])}>{e}</button>
                      );
                    })}
                    <input className="np-pastille-ajout" value={nouvelEmplacement} placeholder="+ autre"
                      onChange={(e) => setNouvelEmplacement(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && nouvelEmplacement.trim()) {
                          e.preventDefault();
                          const v = nouvelEmplacement.trim();
                          if (!f.emplacementCabine.includes(v)) set("emplacementCabine", [...f.emplacementCabine, v]);
                          setNouvelEmplacement("");
                        }
                      }} />
                  </div>
                </div>
                <label className="np-champ">
                  <span>Contacts pour RDV</span>
                  <ZoneTexte rows={2} value={f.contactsRDV} onChange={(e) => set("contactsRDV", e.target.value)} placeholder="M. Dupont : +41 79 123 45 67" />
                </label>
                <div className="np-cartes is-deux">
                  <label className="np-champ">
                    <span><Ruler className="w-3.5 h-3.5" />Commentaires mesures</span>
                    <ZoneTexte rows={3} value={f.commentairesMesures} onChange={(e) => set("commentairesMesures", e.target.value)} />
                  </label>
                  <label className="np-champ">
                    <span><Wrench className="w-3.5 h-3.5" />Commentaires montage</span>
                    <ZoneTexte rows={3} value={f.commentairesMontages} onChange={(e) => set("commentairesMontages", e.target.value)} />
                  </label>
                </div>
              </>
            )}
          </div>

          <footer className="np-pied">
            {idx > 0
              ? <button type="button" className="np-btn is-doux" onClick={() => setEtape(ETAPES[idx - 1].id)}><ChevronLeft className="w-4 h-4" />{ETAPES[idx - 1].label}</button>
              : <button type="button" className="np-btn is-doux" onClick={fermer}>Annuler</button>}
            <span className="np-pied-espace" />
            {idx < ETAPES.length - 1 && (
              <button type="button" className="np-btn is-second" onClick={() => setEtape(ETAPES[idx + 1].id)}>
                {ETAPES[idx + 1].label}<ChevronRight className="w-4 h-4" />
              </button>
            )}
            <button type="button" className="np-btn is-creer" onClick={() => void creer()} disabled={envoi}>
              {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {envoi ? "Création…" : <><span className="np-long">Créer le projet</span><span className="np-court">Créer</span></>}
            </button>
          </footer>
        </section>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Choisir des fiches d'une base liée (contacts, entreprises, fournisseurs…).
 * Rien ne s'affiche tant qu'on n'a rien tapé ; dès la première lettre, la
 * base entière est interrogée chez Notion (voir /api/notion/relations).
 */
function ChoixLie({ label, icone, base, valeur, onChange }: {
  label: string; icone?: React.ReactNode; base?: string; valeur: Lien[]; onChange: (l: Lien[]) => void;
}) {
  const [q, setQ] = useState("");
  const [liste, setListe] = useState<Lien[]>([]);
  const [charge, setCharge] = useState(false);
  const [actif, setActif] = useState(0);
  useEffect(() => {
    const t = q.trim();
    if (!t || !base) return;
    const minuterie = setTimeout(() => {
      setCharge(true);
      fetch(`/api/notion/relations?base=${encodeURIComponent(base)}&q=${encodeURIComponent(t)}`)
        .then((r) => (r.ok ? r.json() : { entrees: [] }))
        .then((d) => { setListe((d.entrees || []).slice(0, 12)); setActif(0); })
        .catch(() => setListe([]))
        .finally(() => setCharge(false));
    }, 220);
    return () => clearTimeout(minuterie);
  }, [q, base]);
  const choisir = (x: Lien) => {
    if (!valeur.some((v) => v.id === x.id)) onChange([...valeur, x]);
    setQ(""); setListe([]);
  };
  const proposes = liste.filter((x) => !valeur.some((v) => v.id === x.id));
  return (
    <div className="np-champ np-lie">
      <span>{icone}{label}</span>
      {valeur.length > 0 && (
        <div className="np-lie-choisis">
          {valeur.map((v) => (
            <em key={v.id}>{v.titre}<button type="button" aria-label={`Retirer ${v.titre}`} onClick={() => onChange(valeur.filter((x) => x.id !== v.id))}><X className="w-3 h-3" /></button></em>
          ))}
        </div>
      )}
      <div className="np-lie-saisie">
        <Search className="w-4 h-4" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={base ? "Tape les premières lettres…" : "Base indisponible"} disabled={!base}
          autoComplete="off"
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => Math.min(i + 1, proposes.length - 1)); }
            if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => Math.max(i - 1, 0)); }
            if (e.key === "Enter" && proposes[actif]) { e.preventDefault(); choisir(proposes[actif]); }
            if (e.key === "Escape" && q) { e.stopPropagation(); setQ(""); }
          }} />
        {charge && <Loader2 className="w-4 h-4 animate-spin" />}
      </div>
      {q.trim() && !charge && (
        <div className="np-lie-liste" role="listbox">
          {proposes.length === 0 && <p>Aucune fiche ne correspond.</p>}
          {proposes.map((x, i) => (
            <button key={x.id} type="button" role="option" aria-selected={i === actif} className={i === actif ? "is-actif" : undefined}
              onMouseEnter={() => setActif(i)} onClick={() => choisir(x)}>{x.titre}</button>
          ))}
        </div>
      )}
    </div>
  );
}
