"use client";

/**
 * Dommage de transport, déclaré depuis l'Arrivage (23.10.2026).
 *
 * Au dépôt, on ouvre le carton et on constate le dégât : on le déclare ici,
 * sans aller chercher la fiche du projet. Il devient un SIGNALEMENT du
 * projet, type « Dommage de transport » — le même que celui qu'on créerait
 * depuis la fiche : il apparaît dans la section Signalements, dans les
 * statistiques des fournisseurs et grossistes, et dans le journal Notion
 * « Infos - Défauts signalé ».
 *
 * Fichiers : photos, vidéos et PDF. Tous partent DIRECTEMENT vers Cloudinary
 * (une vidéo de téléphone dépasse la limite de 4,5 Mo par requête de Vercel),
 * aux plafonds de toute l'app (10 Mo image/document, 100 Mo et 1 min vidéo).
 */

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, FileText, Loader2, Paperclip, Plus, Truck, Video, X } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/lib/notion";
import { compressImage } from "@/lib/compress-image";
import { envoyerEnDirect, refusPour } from "@/lib/envoi-fichiers";
import { identifiantSignalement } from "@/lib/signalement-id";
import { offlineFetch } from "@/lib/offline";

/** Ce qu'on trouve abîmé le plus souvent — un toucher suffit. */
const PIECES = ["Verre / vitre", "Profilé", "Porte", "Paroi", "Receveur", "Charnière / accessoire", "Emballage percé"];

const aujourdhui = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const dateSuisse = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join(".") : iso);

/** Les noms des lots (« Cab2:SDB étage ») — numéro → nom affiché. */
function nomsDesLots(p: Project): string[] {
  const n = Number(p.nbCabines) || 0;
  const noms = new Map<number, string>();
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(p.nomsCabines || "")))) if (m[2].trim()) noms.set(parseInt(m[1], 10), m[2].trim());
  return Array.from({ length: n }, (_, i) => noms.get(i + 1) || `Cabine ${i + 1}`);
}

interface Existant { id: string; description?: string; timestamp?: number; photoUrls?: string[] }

export function DommageTransport({ p, dateArrivage }: { p: Project; dateArrivage?: string }) {
  const [ouvert, setOuvert] = useState(false);
  const [date, setDate] = useState(dateArrivage || aujourdhui());
  const [lots, setLots] = useState<number[]>([]);
  const [pieces, setPieces] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [transporteur, setTransporteur] = useState("");
  const [reserves, setReserves] = useState<"oui" | "non" | "">("");
  const [rapport, setRapport] = useState(false);
  const [fichiers, setFichiers] = useState<{ f: File; apercu: string }[]>([]);
  const [envoi, setEnvoi] = useState(false);
  const [existants, setExistants] = useState<Existant[]>([]);
  const camera = useRef<HTMLInputElement>(null);
  const galerie = useRef<HTMLInputElement>(null);
  const nomsLots = nomsDesLots(p);

  /* La date d'arrivage saisie plus haut sert de valeur par défaut. */
  useEffect(() => { if (dateArrivage && !ouvert) setDate(dateArrivage); }, [dateArrivage, ouvert]);

  const charger = () => {
    fetch(`/api/defauts?projectId=${encodeURIComponent(p.id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((l: (Existant & { types?: string[]; typesLabel?: string })[]) => setExistants((Array.isArray(l) ? l : [])
        .filter((d) => (d.types || []).includes("transport") || /dommage de transport/i.test(d.typesLabel || ""))))
      .catch(() => {});
  };
  useEffect(charger, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ajouter = async (liste: FileList | null) => {
    if (!liste?.length) return;
    const nouveaux: { f: File; apercu: string }[] = [];
    for (const brut of Array.from(liste)) {
      const f = brut.type.startsWith("image/") ? await compressImage(brut) : brut;
      const refus = await refusPour(f);
      if (refus) { toast.error(`${f.name} : ${refus}`); continue; }
      nouveaux.push({ f, apercu: f.type.startsWith("image/") || f.type.startsWith("video/") ? URL.createObjectURL(f) : "" });
    }
    setFichiers((l) => [...l, ...nouveaux]);
    if (camera.current) camera.current.value = "";
    if (galerie.current) galerie.current.value = "";
  };

  const retirer = (i: number) => setFichiers((l) => {
    if (l[i]?.apercu) URL.revokeObjectURL(l[i].apercu);
    return l.filter((_, k) => k !== i);
  });

  const vider = () => {
    fichiers.forEach((x) => x.apercu && URL.revokeObjectURL(x.apercu));
    setFichiers([]); setLots([]); setPieces([]); setDescription(""); setTransporteur(""); setReserves(""); setRapport(false);
  };

  const envoyer = async () => {
    if (!fichiers.length) { toast.error("Ajoute au moins une photo, une vidéo ou un PDF du dommage."); return; }
    if (!pieces.length && !description.trim()) { toast.error("Indique ce qui est endommagé."); return; }
    setEnvoi(true);
    try {
      const envoyes = await envoyerEnDirect(fichiers.map((x) => x.f), p.id, "defauts");
      const quoi = [pieces.join(", "), description.trim()].filter(Boolean).join(" — ");
      const lignes = [
        `Constaté à l'arrivage du ${dateSuisse(date)}`,
        lots.length ? `Lot${lots.length > 1 ? "s" : ""} : ${lots.map((i) => nomsLots[i - 1]).join(", ")}` : "",
        quoi,
        transporteur.trim() ? `Transporteur : ${transporteur.trim()}` : "",
        reserves ? `Réserves sur le bon de livraison : ${reserves}` : "",
      ].filter(Boolean);
      const corps: Record<string, unknown> = {
        id: identifiantSignalement(),
        projectId: p.id,
        projectName: p.projet,
        types: ["transport"],
        typesLabel: "Dommage de transport",
        description: lignes.join("\n"),
        photoUrls: envoyes.map((e) => e.url),
        displayInRapport: rapport,
        phase: "arrivage",
        dateArrivage: date,
        ...(transporteur.trim() ? { transporteur: transporteur.trim() } : {}),
        ...(reserves ? { reservesBonLivraison: reserves === "oui" } : {}),
        /* Un seul lot : son numéro, la référence fiable. Plusieurs : leurs noms. */
        ...(lots.length === 1 ? { cabineIdx: lots[0], cabineLabel: nomsLots[lots[0] - 1] } : {}),
        ...(lots.length > 1 ? { cabineLabel: lots.map((i) => nomsLots[i - 1]).join(", ") } : {}),
      };
      const r = await offlineFetch("/api/defauts", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        if (!d?.queued) throw new Error(d?.error || `HTTP ${r.status}`);
      }
      toast.success("Dommage de transport signalé sur le projet");
      vider();
      setOuvert(false);
      setTimeout(charger, 1500);
    } catch (e) {
      toast.error(`Signalement non envoyé : ${(e as Error).message}`, { duration: 8000 });
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <section className="ar-bloc ar-dommage">
      <h2><Truck /> Dommage de transport</h2>
      {existants.length > 0 && (
        <ul className="ar-dommage-liste">
          {existants.map((d) => (
            <li key={d.id}>
              <AlertTriangle />
              <span>{String(d.description || "Dommage de transport").split("\n").slice(0, 2).join(" · ")}</span>
              {(d.photoUrls || []).length > 0 && <em>{d.photoUrls!.length} fichier{d.photoUrls!.length > 1 ? "s" : ""}</em>}
            </li>
          ))}
        </ul>
      )}

      {!ouvert ? (
        <button type="button" className="ar-bascule" onClick={() => setOuvert(true)}>
          <AlertTriangle /> {existants.length ? "Signaler un autre dommage" : "Signaler un dommage de transport"}
          <i>+</i>
        </button>
      ) : (
        <div className="ar-dommage-form">
          <p className="ar-aide">Le dommage est ajouté aux signalements du projet (type « Dommage de transport »).</p>

          <label className="ar-champ">
            <span>Date d&apos;arrivage</span>
            <input type="date" value={date} max={aujourdhui()} onChange={(e) => setDate(e.target.value)} />
          </label>

          {nomsLots.length > 1 && (
            <div className="ar-champ">
              <span>Lot(s) concerné(s) — facultatif</span>
              <div className="ar-puces">
                {nomsLots.map((nom, i) => {
                  const on = lots.includes(i + 1);
                  return (
                    <button key={i} type="button" className={`ar-puce${on ? " is-on" : ""}`} aria-pressed={on}
                      onClick={() => setLots(on ? lots.filter((x) => x !== i + 1) : [...lots, i + 1].sort((a, b) => a - b))}>
                      {on && <Check />}{nom}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="ar-champ">
            <span>Ce qui est endommagé</span>
            <div className="ar-puces">
              {PIECES.map((x) => {
                const on = pieces.includes(x);
                return (
                  <button key={x} type="button" className={`ar-puce${on ? " is-on" : ""}`} aria-pressed={on}
                    onClick={() => setPieces(on ? pieces.filter((y) => y !== x) : [...pieces, x])}>
                    {on && <Check />}{x}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="ar-champ">
            <span>Description</span>
            <textarea className="ar-texte" rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex. vitre fissurée dans l'angle, profilé plié sur 10 cm…" />
          </label>

          <div className="ar-deux">
            <label className="ar-champ">
              <span>Transporteur — facultatif</span>
              <input value={transporteur} onChange={(e) => setTransporteur(e.target.value)} placeholder="Ex. Planzer, Galliker…" />
            </label>
            <div className="ar-champ">
              <span>Réserves notées sur le bon ?</span>
              <div className="ar-puces">
                {(["oui", "non"] as const).map((v) => (
                  <button key={v} type="button" className={`ar-puce${reserves === v ? " is-on" : ""}`} aria-pressed={reserves === v}
                    onClick={() => setReserves(reserves === v ? "" : v)}>
                    {reserves === v && <Check />}{v === "oui" ? "Oui" : "Non"}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="ar-fichiers is-danger">
            <div className="ar-fichiers-tete">
              <span><Paperclip />Photos, vidéos ou PDF</span>
              {fichiers.length > 0 && <em>{fichiers.length}</em>}
            </div>
            <div className="ar-vignettes">
              {fichiers.map((x, i) => (
                <span key={i} className="ar-vignette ar-vignette-locale" title={x.f.name}>
                  {x.f.type.startsWith("image/")
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={x.apercu} alt="" />
                    : x.f.type.startsWith("video/")
                      ? <span className="ar-vignette-doc"><Video /><small>Vidéo</small></span>
                      : <span className="ar-vignette-doc"><FileText /><small>PDF</small></span>}
                  <button type="button" aria-label="Retirer" onClick={() => retirer(i)}><X /></button>
                </span>
              ))}
              <button type="button" className="ar-ajout" onClick={() => camera.current?.click()} disabled={envoi}>
                <Camera /><small>Appareil</small>
              </button>
              <button type="button" className="ar-ajout" onClick={() => galerie.current?.click()} disabled={envoi}>
                <Plus /><small>Fichiers</small>
              </button>
              <input ref={camera} type="file" accept="image/*,video/*" capture="environment" hidden onChange={(e) => void ajouter(e.target.files)} />
              <input ref={galerie} type="file" accept="image/*,video/*,application/pdf" multiple hidden onChange={(e) => void ajouter(e.target.files)} />
            </div>
          </div>

          <button type="button" className={`ar-bascule${rapport ? " is-on" : ""}`} aria-pressed={rapport} onClick={() => setRapport(!rapport)}>
            <FileText /> Afficher dans le rapport client ?
            <i>{rapport ? "Oui" : "Non"}</i>
          </button>

          <div className="ar-dommage-actions">
            <button type="button" className="ar-btn is-doux" onClick={() => { vider(); setOuvert(false); }} disabled={envoi}>Annuler</button>
            <button type="button" className="ar-btn is-danger" onClick={() => void envoyer()} disabled={envoi}>
              {envoi ? <Loader2 className="animate-spin" /> : <AlertTriangle />}{envoi ? "Envoi…" : "Signaler le dommage"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
