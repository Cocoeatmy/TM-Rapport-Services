"use client";

import { useState, useRef, useEffect } from "react";
import { Camera, X, Loader2, ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { thumbnailUrl, previewUrl } from "@/lib/image-url";
import { saveFilesToDeviceGallery } from "@/lib/save-to-gallery";
import { addPendingUpload } from "@/lib/idb-uploads";
import { isOnline, offlineFetch } from "@/lib/offline";
import { toast } from "sonner";

interface BeforeAfterPhoto {
  name: string;
  url: string;
}

interface BeforeAfterPhotosProps {
  projectId: string;
  projectName: string;
  initialBefore?: BeforeAfterPhoto[];
  initialAfter?: BeforeAfterPhoto[];
}

function getStorageKey(projectId: string) {
  return `tm-before-after-${projectId}`;
}

function loadFromStorage(projectId: string): { before: BeforeAfterPhoto[]; after: BeforeAfterPhoto[] } | null {
  try {
    const raw = localStorage.getItem(getStorageKey(projectId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveToStorage(projectId: string, data: { before: BeforeAfterPhoto[]; after: BeforeAfterPhoto[] }) {
  try {
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(data));
  } catch {}
}

/** Déduplique par URL en préservant l'ordre. */
function dedupByUrl(list: BeforeAfterPhoto[]): BeforeAfterPhoto[] {
  const seen = new Set<string>();
  const out: BeforeAfterPhoto[] = [];
  for (const p of list) {
    if (!p?.url || seen.has(p.url)) continue;
    seen.add(p.url);
    out.push(p);
  }
  return out;
}

export function BeforeAfterPhotos({ projectId, projectName, initialBefore, initialAfter }: BeforeAfterPhotosProps) {
  const [before, setBefore] = useState<BeforeAfterPhoto[]>([]);
  const [after, setAfter] = useState<BeforeAfterPhoto[]>([]);
  const [uploadingBefore, setUploadingBefore] = useState(false);
  const [uploadingAfter, setUploadingAfter] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);
  // Garde synchrone : empêche un 2e onChange de relancer un upload
  // pendant que le 1er est en cours (cf. bug iOS capture + multiple).
  const uploadingBeforeRef = useRef(false);
  const uploadingAfterRef = useRef(false);

  // Notion = seule source de vérité (idem CartonPhotos).
  //
  // Avant, on mergeait initialBefore/After (Notion) avec localStorage,
  // ce qui re-contaminait Notion lorsqu'un appareil avait une liste
  // stale (cf. bug TM-2600218). On aligne le state local sur Notion ;
  // localStorage devient un simple miroir pour un mount instantané.
  useEffect(() => {
    const notionBefore = dedupByUrl(initialBefore || []);
    const notionAfter = dedupByUrl(initialAfter || []);
    setBefore(notionBefore);
    setAfter(notionAfter);
    setLoaded(true);
  }, [projectId, initialBefore, initialAfter]);

  useEffect(() => {
    if (!loaded) return;
    saveToStorage(projectId, { before, after });
  }, [before, after, projectId, loaded]);

  // Sync to Notion via PATCH API (queue-aware via offlineFetch).
  const syncToNotion = async (newBefore: BeforeAfterPhoto[], newAfter: BeforeAfterPhoto[]) => {
    try {
      await offlineFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photosAvant: newBefore.map((p) => p.url),
          photosMontage: newAfter.map((p) => p.url),
        }),
      });
    } catch {}
  };

  const handleUpload = async (
    files: FileList,
    side: "before" | "after",
  ) => {
    const guard = side === "before" ? uploadingBeforeRef : uploadingAfterRef;
    if (guard.current) {
      // Double-déclenchement : on ignore et on remet l'input à zéro
      // pour qu'un futur tap fonctionne normalement.
      if (beforeRef.current) beforeRef.current.value = "";
      if (afterRef.current) afterRef.current.value = "";
      return;
    }
    guard.current = true;

    const setUploading = side === "before" ? setUploadingBefore : setUploadingAfter;
    setUploading(true);

    const originals: File[] = Array.from(files);

    // Queue dans IDB en cas d'offline ou d'échec d'upload. Le
    // notionField n'est pas posé pour ces photos parce que
    // /api/upload écrit dans 2 champs distincts (photosAvant /
    // photosMontage) — ce mapping serait à refaire au moment de la
    // synchro tardive ; pour l'instant on écrit côté before-after
    // direct et la PATCH suit, donc même offline on log au moins
    // l'intention.
    const queueOffline = async () => {
      try {
        await addPendingUpload({
          projectId,
          category: `before-after-${side}`,
          files: originals.map((f) => ({ name: f.name, type: f.type, blob: f })),
        });
        toast.info("Photos en attente — envoi auto au retour du réseau", { duration: 3500 });
      } catch (idbErr) {
        console.error("[before-after] IDB queue error:", idbErr);
      }
    };

    try {
      if (!isOnline()) {
        await queueOffline();
        return;
      }
      const formData = new FormData();
      for (const file of originals) formData.append("files", file);
      formData.append("category", "before-after");
      formData.append("projectId", projectId);

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        await queueOffline();
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.files) {
        if (side === "before") {
          const updated = dedupByUrl([...before, ...data.files]);
          setBefore(updated);
          syncToNotion(updated, after);
        } else {
          const updated = dedupByUrl([...after, ...data.files]);
          setAfter(updated);
          syncToNotion(before, updated);
        }
        saveFilesToDeviceGallery(originals).catch(() => {});
      }
    } catch (err) {
      console.error("Upload error:", err);
      await queueOffline();
    } finally {
      guard.current = false;
      setUploading(false);
      if (beforeRef.current) beforeRef.current.value = "";
      if (afterRef.current) afterRef.current.value = "";
    }
  };

  const removePhoto = (side: "before" | "after", index: number) => {
    if (side === "before") {
      const updated = before.filter((_, i) => i !== index);
      setBefore(updated);
      syncToNotion(updated, after);
    } else {
      const updated = after.filter((_, i) => i !== index);
      setAfter(updated);
      syncToNotion(before, updated);
    }
  };

  return (
    <div className="space-y-4">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
        Comparatif Avant / Apres
      </label>

      <div className="grid grid-cols-2 gap-3">
        {/* AVANT */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-center text-gray-500 uppercase tracking-wider">
            Avant
          </div>
          <div className="space-y-2">
            {before.map((photo, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                <img
                  src={thumbnailUrl(photo.url, 400)}
                  alt={`Avant ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removePhoto("before", i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ))}
            {uploadingBefore ? (
              <div className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <button
                onClick={() => beforeRef.current?.click()}
                className="w-full aspect-square rounded-xl border-2 border-dashed border-orange-300 flex flex-col items-center justify-center gap-1 text-orange-400 hover:border-orange-500 hover:text-orange-500 transition-colors active:scale-95"
              >
                <Camera className="w-6 h-6" />
                <span className="text-[10px] font-medium">Photo Avant</span>
              </button>
            )}
          </div>
        </div>

        {/* APRES */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-center text-gray-500 uppercase tracking-wider">
            Apres
          </div>
          <div className="space-y-2">
            {after.map((photo, i) => (
              <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100">
                <img
                  src={thumbnailUrl(photo.url, 400)}
                  alt={`Apres ${i + 1}`}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
                <button
                  onClick={() => removePhoto("after", i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            ))}
            {uploadingAfter ? (
              <div className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <button
                onClick={() => afterRef.current?.click()}
                className="w-full aspect-square rounded-xl border-2 border-dashed border-green-300 flex flex-col items-center justify-center gap-1 text-green-400 hover:border-green-500 hover:text-green-500 transition-colors active:scale-95"
              >
                <Camera className="w-6 h-6" />
                <span className="text-[10px] font-medium">Photo Apres</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input
        ref={beforeRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.length && handleUpload(e.target.files, "before")}
      />
      <input
        ref={afterRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => e.target.files?.length && handleUpload(e.target.files, "after")}
      />

      {/* Generate comparison button */}
      {before.length > 0 && after.length > 0 && (
        <Button
          variant="outline"
          className="w-full rounded-xl"
          onClick={() => setShowComparison(!showComparison)}
        >
          <ArrowLeftRight className="w-4 h-4 mr-2" />
          {showComparison ? "Masquer le comparatif" : "Generer comparatif"}
        </Button>
      )}

      {/* Comparison view */}
      {showComparison && before.length > 0 && after.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-slate-900">
          <div className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 text-center">
              {projectName} - Comparatif Avant / Apres
            </p>
          </div>
          <div className="space-y-0">
            {Array.from({ length: Math.max(before.length, after.length) }).map((_, i) => (
              <div key={i} className="grid grid-cols-2 border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                <div className="relative aspect-square bg-gray-100 dark:bg-slate-800">
                  {before[i] ? (
                    <img
                      src={previewUrl(before[i].url, 600)}
                      alt={`Avant ${i + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                      Pas de photo
                    </div>
                  )}
                  {i === 0 && (
                    <div className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      AVANT
                    </div>
                  )}
                </div>
                <div className="relative aspect-square bg-gray-100 dark:bg-slate-800 border-l border-gray-200 dark:border-gray-700">
                  {after[i] ? (
                    <img
                      src={previewUrl(after[i].url, 600)}
                      alt={`Apres ${i + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs">
                      Pas de photo
                    </div>
                  )}
                  {i === 0 && (
                    <div className="absolute top-2 right-2 bg-green-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                      APRES
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
