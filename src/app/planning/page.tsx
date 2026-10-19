"use client";

/**
 * Planning — les rendez-vous fixés de la semaine, jour par jour.
 *
 * Les données viennent de /api/planning, qui filtre SUR LE SERVEUR : un
 * collaborateur ne reçoit que ses interventions (binômes compris) ; un compte
 * qui suit l'activité de l'équipe reçoit tout, et peut choisir une personne.
 * Hors ligne, la dernière version lue de la semaine reste affichée, datée.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, CloudOff } from "lucide-react";
import { getCollaboratorColor, getCollaboratorInitials } from "@/lib/collaborators";
import type { RendezVous, TypeRdv } from "@/lib/planning";
import "./planning.css";

const TYPES: { id: TypeRdv; label: string; couleur: string }[] = [
  { id: "montage", label: "Montages", couleur: "#1b63ff" },
  { id: "mesures", label: "Mesures", couleur: "#0e7490" },
  { id: "sav", label: "SAV", couleur: "#b45309" },
  { id: "services", label: "Services", couleur: "#6d28d9" },
  { id: "garantie", label: "Garanties", couleur: "#15803d" },
];
const LIBELLE: Record<TypeRdv, string> = { montage: "Montage", mesures: "Relevé de mesures", sav: "SAV", services: "Services", garantie: "Garantie" };

interface Reponse { du: string; au: string; voitTout: boolean; collab: string | null; collaborateurs: string[]; rdv: RendezVous[] }

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function lundiDe(decalage: number): Date {
  const d = new Date(); d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + decalage * 7);
  return d;
}
function numeroSemaine(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const an = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - an.getTime()) / 86400000 - 3 + ((an.getUTCDay() + 6) % 7)) / 7);
}

export default function PlanningPage() {
  const router = useRouter();
  const [decalage, setDecalage] = useState(0);
  const [types, setTypes] = useState<Set<TypeRdv>>(new Set(TYPES.map((t) => t.id)));
  const [collab, setCollab] = useState("");
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [chargement, setChargement] = useState(true);
  const [horsLigne, setHorsLigne] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const aujourdhuiRef = useRef<HTMLElement | null>(null);

  const lundi = useMemo(() => lundiDe(decalage), [decalage]);
  const jours = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(lundi); d.setDate(lundi.getDate() + i); return iso(d); }), [lundi]);
  const du = jours[0], au = jours[6];
  const aujourdhui = iso(new Date());

  const charger = useCallback(async () => {
    setChargement(true); setErreur(null);
    const cle = `tm-planning:${du}:${collab}`;
    try {
      const r = await fetch(`/api/planning?du=${du}&au=${au}${collab ? `&collab=${encodeURIComponent(collab)}` : ""}`, { cache: "no-store" });
      if (!r.ok) throw new Error(r.status === 403 ? "Le planning n'est pas ouvert à ce compte." : `HTTP ${r.status}`);
      const d = (await r.json()) as Reponse;
      setDonnees(d); setHorsLigne(null);
      try { localStorage.setItem(cle, JSON.stringify({ quand: Date.now(), d })); } catch { /* confort */ }
    } catch (e) {
      /* Hors ligne : la dernière version lue de cette semaine, datée. */
      try {
        const brut = localStorage.getItem(cle);
        if (brut) { const { quand, d } = JSON.parse(brut); setDonnees(d); setHorsLigne(quand); setChargement(false); return; }
      } catch { /* ignore */ }
      setDonnees(null);
      setErreur(e instanceof Error && e.message.startsWith("Le planning") ? e.message : "Planning indisponible pour l'instant (réseau ?).");
    } finally {
      setChargement(false);
    }
  }, [du, au, collab]);

  useEffect(() => { charger(); }, [charger]);
  /* À l'ouverture, aller tout de suite au jour même. */
  useEffect(() => {
    if (decalage === 0 && !chargement) aujourdhuiRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
  }, [decalage, chargement]);

  const rdv = (donnees?.rdv || []).filter((r) => types.has(r.type));
  const parJour = new Map<string, RendezVous[]>();
  rdv.forEach((r) => parJour.set(r.jour, [...(parJour.get(r.jour) || []), r]));
  const compteType = (t: TypeRdv) => (donnees?.rdv || []).filter((r) => r.type === t).length;
  const basculer = (t: TypeRdv) => setTypes((avant) => {
    const s = new Set(avant);
    if (s.has(t) && s.size === 1) return new Set(TYPES.map((x) => x.id)); // jamais rien : tout revient
    if (s.size === TYPES.length) return new Set([t]); // premier appui : seulement ce type
    if (s.has(t)) s.delete(t); else s.add(t);
    return s;
  });
  const fin = new Date(lundi); fin.setDate(lundi.getDate() + 6);
  const titre = `${lundi.toLocaleDateString("fr-CH", { day: "numeric", month: "short" })} – ${fin.toLocaleDateString("fr-CH", { day: "numeric", month: "short" })}`;

  return (
    <div className="tm-planning">
      <div className="tm-planning-tete">
        <div>
          <h1>Planning</h1>
          <p>Semaine {numeroSemaine(lundi)} · {titre}</p>
        </div>
        <div className="tm-planning-nav">
          <button type="button" aria-label="Semaine précédente" onClick={() => setDecalage((x) => x - 1)}><ChevronLeft className="w-5 h-5" /></button>
          <button type="button" className="is-now" disabled={decalage === 0} onClick={() => setDecalage(0)}>Aujourd&apos;hui</button>
          <button type="button" aria-label="Semaine suivante" onClick={() => setDecalage((x) => x + 1)}><ChevronRight className="w-5 h-5" /></button>
        </div>
      </div>

      <div className="tm-planning-filtres" role="group" aria-label="Types de rendez-vous">
        {TYPES.map((t) => (
          <button key={t.id} type="button" aria-pressed={types.has(t.id) && types.size < TYPES.length}
            className={`tm-planning-puce${types.has(t.id) ? " is-on" : ""}`} onClick={() => basculer(t.id)}>
            <i style={{ background: t.couleur }} />{t.label}<b>{compteType(t.id)}</b>
          </button>
        ))}
      </div>

      {donnees?.voitTout && (
        <label className="tm-planning-collab">
          <span>Collaborateur</span>
          <select value={collab} onChange={(e) => setCollab(e.target.value)}>
            <option value="">Tous les collaborateurs</option>
            {donnees.collaborateurs.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      )}

      {horsLigne && (
        <p className="tm-planning-note"><CloudOff className="w-4 h-4" /> Hors ligne — version du {new Date(horsLigne).toLocaleString("fr-CH", { dateStyle: "short", timeStyle: "short" })}</p>
      )}
      {erreur && <p className="tm-planning-note is-erreur">{erreur}</p>}
      {chargement && !donnees && <p className="tm-planning-note"><Loader2 className="w-4 h-4 animate-spin" /> Lecture du planning…</p>}

      {donnees && jours.map((j) => {
        const liste = parJour.get(j) || [];
        const d = new Date(j + "T12:00:00");
        const passe = j < aujourdhui;
        return (
          <section key={j} ref={j === aujourdhui ? (el) => { aujourdhuiRef.current = el; } : undefined}
            className={`tm-planning-jour${j === aujourdhui ? " is-aujourdhui" : ""}${passe ? " is-passe" : ""}`} data-jour={j}>
            <h2>
              <span>{j === aujourdhui ? "Aujourd'hui" : d.toLocaleDateString("fr-CH", { weekday: "long" })}</span>
              <small>{d.toLocaleDateString("fr-CH", { day: "numeric", month: "long" })}</small>
              <b>{liste.length}</b>
            </h2>
            {liste.length === 0 ? (
              <p className="tm-planning-vide">Aucun rendez-vous</p>
            ) : liste.map((r) => {
              const t = TYPES.find((x) => x.id === r.type)!;
              const equipe = r.collaborateurs.split(/\s*[&,/]\s*/).map((n) => n.trim()).filter(Boolean);
              return (
                <button key={r.cle} type="button" className="tm-planning-rdv" data-type={r.type}
                  onClick={() => router.push(`/projet/${r.projetId}?mode=${r.mode}`)}>
                  <span className="tm-planning-barre" style={{ background: t.couleur }} />
                  <span className="tm-planning-heure">{r.heure || "—"}</span>
                  <span className="tm-planning-corps">
                    <span className="tm-planning-type" style={{ color: t.couleur }}>
                      {LIBELLE[r.type]}{r.etape ? ` · ${r.etape}` : ""}{r.cabines ? ` · ${r.cabines} cab.` : ""}
                    </span>
                    <span className="tm-planning-projet">{r.projet}</span>
                    <span className="tm-planning-meta">{[r.ofr, r.adresse].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="tm-planning-equipe">
                    {(equipe.length ? equipe : ["?"]).slice(0, 3).map((n) => {
                      const c = getCollaboratorColor(n);
                      return <i key={n} title={n} style={{ backgroundColor: c.bg, color: c.text }}>{n === "?" ? "?" : getCollaboratorInitials(n)}</i>;
                    })}
                  </span>
                </button>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
