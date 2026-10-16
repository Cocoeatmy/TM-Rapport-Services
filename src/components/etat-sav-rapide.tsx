"use client";

/**
 * L'état SAV d'un chantier, changé d'un clic depuis la liste.
 *
 * Deux problèmes, un seul endroit.
 *
 * LE PREMIER : « Aucun SAV » s'affichait en face de chantiers listés dans
 * « RDV SAV à fixer ». La colonne « État - SAV » se remplit à la main dans
 * Notion ; un SAV signalé depuis l'application sur une douche ne la
 * touche pas. Le tableau contredisait la liste qui le contenait. L'état
 * déduit des lots s'affiche désormais, en italique, pour dire qu'il reste
 * à confirmer.
 *
 * LE SECOND : pour corriger cet état, il fallait ouvrir le chantier, puis
 * l'onglet, puis le champ. Un clic sur la pastille suffit maintenant.
 *
 * L'enregistrement est OPTIMISTE — la pastille change tout de suite, le
 * serveur suit. S'il refuse, la valeur d'avant revient avec un message :
 * on ne laisse jamais croire à un enregistrement qui n'a pas eu lieu.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ETATS_SAV } from "@/lib/sav-cabines";

export function EtatSavRapide({
  projectId, etat, deduit, classe, onChange,
}: {
  projectId: string;
  etat: string;
  /** Vrai = déduit des lots ; la colonne Notion dit encore autre chose. */
  deduit: boolean;
  classe: string;
  /** Prévient la liste pour qu'elle affiche la nouvelle valeur. */
  onChange: (etat: string | null) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const boite = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  const choisir = async (valeur: string) => {
    setOuvert(false);
    if (valeur === etat && !deduit) return;
    const avant = etat;
    onChange(valeur);
    setEnvoi(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etatSAV: valeur }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(`État SAV : ${valeur}`);
    } catch {
      onChange(deduit ? null : avant);
      toast.error("L'état n'a pas pu être enregistré — réessayez", { duration: 8000 });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <span ref={boite} className="sg-etatsav">
      <button
        type="button"
        disabled={envoi}
        title={deduit
          ? `Déduit des douches en SAV — la colonne Notion dit encore « Aucun SAV ». Cliquez pour choisir.`
          : "Cliquez pour changer l'état SAV"}
        onClick={(e) => {
          /* La ligne entière est un lien vers le chantier : sans cela, un
             clic sur la pastille l'ouvrirait au lieu de la dérouler. */
          e.preventDefault();
          e.stopPropagation();
          setOuvert((v) => !v);
        }}
        className={`sg-state sg-state-btn ${classe}${deduit ? " is-deduit" : ""}`}
      >
        {etat}
      </button>

      {ouvert && (
        <span className="sg-etatsav-menu" role="menu">
          {deduit && (
            <span className="sg-etatsav-aide">
              Déduit des douches en SAV. Choisissez pour l&apos;inscrire dans Notion.
            </span>
          )}
          {ETATS_SAV.map((v) => (
            <button
              key={v}
              type="button"
              role="menuitem"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); choisir(v); }}
              className={`sg-etatsav-item${v === etat ? " is-on" : ""}`}
            >
              {v}
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
