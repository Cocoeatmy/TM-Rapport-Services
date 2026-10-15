"use client";

/**
 * Toutes les informations d'un projet, consultables et modifiables ici.
 *
 * Mêmes champs, mêmes sections, même ordre que la page « Nouveau projet » :
 * un champ ne doit pas changer de place selon l'écran où on le cherche.
 * Les deux se servent du même composant, c'est la seule garantie qui
 * tienne.
 *
 * ── CE QUI PROTÈGE LES DONNÉES ──────────────────────────────────────────
 *
 * ON N'ENVOIE QUE CE QU'ON A TOUCHÉ. Les cent quarante-deux propriétés
 * sont à l'écran, mais l'enregistrement ne porte que sur celles qu'on a
 * modifiées. Renvoyer les autres « telles qu'on les avait lues »
 * écraserait ce qu'un collègue aurait changé entre-temps.
 *
 * ON REGARDE SI LA FICHE A BOUGÉ. Avant d'enregistrer, on relit la date de
 * dernière modification. Si elle a changé depuis l'ouverture, on le dit et
 * on demande quoi faire, au lieu d'écraser en silence.
 *
 * ON NE MENT PAS SUR CE QUI EST ENREGISTRÉ. Un champ refusé par Notion est
 * nommé, avec sa raison. Un champ qui appartient au système de rapports
 * est grisé, et le reste.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Save, RefreshCw, AlertTriangle, Check, Database } from "lucide-react";
import { toast } from "sonner";
import { ChampsNotion, type SchemaAffichable } from "@/components/champs-notion";
import { memeValeur, type ValeurChamp } from "@/lib/notion-valeurs";

type Valeurs = Record<string, ValeurChamp>;

export function FicheComplete({ projectId }: { projectId: string }) {
  const [schema, setSchema] = useState<SchemaAffichable | null>(null);
  const [initiales, setInitiales] = useState<Valeurs>({});
  const [valeurs, setValeurs] = useState<Valeurs>({});
  const [modifieLe, setModifieLe] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState("");
  const [envoi, setEnvoi] = useState(false);
  const [conflit, setConflit] = useState<string | null>(null);
  const monte = useRef(true);

  useEffect(() => { monte.current = true; return () => { monte.current = false; }; }, []);

  const charger = useCallback(async (silencieux = false) => {
    if (!silencieux) setChargement(true);
    setErreur("");
    try {
      const [rs, rv] = await Promise.all([
        fetch("/api/notion/schema"),
        fetch(`/api/projects/${projectId}/champs`),
      ]);
      if (!rs.ok) throw new Error((await rs.json().catch(() => ({}))).error || "Schéma indisponible");
      if (!rv.ok) throw new Error((await rv.json().catch(() => ({}))).error || "Projet illisible");
      const ds = await rs.json();
      const dv = await rv.json();
      if (!monte.current) return;
      setSchema({ champs: ds.champs || [], sections: ds.sections || [] });
      setInitiales(dv.valeurs || {});
      setValeurs(dv.valeurs || {});
      setModifieLe(dv.modifieLe || null);
      setConflit(null);
    } catch (e) {
      if (monte.current) setErreur((e as Error).message || "Lecture impossible");
    } finally {
      if (monte.current) setChargement(false);
    }
  }, [projectId]);

  useEffect(() => { charger(); }, [charger]);

  const modifier = useCallback((id: string, v: ValeurChamp) => {
    setValeurs((prev) => ({ ...prev, [id]: v }));
  }, []);

  /** Ce qui a réellement changé depuis l'ouverture — et rien d'autre. */
  const changes = useMemo(() => {
    const m: Valeurs = {};
    for (const [id, v] of Object.entries(valeurs)) {
      if (!memeValeur(v, initiales[id] ?? null)) m[id] = v;
    }
    return m;
  }, [valeurs, initiales]);

  const nbChanges = Object.keys(changes).length;

  const enregistrer = async (forcer = false) => {
    if (nbChanges === 0) return;
    setEnvoi(true);
    setConflit(null);
    try {
      /* La fiche a-t-elle bougé pendant qu'on la remplissait ? On relit
         avant d'écrire. C'est moins cher qu'une donnée écrasée. */
      if (!forcer) {
        const frais = await fetch(`/api/projects/${projectId}/champs`).then((r) => (r.ok ? r.json() : null));
        if (frais?.modifieLe && modifieLe && frais.modifieLe !== modifieLe) {
          const touchesAilleurs = Object.keys(changes).filter(
            (id) => !memeValeur(frais.valeurs?.[id] ?? null, initiales[id] ?? null),
          );
          if (touchesAilleurs.length > 0) {
            const noms = touchesAilleurs
              .map((id) => schema?.champs.find((c) => c.id === id)?.nom || id)
              .join(", ");
            setConflit(noms);
            setEnvoi(false);
            return;
          }
          /* La fiche a bougé, mais pas sur les champs qu'on touche : on
             peut enregistrer sans rien écraser. */
          setModifieLe(frais.modifieLe);
        }
      }

      const res = await fetch(`/api/projects/${projectId}/champs`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valeurs: changes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enregistrement refusé");

      if (data.refuses?.length) {
        toast.warning(
          `${data.enregistres} champ(s) enregistré(s). Refusé(s) : ` +
          data.refuses.map((r: { nom: string; motif: string }) => `${r.nom} (${r.motif})`).join(" · "),
          { duration: 12000 },
        );
      } else {
        toast.success(`${data.enregistres} champ${data.enregistres > 1 ? "s" : ""} enregistré${data.enregistres > 1 ? "s" : ""}`);
      }
      /* On relit : Notion peut normaliser une valeur (une date, un
         nombre), et l'écran doit montrer ce qui est VRAIMENT enregistré. */
      await charger(true);
    } catch (e) {
      toast.error((e as Error).message || "Enregistrement impossible");
    } finally {
      setEnvoi(false);
    }
  };

  if (chargement) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        Lecture des champs depuis Notion…
      </div>
    );
  }

  if (erreur) {
    return (
      <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="font-semibold">Les champs n&apos;ont pas pu être lus</p>
          <p className="text-xs mt-1 opacity-80">{erreur}</p>
          <button onClick={() => charger()} className="mt-2 text-xs font-semibold underline">Réessayer</button>
        </div>
      </div>
    );
  }

  if (!schema) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Database className="w-4 h-4 text-gray-400 shrink-0" />
        <p className="text-xs text-gray-500 dark:text-gray-400 flex-1 min-w-0">
          {schema.champs.filter((c) => !c.masque).length} propriétés de la base Notion.
          Les champs grisés sont renseignés ailleurs — par un calcul Notion ou par le rapport d&apos;intervention.
        </p>
        <button
          type="button" onClick={() => charger()} disabled={envoi}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          title="Relire depuis Notion"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Actualiser
        </button>
      </div>

      {conflit && (
        <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="text-sm min-w-0">
            <p className="font-semibold">Ces champs ont changé ailleurs pendant votre saisie</p>
            <p className="text-xs mt-1 break-words">{conflit}</p>
            <p className="text-xs mt-1 opacity-80">
              Quelqu&apos;un — ou Notion — les a modifiés depuis que vous avez ouvert la fiche.
              Enregistrer maintenant remplacerait leur version par la vôtre.
            </p>
            <div className="flex gap-2 mt-2">
              <button onClick={() => charger()} className="text-xs font-semibold underline">
                Reprendre leur version
              </button>
              <button onClick={() => enregistrer(true)} className="text-xs font-semibold underline">
                Garder la mienne
              </button>
            </div>
          </div>
        </div>
      )}

      <ChampsNotion schema={schema} valeurs={valeurs} onChange={modifier} />

      {/* La barre d'enregistrement suit le défilement : avec cent quarante
          propriétés, un bouton tout en bas ne se trouve jamais. */}
      <div className="sticky bottom-0 -mx-1 px-1 py-2 bg-gradient-to-t from-white dark:from-gray-900 via-white/95 dark:via-gray-900/95 to-transparent">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400 flex-1 min-w-0">
            {nbChanges === 0
              ? <span className="inline-flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-500" /> Tout est enregistré</span>
              : `${nbChanges} modification${nbChanges > 1 ? "s" : ""} en attente`}
          </span>
          {nbChanges > 0 && (
            <button
              type="button" onClick={() => { setValeurs(initiales); setConflit(null); }}
              disabled={envoi}
              className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Annuler
            </button>
          )}
          <button
            type="button" onClick={() => enregistrer()} disabled={envoi || nbChanges === 0}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {envoi ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
