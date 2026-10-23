"use client";

/**
 * Créer un projet complet, sans ouvrir Notion.
 *
 * Cette page proposait dix-huit champs, écrits un à un dans le code, sur
 * les cent quarante-deux que compte la base. Pour tout le reste — le
 * fournisseur, les contacts, les numéros de commande, l'arrivage — il
 * fallait créer le dossier ici puis rouvrir Notion pour le compléter.
 *
 * Elle lit maintenant le schéma de la base et se construit toute seule.
 * Une colonne ajoutée demain dans Notion apparaît ici sans qu'on touche à
 * ce fichier.
 *
 * Les champs sont rangés par section, repliées sauf les trois premières :
 * une liste de cent quarante-deux cases à la file serait inutilisable. Et
 * les colonnes que le système de rapports remplit lui-même n'y figurent
 * pas — on ne crée pas un chantier en saisissant ses heures de montage.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Loader2, FolderPlus, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { ChampsNotion, type SchemaAffichable } from "@/components/champs-notion";
import type { ValeurChamp } from "@/lib/notion-valeurs";
import { NouveauProjet } from "@/components/nouveau-projet";

export function CreateProjectButton() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  /* La création en quatre étapes d'abord (20.10.2026) ; le formulaire
     complet, construit sur le schéma, reste à un lien. */
  const [rapide, setRapide] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [schema, setSchema] = useState<SchemaAffichable | null>(null);
  const [erreurSchema, setErreurSchema] = useState("");
  const [valeurs, setValeurs] = useState<Record<string, ValeurChamp>>({});
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => { if (d.user?.role === "admin") setIsAdmin(true); })
      .catch(() => {});
  }, []);

  /* Le schéma n'est demandé qu'à l'ouverture : inutile d'interroger Notion
     sur chaque page pour un bouton qu'on ne cliquera peut-être pas. */
  useEffect(() => {
    if (!ouvert || schema) return;
    setErreurSchema("");
    fetch("/api/notion/schema")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setSchema({ champs: d.champs || [], sections: d.sections || [] }))
      .catch((e) => setErreurSchema(e.message || "Schéma indisponible"));
  }, [ouvert, schema]);

  const champTitre = useMemo(
    () => schema?.champs.find((c) => c.type === "title"),
    [schema],
  );

  const modifier = useCallback((id: string, v: ValeurChamp) => {
    setValeurs((prev) => ({ ...prev, [id]: v }));
  }, []);

  const fermer = () => { setOuvert(false); setValeurs({}); };

  const creer = async () => {
    const titre = champTitre ? valeurs[champTitre.id] : null;
    if (!titre || typeof titre !== "string" || !titre.trim()) {
      toast.error(`« ${champTitre?.nom || "Projet"} » est obligatoire`);
      return;
    }
    setEnvoi(true);
    try {
      const res = await fetch("/api/projects/creer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valeurs }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");

      /* On nomme ce qui n'a pas pu être enregistré : un champ refusé en
         silence, c'est une information qu'on croit saisie et qui manque. */
      if (data.refuses?.length) {
        toast.warning(
          `Projet créé. ${data.refuses.length} champ(s) non enregistré(s) : ` +
          data.refuses.map((r: { nom: string }) => r.nom).join(", "),
          { duration: 10000 },
        );
      } else {
        toast.success("Projet créé");
      }
      fermer();
      if (data.pageId) router.push(`/projet/${data.pageId}?mode=cmd`);
    } catch (e) {
      toast.error((e as Error).message || "Erreur lors de la création");
    } finally {
      setEnvoi(false);
    }
  };

  /* La barre du bas de l'app iPhone ouvre la même création. La demande est
     GARDÉE tant que le rôle n'est pas confirmé : un « + » touché dès
     l'ouverture de l'app arrivait avant la réponse de /api/auth et se
     perdait — rien ne s'ouvrait (24.10.2026). */
  const [demandee, setDemandee] = useState(false);
  useEffect(() => {
    const ouvrir = () => setDemandee(true);
    window.addEventListener("tm-nouveau-projet", ouvrir);
    return () => window.removeEventListener("tm-nouveau-projet", ouvrir);
  }, []);
  useEffect(() => {
    if (demandee && isAdmin) { setRapide(true); setDemandee(false); }
  }, [demandee, isAdmin]);

  if (!isAdmin) return null;

  return (
    <>
      <button
        onClick={() => setRapide(true)}
        aria-label="Créer un nouveau projet"
        title="Nouveau projet"
        className="app-hdr-new w-9 h-9 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white hover:bg-white/25 active:scale-95 transition-all"
      >
        <Plus className="w-4 h-4" />
      </button>

      <NouveauProjet
        open={rapide}
        currentMode=""
        onClose={() => setRapide(false)}
        onCreated={(id) => { if (id) router.push(`/projet/${id}?mode=cmd`); }}
        onTousLesChamps={() => { setRapide(false); setOuvert(true); }}
      />

      {ouvert && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[200] flex justify-end">
          <div
            onClick={fermer}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            aria-hidden="true"
          />
          <div className="relative flex flex-col w-full max-w-2xl bg-white dark:bg-gray-900 h-full overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <FolderPlus className="w-5 h-5 text-blue-500 shrink-0" />
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base truncate">Nouveau projet</h2>
                {schema && (
                  <span className="text-xs text-gray-400 shrink-0">
                    {schema.champs.filter((c) => !c.lectureSeule && !c.masque).length} champs
                  </span>
                )}
              </div>
              <button
                onClick={fermer}
                aria-label="Fermer"
                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4">
              {!schema && !erreurSchema && (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Lecture des champs depuis Notion…
                </div>
              )}

              {erreurSchema && (
                <div role="alert" className="flex items-start gap-2 p-3 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold">Impossible de lire les champs depuis Notion</p>
                    <p className="text-xs mt-1 opacity-80">{erreurSchema}</p>
                    <p className="text-xs mt-1 opacity-80">
                      Le projet ne peut pas être créé tant que la base ne répond pas — mieux vaut
                      attendre que fabriquer un dossier incomplet.
                    </p>
                  </div>
                </div>
              )}

              {schema && (
                /* Les champs non saisissables sont écartés : à la création,
                   une formule n'a rien à calculer et un bouton rien à faire. */
                <ChampsNotion
                  schema={schema}
                  valeurs={valeurs}
                  onChange={modifier}
                  afficherLectureSeule={false}
                />
              )}
            </div>

            <div className="flex items-center gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 shrink-0">
              <button
                onClick={fermer}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={creer}
                disabled={envoi || !schema}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2"
              >
                {envoi ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {envoi ? "Création…" : "Créer"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
