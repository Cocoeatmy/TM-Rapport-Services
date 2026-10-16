"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, ImagePlus, X, Loader2, Download, CloudUpload, RotateCcw, RotateCw, FileText, AlertTriangle } from "lucide-react";
import { thumbnailUrl, rotateCloudinaryUrl } from "@/lib/image-url";
import { invalidateApiCache } from "@/lib/api-helpers";
import { compressImage } from "@/lib/compress-image";
import { priseDeVueDuFichier } from "@/lib/exif-photo";
import { suffixePriseDeVue } from "@/lib/heures-photos";
import { refusFichier } from "@/lib/video-limites";
import { dureeVideo } from "@/lib/video-duree";
import { saveFilesToDeviceGallery, enregistrerUnFichier } from "@/lib/save-to-gallery";
import { addPendingUpload, removePendingUpload, processPendingUploads } from "@/lib/idb-uploads";
import { usePendingUploads } from "@/lib/use-pending-uploads";
import { isOnline } from "@/lib/offline";
import { toast } from "sonner";

interface PhotoUploadProps {
  category: string;
  label: string;
  /** Texte d'instruction affiché sous le titre de la section (entre parenthèses). */
  hint?: string;
  projectId: string;
  notionField?: string;
  filePrefix?: string;
  existingPhotos?: { name: string; url: string }[];
  /** Appelé après un upload réussi (la photo est déjà dans Notion via /api/upload) */
  onUpload?: (files: { name: string; url: string }[]) => void;
  /** Appelé après une suppression (le parent doit PATCH Notion avec la liste mise à jour) */
  onDelete?: (files: { name: string; url: string }[]) => void;
  /** Appelé après une rotation d'une photo existante : le parent remplace
   *  l'URL et PATCH Notion (oldUrl → newUrl). */
  onRotate?: (oldUrl: string, newUrl: string) => void;
  /** Appelé dès que l'utilisateur sélectionne des fichiers (avant upload/compression) */
  onFilesSelected?: (files: File[]) => void;
  /** Types de fichiers acceptés (défaut : images seules). Ex. "image/*,video/*". */
  accept?: string;
}

export function PhotoUpload({
  category,
  label,
  hint,
  projectId,
  notionField,
  filePrefix,
  existingPhotos = [],
  onUpload,
  onDelete,
  onRotate,
  onFilesSelected,
  accept = "image/*",
}: PhotoUploadProps) {
  // Nombre d'uploads actuellement en cours (≥ 1 = au moins un en arrière-plan)
  const [uploadingCount, setUploadingCount] = useState(0);
  // Blob URLs des photos EN COURS d'upload (affichées comme vignettes en attente)
  const [previews, setPreviews] = useState<string[]>([]);

  /* Le parent apprend les URLs quand la file a fini, pas quand on prend la
     photo : c'est ce qui permet de ne plus rien attendre du réseau ici. On
     passe par une ref pour que l'écouteur, posé une fois, appelle toujours
     la dernière version du callback. */
  const onUploadRef = useRef(onUpload);
  useEffect(() => { onUploadRef.current = onUpload; }, [onUpload]);
  useEffect(() => {
    const auRattachement = (e: Event) => {
      const d = (e as CustomEvent).detail as {
        projectId?: string; category?: string; notionField?: string;
        files?: { name: string; url: string }[];
      } | undefined;
      if (!d || d.projectId !== projectId || d.category !== category) return;
      if ((d.notionField || undefined) !== (notionField || undefined)) return;
      if (d.files?.length) onUploadRef.current?.(d.files);
    };
    window.addEventListener("tm-upload-attached", auRattachement);
    return () => window.removeEventListener("tm-upload-attached", auRattachement);
  }, [projectId, category, notionField]);

  /* L'état du réseau décide de ce que dit le badge d'une photo en attente :
     « Envoi… » ou « Hors ligne ». */
  const [enLigne, setEnLigne] = useState(true);
  useEffect(() => {
    const maj = () => setEnLigne(isOnline());
    maj();
    window.addEventListener("online", maj);
    window.addEventListener("offline", maj);
    return () => {
      window.removeEventListener("online", maj);
      window.removeEventListener("offline", maj);
    };
  }, []);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  // Anti double-fire iOS : timestamp du dernier déclenchement par source.
  // Sur iOS, onChange peut se déclencher deux fois pour la même sélection.
  // On ignore tout re-déclenchement dans les 600 ms suivant le premier.
  const lastFireRef = useRef<Record<string, number>>({ camera: 0, gallery: 0 });

  // Compteur de photos total (existantes + en attente IDB) pour le nommage.
  const pendingCountRef = useRef(0);

  // Nettoyage : révoque tous les blob URLs encore en mémoire au démontage.
  useEffect(() => {
    return () => {
      previews.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFiles = async (
    e: React.ChangeEvent<HTMLInputElement>,
    source: "camera" | "gallery" = "gallery",
  ) => {
    const files = e.target.files;

    // ── Anti double-fire iOS ─────────────────────────────────────────────────
    const now = Date.now();
    if (now - lastFireRef.current[source] < 600) {
      e.target.value = "";
      return;
    }
    lastFireRef.current[source] = now;

    if (!files?.length) return;

    const originals: File[] = Array.from(files);

    // Réinitialise l'input IMMÉDIATEMENT pour que iOS/Android permettent
    // de sélectionner une nouvelle photo sans attendre la fin de l'upload.
    e.target.value = "";

    onFilesSelected?.(originals);

    // ── Aperçu instantané ────────────────────────────────────────────────────
    // Les blob URLs sont affichées tout de suite — avant compression et upload.
    // L'utilisateur voit la photo apparaître dans la grille immédiatement.
    const newPreviews: string[] = originals.map((f) => URL.createObjectURL(f));
    setPreviews((prev) => [...prev, ...newPreviews]);

    // ── Compteur d'uploads en cours ──────────────────────────────────────────
    // Incrémenté ici, décrémenté dans finally — permet N uploads simultanés.
    setUploadingCount((n) => n + 1);

    // ── Nommage des fichiers ─────────────────────────────────────────────────
    const currentCount = existingPhotos.length + pendingCountRef.current;
    const ts = Date.now();
    /* LA DATE DE PRISE DE VUE SE LIT MAINTENANT, PAS APRÈS.
       La compression qui suit redessine l'image sur un canvas et n'en
       ressort que des pixels : l'EXIF est perdu, et avec lui la seule
       heure qui dise vraiment quand le cliché a été pris. On la lit donc
       sur le fichier tel que le téléphone le donne, et on l'inscrit dans
       le nom — le seul endroit qui traverse la file d'attente hors ligne
       sans rien coûter. */
    const prises = await Promise.all(originals.map((f) => priseDeVueDuFichier(f)));
    const renamed: File[] = originals.map((file, i) => {
      const idx = currentCount + i + 1;
      const ext = file.name.split(".").pop() || "jpg";
      const newName = filePrefix
        ? `${filePrefix}.${idx}.${ts}${suffixePriseDeVue(prises[i])}.${ext}`
        : file.name;
      return new File([file], newName, { type: file.type });
    });

    // ── Compression en parallèle ─────────────────────────────────────────────
    // Réduit une photo iPhone (10 Mo) à ~400 Ko → upload 20× plus rapide.
    // Fait EN ARRIÈRE-PLAN pendant que l'utilisateur peut déjà prendre
    // la photo suivante.
    // Seules les IMAGES passent par la compression (canvas). Les vidéos ET les
    // PDF (ou tout autre type non-image) sont uploadés tels quels.
    const compressed: File[] = await Promise.all(
      renamed.map((f) => (f.type.startsWith("image/") ? compressImage(f, 1600, 0.82) : Promise.resolve(f)))
    );

    /* Ce qui a le droit de partir. Les octets ne passent PLUS par Vercel
       (upload direct Cloudinary) : l'ancien plafond de 4 Mo ne protégeait
       plus de rien et refusait des clips de quinze secondes. Restent la
       minute de film et les plafonds du compte Cloudinary — voir
       src/lib/video-limites.ts. */
    const refuses = new Set<File>();
    let premierRefus = "";
    for (const f of compressed) {
      const duree = f.type.startsWith("video/") ? await dureeVideo(f) : null;
      const raison = refusFichier({ taille: f.size, type: f.type, duree });
      if (raison) {
        refuses.add(f);
        if (!premierRefus) premierRefus = raison;
      }
    }
    if (refuses.size > 0) {
      toast.error(
        refuses.size === 1 ? "Envoi impossible" : `${refuses.size} fichiers non envoyés`,
        { description: premierRefus, duration: 9000 },
      );
      /* Les aperçus des refusés quittent la grille tout de suite, sinon elle
         garde des vignettes fantômes que rien ne viendra jamais remplacer. */
      const retirer = newPreviews.filter((_, i) => refuses.has(compressed[i]));
      setPreviews((prev) => prev.filter((u) => !retirer.includes(u)));
      retirer.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
      if (refuses.size === compressed.length) {
        setUploadingCount((n) => Math.max(0, n - 1));
        return;
      }
    }
    const aEnvoyer = compressed.filter((f) => !refuses.has(f));
    /* Aperçus réalignés sur `aEnvoyer` : sans cela, un seul fichier refusé
       décalait les vignettes et l'échec d'une photo en effaçait une autre. */
    const apercus = newPreviews.filter((_, i) => !refuses.has(compressed[i]));

    /* ── 1. ENREGISTRER, puis 2. ENVOYER ─────────────────────────────────
       Dans cet ordre, et jamais l'inverse.

       L'app tentait l'envoi d'abord et ne gardait la photo sur le téléphone
       qu'en cas d'échec. Entre les deux, sur un réseau de chantier qui
       répond mais n'avance pas, la photo n'existait nulle part : ni chez
       Notion, ni dans la file. Elle ne comptait donc pas dans les photos
       exigées, et le monteur restait devant un bouton gris pendant que son
       téléphone « essayait » (incident du 15 octobre 2026, deux monteurs).

       Désormais la photo est écrite dans IndexedDB AVANT toute tentative :
       elle survit à la fermeture de l'app et au redémarrage du téléphone, et
       elle compte immédiatement. L'envoi n'est plus qu'une tâche de fond —
       c'est la file (idb-uploads) qui s'en charge, avec ses réessais, son
       anti-doublon et sa garantie de ne rien supprimer avant confirmation du
       serveur. */
    const retirerApercus = () => {
      setPreviews((prev) => prev.filter((u) => !apercus.includes(u)));
      apercus.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
    };

    try {
      await addPendingUpload({
        projectId,
        category,
        notionField,
        files: aEnvoyer.map((f) => ({ name: f.name, type: f.type, blob: f })),
      });
    } catch (idbErr) {
      /* Le SEUL échec qui mérite d'alerter : la photo n'est pas sur le
         téléphone. Tout le reste se rattrape tout seul. */
      console.error("[photo-upload] enregistrement local impossible:", idbErr);
      toast.error("Photo non enregistrée sur l'appareil — reprenez-la", {
        description: "La mémoire du téléphone est peut-être pleine.",
        duration: 10000,
      });
      retirerApercus();
      setUploadingCount((n) => Math.max(0, n - 1));
      return;
    }

    /* La file affiche désormais ces photos (mêmes vignettes, un seul
       exemplaire) : les aperçus locaux cèdent la place. */
    retirerApercus();
    setUploadingCount((n) => Math.max(0, n - 1));

    if (source === "camera") {
      saveFilesToDeviceGallery(originals).catch(() => {});
    }

    if (!isOnline()) {
      toast.info("Photo enregistrée — elle partira au retour du réseau", { duration: 3000 });
      return;
    }
    /* En ligne : on lance la file tout de suite, sans l'attendre. */
    setTimeout(() => { processPendingUploads().catch(() => {}); }, 50);
  };

  const removePreview = (index: number) => {
    setPreviews((prev) => {
      const url = prev[index];
      if (url) { try { URL.revokeObjectURL(url); } catch {} }
      return prev.filter((_, i) => i !== index);
    });
  };

  const validExisting = existingPhotos.filter((p) => p && p.url && p.url.length > 0);

  const pending = usePendingUploads(projectId).filter(
    (p) =>
      p.category === category &&
      (notionField ? p.notionField === notionField : !p.notionField),
  );
  pendingCountRef.current = pending.length;

  // isUploading = true pour les previews (blob URLs en cours d'upload)
  const allImages: {
    src: string;
    isPreview: boolean;
    pendingId?: string;
    isPending?: boolean;
    isUploading?: boolean;
    statut?: "pending" | "permanently-failed";
    motif?: string;
    blob?: Blob;
    name?: string;
  }[] = [
    ...validExisting.map((p) => ({ src: p.url, isPreview: false })),
    ...pending.map((p) => ({
      src: p.objectUrl, isPreview: false, pendingId: p.id, isPending: true,
      statut: p.statut, motif: p.motif, blob: p.blob, name: p.name,
    })),
    ...previews.map((u) => ({ src: u, isPreview: true, isUploading: true })),
  ];

  const removeExisting = (url: string) => {
    if (!confirm("Supprimer cette photo du rapport ?")) return;
    const updated = validExisting.filter((p) => p.url !== url);
    onDelete?.(updated);
    invalidateApiCache();
  };

  // Rotation d'une photo existante : ±90°. On calcule la nouvelle URL Cloudinary
  // (transformation d'angle bakée) et on laisse le parent PATCH Notion.
  const rotateExisting = (url: string, delta: number) => {
    const newUrl = rotateCloudinaryUrl(url, delta);
    if (newUrl === url) {
      toast.info("Rotation indisponible pour cette photo");
      return;
    }
    onRotate?.(url, newUrl);
    invalidateApiCache();
  };

  // PDF : pas d'aperçu image → tuile dédiée (icône + « PDF »), cliquable.
  const isPdfUrl = (u: string) => /\.pdf(\?|$)/i.test(u);
  // Ouverture PDF : lien DIRECT Cloudinary (origine externe) → s'ouvre dans le
  // navigateur externe (Chrome) avec la visionneuse + bouton télécharger, hors
  // de l'app installée. Nécessite « Allow delivery of PDF and ZIP files » activé
  // dans les réglages Cloudinary (sinon 401).
  const pdfViewUrl = (u: string) => u;
  // Vidéo Cloudinary : poster (1re image) au lieu d'une <img> cassée.
  const isVideoUrl = (u: string) => u.includes("/video/upload/") || /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u);
  const videoPosterUrl = (u: string) => {
    const marker = "/video/upload/";
    const i = u.indexOf(marker);
    if (i < 0) return u;
    const after = u.slice(i + marker.length).replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
    return `${u.slice(0, i + marker.length)}so_0,w_400,c_fill,q_auto/${after}`;
  };

  return (
    <div>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">{label}</label>
      {hint && (
        <p className="text-xs text-gray-400 mb-2 mt-0.5">({hint})</p>
      )}
      {/* Deux colonnes quelle que soit la largeur donnaient, sur un grand
          écran, des vignettes de près d'un mètre : une photo de carton
          occupait tout l'écran. La grille se remplit maintenant de colonnes
          d'environ 170 px — deux sur un téléphone, comme avant, et autant que
          la place le permet au-delà. */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))" }}>
        {allImages.map((img, i) => (
          <div
            key={`${img.isPreview ? "p" : "e"}-${i}-${img.src}`}
            className="relative rounded-xl overflow-hidden bg-gray-100 group"
            style={{ aspectRatio: "4/3" }}
          >
            {!img.isPreview && isPdfUrl(img.src) ? (
              <a
                href={pdfViewUrl(img.src)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400"
                title="Ouvrir / télécharger le PDF"
              >
                <FileText className="w-8 h-8" />
                <span className="text-[11px] font-semibold">PDF</span>
              </a>
            ) : (
              <img
                src={img.isPreview ? img.src : (isVideoUrl(img.src) ? videoPosterUrl(img.src) : thumbnailUrl(img.src, 300))}
                alt={`${label} ${i + 1}`}
                loading="lazy"
                decoding="async"
                className={`w-full h-full object-cover transition-opacity ${img.isUploading ? "opacity-70" : ""}`}
              />
            )}
            {/* Badge « vidéo » (poster affiché) */}
            {!img.isPreview && isVideoUrl(img.src) && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-black/55 rounded-full w-9 h-9 flex items-center justify-center">
                  <span className="text-white text-[13px] ml-0.5">▶</span>
                </div>
              </div>
            )}

            {/* Overlay spinner pendant l'upload (remplace le spinner global) */}
            {img.isUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="bg-white/90 rounded-full p-2 shadow">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                </div>
              </div>
            )}

            {/* Barre inférieure : télécharger */}
            {!img.isUploading && img.isPending && img.blob && (
              /* Photo encore sur le téléphone : on la passe à la feuille de
                 partage iOS (« Enregistrer l'image ») à partir du fichier
                 local. Un lien de téléchargement ne saurait pas la mettre
                 dans la pellicule, et attendre qu'elle soit chez Cloudinary
                 n'aurait pas de sens — elle est là, sous la main. */
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-1.5 bg-gradient-to-t from-black/60 to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => {
                    const fichier = new File([img.blob as Blob], img.name || `photo-${i + 1}.jpg`, {
                      type: (img.blob as Blob).type || "image/jpeg",
                    });
                    enregistrerUnFichier(fichier).then((r) => {
                      if (r === "unsupported") toast.error("Enregistrement impossible sur cet appareil");
                    });
                  }}
                  className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white shadow active:scale-95"
                  title="Enregistrer dans la pellicule"
                >
                  <Download className="w-4.5 h-4.5 text-gray-700" />
                </button>
              </div>
            )}
            {!img.isUploading && !img.isPending && (
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 p-1.5 bg-gradient-to-t from-black/60 to-transparent sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                <a
                  href={img.src}
                  download={`document-${i + 1}.${isPdfUrl(img.src) ? "pdf" : isVideoUrl(img.src) ? "mp4" : "jpg"}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center hover:bg-white shadow active:scale-95"
                  title="Télécharger"
                >
                  <Download className="w-4.5 h-4.5 text-gray-700" />
                </a>
              </div>
            )}

            {/* Barre d'actions en haut à droite : rotation (photos existantes
                uniquement) + suppression. */}
            <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
              {/* Rotation gauche / droite — seulement pour les photos déjà
                  enregistrées (pas les previews ni les uploads en attente). */}
              {!img.isUploading && !img.isPreview && !img.isPending && (
                <>
                  <button
                    type="button"
                    onClick={() => rotateExisting(img.src, -90)}
                    className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-blue-500 transition-colors active:scale-95"
                    title="Pivoter vers la gauche"
                  >
                    <RotateCcw className="w-4 h-4 text-white" />
                  </button>
                  <button
                    type="button"
                    onClick={() => rotateExisting(img.src, 90)}
                    className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-blue-500 transition-colors active:scale-95"
                    title="Pivoter vers la droite"
                  >
                    <RotateCw className="w-4 h-4 text-white" />
                  </button>
                </>
              )}
              {/* Bouton X */}
              <button
                type="button"
                onClick={async () => {
                  if (img.isPending && img.pendingId) {
                    try { await removePendingUpload(img.pendingId); } catch {}
                    return;
                  }
                  if (img.isPreview) {
                    removePreview(i - validExisting.length - pending.length);
                  } else {
                    removeExisting(img.src);
                  }
                }}
                className="w-8 h-8 bg-black/60 rounded-full flex items-center justify-center hover:bg-red-500 transition-colors active:scale-95"
                title={
                  img.isPending
                    ? "Annuler cet upload en attente"
                    : img.isPreview
                      ? "Annuler cet ajout"
                      : "Supprimer cette photo du rapport"
                }
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>

            {/* Où en est cette photo. Dans tous les cas elle est SUR LE
                TÉLÉPHONE et elle compte pour les photos exigées — le badge
                ne parle que de son voyage vers le serveur. */}
            {img.isPending && (() => {
              const echec = img.statut === "permanently-failed";
              const couleur = echec
                ? "bg-red-600/90"
                : enLigne ? "bg-blue-500/90" : "bg-slate-600/90";
              const texte = echec ? "Erreur" : enLigne ? "Envoi…" : "Hors ligne";
              const bulle = echec
                ? `Enregistrée sur l'appareil. Envoi en échec${img.motif ? ` — ${img.motif}` : ""} : nouvelle tentative programmée.`
                : enLigne
                  ? "Enregistrée sur l'appareil. Envoi au serveur en cours."
                  : "Enregistrée sur l'appareil. Elle partira au retour du réseau.";
              return (
                <div className={`absolute top-1.5 left-1.5 flex items-center gap-1 ${couleur} text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full shadow`} title={bulle}>
                  {echec ? <AlertTriangle className="w-2.5 h-2.5" /> : <CloudUpload className="w-2.5 h-2.5" />}
                  <span>{texte}</span>
                </div>
              );
            })()}
          </div>
        ))}

        {/* ── Boutons Camera / Galerie — toujours visibles, même pendant upload ── */}
        <button
          onClick={() => cameraRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors active:scale-95 min-h-[80px] relative"
          style={{ aspectRatio: "4/3" }}
        >
          <Camera className="w-7 h-7" />
          <span className="text-xs font-medium">Photo</span>
          {/* Badge discret indiquant qu'un upload tourne en arrière-plan */}
          {uploadingCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
              <Loader2 className="w-2.5 h-2.5 animate-spin text-white" />
            </span>
          )}
        </button>
        <button
          onClick={() => galleryRef.current?.click()}
          className="rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center gap-1.5 text-gray-400 hover:border-purple-400 hover:text-purple-500 transition-colors active:scale-95 min-h-[80px] relative"
          style={{ aspectRatio: "4/3" }}
        >
          <ImagePlus className="w-7 h-7" />
          <span className="text-xs font-medium">Galerie</span>
          {uploadingCount > 0 && (
            <span className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
              <Loader2 className="w-2.5 h-2.5 animate-spin text-white" />
            </span>
          )}
        </button>
      </div>

      {/* Input caméra */}
      <input
        ref={cameraRef}
        type="file"
        accept={accept}
        capture="environment"
        className="hidden"
        onChange={(e) => handleFiles(e, "camera")}
      />
      {/* Input galerie */}
      <input
        ref={galleryRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e, "gallery")}
      />
    </div>
  );
}
