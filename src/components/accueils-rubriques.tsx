"use client";

/**
 * Les pages d'accueil en cartes du rail (Mac, iPad) : CRM, Grossistes,
 * Fournisseurs. Ces rubriques n'ouvraient qu'une rangée d'onglets ; elles
 * ont désormais une vraie première page — de grandes cartes (icônes pour le
 * CRM, logos pour les partenaires) qui mènent aux listes existantes
 * (20.10.2026). Mêmes cartes que « Projets en cours » (src/app/accueils.css).
 */
import { useEffect, useState, type CSSProperties } from "react";
import { ChevronRight, Users, Building2, Factory, Warehouse, LayoutGrid } from "lucide-react";

const carteStyle = (couleur: string) => ({ ["--tm-etat" as string]: couleur } as CSSProperties);

/* ── CRM ─────────────────────────────────────────────────────────────── */
const CRM = [
  { mode: "clients-contacts", type: "contacts", label: "Contacts", aide: "Les personnes", Icon: Users, couleur: "#1b63ff" },
  { mode: "clients-entreprises", type: "entreprises", label: "Entreprises", aide: "Clients, régies, sanitaires", Icon: Building2, couleur: "#7c3aed" },
  { mode: "clients-fournisseurs", type: "fournisseurs", label: "Fournisseurs", aide: "Fabricants de cabines", Icon: Factory, couleur: "#d97706" },
  { mode: "clients-grossistes", type: "grossistes", label: "Grossistes", aide: "Distributeurs", Icon: Warehouse, couleur: "#0e7490" },
] as const;

export function AccueilCrm({ onOuvrir }: { onOuvrir: (mode: string) => void }) {
  /* Le nombre de fiches de chaque carnet — lu dans le cache du serveur. */
  const [nombres, setNombres] = useState<Record<string, number | null>>({});
  useEffect(() => {
    let vivant = true;
    for (const c of CRM) {
      fetch(`/api/crm?type=${c.type}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (vivant) setNombres((n) => ({ ...n, [c.type]: Array.isArray(d) ? d.length : null })); })
        .catch(() => {});
    }
    return () => { vivant = false; };
  }, []);
  return (
    <section className="tm-accueil" aria-label="CRM">
      <div className="tm-accueil-titre"><h2>CRM</h2><p>Le carnet d&apos;adresses de l&apos;entreprise</p></div>
      <div className="tm-etats-grille">
        {CRM.map(({ mode, type, label, aide, Icon, couleur }) => (
          <button key={mode} type="button" className="tm-etat-bouton" style={carteStyle(couleur)} onClick={() => onOuvrir(mode)}>
            <span className="tm-etat-icone"><Icon /></span>
            <span className="tm-etat-nom">{label}<br /><small style={{ fontWeight: 500, fontSize: 12, color: "#64748b" }}>{aide}</small></span>
            <b>{nombres[type] ?? "…"}</b>
            <ChevronRight className="tm-etat-fleche" aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── Partenaires (grossistes, fournisseurs) : les logos ──────────────── */
export interface EntreeLogo { mode: string; label: string; logo?: string; inverse?: boolean; /** Logo au fichier très marginé : agrandi dans sa carte. */ zoom?: number }

export function AccueilLogos({ titre, aide, famille, entrees, onOuvrir }: {
  titre: string; aide: string; famille: "grossistes" | "fournisseurs";
  entrees: EntreeLogo[]; onOuvrir: (mode: string) => void;
}) {
  const Icone = famille === "grossistes" ? Warehouse : Factory;
  const tous = entrees.find((e) => !e.logo);
  const avecLogo = entrees.filter((e) => e.logo);
  return (
    <section className="tm-accueil" aria-label={titre}>
      <div className="tm-accueil-titre"><h2>{titre}</h2><p>{aide}</p></div>
      <div className="tm-etats-grille">
        {tous && (
          <button type="button" className="tm-etat-bouton is-tous" onClick={() => onOuvrir(tous.mode)}>
            <span className="tm-etat-tete"><i />Vue</span>
            <span className="tm-etat-nom" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Icone className="w-5 h-5" />Tous les {famille}
            </span>
            <b><LayoutGrid className="w-6 h-6" /></b>
            <ChevronRight className="tm-etat-fleche" aria-hidden="true" />
          </button>
        )}
        {avecLogo.map((e) => (
          <button key={e.mode} type="button" className="tm-etat-bouton is-logo" style={carteStyle(famille === "grossistes" ? "#0e7490" : "#d97706")}
            onClick={() => onOuvrir(e.mode)} aria-label={e.label} title={e.label}>
            <span className="tm-etat-logo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={e.logo} alt="" className={e.inverse ? "is-inverse" : undefined}
                style={e.zoom ? { transform: `scale(${e.zoom})` } : undefined} />
            </span>
            <span className="tm-etat-nom">{e.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
