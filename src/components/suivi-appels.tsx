"use client";

/**
 * La colonne « Appels » des listes « RDV … à fixer » (22.10.2026).
 *
 * Une pastille résume où en est la prise de contact (« 2× sans réponse »,
 * « Rappeler le 24.10 », « Joint le 22.10 »), de plus en plus chaude à
 * mesure que les tentatives s'accumulent. Un clic ouvre le menu : noter
 * l'appel qu'on vient de passer, et relire les précédents. Voir
 * lib/suivi-appels (règles) et /api/appels (stockage + journal Notion).
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Phone, PhoneMissed, MessageSquare, CalendarClock, PhoneCall, Loader2, Mail, Clock } from "lucide-react";
import { toast } from "sonner";
import { ISSUES_APPEL, ligneJournal, lireHeure, rangAppel, resumerAppels, type Appel, type IssueAppel } from "@/lib/suivi-appels";

/* Un seul chargement pour toute la liste, partagé par toutes les lignes. */
let cache: Record<string, Appel[]> | null = null;
let enCours: Promise<void> | null = null;
const abonnes = new Set<() => void>();
const prevenir = () => abonnes.forEach((f) => f());
function charger() {
  if (!enCours) {
    enCours = fetch("/api/appels")
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => { cache = d && typeof d === "object" ? (d as Record<string, Appel[]>) : {}; prevenir(); })
      .catch(() => { cache = cache || {}; })
      .finally(() => { setTimeout(() => { enCours = null; }, 30_000); });
  }
  return enCours;
}

function useAppels(projectId: string): Appel[] {
  const [, forcer] = useState(0);
  useEffect(() => {
    const f = () => forcer((n) => n + 1);
    abonnes.add(f);
    if (!cache) charger();
    return () => { abonnes.delete(f); };
  }, []);
  return cache?.[projectId] || [];
}

/** « 2026-10-22 », jour local. */
function aujourdhui(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ICONES: Record<IssueAppel, typeof Phone> = {
  "sans-reponse": PhoneMissed, message: MessageSquare, sms: Mail, rappeler: CalendarClock, joint: PhoneCall,
};

export function SuiviAppels({ projectId, liste }: { projectId: string; liste: string }) {
  const appels = useAppels(projectId);
  const r = resumerAppels(appels);
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState<IssueAppel | null>(null);
  const [rappelLe, setRappelLe] = useState("");
  const [note, setNote] = useState("");
  /* Appel passé plus tôt (en voiture, noté au bureau) : jour + heure réels.
     Heure vide = maintenant. */
  const [jourAppel, setJourAppel] = useState("");
  const [heureAppel, setHeureAppel] = useState("");
  const boite = useRef<HTMLSpanElement>(null);
  const menu = useRef<HTMLSpanElement>(null);
  /* Le menu vit par-dessus la page (portail, position fixe) : dans la liste,
     il était coupé par le bas du panneau sur les dernières lignes. Il s'ouvre
     sous la pastille, ou au-dessus quand la place manque. */
  const [pos, setPos] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!ouvert) return;
    const placer = () => {
      const r = boite.current?.getBoundingClientRect();
      if (!r) return;
      const largeur = 290;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8));
      const enBas = window.innerHeight - r.bottom > 400 || r.top < 400;
      setPos(enBas ? { left, top: r.bottom + 4 } : { left, bottom: window.innerHeight - r.top + 4 });
    };
    placer();
    const dehors = (e: MouseEvent) => {
      const t = e.target as Node;
      if (boite.current?.contains(t) || menu.current?.contains(t)) return;
      setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    window.addEventListener("scroll", placer, true);
    window.addEventListener("resize", placer);
    return () => {
      document.removeEventListener("mousedown", dehors);
      window.removeEventListener("scroll", placer, true);
      window.removeEventListener("resize", placer);
    };
  }, [ouvert]);

  const stop = (e: React.SyntheticEvent) => { e.preventDefault(); e.stopPropagation(); };

  const noter = async (issue: IssueAppel) => {
    if (issue === "rappeler" && !rappelLe) { toast.error("Choisissez le jour du rappel"); return; }
    let le: string | undefined;
    const heureLue = lireHeure(heureAppel);
    if (heureLue === null) { toast.error("Heure illisible — par ex. 11:00, ou laissez vide"); return; }
    /* Un autre jour sans heure : l'heure n'est pas connue, on n'en invente
       pas — le journal n'indique que le jour (midi sert au classement). */
    const sansHeure = !!jourAppel && jourAppel !== aujourdhui() && !heureLue;
    if (heureLue || sansHeure) {
      const d = new Date(`${jourAppel || aujourdhui()}T${heureLue || "12:00"}:00`);
      if (Number.isNaN(d.getTime()) || (!sansHeure && d.getTime() > Date.now() + 60_000) || jourAppel > aujourdhui()) {
        toast.error("Le jour ou l'heure de l'appel est dans le futur"); return;
      }
      le = d.toISOString();
    }
    setEnvoi(issue);
    try {
      const res = await fetch("/api/appels", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, issue, le, sansHeure, rappelLe: issue === "rappeler" ? rappelLe : undefined, note: note.trim() || undefined, liste }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      cache = { ...(cache || {}), [projectId]: d.appels || [...appels, d.appel] };
      prevenir();
      toast.success(d.journal ? "Appel noté — journal Notion mis à jour" : "Appel noté (journal Notion à compléter)");
      setNote(""); setRappelLe(""); setJourAppel(""); setHeureAppel(""); setOuvert(false);
    } catch (e) {
      toast.error(`Appel non enregistré : ${(e as Error).message}`);
    } finally {
      setEnvoi(null);
    }
  };

  const historique = [...appels].sort((a, b) => b.le.localeCompare(a.le)).slice(0, 8);

  return (
    <span ref={boite} className="sg-appels">
      <button type="button" className={`sg-appels-btn is-${r.ton}`}
        title={historique.length ? `${r.quand ? `Dernier appel ${r.quand}\n` : ""}${historique.map((a) => ligneJournal(a, rangAppel(appels, a))).join("\n")}` : "Noter un appel"}
        onClick={(e) => { stop(e); setOuvert((v) => !v); }}>
        <Phone className="w-3 h-3 shrink-0" />
        <span className="sg-appels-txt">{r.ton === "aucun" ? "—" : r.libelle}</span>
        {r.quand && r.ton !== "aucun" && <em>{r.quand}</em>}
      </button>
      {ouvert && typeof document !== "undefined" && createPortal(
        <span ref={menu} className="sg-appels-menu" style={pos} role="menu" onClick={stop} onMouseDown={(e) => e.stopPropagation()}>
          <span className="sg-appels-titre">Noter l&apos;appel</span>
          <span className="sg-appels-quand">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>Appelé</span>
            <input type="date" value={jourAppel || aujourdhui()} max={aujourdhui()} onClick={(e) => e.stopPropagation()}
              onChange={(e) => setJourAppel(e.target.value)} aria-label="Jour de l'appel" />
            <span>à</span>
            {/* Champ texte, pas `type="time"` : Safari dessine une heure grisée
                (l'heure courante) dans une case horaire vide, et on croyait
                qu'elle serait enregistrée. Vide = pas d'heure. */}
            <input type="text" inputMode="numeric" placeholder="--:--" maxLength={5} value={heureAppel}
              className="sg-appels-heure" onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onChange={(e) => setHeureAppel(e.target.value)} aria-label="Heure de l'appel (facultative)" />
          </span>
          <span className="sg-appels-quand-aide">{heureAppel.trim() ? "Appel noté après coup, à l'heure indiquée"
              : jourAppel && jourAppel !== aujourdhui() ? "Heure facultative" : "Heure vide = maintenant"}</span>
          <input className="sg-appels-note" type="text" value={note} maxLength={200}
            placeholder="Note (facultatif) — ex. rappeler après 17h"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onChange={(e) => setNote(e.target.value)} />
          <span className="sg-appels-actions">
            {(["sans-reponse", "message", "sms", "joint"] as IssueAppel[]).map((i) => {
              const I = ICONES[i];
              return (
                <button key={i} type="button" className={`sg-appels-act is-${i}`} disabled={!!envoi}
                  onClick={(e) => { stop(e); noter(i); }}>
                  {envoi === i ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <I className="w-3.5 h-3.5" />}
                  {ISSUES_APPEL[i]}
                </button>
              );
            })}
          </span>
          <span className="sg-appels-rappel">
            <CalendarClock className="w-3.5 h-3.5 shrink-0" />
            <input type="date" value={rappelLe} onClick={(e) => e.stopPropagation()}
              onChange={(e) => setRappelLe(e.target.value)} aria-label="Jour du rappel" />
            <button type="button" disabled={!!envoi || !rappelLe} onClick={(e) => { stop(e); noter("rappeler"); }}>
              {envoi === "rappeler" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "À rappeler"}
            </button>
          </span>
          {historique.length > 0 && (
            <span className="sg-appels-histo">
              {historique.map((a) => {
                const I = ICONES[a.issue];
                return (
                  <span key={a.id} className={`is-${a.issue}`}>
                    <I className="w-3 h-3 shrink-0" />
                    <span>{ligneJournal(a, rangAppel(appels, a))}</span>
                  </span>
                );
              })}
            </span>
          )}
          <span className="sg-appels-aide">Chaque appel est aussi écrit dans le journal Notion du projet.</span>
        </span>,
        document.body,
      )}
    </span>
  );
}
