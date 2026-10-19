"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

/**
 * Les dernières pastilles de l'en-tête, repliées derrière « ⋯ » quand elles
 * ne tiennent plus sur la ligne.
 *
 * Sur un iPhone, un administrateur a jusqu'à onze pastilles de 40 px : la
 * ligne débordait déjà de 63 px sur un iPhone SE (relevé du 20.10.2026) et
 * défilait sans que rien ne l'indique. Plutôt que de rétrécir les zones
 * tactiles, ces pastilles-ci passent dans un petit panneau. Elles y restent
 * montées et fonctionnent comme avant (compteurs, menus, synchro). Si l'une
 * d'elles signale quelque chose (`data-alerte`), le « ⋯ » porte une pastille.
 *
 * Quand tout tient (iPad, ordinateur), rien ne change : les pastilles sont à
 * leur place habituelle (`display: contents`).
 *
 * Les pastilles ne sont montées QU'UNE fois, dans un conteneur qu'on DÉPLACE
 * entre la ligne et le panneau. Les rendre ici puis là les faisait remonter à
 * chaque repli (rotation de l'iPhone…) : la synchro relançait ses
 * automatismes au milieu d'un envoi (constaté en test, 20.10.2026).
 */
export function RepliEntete({ children }: { children: ReactNode }) {
  const [replie, setReplie] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [alerte, setAlerte] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 8 });
  const boutonRef = useRef<HTMLButtonElement>(null);
  const panneauRef = useRef<HTMLDivElement>(null);
  const largeurDepliee = useRef(0);
  const emplacementRef = useRef<HTMLDivElement>(null);
  const [hote, setHote] = useState<HTMLDivElement | null>(null);
  const monte = hote !== null;
  useEffect(() => {
    const el = document.createElement("div");
    el.style.display = "contents";
    setHote(el);
    return () => el.remove();
  }, []);

  /* Le conteneur des pastilles va là où elles doivent paraître. */
  useLayoutEffect(() => {
    if (!hote) return;
    const cible = replie ? panneauRef.current : emplacementRef.current;
    if (cible && hote.parentElement !== cible) cible.appendChild(hote);
  }, [hote, replie]);

  /* Replier quand la ligne déborde ; déplier quand elle a retrouvé la largeur
     qu'il lui fallait. */
  useLayoutEffect(() => {
    const ligne = document.querySelector<HTMLElement>("#main-header > div");
    if (!ligne) return;
    const evaluer = () => {
      if (!replie) {
        if (ligne.scrollWidth > ligne.clientWidth + 1) {
          largeurDepliee.current = ligne.scrollWidth;
          setReplie(true);
        }
      } else if (ligne.clientWidth >= largeurDepliee.current + 2) {
        setReplie(false);
        setOuvert(false);
      }
    };
    evaluer();
    const ro = new ResizeObserver(evaluer);
    ro.observe(ligne);
    for (const enfant of Array.from(ligne.children)) ro.observe(enfant);
    const mo = new MutationObserver(evaluer);
    mo.observe(ligne, { childList: true, subtree: true });
    return () => { ro.disconnect(); mo.disconnect(); };
  }, [replie]);

  /* Une pastille repliée qui signale quelque chose se voit sur le « ⋯ ». */
  useEffect(() => {
    const p = panneauRef.current;
    if (!replie || !p) { setAlerte(false); return; }
    const lire = () => setAlerte(!!p.querySelector("[data-alerte]"));
    lire();
    const mo = new MutationObserver(lire);
    mo.observe(p, { childList: true, subtree: true, attributes: true });
    return () => mo.disconnect();
  }, [replie, monte]);

  /* Fermer en touchant ailleurs, ou avec Échap. Les menus ouverts DEPUIS le
     panneau (compte, notifications) vivent ailleurs dans la page : un toucher
     dedans ne doit pas refermer le panneau sous eux. */
  useEffect(() => {
    if (!ouvert) return;
    const ailleurs = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panneauRef.current?.contains(t) || boutonRef.current?.contains(t)) return;
      if ((t as Element).closest?.("[data-menu-entete]")) return;
      setOuvert(false);
    };
    const echap = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("pointerdown", ailleurs);
    document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("pointerdown", ailleurs); document.removeEventListener("keydown", echap); };
  }, [ouvert]);

  const basculer = () => {
    const r = boutonRef.current?.getBoundingClientRect();
    if (r) setPos({ top: Math.round(r.bottom + 8), right: Math.max(8, Math.round(window.innerWidth - r.right)) });
    setOuvert((o) => !o);
  };

  return (
    <>
      {/* L'emplacement dans la ligne (vide quand c'est replié). */}
      <div ref={emplacementRef} className="contents" />
      {replie && (
        <button
          ref={boutonRef}
          type="button"
          onClick={basculer}
          aria-label="Autres actions"
          aria-expanded={ouvert}
          title="Autres actions"
          className="relative w-9 h-9 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white hover:bg-white/25 active:scale-95 transition-all"
        >
          <MoreHorizontal className="w-5 h-5" />
          {alerte && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-orange-500 border-2 border-[#1e3a5f]" aria-hidden="true" />
          )}
        </button>
      )}
      {monte && createPortal(
        <div
          ref={panneauRef}
          id="main-header-repli"
          role="group"
          aria-label="Autres actions"
          className="rounded-2xl shadow-2xl border border-white/15 p-2 flex flex-wrap items-center justify-end gap-2 bg-[#1e3a5f]/95 backdrop-blur-md"
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 70, maxWidth: "calc(100vw - 16px)", display: replie && ouvert ? "flex" : "none" }}
        />,
        document.body,
      )}
      {/* Les pastilles elles-mêmes : montées une fois, dans l'hôte déplacé. */}
      {hote && createPortal(children, hote)}
    </>
  );
}
