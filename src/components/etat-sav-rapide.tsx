"use client";

/**
 * L'état SAV d'un chantier, changé d'un clic depuis la liste.
 *
 * La pastille garde EXACTEMENT l'allure d'un état figé — même forme, même
 * taille, mêmes couleurs que partout ailleurs. Une liste n'a pas à
 * ressembler à un formulaire : une première version en italique souligné
 * de pointillés s'en écartait, et on la voyait.
 *
 * Deux choses derrière elle.
 *
 * L'ÉTAT AFFICHÉ PEUT ÊTRE DÉDUIT DES LOTS. La colonne « État - SAV » se
 * remplit à la main dans Notion ; un SAV signalé sur une douche ne la
 * touche pas, d'où les « Aucun SAV » en face de chantiers qui attendent
 * une reprise. On affiche alors ce que les douches disent — l'infobulle
 * le précise, sans rien changer à l'apparence.
 *
 * LA LISTE DES ÉTATS VIENT DE NOTION. Elle n'est pas écrite ici : on lit
 * la colonne. Un état ajouté dans Notion apparaît donc tout seul dans ce
 * menu.
 *
 * ── LA LIMITE, ET ELLE EST DE NOTION ────────────────────────────────────
 *
 * « État - SAV » est une colonne de type « statut ». L'API refuse
 * d'inventer une valeur : `Invalid status option. Status option "…" does
 * not exist` (vérifié le 16 octobre 2026). On ne peut donc pas taper
 * n'importe quoi depuis ici — mais on peut créer l'état dans Notion et le
 * retrouver dans ce menu, et c'est ce que le champ libre explique au lieu
 * de laisser l'utilisateur buter sur un refus incompréhensible.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ETATS_SAV } from "@/lib/sav-cabines";

/** Les états lus chez Notion, partagés par toutes les lignes de la liste. */
let etatsConnus: string[] | null = null;
let lecture: Promise<string[]> | null = null;

async function lireEtats(frais = false): Promise<string[]> {
  if (!frais && etatsConnus) return etatsConnus;
  if (!frais && lecture) return lecture;
  const p = fetch(`/api/notion/schema${frais ? "?frais=1" : ""}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const champ = (d?.champs || []).find(
        (c: { nom: string }) => c.nom === "État - SAV",
      );
      const noms = (champ?.options || []).map((o: { nom: string }) => o.nom).filter(Boolean);
      etatsConnus = noms.length ? noms : [...ETATS_SAV];
      return etatsConnus as string[];
    })
    .catch(() => [...ETATS_SAV] as string[])
    .finally(() => { lecture = null; });
  lecture = p;
  return p;
}

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
  const [options, setOptions] = useState<string[]>(() => etatsConnus || [...ETATS_SAV]);
  const [libre, setLibre] = useState("");
  const [refus, setRefus] = useState("");
  const boite = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!ouvert) return;
    lireEtats().then(setOptions).catch(() => {});
    const dehors = (e: MouseEvent) => {
      if (boite.current && !boite.current.contains(e.target as Node)) setOuvert(false);
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  const enregistrer = async (valeur: string) => {
    const v = valeur.trim();
    if (!v) return;
    if (v === etat && !deduit) { setOuvert(false); return; }
    const avant = etat;
    setRefus("");
    onChange(v);
    setEnvoi(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ etatSAV: v }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(String(d.error || res.status));
      }
      toast.success(`État SAV : ${v}`);
      setOuvert(false);
      setLibre("");
    } catch (e) {
      onChange(deduit ? null : avant);
      const msg = String((e as Error).message || "");
      if (/does not exist|Invalid status/i.test(msg)) {
        /* Notion n'invente pas une valeur de statut. Plutôt qu'un code
           d'erreur, on dit quoi faire — et on propose de relire la
           colonne, au cas où l'état vient d'y être créé. */
        setRefus(`« ${v} » n'existe pas dans la colonne « État - SAV » de Notion. Créez-le là-bas, puis relisez les états.`);
      } else {
        setRefus("L'état n'a pas pu être enregistré — réessayez.");
      }
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
          ? "Déduit des douches en SAV — la colonne Notion n'a pas encore suivi. Cliquez pour choisir."
          : "Cliquez pour changer l'état SAV"}
        onClick={(e) => {
          /* La ligne entière est un lien vers le chantier : sans cela, un
             clic sur la pastille l'ouvrirait au lieu de la dérouler. */
          e.preventDefault();
          e.stopPropagation();
          setOuvert((v) => !v);
        }}
        className={`sg-state sg-state-btn ${classe}`}
      >
        {etat}
      </button>

      {ouvert && (
        <span className="sg-etatsav-menu" role="menu" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          {deduit && (
            <span className="sg-etatsav-aide">
              État déduit des douches en SAV. Choisissez pour l&apos;inscrire dans Notion.
            </span>
          )}
          {options.map((v) => (
            <button
              key={v}
              type="button"
              role="menuitem"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); enregistrer(v); }}
              className={`sg-etatsav-item${v === etat ? " is-on" : ""}`}
            >
              {v}
            </button>
          ))}

          <span className="sg-etatsav-sep" />
          <span className="sg-etatsav-libre">
            <input
              value={libre}
              onChange={(e) => setLibre(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); enregistrer(libre); }
                if (e.key === "Escape") { e.preventDefault(); setOuvert(false); }
              }}
              placeholder="Autre état…"
              aria-label="Autre état"
            />
            <button type="button" disabled={!libre.trim() || envoi}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); enregistrer(libre); }}>
              OK
            </button>
          </span>
          {refus && (
            <span className="sg-etatsav-refus">
              {refus}
              <button type="button"
                onClick={(e) => {
                  e.preventDefault(); e.stopPropagation();
                  lireEtats(true).then((l) => { setOptions(l); setRefus(""); });
                }}>
                Relire les états
              </button>
            </span>
          )}
        </span>
      )}
    </span>
  );
}
