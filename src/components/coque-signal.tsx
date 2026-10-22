"use client";

/**
 * La coque Signal des pages hors tableau de bord (22.10.2026).
 *
 * Sur l'accueil, le rail à gauche et la barre d'en-tête (recherche ouverte,
 * « Nouveau projet ») sont rendus par `page.tsx`. Les autres pages — fiche
 * projet, administration, planning, devis — n'en avaient rien : on y
 * arrivait sans rail, avec un en-tête différent, et l'app semblait changer
 * d'apparence d'une page à l'autre. Ce composant leur apporte LES MÊMES :
 * mêmes classes (`signal-rail`, `signal-headerbar`), donc les mêmes styles,
 * et les mêmes destinations (elles ouvrent l'accueil sur la bonne vue).
 *
 * Il ne paraît qu'en thème Signal, sur grand écran (même requête que le rail
 * de l'accueil), hors app iPhone, et jamais sur les pages publiques vues par
 * les clients ni sur la connexion.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import {
  Archive, BarChart2, Building2, Coins, Columns3, Factory, FolderOpen, Plus,
  Receipt, Search, Sparkles, Truck, Users as UsersIcon, Warehouse,
} from "lucide-react";

/* Même chaîne que `REQUETE_RAIL` (page.tsx) et que la règle du rail dans
   theme-signal.css : les trois doivent rester identiques. */
const REQUETE_RAIL = "(min-width: 1024px), (min-width: 700px) and (pointer: coarse)";

/* Pages sans coque : l'accueil a la sienne ; les autres sont publiques. */
const SANS_COQUE = /^\/(login|client|f|m|s|sav|sig|ch)(\/|$)/;

export function CoqueSignal() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const [signal, setSignal] = useState(false);
  const [large, setLarge] = useState(false);
  const [iphone, setIphone] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [bexioOk, setBexioOk] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    const lire = () => {
      setSignal(html.getAttribute("data-ui") === "signal");
      setIphone(html.getAttribute("data-app") === "ios");
    };
    lire();
    const obs = new MutationObserver(lire);
    obs.observe(html, { attributes: true, attributeFilter: ["data-ui", "data-app"] });
    const mq = window.matchMedia(REQUETE_RAIL);
    const maj = () => setLarge(mq.matches);
    maj();
    mq.addEventListener("change", maj);
    setSlot(document.getElementById("signal-header-slot"));
    return () => { obs.disconnect(); mq.removeEventListener("change", maj); };
  }, []);

  const actif = signal && large && !iphone && pathname !== "/" && !SANS_COQUE.test(pathname);

  /* La hauteur réelle de l'en-tête (bandeau de synchro compris), suivie en
     continu : l'accueil la mesurait seul, les autres pages gardaient une
     valeur périmée et le rail se décalait. */
  useEffect(() => {
    if (!actif) return;
    const header = document.getElementById("main-header");
    const bloc = header?.parentElement ?? header;
    if (!bloc) return;
    const poser = () => document.documentElement.style.setProperty("--header-h", `${bloc.offsetHeight}px`);
    poser();
    const ro = new ResizeObserver(poser);
    ro.observe(bloc);
    return () => ro.disconnect();
  }, [actif]);

  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    fetch("/api/auth")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const admin = d?.user?.role === "admin";
        if (!vivant) return;
        setIsAdmin(admin);
        /* Facturation et CA-Bexio : seulement si l'accès bexio répond, comme
           sur l'accueil (données réservées au propriétaire des accès). */
        if (admin) {
          fetch("/api/bexio/etat", { credentials: "include" })
            .then((r) => { if (vivant) setBexioOk(r.ok); })
            .catch(() => {});
        }
      })
      .catch(() => {});
    return () => { vivant = false; };
  }, [actif]);

  if (!actif) return null;

  const aller = (mode: string) => router.push(`/?mode=${mode}`);
  const entrees: { id: string; label: string; Icon: typeof Sparkles; act: () => void; cls?: string }[] = [
    { id: "projets", label: "Projets", Icon: FolderOpen, act: () => aller("calendrier") },
    { id: "clients", label: "CRM", Icon: UsersIcon, act: () => aller("clients-accueil") },
    { id: "grossistes", label: "Grossistes", Icon: Warehouse, act: () => aller("grossistes-accueil") },
    { id: "fournisseurs", label: "Fournisseurs", Icon: Factory, act: () => aller("fournisseurs-accueil") },
    { id: "arrivage", label: "Arrivage", Icon: Truck, act: () => aller("arrivage") },
    { id: "kanban", label: "Kanban", Icon: Columns3, act: () => aller("kanban") },
    { id: "destockage", label: "Déstockage", Icon: Archive, act: () => aller("destockage") },
    { id: "chantiers", label: "Chantiers PPE", Icon: Building2, act: () => aller("chantiers") },
    ...(isAdmin ? [{ id: "stats", label: "Stats", Icon: BarChart2, act: () => aller("stats") }] : []),
    ...(bexioOk ? [
      { id: "facturation", label: "Facturation", Icon: Receipt, act: () => aller("facturation") },
      { id: "ca-bexio", label: "CA-Bexio", Icon: Coins, act: () => aller("ca-bexio") },
    ] : []),
    { id: "assistant", label: "Assistant IA", Icon: Sparkles, cls: "is-assistant",
      act: () => window.dispatchEvent(new Event("tm-ouvrir-assistant")) },
  ];

  return (
    <>
      <nav aria-label="Navigation principale" className="signal-rail hidden lg:flex">
        {entrees.map((it) => (
          <button key={it.id} type="button" onClick={it.act} title={it.label} aria-label={it.label}
            className={`signal-rail-item${it.cls ? ` ${it.cls}` : ""}`}>
            <it.Icon className="w-5 h-5" />
          </button>
        ))}
      </nav>
      {slot && createPortal(
        <div className="signal-headerbar">
          <div className="signal-topbar-spacer" />
          <button type="button" className="signal-search"
            onClick={() => window.dispatchEvent(new CustomEvent("tm-open-search"))}>
            <Search className="w-4 h-4 shrink-0" />
            <span className="signal-search-ph">Rechercher un projet ou lancer une action</span>
            <span className="signal-kbd">⌘K</span>
          </button>
          {isAdmin && (
            <button type="button" className="signal-new"
              onClick={() => window.dispatchEvent(new Event("tm-nouveau-projet"))}>
              <Plus className="w-4 h-4" />
              Nouveau projet
            </button>
          )}
        </div>,
        slot,
      )}
    </>
  );
}
