"use client";

import { Suspense, useEffect, useRef, useState, use, useCallback, type Dispatch, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowUp,
  Clock,
  MapPin,
  Navigation,
  Users,
  FileText,
  MessageSquare,
  ClipboardList,
  Ruler,
  Send,
  Loader2,
  ExternalLink,
  Hash,
  Box,
  Package,
  Truck,
  ChevronDown,
  ChevronUp,
  Plus,
  Trash2,
  Pencil,
  Check,
  Sparkles,
  Tag,
  Building2,
  History,
  AlertTriangle,
  Camera,
  ImagePlus,
  X,
  GripVertical,
  RotateCcw,
  Hourglass,
  Minus,
  FileSpreadsheet,
  Wrench,
} from "lucide-react";
// MontageChecklist supprimée (section retirée)
import { ProjectChat } from "@/components/project-chat";
// GPS DÉSACTIVÉ — décommenter pour réactiver le pointage GPS automatique
// import { GPSTracker } from "@/components/gps-tracker";
// import { AdminGpsTimer } from "@/components/admin-gps-timer";
import { SiteTimer } from "@/components/site-timer";
// StockUsage supprimée (section retirée)
import { SAVForm } from "@/components/sav-form";
import { ContactButtons } from "@/components/contact-buttons";
import { Star, Share2, RefreshCw, PenLine, ImageDown, Lock, Search, Save, AlertCircle } from "lucide-react";
import { toggleFavorite, isFavorite } from "@/lib/favorites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeliveryScan } from "@/components/delivery-scan";
import { CartonPhotos } from "@/components/carton-photos";
import { AdminEditModal } from "@/components/admin-edit-modal";

const SignaturePad = dynamic(() => import("@/components/signature-pad").then(m => ({ default: m.SignaturePad })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

const PhotoUpload = dynamic(() => import("@/components/photo-upload").then(m => ({ default: m.PhotoUpload })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

const BeforeAfterPhotos = dynamic(() => import("@/components/before-after-photos").then(m => ({ default: m.BeforeAfterPhotos })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

const PiecesForm = dynamic(() => import("@/components/pieces-form").then(m => ({ default: m.PiecesForm })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

const DefautForm = dynamic(() => import("@/components/defaut-form").then(m => ({ default: m.DefautForm })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-32" />,
});

const VoiceRecorder = dynamic(() => import("@/components/voice-recorder").then(m => ({ default: m.VoiceRecorder })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-gray-200 rounded-xl h-10" />,
});
import { toast } from "sonner";
import type { Project } from "@/lib/notion";
import { getCollaboratorColor } from "@/lib/collaborators";
import { isMultiDayHours, parsePointages } from "@/lib/pointages";
import { normalizeRapportMonteur, buildCabineReportLines, splitRapportByCabine } from "@/lib/rapport";
import { addToQueue, isOnline, offlineFetch } from "@/lib/offline";
import { fetchWithRetry, invalidateApiCache } from "@/lib/api-helpers";
import { showRetryToast } from "@/components/error-toast";
import {
  type PhotoBucketKey,
  BUCKET_LABEL,
  BUCKET_HINT,
  BUCKET_NOTION_FIELD,
  bucketFilePrefix,
  defaultBucketForField,
  detectBucket,
  filterByBucket,
  missingBucketLabels,
  missingRequiredPhotos,
  missingOptionalPhotoLabels,
  type RequiredPhotoShortfall,
  extractCabine,
} from "@/lib/photo-buckets";
import { STATUS_CMD_COLORS, STATUS_MESURES_COLORS } from "@/lib/constants";
import { ColoredSelect } from "@/components/colored-select";
import { thumbnailUrl } from "@/lib/image-url";

/** Photo upload tied to a logical bucket (sub-section dans une colonne Notion). */
function BucketPhotoUpload({
  bucket,
  cabineIdx,
  projectId,
  project,
  setProject,
  onAutoFill,
  onLog,
  accept,
}: {
  bucket: PhotoBucketKey;
  cabineIdx?: number;
  projectId: string;
  project: Project | null;
  setProject: React.Dispatch<React.SetStateAction<Project | null>>;
  onAutoFill?: (bucket: PhotoBucketKey, captureTime: string, cabineIdx?: number) => void;
  onLog?: (action: string, details: string) => void;
  accept?: string;
}) {
  if (!project) return null;
  const notionFieldKey = BUCKET_NOTION_FIELD[bucket];
  const notionFieldName: Record<typeof notionFieldKey, string> = {
    photosAvant: "Photos avant montage",
    photosDemontage: "Photos démontage",
    photosMontage: "Photos montage terminé",
    photosQRCode: "Photos QR Code",
    photosGaranties: "Photos garanties",
    photosSavRetouches: "Photos SAV / Retouches cabines",
    documentsSavDemande: "Documents SAV - demande",
  };
  const fieldDefault = defaultBucketForField(notionFieldKey);
  const allInField = project[notionFieldKey] || [];
  const existingPhotos = filterByBucket(allInField, bucket, cabineIdx, fieldDefault);

  // Helper : recalcule la liste complète du champ Notion en remplaçant
  // les photos de ce bucket+cabine par newBucketFiles.
  const buildNextFullList = (
    prev: Project,
    newBucketFiles: { name: string; url: string }[],
  ): { name: string; url: string }[] => {
    const current = prev[notionFieldKey] || [];
    const kept = current.filter((f) => {
      const sameBucket = detectBucket(f.name, fieldDefault) === bucket;
      if (!sameBucket) return true;
      if (cabineIdx === undefined) return false;
      const cab = /\.Cab(\d+)\./.exec(f.name);
      const cabNum = cab ? parseInt(cab[1], 10) : null;
      return cabineIdx >= 1 ? cabNum !== cabineIdx : cabNum !== null;
    });
    return [...kept, ...newBucketFiles];
  };

  // Upload : /api/upload a déjà écrit dans Notion — on AJOUTE les
  // nouveaux fichiers à l'état courant (prev) sans jamais lire une
  // closure périmée. Pas de PATCH : zéro race condition possible.
  const handleUpload = (newFiles: { name: string; url: string }[]) => {
    setProject((prev) => {
      if (!prev) return prev;
      const current: { name: string; url: string }[] = prev[notionFieldKey] || [];
      const existingUrls = new Set(current.map((f) => f.url));
      const toAdd = newFiles.filter((f) => f.url && !existingUrls.has(f.url));
      if (toAdd.length === 0) return prev;
      // Log l'ajout de photos
      const label = BUCKET_LABEL[bucket];
      const cabSuffix = cabineIdx ? ` (Cabine ${cabineIdx})` : "";
      onLog?.(
        `Photo ajoutée — ${label}${cabSuffix}`,
        `${toAdd.length} photo${toAdd.length > 1 ? "s" : ""} enregistrée${toAdd.length > 1 ? "s" : ""}`,
      );
      return { ...prev, [notionFieldKey]: [...current, ...toAdd] };
    });
  };

  // Suppression : mise à jour immédiate de l'état React + PATCH Notion confirmé.
  // On calcule nextFullList depuis project (closure fraîche au moment du clic)
  // plutôt qu'à l'intérieur de setProject pour éviter tout edge-case React 18.
  const handleDelete = async (newBucketFiles: { name: string; url: string }[]) => {
    if (!project) return;
    const nextFullList = buildNextFullList(project, newBucketFiles);
    // Mise à jour UI immédiate — la photo disparaît du rendu.
    setProject((prev) => prev ? { ...prev, [notionFieldKey]: nextFullList } : prev);

    // PATCH Notion : on vérifie le résultat pour éviter que les photos
    // "reviennent" après un rechargement si le PATCH a échoué silencieusement.
    // offlineFetch queue automatiquement les 5xx et 429 (retry plus tard).
    const res = await offlineFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [notionFieldKey]: nextFullList }),
    });

    // Invalide le cache SW pour que le prochain rechargement reçoive les données fraîches.
    invalidateApiCache();

    if (res.ok) {
      let resData: any = {};
      try { resData = await res.json(); } catch {}
      if (resData?.queued) {
        // La suppression est en attente de synchronisation (réseau faible / rate-limit Notion).
        // Elle sera rejouée automatiquement dès que la connexion revient.
        toast("Photo retirée — synchronisation Notion en attente (connexion faible)", {
          duration: 5000,
          icon: "🔄",
        } as any);
      }
      // Sinon : succès immédiat, pas de toast superflu.
    } else {
      // Erreur définitive (400, etc.) — avertir sans annuler l'UI.
      let errMsg = "";
      try { const j = await res.json(); errMsg = j?.error || ""; } catch {}
      toast.error(
        errMsg
          ? `Suppression non enregistrée dans Notion : ${errMsg}`
          : "Suppression non enregistrée dans Notion — réessayez ou rechargez la page.",
        { duration: 8000 }
      );
    }
  };

  // Rotation : remplace l'URL d'une photo (rotation Cloudinary) dans le champ
  // Notion et PATCH. Le nom reste inchangé (détection de bucket préservée).
  const handleRotate = async (oldUrl: string, newUrl: string) => {
    if (!project) return;
    const current = project[notionFieldKey] || [];
    const nextFullList = current.map((f) => (f.url === oldUrl ? { ...f, url: newUrl } : f));
    setProject((prev) => (prev ? { ...prev, [notionFieldKey]: nextFullList } : prev));
    const res = await offlineFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [notionFieldKey]: nextFullList }),
    });
    invalidateApiCache();
    if (!res.ok) {
      toast.error("Rotation non enregistrée dans Notion — réessayez.");
    }
  };

  const hint = BUCKET_HINT[bucket];
  return (
    <div>
      <PhotoUpload
        hint={hint}
        category={`${bucket.toLowerCase()}${cabineIdx ? `-cab${cabineIdx}` : ""}`}
        label={BUCKET_LABEL[bucket]}
        projectId={projectId}
        notionField={notionFieldName[notionFieldKey]}
        filePrefix={bucketFilePrefix(bucket, cabineIdx)}
        existingPhotos={existingPhotos}
        accept={accept}
        onUpload={handleUpload}
        onDelete={handleDelete}
        onRotate={handleRotate}
        onFilesSelected={(files) => {
          if (onAutoFill && files.length > 0) {
            const t = new Date(files[0].lastModified);
            const hh = String(t.getHours()).padStart(2, "0");
            const mm = String(t.getMinutes()).padStart(2, "0");
            onAutoFill(bucket, `${hh}:${mm}`, cabineIdx);
          }
        }}
      />
    </div>
  );
}

/**
 * Zone d'upload unique regroupant les 3 sous-buckets montage
 * (MONTAGE_GAUCHE, MONTAGE_CENTRE, MONTAGE_DROITE) en une seule interface.
 * Les nouvelles photos sont enregistrées avec le préfixe MONTAGE_GAUCHE ;
 * les photos existantes des 3 sous-buckets sont toutes affichées ensemble.
 */
function CombinedMontageUpload({
  cabineIdx,
  projectId,
  project,
  setProject,
  onAutoFill,
  onLog,
}: {
  cabineIdx?: number;
  projectId: string;
  project: Project | null;
  setProject: React.Dispatch<React.SetStateAction<Project | null>>;
  onAutoFill?: (bucket: PhotoBucketKey, captureTime: string, cabineIdx?: number) => void;
  onLog?: (action: string, details: string) => void;
}) {
  if (!project) return null;
  const fieldDefault = defaultBucketForField("photosMontage");
  const MONTAGE_BUCKETS: PhotoBucketKey[] = ["MONTAGE_GAUCHE", "MONTAGE_CENTRE", "MONTAGE_DROITE"];

  // Toutes les photos des 3 sous-buckets combinées
  const existingPhotos = MONTAGE_BUCKETS.flatMap((b) =>
    filterByBucket(project.photosMontage || [], b, cabineIdx, fieldDefault)
  );

  const handleUpload = (newFiles: { name: string; url: string }[]) => {
    setProject((prev) => {
      if (!prev) return prev;
      const current = prev.photosMontage || [];
      const existingUrls = new Set(current.map((f) => f.url));
      const toAdd = newFiles.filter((f) => f.url && !existingUrls.has(f.url));
      if (toAdd.length === 0) return prev;
      const cabSuffix = cabineIdx ? ` (Cabine ${cabineIdx})` : "";
      onLog?.(
        `Photo ajoutée — Photos montage${cabSuffix}`,
        `${toAdd.length} photo${toAdd.length > 1 ? "s" : ""} enregistrée${toAdd.length > 1 ? "s" : ""}`,
      );
      return { ...prev, photosMontage: [...current, ...toAdd] };
    });
  };

  const handleDelete = (survivingPhotos: { name: string; url: string }[]) => {
    if (!project) return;
    const current = project.photosMontage || [];
    // Conserver tout ce qui n'est PAS un sous-bucket montage de cette cabine
    const kept = current.filter((f) => {
      const bkt = detectBucket(f.name, fieldDefault);
      if (!MONTAGE_BUCKETS.includes(bkt)) return true;
      if (cabineIdx !== undefined) {
        const cab = extractCabine(f.name);
        return cabineIdx >= 1 ? cab !== cabineIdx : cab !== null;
      }
      return false;
    });
    const nextFullList = [...kept, ...survivingPhotos];
    setProject((prev) => (prev ? { ...prev, photosMontage: nextFullList } : prev));
    offlineFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photosMontage: nextFullList }),
    }).catch(() => {});
  };

  const handleRotate = async (oldUrl: string, newUrl: string) => {
    if (!project) return;
    const current = project.photosMontage || [];
    const nextFullList = current.map((f) => (f.url === oldUrl ? { ...f, url: newUrl } : f));
    setProject((prev) => (prev ? { ...prev, photosMontage: nextFullList } : prev));
    const res = await offlineFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photosMontage: nextFullList }),
    });
    invalidateApiCache();
    if (!res.ok) toast.error("Rotation non enregistrée dans Notion — réessayez.");
  };

  return (
    <div>
      <PhotoUpload
        hint="1 photo gauche, 1 photo centre, 1 photo droite"
        category={`montage${cabineIdx ? `-cab${cabineIdx}` : ""}`}
        label="Photos montage"
        projectId={projectId}
        notionField="Photos montage terminé"
        filePrefix={bucketFilePrefix("MONTAGE_GAUCHE", cabineIdx)}
        existingPhotos={existingPhotos}
        onUpload={handleUpload}
        onDelete={handleDelete}
        onRotate={handleRotate}
        onFilesSelected={(files) => {
          if (onAutoFill && files.length > 0) {
            const t = new Date(files[0].lastModified);
            const hh = String(t.getHours()).padStart(2, "0");
            const mm = String(t.getMinutes()).padStart(2, "0");
            onAutoFill("MONTAGE_GAUCHE", `${hh}:${mm}`, cabineIdx);
          }
        }}
      />
    </div>
  );
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Non planifié";
  const d = new Date(dateStr);
  const datePart = d.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  // Si la date contient une heure (format ISO avec T)
  if (dateStr.includes("T")) {
    const timePart = d.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });
    return `${datePart} à ${timePart}`;
  }
  return datePart;
}

function MapAddressLink({ address }: { address: string }) {
  const [showPicker, setShowPicker] = useState(false);
  const addr = encodeURIComponent(address);

  const openApp = (app: "apple" | "google" | "waze") => {
    setShowPicker(false);
    switch (app) {
      case "apple":
        window.location.href = `maps://?q=${addr}`;
        break;
      case "google":
        window.location.href = `comgooglemaps://?q=${addr}`;
        setTimeout(() => {
          window.open(`https://www.google.com/maps/search/?api=1&query=${addr}`, "_blank");
        }, 500);
        break;
      case "waze":
        window.location.href = `waze://?q=${addr}&navigate=yes`;
        setTimeout(() => {
          window.open(`https://waze.com/ul?q=${addr}&navigate=yes`, "_blank");
        }, 500);
        break;
    }
  };

  return (
    <div className="flex items-start gap-2">
      <MapPin className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
      <div className="relative">
        <p className="text-xs text-gray-500">Adresse chantier</p>
        <button
          onClick={() => setShowPicker(!showPicker)}
          className="text-sm font-medium text-blue-600 underline underline-offset-2 active:text-blue-800 text-left"
        >
          {address}
        </button>
        {showPicker && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowPicker(false)} />
            <div className="absolute left-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-1 w-52">
              <button
                onClick={() => openApp("apple")}
                className="w-full text-left text-sm px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
              >
                <Navigation className="w-4 h-4 text-blue-500" />
                Apple Plans
              </button>
              <button
                onClick={() => openApp("google")}
                className="w-full text-left text-sm px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
              >
                <MapPin className="w-4 h-4 text-red-500" />
                Google Maps
              </button>
              <button
                onClick={() => openApp("waze")}
                className="w-full text-left text-sm px-3 py-2.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-3 text-gray-700 dark:text-gray-300"
              >
                <Navigation className="w-4 h-4 text-cyan-500" />
                Waze
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReportConsultations({ projectId }: { projectId: string }) {
  const [consultations, setConsultations] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const token = btoa(projectId).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    fetch(`/api/client/${token}/track`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setConsultations(data); })
      .catch(() => {});
  }, [open, projectId]);

  const viewCount = consultations.filter(c => c.action === "view").length;
  const pdfCount = consultations.filter(c => c.action === "pdf").length;
  const lastView = consultations.length > 0 ? consultations[consultations.length - 1] : null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden mb-4">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${consultations.length > 0 ? "bg-green-500" : "bg-gray-300"}`} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
            Suivi consultation rapport
          </span>
          {consultations.length > 0 && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
              Consulté {viewCount}×
            </span>
          )}
          {consultations.length === 0 && (
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              Pas encore consulté
            </span>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {consultations.length === 0 ? (
            <p className="text-sm text-gray-400">Le client n&apos;a pas encore consulté le rapport.</p>
          ) : (
            <>
              <div className="flex gap-4 text-xs text-gray-500 mb-2">
                <span>👁 {viewCount} ouverture{viewCount > 1 ? "s" : ""} portail</span>
                <span>📄 {pdfCount} ouverture{pdfCount > 1 ? "s" : ""} PDF</span>
              </div>
              {consultations.slice().reverse().slice(0, 10).map((c, i) => (
                <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-gray-50 dark:border-gray-700 last:border-0">
                  <span className="text-gray-600 dark:text-gray-300">
                    {c.action === "pdf" ? "📄 A ouvert le PDF" : "👁 A consulté le portail"}
                  </span>
                  <span className="text-gray-400">
                    {new Date(c.timestamp).toLocaleString("fr-CH", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ProjectHistory({ projectId, onCountChange }: { projectId: string; onCountChange?: (count: number) => void }) {
  const [logs, setLogs] = useState<{ id: string; timestamp: number; user: string; action: string; details: string }[]>([]);
  const [open, setOpen] = useState(false);

  const loadLogs = async () => {
    try {
      const res = await fetch(`/api/logs?projectId=${encodeURIComponent(projectId)}`);
      if (res.ok) {
        const filtered = await res.json();
        if (Array.isArray(filtered)) {
          setLogs(filtered);
          onCountChange?.(filtered.length);
        }
      }
    } catch {}
  };

  useEffect(() => {
    loadLogs();
  }, [projectId]);

  return (
    <Card>
      <CardContent className="pt-4">
        <button
          onClick={() => { setOpen(!open); if (!open) loadLogs(); }}
          className="w-full flex items-center justify-between text-sm"
        >
          <span className="flex items-center gap-2 font-medium text-gray-700 dark:text-gray-300">
            <Clock className="w-4 h-4" />
            Historique des modifications
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
        {open && (
          <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-3">Aucune modification</p>
            ) : (
              logs.map((log) => (
                <div key={log.id} className="flex items-start gap-2 text-xs border-b border-gray-50 dark:border-gray-700 pb-2 last:border-0">
                  <div className="text-gray-400 shrink-0 w-14">
                    <div>{new Date(log.timestamp).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}</div>
                    <div className="text-[10px] text-gray-300">{new Date(log.timestamp).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-700 dark:text-gray-300">{log.action}</p>
                    {log.details && <p className="text-gray-400">{log.details}</p>}
                  </div>
                  <span className="text-gray-400 shrink-0">{log.user}</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EditableDate({ project, mode, onUpdate }: { project: Project; mode: string; onUpdate: (date: string | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentDate = mode === "mesures" ? project.dateMesures : project.dateMontage;
  // Extraire date et heure depuis le format ISO
  const initDate = currentDate ? currentDate.split("T")[0] : "";
  const initTime = currentDate && currentDate.includes("T") ? currentDate.split("T")[1]?.slice(0, 5) : "";
  const [dateValue, setDateValue] = useState(initDate);
  const [timeValue, setTimeValue] = useState(initTime);
  const label = mode === "mesures" ? "Date de mesures" : mode === "services" ? "Date de service" : mode === "sav" ? "Date SAV" : "Date de montage";
  const notionField = mode === "mesures" ? "dateMesures" : "dateMontage";

  const buildDateString = () => {
    if (!dateValue) return null;
    if (timeValue) return `${dateValue}T${timeValue}:00`;
    return dateValue;
  };

  const handleSave = async () => {
    setSaving(true);
    try { window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field: notionField } })); } catch {}
    const newDate = buildDateString();
    const patchBody = { [notionField]: newDate };
    const logDetails = `${formatDate(currentDate)} → ${newDate ? formatDate(newDate) : "Non planifié"}`;

    if (!isOnline()) {
      addToQueue({ type: "update", url: `/api/projects/${project.id}`, method: "PATCH", body: patchBody });
      onUpdate(newDate);
      setEditing(false);
      setSaving(false);
      return;
    }

    try {
      const res = await fetchWithRetry(
        `/api/projects/${project.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        },
        2,
        (msg, retry) => showRetryToast(msg, () => { retry().catch(() => {}); }),
      );
      if (res.ok) {
        onUpdate(newDate);
        Promise.all([
          fetch("/api/logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: project.id, projectName: project.projet, action: `Modification ${label}`, details: logDetails }),
          }),
          fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectName: project.projet, projectId: project.id, action: `Modification ${label}`, details: logDetails }),
          }),
        ]).catch(() => {});
        setEditing(false);
      }
    } catch {
      addToQueue({ type: "update", url: `/api/projects/${project.id}`, method: "PATCH", body: patchBody });
      onUpdate(newDate);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-2">
      <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        {editing ? (
          <div className="space-y-1.5 mt-0.5">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="h-8 px-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 dark:bg-slate-800 dark:text-gray-100 flex-1 min-w-0"
              />
              <input
                type="time"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
                placeholder="Heure"
                className="h-8 px-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 dark:bg-slate-800 dark:text-gray-100 w-24"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="h-7 px-3 rounded-lg bg-green-500 text-white text-xs font-medium flex items-center justify-center gap-1 hover:bg-green-600 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                Enregistrer
              </button>
              <button
                onClick={() => { setEditing(false); setDateValue(initDate); setTimeValue(initTime); }}
                className="h-7 px-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-300"
              >
                Annuler
              </button>
              {timeValue && (
                <button
                  onClick={() => setTimeValue("")}
                  className="h-7 px-2 text-xs text-gray-400 hover:text-red-500"
                >
                  Retirer l'heure
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {formatDate(currentDate)}
              {project.dateMontageEnd && mode !== "mesures" && (
                <span className="text-gray-400"> → {formatDate(project.dateMontageEnd)}</span>
              )}
            </p>
            {project.dateMontageEnd && mode !== "mesures" && (() => {
              const start = currentDate?.split("T")[0] || "";
              const end = project.dateMontageEnd.split("T")[0];
              if (!start || !end) return null;
              const startD = new Date(start + "T12:00:00");
              const endD = new Date(end + "T12:00:00");
              let workDays = 0;
              const cur = new Date(startD);
              while (cur <= endD) { if (cur.getDay() !== 0 && cur.getDay() !== 6) workDays++; cur.setDate(cur.getDate() + 1); }
              return workDays > 1 ? (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 ml-1">{workDays} jours ouvrables</span>
              ) : null;
            })()}
            <button
              onClick={() => setEditing(true)}
              className="w-6 h-6 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
            >
              <Pencil className="w-3 h-3 text-gray-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ExtraDateField({ label, value, projectId, fieldName, onUpdate }: {
  label: string; value: string | null; projectId: string; fieldName: string; onUpdate: (v: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ? value.split("T")[0] : "");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await offlineFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldName]: draft || null }),
      });
      onUpdate(draft || null);
      try { window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field: fieldName } })); } catch {}
      setEditing(false);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  const formatted = value
    ? new Date(value.split("T")[0] + "T00:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" })
    : null;

  return (
    <div className="flex items-start gap-1.5">
      <Clock className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400">{label}</p>
        {editing ? (
          <div className="mt-0.5 space-y-1">
            <input type="date" value={draft} onChange={(e) => setDraft(e.target.value)}
              className="text-xs border rounded px-1.5 py-1 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200 w-full" />
            <div className="flex gap-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 text-[10px] bg-green-500 text-white py-1 rounded hover:bg-green-600">✓</button>
              <button onClick={() => { setEditing(false); setDraft(value ? value.split("T")[0] : ""); }}
                className="flex-1 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-1 rounded">✕</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{formatted || "—"}</p>
            <button onClick={() => { setDraft(value ? value.split("T")[0] : ""); setEditing(true); }}
              className="text-gray-300 hover:text-blue-500 p-0.5"><Pencil className="w-2.5 h-2.5" /></button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Adresse chantier : conserve le lien GPS + bouton crayon admin */
function InlineAddressField({
  value, projectId, isAdmin, onUpdate,
}: { value: string; projectId: string; isAdmin: boolean; onUpdate: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);

  if (!value && !isAdmin) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await offlineFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adresseChantier: draft.trim() || null }),
      });
      onUpdate(draft.trim());
      setEditing(false);
    } catch { } finally { setSaving(false); }
  };

  if (editing) {
    return (
      <div className="space-y-1 py-1">
        <p className="text-xs text-gray-500">Adresse chantier</p>
        <input autoFocus value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          className="text-xs border rounded px-1.5 py-1 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200 w-full" />
        <div className="flex gap-1">
          <button onClick={handleSave} disabled={saving}
            className="flex-1 text-[10px] bg-green-500 text-white py-0.5 rounded hover:bg-green-600">{saving ? "…" : "✓"}</button>
          <button onClick={() => { setEditing(false); setDraft(value || ""); }}
            className="flex-1 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-0.5 rounded">✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1">
      {value
        ? <MapAddressLink address={value} />
        : <div className="py-1"><p className="text-xs text-gray-500">Adresse chantier</p><p className="text-xs text-gray-300 italic">—</p></div>
      }
      {isAdmin && (
        <button onClick={() => { setDraft(value || ""); setEditing(true); }}
          className="text-gray-300 hover:text-blue-500 p-0.5 mt-5 shrink-0 transition-colors">
          <Pencil className="w-2.5 h-2.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Champ texte / nombre éditable inline (admin uniquement).
 * Affiche valeur + crayon en lecture ; input + ✓/✕ en édition.
 * Pour les non-admins : comportement identique à InfoRow (masqué si vide).
 */
function InlineField({
  icon: Icon,
  label,
  value,
  projectId,
  fieldName,
  type = "text",
  isAdmin,
  onUpdate,
}: {
  icon?: any;
  label: string;
  value: string | number | null;
  projectId: string;
  fieldName: string;
  type?: "text" | "number";
  isAdmin: boolean;
  onUpdate: (v: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ""));
  const [saving, setSaving] = useState(false);

  if (!isAdmin && !value) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      const parsed =
        type === "number"
          ? draft.trim() ? Number(draft) : null
          : draft.trim() || null;
      await offlineFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldName]: parsed }),
      });
      onUpdate(parsed);
      setEditing(false);
    } catch (err) {
      console.error("InlineField save:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-2 py-1">
      {Icon && <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        {editing ? (
          <div className="mt-0.5 space-y-1">
            <input
              type={type}
              value={draft}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") { setEditing(false); setDraft(String(value ?? "")); }
              }}
              className="text-xs border rounded px-1.5 py-1 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200 w-full"
            />
            <div className="flex gap-1">
              <button onClick={handleSave} disabled={saving}
                className="flex-1 text-[10px] bg-green-500 text-white py-0.5 rounded hover:bg-green-600">
                {saving ? "…" : "✓"}
              </button>
              <button onClick={() => { setEditing(false); setDraft(String(value ?? "")); }}
                className="flex-1 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-0.5 rounded">
                ✕
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">
              {value != null && value !== "" ? String(value) : (
                isAdmin ? <span className="text-gray-300 text-xs italic">—</span> : null
              )}
            </p>
            {isAdmin && (
              <button
                onClick={() => { setDraft(String(value ?? "")); setEditing(true); }}
                className="text-gray-300 hover:text-blue-500 p-0.5 shrink-0 transition-colors"
              >
                <Pencil className="w-2.5 h-2.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sélecteur inline d'emplacement cabine.
 * Les options sont chargées depuis Notion via /api/projects/field-options
 * et se mettent à jour automatiquement si de nouvelles options sont ajoutées.
 * Visible par tous, éditable uniquement par les admins.
 */
function EmplacementSelect({
  value,
  projectId,
  isAdmin,
  onUpdate,
}: {
  value: string;
  projectId: string;
  isAdmin: boolean;
  onUpdate: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  // Charge les options depuis Notion au premier clic
  const loadOptions = async () => {
    if (options.length > 0) return;
    try {
      const res = await fetch("/api/projects/field-options?fields=Emplacement+de+cabine");
      const data = await res.json();
      setOptions(data["Emplacement de cabine"] ?? []);
    } catch {}
  };

  const handleOpen = async () => {
    setDraft(value.split(",")[0].trim());
    await loadOptions();
    setEditing(true);
  };

  const handleSave = async (selected: string) => {
    setSaving(true);
    try {
      await offlineFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emplacementCabine: selected }),
      });
      onUpdate(selected);
      setEditing(false);
    } catch (err) {
      console.error("Save emplacement error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p className="text-xs text-gray-500">Emplacement cabine</p>
      {editing ? (
        <div className="mt-1 flex flex-col gap-1">
          <select
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="text-sm border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full"
          >
            <option value="">— Choisir —</option>
            {options.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <div className="flex gap-1">
            <button
              onClick={() => handleSave(draft)}
              disabled={saving}
              className="flex-1 text-[11px] bg-green-500 hover:bg-green-600 text-white py-1 rounded-lg font-medium transition-colors"
            >
              {saving ? "…" : "✓"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="flex-1 text-[11px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 py-1 rounded-lg transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1 mt-0.5">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{value || "---"}</p>
          {isAdmin && (
            <button
              onClick={handleOpen}
              className="text-gray-300 hover:text-blue-500 p-0.5 transition-colors"
            >
              <Pencil className="w-2.5 h-2.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Liste les pièces manquantes (depuis /api/pieces) avec numérotation,
 *  modification inline et suppression per-pièce. */
function PiecesList({ projectId, refreshKey, cabineLabel }: { projectId: string; refreshKey?: number; cabineLabel?: string }) {
  type Piece = {
    id: string;
    description?: string;
    reference?: string;
    user?: string;
    timestamp?: number;
    photoUrls?: string[];
    photoUrl?: string;
    status?: string;
    cabineLabel?: string;
    displayInRapport?: boolean;
  };
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ description: string; reference: string }>({ description: "", reference: "" });
  const [saving, setSaving] = useState(false);

  // Affiche / masque cette pièce sur le rapport client (PDF), comme les défauts.
  const toggleDisplay = async (id: string, current: boolean) => {
    const next = !current;
    setPieces((prev) => prev.map((p) => p.id === id ? { ...p, displayInRapport: next } : p));
    const revert = () => {
      setPieces((prev) => prev.map((p) => p.id === id ? { ...p, displayInRapport: current } : p));
      toast.error("Échec : le réglage n'a pas été enregistré. Réessayez.");
    };
    try {
      const res = await fetch("/api/pieces", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, displayInRapport: next }) });
      if (!res.ok) { revert(); return; }
      toast.success(next ? "Affichée sur le rapport" : "Masquée du rapport");
    } catch { revert(); }
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pieces?projectId=${projectId}`);
      if (res.ok) {
        // Réponse hors-ligne du SW ([] vide) : ne pas écraser une liste déjà affichée.
        if (res.headers.get("X-SW-Offline") === "1") return;
        const data = await res.json();
        if (Array.isArray(data)) setPieces(data);
      }
    } catch {} finally { setLoaded(true); }
  }, [projectId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const handleDelete = async (id: string, num: number) => {
    if (!confirm(`Supprimer la Pièce n°${num} ? Cette action est irréversible.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/pieces?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setPieces((prev) => prev.filter((p) => p.id !== id));
        toast.success(`Pièce n°${num} supprimée`);
      } else { toast.error("Erreur lors de la suppression"); }
    } catch { toast.error("Erreur réseau"); }
    finally { setDeleting(null); }
  };

  const startEdit = (p: Piece) => {
    setEditing(p.id);
    setEditDraft({ description: p.description || "", reference: p.reference || "" });
  };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/pieces", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, description: editDraft.description, reference: editDraft.reference }),
      });
      if (res.ok) {
        setPieces((prev) => prev.map((p) => p.id === id ? { ...p, ...editDraft } : p));
        setEditing(null);
      } else { toast.error("Erreur lors de la modification"); }
    } catch { toast.error("Erreur réseau"); }
    finally { setSaving(false); }
  };

  const visiblePieces = cabineLabel
    ? pieces.filter((p) => normCabineLabel(p.cabineLabel) === normCabineLabel(cabineLabel))
    : pieces;

  if (!loaded || visiblePieces.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">
        Pièces manquantes ({visiblePieces.length})
      </p>
      {visiblePieces.map((p, idx) => {
        const num = idx + 1;
        const pieceVisible = p.displayInRapport !== false;
        const isDeleting = deleting === p.id;
        const isEditing = editing === p.id;
        const photos = p.photoUrls?.length ? p.photoUrls : (p.photoUrl ? [p.photoUrl] : []);
        return (
          <div key={p.id} className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-900/10 p-3">
            <div className="mb-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-orange-700 dark:text-orange-400 min-w-0 truncate">
                  {/* Vue globale : nom de la cabine ; vue par cabine : numéro. */}
                  {!cabineLabel && p.cabineLabel ? p.cabineLabel : `Pièce n°${num}`}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${pieceVisible ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-gray-600 text-gray-500"}`}>
                    {pieceVisible ? "Sur rapport ✓" : "Masquée"}
                  </span>
                  <button onClick={() => isEditing ? setEditing(null) : startEdit(p)}
                    className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Modifier">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(p.id, num)} disabled={isDeleting}
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors" title="Supprimer">
                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              {/* Case sur sa propre ligne, à droite. */}
              <div className="flex items-center justify-end mt-1.5">
                <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer select-none whitespace-nowrap"
                  title="Cocher pour ne pas afficher cette pièce sur le rapport">
                  <input
                    type="checkbox"
                    checked={!pieceVisible}
                    onChange={() => toggleDisplay(p.id, pieceVisible)}
                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-orange-500 focus:ring-orange-400"
                  />
                  Ne pas afficher
                </label>
              </div>
            </div>

            {isEditing ? (
              <div className="space-y-2 mb-2">
                <div>
                  <label className="text-[10px] text-gray-500">Description</label>
                  <textarea value={editDraft.description} onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                    className="w-full text-xs border rounded-lg px-2 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200 resize-none mt-0.5" rows={2} />
                </div>
                <div>
                  <label className="text-[10px] text-gray-500">Référence</label>
                  <input value={editDraft.reference} onChange={(e) => setEditDraft((d) => ({ ...d, reference: e.target.value }))}
                    className="w-full text-xs border rounded-lg px-2 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200 mt-0.5" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => handleSaveEdit(p.id)} disabled={saving}
                    className="text-xs bg-green-500 text-white px-3 py-1 rounded-lg disabled:opacity-50">
                    {saving ? "..." : "✓ Enregistrer"}
                  </button>
                  <button onClick={() => setEditing(null)} className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-lg">Annuler</button>
                </div>
              </div>
            ) : (
              <>
                {p.description && <p className="text-xs text-gray-700 dark:text-gray-300 mb-1 font-medium">{p.description}</p>}
                {p.reference && <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Réf. : {p.reference}</p>}
              </>
            )}

            <p className="text-[10px] text-gray-400 mb-1">
              {p.user || "—"}{p.timestamp ? ` · ${new Date(p.timestamp).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
            </p>

            {photos.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={thumbnailUrl(url, 500)} alt={`Photo ${i + 1}`} loading="lazy" decoding="async"
                      style={{ aspectRatio: "4/3" }}
                      className="w-full object-cover rounded-lg border border-orange-200 dark:border-orange-700 hover:opacity-90 transition-opacity" />
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Liste les défauts du projet (depuis /api/defauts) avec numérotation,
 *  toggle rapport client, et suppression per-défaut. */
function DefautsList({ projectId, refreshKey, cabineLabel, project, setProject }: { projectId: string; refreshKey?: number; cabineLabel?: string; project?: Project | null; setProject?: Dispatch<SetStateAction<Project | null>> }) {
  type Defaut = {
    id: string;
    typesLabel?: string;
    types?: string[];
    description?: string;
    user?: string;
    timestamp?: number;
    photoUrls?: string[];
    status?: string;
    displayInRapport?: boolean;
    cabineLabel?: string;
    resolved?: boolean;
  };
  const [defauts, setDefauts] = useState<Defaut[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/defauts?projectId=${projectId}`);
      if (res.ok) {
        // Réponse hors-ligne du SW ([] vide) : ne pas écraser une liste déjà affichée.
        if (res.headers.get("X-SW-Offline") === "1") return;
        const data = await res.json();
        if (Array.isArray(data)) setDefauts(data);
      }
    } catch {} finally { setLoaded(true); }
  }, [projectId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const toggleDisplay = async (id: string, current: boolean) => {
    const next = !current;
    setDefauts((prev) => prev.map((d) => d.id === id ? { ...d, displayInRapport: next } : d));
    const revert = () => {
      setDefauts((prev) => prev.map((d) => d.id === id ? { ...d, displayInRapport: current } : d));
      toast.error("Échec : le réglage n'a pas été enregistré. Réessayez.");
    };
    try {
      const res = await fetch("/api/defauts", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, displayInRapport: next }) });
      // Un fetch ne jette PAS sur 404/500 → on vérifie explicitement res.ok,
      // sinon la case restait cochée alors que rien n'était persisté.
      if (!res.ok) { revert(); return; }
      toast.success(next ? "Affiché sur le rapport" : "Masqué du rapport");
    } catch {
      revert();
    }
  };

  // « Défaut réglé » : PAR DÉFAUT (indépendant). Stocké dans le KV du défaut ;
  // le serveur met à jour la case Notion projet « Soucis montages clôturé »
  // (cochée seulement quand TOUS les défauts sont réglés).
  const toggleResolved = (id: string, current: boolean) => {
    const next = !current;
    setDefauts((prev) => prev.map((d) => d.id === id ? { ...d, resolved: next } : d));
    fetch("/api/defauts", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, resolved: next }) })
      .then((res) => {
        if (!res.ok) { setDefauts((prev) => prev.map((d) => d.id === id ? { ...d, resolved: current } : d)); toast.error("Échec : réglage non enregistré."); return; }
        toast.success(next ? "Défaut marqué réglé" : "Défaut rouvert");
        // Reflet local de la case projet pour le bloc travaux + cohérence.
        setProject?.((prev) => {
          if (!prev) return prev;
          const all = defauts.every((d) => d.id === id ? next : d.resolved);
          return { ...prev, soucisMontageCloture: all && defauts.length > 0 };
        });
      })
      .catch(() => { setDefauts((prev) => prev.map((d) => d.id === id ? { ...d, resolved: current } : d)); toast.error("Erreur réseau."); });
  };
  // Au moins un défaut réglé → on affiche le bloc « Travaux exécutés » (projet).
  const anyResolved = defauts.some((d) => d.resolved);

  const handleDelete = async (id: string, num: number) => {
    if (!confirm(`Supprimer le Défaut n°${num} ? Cette action est irréversible.`)) return;
    setDeleting(id);
    try {
      const res = await fetch(`/api/defauts?id=${id}`, { method: "DELETE" });
      if (res.ok) { setDefauts((prev) => prev.filter((d) => d.id !== id)); toast.success(`Défaut n°${num} supprimé`); }
      else { toast.error("Erreur lors de la suppression"); }
    } catch { toast.error("Erreur réseau"); }
    finally { setDeleting(null); }
  };

  const startEdit = (d: Defaut) => { setEditing(d.id); setEditDraft(d.description || ""); };

  const handleSaveEdit = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch("/api/defauts", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, description: editDraft }) });
      if (res.ok) { setDefauts((prev) => prev.map((d) => d.id === id ? { ...d, description: editDraft } : d)); setEditing(null); }
      else { toast.error("Erreur lors de la modification"); }
    } catch { toast.error("Erreur réseau"); }
    finally { setSaving(false); }
  };

  const visibleDefauts = cabineLabel
    ? defauts.filter((d) => normCabineLabel(d.cabineLabel) === normCabineLabel(cabineLabel))
    : defauts;

  if (!loaded || visibleDefauts.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-red-600 dark:text-red-400">Défauts signalés ({visibleDefauts.length})</p>
      {visibleDefauts.map((d, idx) => {
        const num = idx + 1;
        const visible = d.displayInRapport !== false;
        const isDeleting = deleting === d.id;
        const isEditing = editing === d.id;
        return (
          <div key={d.id} className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10 p-3">
            {/* En-tête : titre + statut/actions (ligne 1) ; cases à cocher (ligne 2,
                alignées à droite) → jamais de retour à la ligne disgracieux. */}
            <div className="mb-2">
              <div className="flex items-center justify-between gap-2">
                {/* Titre = LOT en évidence (vue globale) ; sinon « Défaut n°X ». */}
                <span className="text-xs font-bold text-red-700 dark:text-red-400 min-w-0 truncate">
                  {!cabineLabel && d.cabineLabel ? d.cabineLabel : `Défaut n°${num}`}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full border whitespace-nowrap ${visible ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-gray-600 text-gray-500"}`}>
                    {visible ? "Sur rapport ✓" : "Masqué"}
                  </span>
                  <button onClick={() => isEditing ? setEditing(null) : startEdit(d)}
                    className="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-blue-50 transition-colors" title="Modifier">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(d.id, num)} disabled={isDeleting}
                    className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors" title="Supprimer ce défaut">
                    {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              {/* Cases à cocher sur leur propre ligne, à droite. */}
              <div className="flex items-center justify-end gap-4 mt-1.5">
                <label className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400 cursor-pointer select-none whitespace-nowrap"
                  title="Cocher pour ne pas afficher ce défaut sur le rapport">
                  <input
                    type="checkbox"
                    checked={!visible}
                    onChange={() => toggleDisplay(d.id, visible)}
                    className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-red-500 focus:ring-red-400"
                  />
                  Ne pas afficher
                </label>
                {project && setProject && (
                  <label className="flex items-center gap-1 text-[10px] font-medium text-green-700 dark:text-green-400 cursor-pointer select-none whitespace-nowrap"
                    title="Cocher quand CE défaut a été réglé">
                    <input
                      type="checkbox"
                      checked={!!d.resolved}
                      onChange={() => toggleResolved(d.id, !!d.resolved)}
                      className="w-3.5 h-3.5 rounded border-gray-300 dark:border-gray-600 text-green-600 focus:ring-green-500 accent-green-600"
                    />
                    Défaut réglé
                  </label>
                )}
              </div>
            </div>

            {/* Type de défaut */}
            {(d.typesLabel || (d.types && d.types.length > 0)) && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {(d.types && d.types.length > 0 ? d.types : (d.typesLabel || "").split(",")).map((t, i) => (
                  <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-700">
                    {typeof t === "string" ? t.trim() : t}
                  </span>
                ))}
              </div>
            )}

            {/* Description — éditable */}
            {isEditing ? (
              <div className="space-y-2 mb-2">
                <textarea value={editDraft} onChange={(e) => setEditDraft(e.target.value)}
                  className="w-full text-xs border rounded-lg px-2 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200 resize-none" rows={3} />
                <div className="flex gap-1">
                  <button onClick={() => handleSaveEdit(d.id)} disabled={saving}
                    className="text-xs bg-green-500 text-white px-3 py-1 rounded-lg disabled:opacity-50">
                    {saving ? "..." : "✓ Enregistrer"}
                  </button>
                  <button onClick={() => setEditing(null)} className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-lg">Annuler</button>
                </div>
              </div>
            ) : d.description ? (
              <p className="text-xs text-gray-700 dark:text-gray-300 mb-1.5 leading-relaxed">{d.description}</p>
            ) : null}

            {/* Auteur + date */}
            <p className="text-[10px] text-gray-400 mb-1">
              {d.user || "—"}{d.timestamp ? ` · ${new Date(d.timestamp).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
            </p>

            {/* Photos */}
            {d.photoUrls && d.photoUrls.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
                {d.photoUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                    <img src={thumbnailUrl(url, 500)} alt={`Photo ${i + 1}`} loading="lazy" decoding="async"
                      style={{ aspectRatio: "4/3" }}
                      className="w-full object-cover rounded-lg border border-red-200 dark:border-red-700 hover:opacity-90 transition-opacity" />
                  </a>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Bloc « Travaux exécutés » — visible quand le défaut est réglé (case
          « Défaut réglé »). Photos + texte, champs PROJET synchronisés Notion
          (« Photos soucis montage réglé » / « Explications travaux exécuté »). */}
      {project && setProject && anyResolved && (
        <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10 p-3 space-y-3">
          <p className="text-xs font-semibold text-green-700 dark:text-green-400">Travaux exécutés (souci réglé)</p>
          <PhotoUpload
            category="soucis-regle"
            label="Photos du souci réglé"
            projectId={projectId}
            notionField="Photos soucis montage réglé"
            filePrefix="Photos-Soucis-Regle"
            existingPhotos={project.photosSoucisRegle || []}
            onUpload={(files) => {
              setProject((prev) => prev ? { ...prev, photosSoucisRegle: [...(prev.photosSoucisRegle || []), ...files] } : prev);
              // Protège la liste locale du « revert » par le polling tant que
              // Notion n'a pas encore répercuté l'ajout (sinon les photos
              // disparaissent quelques secondes puis reviennent).
              window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field: "photosSoucisRegle" } }));
            }}
            onDelete={(files) => {
              setProject((prev) => prev ? { ...prev, photosSoucisRegle: files } : prev);
              window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field: "photosSoucisRegle" } }));
              offlineFetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photosSoucisRegle: files }) }).catch(console.error);
            }}
          />
          <ExplicationTravauxField
            projectId={projectId}
            value={project.explicationsTravaux || ""}
            onUpdate={(v) => setProject((prev) => prev ? { ...prev, explicationsTravaux: v } : prev)}
          />
        </div>
      )}
    </div>
  );
}

function EditableSignalement({ label, color, text, photos: initialPhotos, projectId, notionTextField, onUpdate, onPhotosUpdate, onDelete }: {
  label: string; color: "orange" | "red"; text: string; photos: { name: string; url: string }[];
  projectId: string; notionTextField: string; onUpdate: (newText: string) => void;
  onPhotosUpdate?: (photos: { name: string; url: string }[]) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);
  const [photos, setPhotos] = useState(initialPhotos);
  const [uploadingCount, setUploadingCount] = useState(0);
  // Blob URLs pour aperçu instantané pendant l'upload
  const [uploadPreviews, setUploadPreviews] = useState<string[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  // Anti double-fire iOS : timestamp du dernier déclenchement
  const lastFireMsRef = useRef<Record<string, number>>({ camera: 0, gallery: 0 });

  // Garde le state local en phase quand le parent re-render avec
  // une nouvelle liste (ex : polling collaboratif, refetch).
  useEffect(() => { setPhotos(initialPhotos); }, [initialPhotos]);

  const isPieces = notionTextField.includes("Pièces");
  const photosFieldKey = isPieces ? "photosPiecesManquantes" : "photosDefautsSignale";
  const uploadCategory = isPieces ? "pieces" : "defauts";
  const uploadNotionField = isPieces ? "Photos - Pièces manquante" : "Photos - Défauts signalé";

  const borderColor = color === "orange" ? "border-orange-300" : "border-red-300";
  const textColor = color === "orange" ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400";

  const handleSave = async () => {
    setSaving(true);
    try {
      await offlineFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [isPieces ? "infoPiecesManquantes" : "infoDefautsSignale"]: draft }),
      });
      onUpdate(draft);
      setEditing(false);
    } catch {} finally { setSaving(false); }
  };

  const handleDeleteSignalement = async () => {
    if (!confirm(`Supprimer ce signalement "${label}" ? Cette action est irréversible.`)) return;
    setDeleting(true);
    try {
      const textField = isPieces ? "infoPiecesManquantes" : "infoDefautsSignale";
      const photoField = isPieces ? "photosPiecesManquantes" : "photosDefautsSignale";
      await offlineFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [textField]: "", [photoField]: [] }),
      });
      invalidateApiCache();
      onDelete?.();
    } catch {
      toast.error("Erreur lors de la suppression");
    } finally {
      setDeleting(false);
    }
  };

  const handleRemovePhoto = async (idx: number) => {
    if (!confirm("Supprimer cette photo ?")) return;
    const next = photos.filter((_, i) => i !== idx);
    setPhotos(next);
    onPhotosUpdate?.(next);
    try {
      await offlineFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [photosFieldKey]: next }),
      });
      invalidateApiCache();
    } catch {
      // Restaure en cas d'échec
      setPhotos(photos);
      onPhotosUpdate?.(photos);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleAddPhotos = async (files: FileList | null, source: "camera" | "gallery" = "gallery") => {
    if (!files?.length) return;
    // Anti double-fire iOS : ignorer si même source déclenchée < 600 ms
    const now = Date.now();
    if (now - lastFireMsRef.current[source] < 600) {
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
      return;
    }
    lastFireMsRef.current[source] = now;

    const originals = Array.from(files);

    // Réinitialise l'input IMMÉDIATEMENT → permet de prendre une 2e photo
    // sans attendre la fin de l'upload de la première.
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";

    // Aperçu instantané
    const newPreviews = originals.map((f) => URL.createObjectURL(f));
    setUploadPreviews((prev) => [...prev, ...newPreviews]);
    setUploadingCount((n) => n + 1);

    try {
      const formData = new FormData();
      originals.forEach((f) => formData.append("files", f));
      formData.append("projectId", projectId);
      formData.append("category", uploadCategory);
      formData.append("notionField", uploadNotionField);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        toast.error("Échec de l'upload");
        return;
      }
      const data = await res.json();
      const newPhotos: { name: string; url: string }[] = (data.files || []).map((f: any) => ({ name: f.name || "photo.jpg", url: f.url }));
      // Dédup par URL au cas où le serveur renverrait des doublons.
      const seen = new Set<string>();
      const merged = [...photos, ...newPhotos].filter((p) => {
        if (!p.url || seen.has(p.url)) return false;
        seen.add(p.url);
        return true;
      });
      setPhotos(merged);
      onPhotosUpdate?.(merged);
      invalidateApiCache();
      // Nettoie les previews de CE batch
      setUploadPreviews((prev) => {
        const result = prev.filter((u) => !newPreviews.includes(u));
        newPreviews.forEach((u) => { try { URL.revokeObjectURL(u); } catch {} });
        return result;
      });
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setUploadingCount((n) => Math.max(0, n - 1));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className={`text-sm font-medium ${textColor}`}>{label}</p>
        <div className="flex items-center gap-0.5">
          <button onClick={() => { setDraft(text); setEditing(!editing); }}
            className="text-gray-400 hover:text-blue-500 p-1">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDeleteSignalement}
            disabled={deleting}
            className="text-gray-400 hover:text-red-500 p-1 disabled:opacity-50"
            title="Supprimer ce signalement"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {editing ? (
        <div className="space-y-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)}
            className="w-full text-xs border rounded-lg px-2 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200 resize-none"
            rows={Math.max(draft.split("\n").length + 1, 3)} />
          <div className="flex gap-1">
            <button onClick={handleSave} disabled={saving}
              className="text-xs bg-green-500 text-white px-3 py-1 rounded-lg hover:bg-green-600 disabled:opacity-50">
              {saving ? "..." : "✓ Enregistrer"}
            </button>
            <button onClick={() => setEditing(false)}
              className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-lg">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <>
          {text.split("\n").filter(Boolean).map((line, i) => (
            <p key={i} className={`text-xs text-muted-foreground border-l-2 ${borderColor} pl-2 mb-1`}>{line}</p>
          ))}
        </>
      )}
      <div className="flex flex-wrap gap-2 mt-2 items-start">
        {photos.map((f, i) => (
          <div key={i} className="relative group">
            <a href={f.url} target="_blank" rel="noopener noreferrer">
              <img src={thumbnailUrl(f.url, 128)} alt={f.name} loading="lazy" decoding="async" className="w-16 h-16 object-cover rounded border" />
            </a>
            <button
              type="button"
              onClick={() => handleRemovePhoto(i)}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 sm:opacity-100 hover:bg-red-500 transition-opacity"
              title="Supprimer cette photo"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {/* Aperçus instantanés des photos en cours d'upload */}
        {uploadPreviews.map((src, i) => (
          <div key={`prev-${i}`} className="relative w-16 h-16 rounded border overflow-hidden bg-gray-100">
            <img src={src} alt="En cours…" className="w-full h-full object-cover opacity-60" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className={`w-16 h-7 rounded border-2 border-dashed flex items-center justify-center gap-1 text-[10px] transition-colors relative ${
              color === "orange"
                ? "border-orange-300 text-orange-500 hover:bg-orange-50"
                : "border-red-300 text-red-500 hover:bg-red-50"
            }`}
          >
            <Camera className="w-3 h-3" /> Photo
            {uploadingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center">
                <Loader2 className="w-2 h-2 animate-spin text-white" />
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            className={`w-16 h-7 rounded border-2 border-dashed flex items-center justify-center gap-1 text-[10px] transition-colors relative ${
              color === "orange"
                ? "border-orange-300 text-orange-500 hover:bg-orange-50"
                : "border-red-300 text-red-500 hover:bg-red-50"
            }`}
          >
            <ImagePlus className="w-3 h-3" /> Galerie
            {uploadingCount > 0 && (
              <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center">
                <Loader2 className="w-2 h-2 animate-spin text-white" />
              </span>
            )}
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleAddPhotos(e.target.files, "camera")} />
        <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleAddPhotos(e.target.files, "gallery")} />
      </div>
    </div>
  );
}

// Mentions de présence du client dans le rapport du monteur. Doivent
// correspondre EXACTEMENT au libellé des boutons de la section « Rapport du
// monteur » pour que la coche se synchronise dans les deux sens.
const PRESENCE_CLIENT = "Client présent lors du montage, travaux validés par client.";
const PRESENCE_PERSONNE = "Personne sur site lors du montage.";
/** Le rapport indique-t-il déjà si un client était présent ou non ? */
function hasPresenceStatement(rapport: string): boolean {
  return rapport.includes(PRESENCE_CLIENT) || rapport.includes(PRESENCE_PERSONNE);
}

/**
 * Normalise un libellé de lot pour comparaison tolérante (espaces, tirets,
 * ponctuation, casse ignorés). « B02 - Douche » ≡ « B02 Douche » ≡ « b02douche ».
 * Sert à relier les signalements (dont le libellé a pu être saisi/renommé
 * différemment) à la bonne carte de cabine.
 */
function normCabineLabel(s: string | undefined | null): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// ── Rapport cabine : phrases « classiques » prédéfinies dans l'app ────────────
// Boutons à cocher standards. Tout texte du rapport qui RESTE une fois ces
// phrases retirées = texte ajouté MANUELLEMENT (précisions propres au monteur).
const RAPPORT_CABINE_CLASSIQUES = [
  "L'installation s'est déroulée sans encombre.",
  "Nous avons rencontré quelques difficultés à l'assemblage de la cabine.",
] as const;
/** true si le rapport contient du texte ajouté à la main (au-delà des phrases
 *  classiques). Sert à afficher une icône « rapport personnalisé » sur le lot. */
function hasManualRapport(rapport: string | undefined | null): boolean {
  let s = rapport || "";
  for (const phrase of RAPPORT_CABINE_CLASSIQUES) s = s.split(phrase).join("");
  return s.replace(/\s+/g, "").length > 0;
}

// ── Monteur sous-traitance PAR CABINE ────────────────────────────────────────
// Encodé dans la colonne Notion « Monteurs sous-traitance » comme les monteurs
// responsables : "Cab1:Nom | Cab2:Nom | …".
function parseSousTraitance(raw: string): Record<number, string> {
  const map: Record<number, string> = {};
  (raw || "").split("|").forEach((part) => {
    const m = /^\s*Cab(\d+)\s*:(.*)$/.exec(part.trim());
    if (m) { const v = m[2].trim(); if (v) map[parseInt(m[1], 10)] = v; }
  });
  return map;
}
// Parse une chaîne "Cab1:val | Cab2:val" en tolérant les valeurs MULTI-LIGNES
// (regex [^|]* ≈ merge serveur). Utilisé pour SAV/Retouches (texte libre).
function parseCabineTextMulti(raw: string): Record<number, string> {
  const map: Record<number, string> = {};
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw || ""))) { const v = m[2].trim(); if (v) map[parseInt(m[1], 10)] = v; }
  return map;
}
function encodeSousTraitance(map: Record<number, string>): string {
  return Object.entries(map)
    .filter(([, v]) => v && v.trim())
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([k, v]) => `Cab${k}:${v.trim()}`)
    .join(" | ");
}

/** État du montage possible d'une cabine (colonne Notion « État du montage »). */
const ETATS_MONTAGE = ["Montage terminé", "Montage partiel", "Montage pas possible"] as const;
/** Classe de couleur du numéro de lot selon l'état explicite. "" = pas d'état → couleur auto. */
function etatMontageBadgeClass(etat: string | undefined): string {
  switch (etat) {
    case "Montage pas possible": return "bg-red-600 ring-2 ring-red-300 dark:ring-red-500/50";
    case "Montage partiel": return "bg-violet-600 ring-2 ring-violet-300 dark:ring-violet-500/50";
    case "Montage terminé": return "bg-green-600";
    default: return "";
  }
}

/** Texte « Explications travaux exécuté » (projet). Sauvegarde au blur + Notion,
 *  avec reformulation IA (comme le rapport du monteur). */
function ExplicationTravauxField({ projectId, value, onUpdate }: { projectId: string; value: string; onUpdate: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [reformulating, setReformulating] = useState(false);
  const focusedRef = useRef(false);
  useEffect(() => { if (!focusedRef.current) setDraft(value); }, [value]);
  const commit = (text?: string) => {
    const v = text ?? draft;
    if (v === value) return;
    onUpdate(v);
    window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field: "explicationsTravaux" } }));
    offlineFetch(`/api/projects/${projectId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ explicationsTravaux: v }),
    }).catch(console.error);
  };
  const reformulate = async () => {
    if (!draft.trim()) return;
    setReformulating(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Reformule ce texte décrivant les travaux exécutés pour régler un souci de montage de cabine de douche, de manière professionnelle, claire et concise. Garde le sens exact mais améliore la formulation. Réponds uniquement avec le texte reformulé, sans introduction ni commentaire :\n\n${draft}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const out = (data.answer || data.response || "").trim();
        if (out) { setDraft(out); commit(out); }
      }
    } catch {} finally {
      setReformulating(false);
    }
  };
  return (
    <div>
      <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-1">Explications — travaux exécutés</label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => { focusedRef.current = true; }}
        onBlur={() => { focusedRef.current = false; commit(); }}
        rows={3}
        placeholder="Décrire ce qui a été fait pour régler le souci…"
        className="w-full text-sm border rounded-lg px-3 py-2 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-green-400/40"
      />
      {draft.trim().length > 10 && (
        <button
          type="button"
          onClick={reformulate}
          disabled={reformulating}
          className="mt-1.5 flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 disabled:opacity-50"
        >
          {reformulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {reformulating ? "Reformulation en cours..." : "Reformuler avec l'IA"}
        </button>
      )}
    </div>
  );
}

/** Champ texte « monteur sous-traitance » d'UNE cabine (admin). Sauvegarde au blur. */
function CabineSousTraitantInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ne pas écraser la saisie en cours quand la valeur externe change (optimiste).
  useEffect(() => { if (!focusedRef.current) setDraft(value); }, [value]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const commit = (raw: string) => {
    const v = raw.replace(/[|:]/g, " ").replace(/\s+/g, " ").trim(); // pas de | ni : (délimiteurs)
    if (v !== value) onSave(v);
  };
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => {
        const val = e.target.value;
        setDraft(val);
        // Sauvegarde PENDANT la frappe (débounce) → les photos se débloquent
        // sans attendre de quitter le champ, et l'enregistrement tient du 1er coup.
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => commit(val), 700);
      }}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; if (timerRef.current) clearTimeout(timerRef.current); commit(draft); }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      placeholder="Nom du sous-traitant…"
      className="mt-1 w-full h-9 px-3 text-sm rounded-lg border border-orange-200 dark:border-orange-800/50 bg-orange-50/40 dark:bg-orange-950/20 focus:outline-none focus:ring-2 focus:ring-orange-400/40"
    />
  );
}

// Zone de texte SAV / Retouches / Réglages par cabine (debounce + anti-clobber).
// Le `|` est interdit (délimiteur du modèle par-cabine) → remplacé par « / ».
function CabineSavInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const focusedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (!focusedRef.current) setDraft(value); }, [value]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const commit = (raw: string) => {
    const v = raw.replace(/\|/g, " / ").trim();
    if (v !== value) onSave(v);
  };
  return (
    <Textarea
      value={draft}
      onChange={(e) => {
        const val = e.target.value;
        setDraft(val);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => commit(val), 700);
      }}
      onFocus={() => { focusedRef.current = true; }}
      onBlur={() => { focusedRef.current = false; if (timerRef.current) clearTimeout(timerRef.current); commit(draft); }}
      rows={4}
      placeholder="Ex. : régler la porte, changer un joint, refaire le silicone, retouche peinture…"
      className="mt-1"
    />
  );
}

function EditableTextField({ label, value, projectId, fieldName, notionField, multiline, onUpdate, hideLabel }: {
  label: string; value: string; projectId: string; fieldName: string; notionField: string; multiline?: boolean; onUpdate: (v: string) => void; hideLabel?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const handleAiReformulate = async () => {
    if (!draft.trim() || draft.trim().length < 10) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Reformule ce texte de manière professionnelle, claire et concise pour un rapport technique. Garde le sens exact mais améliore la formulation. Réponds uniquement avec le texte reformulé :\n\n${draft}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.answer || data.response) setDraft((data.answer || data.response).trim());
      }
    } catch {} finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await offlineFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [fieldName]: draft }),
      });
      onUpdate(draft);
      setEditing(false);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-2">
      {!hideLabel && <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        {!hideLabel && <p className="text-xs text-gray-500">{label}</p>}
        {editing ? (
          <div className="mt-1 space-y-1">
            {multiline ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200 resize-none"
                rows={3}
              />
            ) : (
              <input
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="w-full text-sm border rounded-lg px-2 py-1.5 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200"
              />
            )}
            <div className="flex items-center gap-1">
              <button onClick={handleSave} disabled={saving}
                className="text-xs bg-green-500 text-white px-3 py-1 rounded-lg hover:bg-green-600 disabled:opacity-50">
                {saving ? "..." : "✓"}
              </button>
              <button onClick={() => { setEditing(false); setDraft(value || ""); }}
                className="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-3 py-1 rounded-lg">
                ✕
              </button>
              {multiline && draft.trim().length > 10 && (
                <button onClick={handleAiReformulate} disabled={aiLoading}
                  className="ml-auto flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 disabled:opacity-50">
                  {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {aiLoading ? "IA..." : "✨ Reformuler"}
                </button>
              )}
            </div>
            {multiline && (
              <div className="mt-1">
                <VoiceRecorder onTranscript={(text) => setDraft((prev) => prev ? prev + "\n" + text : text)} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{value || "---"}</p>
            <button onClick={() => { setDraft(value || ""); setEditing(true); }}
              className="text-gray-400 hover:text-blue-500 p-0.5">
              <Pencil className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Note de montage à USAGE INTERNE — jamais envoyée au client (ni dans le PDF,
 * ni dans le portail client). Zone toujours éditable, sauvegarde automatique
 * débouncée (1,5 s) vers la propriété Notion « Commentaires interne ».
 * Style volontairement distinct (fond ambré/sombre + cadenas) pour qu'on ne la
 * confonde jamais avec le rapport visible par le client.
 */
function InternalNoteField({
  projectId,
  value,
  onUpdate,
}: {
  projectId: string;
  value: string;
  onUpdate: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value || "");
  const [open, setOpen] = useState(false); // repliable
  const [savedAt, setSavedAt] = useState<"idle" | "saving" | "saved">("idle");
  const [reformulating, setReformulating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editedRef = useRef(false);

  // Le projet se charge en deux temps (init local puis données Notion fraîches).
  // Tant que l'utilisateur n'a pas tapé, on adopte la valeur serveur pour ne
  // jamais afficher une note vide alors que Notion en contient déjà une.
  useEffect(() => {
    if (!editedRef.current) setDraft(value || "");
  }, [value]);

  const scheduleSave = (next: string) => {
    editedRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setSavedAt("saving");
    timerRef.current = setTimeout(async () => {
      try {
        await offlineFetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteInterneMontage: next }),
        });
        onUpdate(next);
        setSavedAt("saved");
      } catch {
        setSavedAt("idle");
      }
    }, 1500);
  };

  const applyText = (text: string) => {
    setDraft(text);
    scheduleSave(text);
  };

  const handleReformulate = async () => {
    if (!draft.trim() || draft.trim().length < 10 || reformulating) return;
    setReformulating(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Reformule cette note interne de chantier de manière claire et concise, à destination des collaborateurs. Garde le sens exact mais améliore la formulation. Réponds uniquement avec le texte reformulé, sans introduction ni commentaire :\n\n${draft}`,
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const out = (d.answer || d.response || "").trim();
        if (out) applyText(out);
      }
    } catch {
      /* silencieux — l'utilisateur garde son texte */
    } finally {
      setReformulating(false);
    }
  };

  const noteCount = (draft || "").split("\n").map((l) => l.trim()).filter(Boolean).length;
  return (
    <div className="rounded-2xl border-2 border-amber-300 dark:border-amber-700/60 bg-amber-50/80 dark:bg-amber-950/30 p-4 space-y-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 text-left">
        <span className="w-6 h-6 rounded-lg bg-amber-200/80 dark:bg-amber-800/50 flex items-center justify-center shrink-0">
          <Lock className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200 leading-tight">
            Note interne{noteCount > 0 ? ` (${noteCount})` : ""}
          </p>
          <p className="text-[11px] text-amber-600 dark:text-amber-400 leading-tight">
            Non visible par le client — communication entre collaborateurs
          </p>
        </div>
        {savedAt === "saved" && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400">
            <Check className="w-3 h-3" /> Enregistré
          </span>
        )}
        {open
          ? <ChevronUp className={`w-4 h-4 text-amber-500 shrink-0 ${savedAt === "saved" ? "" : "ml-auto"}`} />
          : <ChevronDown className={`w-4 h-4 text-amber-500 shrink-0 ${savedAt === "saved" ? "" : "ml-auto"}`} />}
      </button>
      {open && (
        <>
          <Textarea
            placeholder="Informations réservées à l'équipe (accès, difficultés, à prévoir pour le SAV…)"
            value={draft}
            onChange={(e) => { setDraft(e.target.value); scheduleSave(e.target.value); }}
            rows={3}
            className="bg-white/70 dark:bg-slate-900/40 border-amber-200 dark:border-amber-800/50 focus-visible:ring-amber-400"
          />
          <button
            type="button"
            onClick={handleReformulate}
            disabled={reformulating || draft.trim().length < 10}
            title={draft.trim().length < 10 ? "Écrivez d'abord quelques mots" : undefined}
            className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400 hover:text-amber-800 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {reformulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {reformulating ? "Reformulation en cours..." : "Reformuler avec l'IA"}
          </button>
          <div className="pt-1">
            <VoiceRecorder
              accent="amber"
              addLabel="Ajouter à la note"
              onTranscript={(text) => applyText(draft ? draft + "\n" + text : text)}
            />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Cellule compacte "Mesures traitée par" pour la grille Informations Dates.
 * Affiche un badge coloré (même palette que getCollaboratorColor) et charge
 * les options dynamiquement depuis Notion → jamais besoin de mettre à jour le code.
 */
function MesuresParCell({
  value,
  projectId,
  onUpdate,
}: {
  value: string;
  projectId: string;
  onUpdate: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/projects/field-options?fields=Mesures+trait%C3%A9e+par")
      .then((r) => r.json())
      .then((data) => {
        const opts = data["Mesures traitée par"];
        if (Array.isArray(opts) && opts.length > 0) setOptions(opts);
      })
      .catch(() => {});
  }, []);

  const handleSelect = async (name: string) => {
    const newValue = name === value ? "" : name;
    setSaving(true);
    try {
      await offlineFetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mesuresTraiteePar: newValue }),
      });
      onUpdate(newValue);
      try { window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field: "mesuresTraiteePar" } })); } catch {}
      setEditing(false);
    } catch {} finally {
      setSaving(false);
    }
  };

  const colors = value ? getCollaboratorColor(value) : null;

  return (
    <div className="flex items-start gap-1.5">
      <Users className="w-3.5 h-3.5 text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-gray-400">Mesures traitée par</p>
        {editing ? (
          <div className="mt-1 space-y-1.5">
            <div className="flex flex-wrap gap-1">
              {options.map((name) => {
                const c = getCollaboratorColor(name);
                return (
                  <button
                    key={name}
                    onClick={() => handleSelect(name)}
                    disabled={saving}
                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full transition-all disabled:opacity-50 ${
                      value === name ? "ring-2 ring-offset-1 ring-blue-400" : "opacity-60 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: c.bg, color: c.text }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.dot }} />
                    {name}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setEditing(false)}
              className="text-[10px] text-gray-400 hover:text-gray-600"
            >
              Annuler
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            {value && colors ? (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: colors.bg, color: colors.text }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.dot }} />
                {value}
              </span>
            ) : (
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">—</span>
            )}
            <button onClick={() => setEditing(true)} className="text-gray-300 hover:text-blue-500 p-0.5">
              <Pencil className="w-2.5 h-2.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditableCollaborateur({ project, mode, onUpdate }: { project: Project; mode: string; onUpdate: (collab: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentCollab = mode === "mesures" ? project.mesuresTraiteePar : project.collaborateurs;
  const notionOptionField = mode === "mesures" ? "Mesures traitée par" : "Collaborateurs montages";
  // Options chargées depuis Notion (fallback statique le temps du chargement)
  const [options, setOptions] = useState<string[]>(["Micael", "Claudio", "Jean-Marc", "Jacobo", "Miguel", "Loïc"]);
  const [selected, setSelected] = useState<string[]>(
    currentCollab ? currentCollab.split(" & ").map((n) => n.trim()).filter(Boolean) : []
  );
  const notionField = mode === "mesures" ? "mesuresTraiteePar" : "collaborateurs";

  // Charge les options depuis Notion au montage
  useEffect(() => {
    const encoded = encodeURIComponent(notionOptionField);
    fetch(`/api/projects/field-options?fields=${encoded}`)
      .then((r) => r.json())
      .then((data) => {
        const opts = data[notionOptionField];
        if (Array.isArray(opts) && opts.length > 0) setOptions(opts);
      })
      .catch(() => {});
  }, [notionOptionField]);

  const toggleCollab = (name: string) => {
    setSelected((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
  };

  const handleSave = async () => {
    setSaving(true);
    try { window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field: notionField } })); } catch {}
    const newValue = selected.join(" & ");
    const patchBody = { [notionField]: newValue || "" };
    const logDetails = `${currentCollab || "---"} → ${newValue || "---"}`;

    if (!isOnline()) {
      addToQueue({ type: "update", url: `/api/projects/${project.id}`, method: "PATCH", body: patchBody });
      onUpdate(newValue);
      setEditing(false);
      setSaving(false);
      return;
    }

    try {
      const res = await fetchWithRetry(
        `/api/projects/${project.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        },
        2,
        (msg, retry) => showRetryToast(msg, () => { retry().catch(() => {}); }),
      );
      if (res.ok) {
        onUpdate(newValue);
        Promise.all([
          fetch("/api/logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId: project.id, projectName: project.projet, action: "Modification collaborateur", details: logDetails }),
          }),
          fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectName: project.projet, projectId: project.id, action: "Modification collaborateur", details: logDetails }),
          }),
        ]).catch(() => {});
        setEditing(false);
      }
    } catch {
      addToQueue({ type: "update", url: `/api/projects/${project.id}`, method: "PATCH", body: patchBody });
      onUpdate(newValue);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-2">
      <Users className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{mode === "mesures" ? "Mesures traitée par" : "Montage traité par"}</p>
        {editing ? (
          <div className="space-y-2 mt-1">
            <div className="flex flex-wrap gap-1.5">
              {options.map((name) => {
                const isSelected = selected.includes(name);
                const colors = getCollaboratorColor(name);
                return (
                  <button
                    key={name}
                    onClick={() => toggleCollab(name)}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-full transition-all ${
                      isSelected ? "ring-2 ring-offset-1 ring-blue-400" : "opacity-40"
                    }`}
                    style={{ backgroundColor: colors.bg, color: colors.text }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.dot }} />
                    {name}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="h-7 px-3 rounded-lg bg-green-500 text-white text-xs font-medium flex items-center gap-1 hover:bg-green-600 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                Enregistrer
              </button>
              <button
                onClick={() => { setEditing(false); setSelected(currentCollab ? currentCollab.split(" & ").map((n) => n.trim()) : []); }}
                className="h-7 px-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium hover:bg-gray-300"
              >
                Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {currentCollab ? (
              currentCollab.split(" & ").map((name) => (
                <span
                  key={name}
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full"
                  style={{ backgroundColor: getCollaboratorColor(name.trim()).bg, color: getCollaboratorColor(name.trim()).text }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: getCollaboratorColor(name.trim()).dot }} />
                  {name.trim()}
                </span>
              ))
            ) : (
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">---</p>
            )}
            <button
              onClick={() => setEditing(true)}
              className="w-6 h-6 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center"
            >
              <Pencil className="w-3 h-3 text-gray-400" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: any;
  label: string;
  value: string | number | null;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{String(value)}</p>
      </div>
    </div>
  );
}

function StatusDropdown({
  project,
  mode,
  label,
  onUpdate,
}: {
  project: Project;
  mode: "cmd" | "mesures";
  label: string;
  onUpdate: (field: string, value: string) => void;
}) {
  const isMesures = mode === "mesures";
  const statusColors = isMesures ? STATUS_MESURES_COLORS : STATUS_CMD_COLORS;
  const property = isMesures ? "État - Mesures" : "État - CMD";
  const currentStatus = isMesures ? project.etatMesures : project.etatCMD;
  const field = isMesures ? "etatMesures" : "etatCMD";
  const [saving, setSaving] = useState(false);

  const handleChange = async (newStatus: string) => {
    if (newStatus === currentStatus) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newStatus }),
      });
      if (res.ok) {
        onUpdate(field, newStatus);
        toast.success(`Statut ${label} mis à jour`);
        try {
          await fetch("/api/logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectId: project.id,
              projectName: project.projet,
              action: `Reclassification ${label}`,
              details: `${currentStatus} -> ${newStatus}`,
            }),
          });
        } catch {}
      } else {
        toast.error("Erreur lors du changement de statut");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 leading-none">
        {label}
      </span>
      <div className="flex items-center gap-1.5">
        <div className="min-w-[180px] max-w-[230px]">
          <ColoredSelect
            property={property}
            value={currentStatus || ""}
            options={Object.keys(statusColors)}
            onChange={handleChange}
            fallback={(v) => statusColors[v]}
          />
        </div>
        {saving && <span className="text-[10px] text-gray-400 animate-pulse">…</span>}
      </div>
    </div>
  );
}

/** Parse time from formats: "HH:MM" — returns minutes since midnight */
function parseTimeRaw(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  const simpleMatch = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (simpleMatch) {
    return parseInt(simpleMatch[1]) * 60 + parseInt(simpleMatch[2]);
  }
  const timeMatches = raw.match(/(\d{1,2}):(\d{2})/g);
  if (timeMatches && timeMatches.length > 0) {
    const first = timeMatches[0];
    const parts = first.split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }
  return null;
}

/**
 * Extrait la vraie heure HH:MM d'un slot cabine.
 * Format avec date : "Cab1:2026-06-03:08:30" → prend le DERNIER HH:MM du slot.
 * Format simple    : "Cab1:08:30"            → idem.
 * Le "dernier" HH:MM est toujours l'heure réelle (les parties date ne matchent pas).
 */
function extractCabineSlotTime(slot: string): number | null {
  const all = [...slot.matchAll(/(\d{2}):(\d{2})/g)];
  if (all.length === 0) return null;
  const last = all[all.length - 1];
  const h = parseInt(last[1]);
  const m = parseInt(last[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

/**
 * Calcule la durée totale (somme de toutes les cabines) et le nombre de
 * cabines mesurées, pour les deux formats heureArrivee/heureDepart :
 *  - Multi-cabine : "Cab1:2026-06-03:08:30 | Cab2:2026-06-03:09:00"
 *  - Simple HH:MM : "08:30"
 */
function parseTotalDuration(
  heureArrivee: string,
  heureDepart: string,
): { totalMins: number; cabinesCount: number } | null {
  if (!heureArrivee || !heureDepart) return null;

  // Format multi-cabine
  if (heureArrivee.includes("Cab") && heureDepart.includes("Cab")) {
    const arrSlots = heureArrivee.split("|").map((s) => s.trim());
    const depSlots = heureDepart.split("|").map((s) => s.trim());

    const toMap = (slots: string[]) => {
      const map = new Map<number, number>();
      for (const slot of slots) {
        const cabMatch = slot.match(/^Cab(\d+):/);
        if (!cabMatch) continue;
        const cabNum = parseInt(cabMatch[1]);
        const mins = extractCabineSlotTime(slot);
        if (mins !== null) map.set(cabNum, mins);
      }
      return map;
    };

    const arrMap = toMap(arrSlots);
    const depMap = toMap(depSlots);

    let totalMins = 0;
    let cabinesCount = 0;
    for (const [cabNum, arrMins] of arrMap.entries()) {
      const depMins = depMap.get(cabNum);
      if (depMins === undefined) continue;
      let diff = depMins - arrMins;
      if (diff <= 0) diff += 24 * 60;
      if (diff > 12 * 60) continue; // sanité : ignorer les durées impossibles (>12h/cabine)
      totalMins += diff;
      cabinesCount++;
    }
    if (cabinesCount === 0) return null;
    return { totalMins, cabinesCount };
  }

  // Format simple HH:MM
  const arrive = parseTimeRaw(heureArrivee);
  const depart = parseTimeRaw(heureDepart);
  if (arrive === null || depart === null) return null;
  let mins = depart - arrive;
  if (mins <= 0) mins += 24 * 60;
  return { totalMins: mins, cabinesCount: 1 };
}

/** Estimate duration for a project based on supplier + series historical data */
function estimateDuration(
  fournisseur: string,
  nbCabines: number,
  seriesCabines: string[],
  projects: Project[],
): { hours: number; minutes: number; confidence: string } | null {
  const projectsWithTime = projects
    .filter(
      (p) =>
        p.heureArrivee &&
        p.heureDepart &&
        p.heureArrivee.trim() !== "" &&
        p.heureDepart.trim() !== "",
    )
    .map((p) => {
      const duration = parseTotalDuration(p.heureArrivee, p.heureDepart);
      if (!duration) return null;
      // Utilise le nombre réel de cabines mesurées (ou nbCabines Notion si 1 seul slot)
      const cabines = Math.max(duration.cabinesCount, p.nbCabines || 1);
      const minsPerCabine = duration.totalMins / cabines;
      return { project: p, minsPerCabine };
    })
    .filter(Boolean) as { project: Project; minsPerCabine: number }[];

  // Priorité 1 : même fournisseur + même série (intersection ≥ 1 série commune)
  const hasSeries = seriesCabines.length > 0;
  const supplierSeriesProjects = hasSeries
    ? projectsWithTime.filter(
        (p) =>
          p.project.fournisseurs.includes(fournisseur) &&
          p.project.seriesCabines.some((s) => seriesCabines.includes(s)),
      )
    : [];

  // Priorité 2 : même fournisseur uniquement
  const supplierProjects = projectsWithTime.filter((p) =>
    p.project.fournisseurs.includes(fournisseur),
  );

  let avgMinsPerCabine: number;
  let confidence: string;
  const seriesLabel = seriesCabines.length > 0 ? ` – ${seriesCabines.join(", ")}` : "";

  if (supplierSeriesProjects.length >= 1) {
    // Meilleure précision : fournisseur + série (même 1 projet est plus fiable
    // que mélanger des séries différentes — ex. Easy vs Luxe)
    avgMinsPerCabine =
      supplierSeriesProjects.reduce((s, p) => s + p.minsPerCabine, 0) /
      supplierSeriesProjects.length;
    const n = supplierSeriesProjects.length;
    confidence = `${n} projet${n > 1 ? "s" : ""} ${fournisseur}${seriesLabel}`;
  } else if (supplierProjects.length >= 3) {
    // Fallback : fournisseur seul (pas de données série disponibles)
    avgMinsPerCabine =
      supplierProjects.reduce((s, p) => s + p.minsPerCabine, 0) /
      supplierProjects.length;
    confidence = `${supplierProjects.length} projets ${fournisseur}`;
  } else if (projectsWithTime.length >= 3) {
    // Dernier recours : moyenne générale
    avgMinsPerCabine =
      projectsWithTime.reduce((s, p) => s + p.minsPerCabine, 0) /
      projectsWithTime.length;
    confidence = "moyenne generale";
  } else {
    return null;
  }

  const totalMins = Math.round(avgMinsPerCabine * nbCabines);
  return {
    hours: Math.floor(totalMins / 60),
    minutes: totalMins % 60,
    confidence,
  };
}

function DurationEstimate({
  project,
}: {
  project: Project;
}) {
  const [estimate, setEstimate] = useState<{
    hours: number;
    minutes: number;
    confidence: string;
  } | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const nbCabines = project.nbCabines || 1;
    const fournisseur = project.fournisseurs?.[0];
    const seriesCabines = project.seriesCabines || [];
    if (!fournisseur) {
      setLoaded(true);
      return;
    }

    fetch("/api/projects/cmd-termine")
      .then((r) => (r.ok ? r.json() : []))
      .then((completedProjects: Project[]) => {
        const result = estimateDuration(fournisseur, nbCabines, seriesCabines, completedProjects);
        setEstimate(result);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [project.fournisseurs, project.nbCabines, project.seriesCabines]);

  if (!loaded) return null;

  if (!estimate) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        Pas assez de donnees pour estimer la duree
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm font-medium">
      <Clock className="w-4 h-4 shrink-0" />
      <span>
        Duree estimee : ~{estimate.hours}h{" "}
        {estimate.minutes.toString().padStart(2, "0")}min
      </span>
      <span className="text-[10px] font-normal opacity-70 ml-1">
        ({estimate.confidence})
      </span>
    </div>
  );
}

// Vignette « logo de fichier » classique, choisie selon l'extension.
// Rendu d'une page blanche à coin plié + étiquette colorée (style Adobe/Office).
// Découpe un champ "N° OFR TM" en numéros individuels. L'utilisateur saisit
// dans Notion un retour à la ligne après chaque numéro (TM-xxxxxxx), mais le
// HTML réduit les \n en espace. On coupe donc sur les retours à la ligne ET
// avant chaque "TM-" (au cas où ils seraient collés/espacés) pour réafficher
// un numéro par ligne.
function splitOfrNumbers(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(/\s*\n\s*|\s+(?=TM-)|(?<=\d)(?=TM-)/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

function FileTypeIcon({ name, className }: { name: string; className?: string }) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  const MAP: Record<string, { color: string; label: string }> = {
    pdf: { color: "#E4483B", label: "PDF" },
    jpg: { color: "#F59E0B", label: "JPG" },
    jpeg: { color: "#F59E0B", label: "JPG" },
    png: { color: "#0EA5E9", label: "PNG" },
    gif: { color: "#8B5CF6", label: "GIF" },
    webp: { color: "#0EA5E9", label: "WEBP" },
    heic: { color: "#0EA5E9", label: "HEIC" },
    heif: { color: "#0EA5E9", label: "HEIF" },
    svg: { color: "#EC4899", label: "SVG" },
    doc: { color: "#2563EB", label: "DOC" },
    docx: { color: "#2563EB", label: "DOC" },
    xls: { color: "#16A34A", label: "XLS" },
    xlsx: { color: "#16A34A", label: "XLS" },
    csv: { color: "#16A34A", label: "CSV" },
    ppt: { color: "#EA580C", label: "PPT" },
    pptx: { color: "#EA580C", label: "PPT" },
    zip: { color: "#6B7280", label: "ZIP" },
    rar: { color: "#6B7280", label: "RAR" },
    txt: { color: "#64748B", label: "TXT" },
    dwg: { color: "#0D9488", label: "DWG" },
    dxf: { color: "#0D9488", label: "DXF" },
  };
  const info = MAP[ext] || { color: "#64748B", label: (ext || "FILE").toUpperCase().slice(0, 4) };
  const fontSize = info.label.length >= 4 ? 4.4 : 5.6;
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Page avec coin plié */}
      <path d="M6 2h8.5L20 7.5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z" fill="#fff" stroke={info.color} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M14.5 2v4.5a1 1 0 0 0 1 1H20" stroke={info.color} strokeWidth="1.4" strokeLinejoin="round" />
      {/* Étiquette colorée débordant à gauche (look classique) */}
      <rect x="2" y="12.5" width="14.5" height="7.5" rx="1.2" fill={info.color} />
      <text x="9.25" y="18.1" textAnchor="middle" fontSize={fontSize} fontWeight="700" fill="#fff" fontFamily="Arial, Helvetica, sans-serif">{info.label}</text>
    </svg>
  );
}

function DocumentLinks({ files, label, projectId, notionField, hideLabel }: { files: { name: string; url: string }[]; label: string; projectId?: string; notionField?: string; hideLabel?: boolean }) {
  if (!files.length) return null;

  const handleOpen = (index: number, originalUrl: string) => {
    if (projectId && notionField) {
      // Use proxy to get fresh URL
      window.open(`/api/file-proxy?projectId=${projectId}&field=${encodeURIComponent(notionField)}&index=${index}`, "_blank");
    } else {
      window.open(originalUrl, "_blank");
    }
  };

  return (
    <div className={hideLabel ? "" : "mt-3"}>
      {!hideLabel && <p className="text-xs text-gray-500 mb-1.5">{label}</p>}
      <div className="space-y-1.5">
        {files.map((f, i) => (
          <button
            key={i}
            onClick={() => handleOpen(i, f.url)}
            className="w-full flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg active:bg-blue-100 text-left"
          >
            <FileTypeIcon name={f.name} className="w-5 h-5 shrink-0" />
            <span className="truncate flex-1">{f.name}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Commentaires Notion natifs ──────────────────────────────────────────────

interface NotionComment {
  id: string;
  text: string;
  createdTime: string;
  discussionId: string;
  author?: string;
}

function NotionComments({ projectId, onCountChange }: { projectId: string; onCountChange?: (n: number) => void }) {
  const [comments, setComments] = useState<NotionComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [commentsError, setCommentsError] = useState<string | null>(null);

  const loadComments = useCallback(() => {
    setCommentsError(null);
    fetch(`/api/projects/${projectId}/comments`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setComments(data);
        } else if (data?.error) {
          setCommentsError(data.error);
        }
      })
      .catch(() => setCommentsError("Impossible de charger les commentaires"))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  useEffect(() => {
    onCountChange?.(comments.length);
  }, [comments, onCountChange]);

  const handleSubmit = async () => {
    const text = newComment.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur serveur");
      }
      const created: NotionComment = await res.json();
      setComments((prev) => [...prev, created]);
      setNewComment("");
    } catch (e: any) {
      alert(e.message || "Erreur lors de l'envoi");
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Commentaires Notion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
          </div>
        ) : commentsError ? (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2.5">
            <span className="text-xs text-amber-800 dark:text-amber-200 flex-1">{commentsError}</span>
            <button
              type="button"
              onClick={loadComments}
              className="text-xs font-medium text-amber-700 dark:text-amber-300 hover:underline shrink-0"
            >
              Réessayer
            </button>
          </div>
        ) : comments.length === 0 ? (
          <p className="text-xs text-gray-400 italic">Aucun commentaire dans Notion.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-xl bg-gray-50 dark:bg-gray-800/60 px-3 py-2.5">
              {c.author && (
                <p className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 mb-1">
                  {c.author}
                </p>
              )}
              <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-wrap leading-relaxed">
                {c.text}
              </p>
              <p className="text-[10px] text-gray-400 mt-1.5">
                {new Date(c.createdTime).toLocaleDateString("fr-CH", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          ))
        )}

        {/* Formulaire d'écriture */}
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
          <textarea
            rows={3}
            className="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors"
            placeholder="Ajouter un commentaire… (⌘+Entrée pour envoyer)"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={submitting}
          />
          <div className="flex justify-end mt-2">
            <button
              onClick={handleSubmit}
              disabled={!newComment.trim() || submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold transition-colors"
            >
              {submitting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              Envoyer
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="px-4 py-8 text-center text-gray-400">Chargement...</div>}>
      <ProjectPageContent id={id} />
    </Suspense>
  );
}

function ProjectPageContent({ id }: { id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mode = searchParams.get("mode") || "cmd";
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  // Vrai quand on affiche un cache et qu'une actualisation tourne en arrière-plan.
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<"temporary" | "notfound" | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  // Confirmation persistante "Rapport envoyé" (évite les envois multiples : le
  // collaborateur voit clairement que ça a fonctionné et doit fermer la fenêtre).
  const [showSentConfirm, setShowSentConfirm] = useState(false);
  const [reformulating, setReformulating] = useState(false);
  const [reformulatingCabineIdx, setReformulatingCabineIdx] = useState<number | null>(null);
  const [missingPhotosPrompt, setMissingPhotosPrompt] = useState<{
    kind: "save" | "send";
    /** Groupes RECOMMANDÉS absents (rappel contournable). */
    missing: string[];
    /** Photos OBLIGATOIRES manquantes (avec compteur) → BLOQUE l'envoi. */
    required?: RequiredPhotoShortfall[];
    /** Si vrai, on force aussi le choix « client présent / personne sur site ». */
    needsPresence?: boolean;
  } | null>(null);
  // Demande de signature obligatoire (client présent mais pas encore signé).
  const [signatureRequiredPrompt, setSignatureRequiredPrompt] = useState(false);
  // Dernière version connue côté serveur des champs éditables texte.
  // Sert au merge intelligent du polling : si le serveur a changé ET
  // que la valeur locale correspond encore à la snapshot (= l'utilisateur
  // n'a pas modifié), on met à jour local pour voir les ajouts d'un autre
  // collaborateur. Sinon on préserve la saisie en cours et on met juste
  // à jour la snapshot pour détecter les changements suivants.
  const serverSnapshotRef = useRef<{
    rapport: string;
    commentaires: string;
    heureArrivee: string;
    heureDepart: string;
  }>({ rapport: "", commentaires: "", heureArrivee: "", heureDepart: "" });
  // Valeurs qu'on vient de sauvegarder (+ horodatage). Tant que Notion n'a pas
  // propagé l'écriture (quelques secondes), une relecture peut renvoyer l'ANCIENNE
  // valeur : ce garde empêche le polling d'écraser la saisie avec ce périmé.
  const pendingSaveRef = useRef<{
    rapport: string; commentaires: string; heureArrivee: string; heureDepart: string; ts: number;
  } | null>(null);
  // Champs projet (dates, "traité par"…) édités inline récemment : le polling ne
  // doit pas les faire "clignoter" en réaffichant une relecture Notion périmée.
  const pendingFieldsRef = useRef<Record<string, number>>({});
  // Notif discret si on n'a pas pu fusionner automatiquement (conflit).
  const [collabUpdateToast, setCollabUpdateToast] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string; email?: string } | null>(null);
  const [showRapport, setShowRapport] = useState(false);
  // ── Nouvelle présentation macOS : barre d'icônes rondes qui déplient/replient
  //    les sections. iOS/autres : présentation actuelle inchangée. ──
  const [isMac, setIsMac] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [macTabs, setMacTabs] = useState<Set<string>>(new Set());
  const [notionCommentsCount, setNotionCommentsCount] = useState(0);
  useEffect(() => {
    const ua = navigator.userAgent;
    const isTouchMac = /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
    const iOS = /iPad|iPhone|iPod/.test(ua) || isTouchMac; // iPadOS se présente comme Mac
    setIsMac(/Macintosh|Mac OS X/.test(ua) && !iOS);
    setIsIOS(iOS);
  }, []);
  // Présentation « onglets » (icônes qui déplient/replient les sections) :
  // active sur macOS (rail vertical à gauche) ET iOS (barre horizontale).
  const isTab = isMac || isIOS;
  const toggleMacTab = (id: string) => setMacTabs((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  /** true = section masquée (présentation onglets, onglet fermé). */
  const macHidden = (id: string) => isTab && !macTabs.has(id);
  // Clé de rafraîchissement pour DefautsList : incrémentée à chaque
  // nouveau défaut soumis pour forcer le rechargement des données KV.
  const [defautRefreshKey, setDefautRefreshKey] = useState(0);
  const [pieceRefreshKey, setPieceRefreshKey] = useState(0);
  const [cabineSignalements, setCabineSignalements] = useState<{
    pieces: { id: string; cabineLabel?: string }[];
    defauts: { id: string; cabineLabel?: string }[];
  }>({ pieces: [], defauts: [] });
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then((d) => {
      if (d.user) setCurrentUser(d.user);
    }).catch(() => {});
  }, []);

  // Charge les signalements (pièces + défauts) pour afficher les icônes dans les en-têtes de cabine
  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetch(`/api/pieces?projectId=${id}`).then((r) => r.ok ? r.json() : []).catch(() => []),
      fetch(`/api/defauts?projectId=${id}`).then((r) => r.ok ? r.json() : []).catch(() => []),
    ]).then(([pieces, defauts]) => {
      setCabineSignalements({ pieces: Array.isArray(pieces) ? pieces : [], defauts: Array.isArray(defauts) ? defauts : [] });
    });
  }, [id, pieceRefreshKey, defautRefreshKey]);

  const handleReformulateCabine = async (idx: number) => {
    const text = cabines[idx]?.rapport;
    if (!text?.trim()) return;
    setReformulatingCabineIdx(idx);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Reformule ce texte de rapport de montage de cabine de douche de manière professionnelle, claire et concise. Garde le sens exact mais améliore la formulation. Réponds uniquement avec le texte reformulé, sans introduction ni commentaire :\n\n${text}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.answer || data.response) {
          setCabines((prev) =>
            prev.map((c, i) => i === idx ? { ...c, rapport: (data.answer || data.response).trim() } : c)
          );
          scheduleAutoSave();
        }
      }
    } catch {} finally {
      setReformulatingCabineIdx(null);
    }
  };

  const handleReformulate = async () => {
    if (!rapport.trim()) return;
    setReformulating(true);
    try {
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: `Reformule ce texte de rapport de montage de cabines de douche de manière professionnelle, claire et concise. Garde le sens exact mais améliore la formulation. Réponds uniquement avec le texte reformulé, sans introduction ni commentaire :\n\n${rapport}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.answer || data.response) {
          setRapport((data.answer || data.response).trim());
        }
      }
    } catch {} finally {
      setReformulating(false);
    }
  };

  const [heureArrivee, setHeureArrivee] = useState("");
  const [heureDepart, setHeureDepart] = useState("");
  const [commentaires, setCommentaires] = useState("");
  const [rapport, setRapport] = useState("");
  const [cabines, setCabines] = useState<{ nom: string; rapport: string; open: boolean; monteur: string; arrivee: string; depart: string; date: string; activeTab: "infos" | "photos" | "signalements" | "rapport" | "sav"; qrEnabled: boolean; garantieEnabled: boolean }[]>([]);
  const [isCabineMode, setIsCabineMode] = useState(false);
  const [expandedCabineDate, setExpandedCabineDate] = useState<string | null>(null);
  const [rapportModalCabineIdx, setRapportModalCabineIdx] = useState<number | null>(null);
  const [resetConfirmIdx, setResetConfirmIdx] = useState<number | null>(null);
  const [showRapportGeneral, setShowRapportGeneral] = useState(false);
  const [showRapportRequiredModal, setShowRapportRequiredModal] = useState(false);
  const [monoActiveTab, setMonoActiveTab] = useState<"rapport" | "photos">("rapport");

  // ── Auto-fill depuis email connecté (hors admin) ──────────────────────────
  const EMAIL_TO_COLLAB: Record<string, string> = {
    "tm.douche.montage.1@gmail.com": "Claudio",
    "tm.douche.montage.2@gmail.com": "Jean-Marc",
    "tm.douche.montage.3@gmail.com": "Jacobo",
    "tm.douche.montage.4@gmail.com": "Miguel",
    "tm.douche.montage.5@gmail.com": "Loïc",
  };
  const autoCollab = currentUser?.email ? (EMAIL_TO_COLLAB[currentUser.email] ?? null) : null;

  // ── Recherche de lot (projets à nombreuses cabines) ──────────────────────
  const [cabineSearch, setCabineSearch] = useState("");
  const [showOnlySignalements, setShowOnlySignalements] = useState(false); // filtre lots avec pièce/défaut
  const [showOnlyRapport, setShowOnlyRapport] = useState(false); // filtre lots avec rapport personnalisé
  const [showOnlySav, setShowOnlySav] = useState(false); // filtre lots avec SAV / retouche
  const [heuresFilterCollab, setHeuresFilterCollab] = useState(""); // filtre : clic sur un collaborateur du suivi des heures
  const [showSignalementsCard, setShowSignalementsCard] = useState(false); // carte « Signalements enregistrés » repliable
  const [showSignatureCard, setShowSignatureCard] = useState(false); // carte « Signature du client » repliable
  /** Déplie et fait défiler jusqu'au lot correspondant (nom de cabine). */
  const jumpToCabine = (query: string) => {
    const q = query.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return;
    const idx = cabines.findIndex(
      (c) => (c.nom || "").toLowerCase().replace(/\s+/g, "").includes(q),
    );
    if (idx < 0) { toast.error(`Lot « ${query.trim()} » introuvable`); return; }
    setCabines((prev) => prev.map((c, i) => (i === idx ? { ...c, open: true } : c)));
    setTimeout(() => {
      document.querySelector(`[data-cabineidx="${idx}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };
  /** Ouvre et fait défiler jusqu'au lot d'index donné (clic depuis le suivi des
   *  heures). On lève le filtre « Avec signalement » pour ne pas masquer la carte. */
  const openCabineByIndex = (idx: number) => {
    if (idx < 0) return;
    setShowOnlySignalements(false);
    setShowOnlyRapport(false);
    setShowOnlySav(false);
    setCabines((prev) => prev.map((c, i) => (i === idx ? { ...c, open: true } : c)));
    setTimeout(() => {
      document.querySelector(`[data-cabineidx="${idx}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };

  // ── Drag-and-drop reorder cabines ────────────────────────────────────────
  const [cabineDragMode, setCabineDragMode] = useState(false);
  const [dragCabSrc, setDragCabSrc] = useState<number | null>(null);
  const [dragCabOver, setDragCabOver] = useState<number | null>(null);
  const cabineLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cabineTouchSrcRef = useRef<number | null>(null);
  const nomKvDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Garde-fou anti-revert CDN.
   *
   * Quand l'admin modifie un nom de cabine, on stocke l'index + timestamp.
   * Le refetch (15 s) ne doit PAS écraser ce nom pendant 60 s — le CDN
   * (s-maxage=15) peut retourner de l'ancienne donnée dans cette fenêtre et
   * provoquer un revert de l'état local → la prochaine édition d'une autre
   * cabine inclurait le nom réverté dans son PATCH, écrasant Notion.
   */
  const dirtyNomRef = useRef<Map<number, number>>(new Map()); // cabIndex(0-based) → Date.now()
  /** Timestamp du dernier reset par cabine.
   *  Protège les cabines réinitialisées contre la restauration par le polling
   *  (monteur) ou initProject (heures/date) pendant 10 minutes. */
  const resetCabinesRef = useRef<Map<number, number>>(new Map()); // cabIndex → Date.now()
  // ── Auto-save en arrière-plan ─────────────────────────────────────────────
  // Référence vers les données actuelles pour éviter les stale closures dans
  // le timer de debounce. Mise à jour à chaque render (avant le return).
  const latestSaveDataRef = useRef<{
    rapport: string;
    commentaires: string;
    heureArrivee: string;
    heureDepart: string;
    cabines: typeof cabines;
    isCabineMode: boolean;
    isMultiDay: boolean;
    pointages: typeof pointages;
  }>({
    rapport: "", commentaires: "", heureArrivee: "", heureDepart: "",
    cabines: [], isCabineMode: false, isMultiDay: false, pointages: [],
  });
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Garde-fou : stocke l'id du projet dont les noms ont déjà été initialisés.
   *  Empêche le 2e appel initProject (données fraîches Notion) d'écraser les
   *  noms personnalisés déjà chargés depuis localStorage ou l'API KV. */
  const cabinesInitializedRef = useRef<string | null>(null);
  /** Garde-fou : id du projet dont les champs ÉDITABLES (rapport, heures,
   *  pointages) ont déjà été initialisés. Empêche le 2e appel initProject
   *  (fetch frais après le cache) d'écraser la saisie en cours. */
  const editablesInitializedRef = useRef<string | null>(null);
  /** Dernier count envoyé à Notion pour éviter les PATCH redondants. */
  const lastSyncedInstalledRef = useRef<number>(-1);

  const reorderCabines = (srcIdx: number, dstIdx: number) => {
    if (srcIdx === dstIdx) return;
    setCabines(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(srcIdx, 1);
      arr.splice(dstIdx, 0, moved);
      // Persiste le nouvel ordre des noms ET monteurs dans localStorage + KV
      try {
        localStorage.setItem(`tm-cabin-noms-${id}`, JSON.stringify(arr.map((c) => c.nom)));
        localStorage.setItem(`tm-cabin-monteurs-${id}`, JSON.stringify(arr.map((c) => c.monteur)));
      } catch {}
      const nomsEnc = arr.map((c, i) => `Cab${i + 1}:${c.nom || `Cabine ${i + 1}`}`).join(" | ");
      const attrEnc = arr.map((c, i) => `Cab${i + 1}:${c.monteur || ""}`).join(" | ");
      offlineFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomsCabines: nomsEnc, attributionCabines: attrEnc }),
      }).catch(() => {});
      return arr;
    });
  };
  /**
   * Planifie une sauvegarde silencieuse en arrière-plan (debounce 2 s).
   * Appelée à chaque modification utilisateur — le bouton Enregistrer reste
   * disponible comme filet de sécurité. Pas de toast, pas de setSaving.
   */
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      const {
        rapport, commentaires, heureArrivee, heureDepart,
        cabines: cab, isCabineMode: cabMode, isMultiDay: multiDay, pointages: pts,
      } = latestSaveDataRef.current;
      if (!id) return; // projet pas encore chargé

      const reportToSave = cabMode
        ? [rapport.trim(), buildCabineReportLines(cab)].filter(Boolean).join("\n\n")
        : rapport;

      const arriveeToSave = cabMode
        ? cab.map((c, i) => {
            // N'inclure la cabine QUE si l'heure est renseignée.
            // Sans ça, une cabine avec date mais sans heure génère
            // "Cab2:2026-06-09:" qui écrase l'heure réelle côté serveur.
            if (!c.arrivee) return "";
            const ds = c.date ? `${c.date}:` : "";
            return `Cab${i + 1}:${ds}${c.arrivee}`;
          }).filter(Boolean).join(" | ")
        : multiDay
          ? pts.map((p) => `${p.date} ${p.collaborateur} ${p.arrivee}`).join(" | ")
          : heureArrivee;

      const departToSave = cabMode
        ? cab.map((c, i) => {
            // Idem : on n'envoie rien si l'heure de départ est vide.
            if (!c.depart) return "";
            const ds = c.date ? `${c.date}:` : "";
            return `Cab${i + 1}:${ds}${c.depart}`;
          }).filter(Boolean).join(" | ")
        : multiDay
          ? pts.map((p) => `${p.date} ${p.collaborateur} ${p.depart}`).join(" | ")
          : heureDepart;

      // ── Attribution monteurs : ré-affirmation continue (auto-réparation) ──────
      // MÊME PRINCIPE QUE LES HEURES : on ré-envoie l'attribution à chaque
      // autosave pour qu'elle ne disparaisse JAMAIS de Notion (bug récurrent :
      // le monteur était écrit une seule fois puis jamais réécrit → toute perte
      // était définitive, contrairement aux heures qui se réparent seules).
      //
      // SÉCURITÉ ANTI-ÉCRASEMENT (2 niveaux) :
      //  1. On n'inclut QUE les slots non-vides → jamais de rétrogradation d'un
      //     monteur existant (les slots vides ne sont pas envoyés).
      //  2. On n'ajoute la clé `attributionCabines` QUE si la chaîne contient au
      //     moins un "Cab" — car le merge serveur écrase Notion si l'entrant ne
      //     contient pas "Cab" (chaîne vide = wipe). Donc si aucun monteur en
      //     mémoire, on n'envoie rien du tout.
      // Le merge serveur (mergeCabineAttribution) ignore de toute façon les
      // slots absents et ne touche qu'aux cabines fournies non-vides.
      const attributionToSave = cabMode
        ? cab
            .map((c, i) => (c.monteur && c.monteur.trim() ? `Cab${i + 1}:${c.monteur.trim()}` : ""))
            .filter(Boolean)
            .join(" | ")
        : "";

      const patchBody: Record<string, unknown> = {
        heureArrivee: arriveeToSave,
        heureDepart: departToSave,
        commentairesMontages: commentaires,
        rapportMonteur: reportToSave,
      };
      if (attributionToSave.includes("Cab")) {
        patchBody.attributionCabines = attributionToSave;
      }

      // PATCH Notion en arrière-plan — erreurs silencieuses
      offlineFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      }).catch(() => {});

      if (cabMode) {
        // Backup localStorage. L'attribution monteurs est en plus ré-affirmée
        // dans le PATCH ci-dessus (auto-réparation, slots non-vides uniquement).
        // Les NOMS de cabines restent volontairement HORS autosave : contrairement
        // au monteur, un nom vide/​par défaut est ambigu et un ré-envoi périmé
        // pourrait écraser un renommage admin récent → on les laisse à leur
        // handler dédié (onChange).
        try {
          localStorage.setItem(`tm-cabin-noms-${id}`, JSON.stringify(cab.map((c, i) => c.nom || `Cabine ${i + 1}`)));
          localStorage.setItem(`tm-cabin-monteurs-${id}`, JSON.stringify(cab.map((c) => c.monteur)));
        } catch {}
      }

      // Aligner le snapshot pour que le polling ne détecte pas de faux conflit
      serverSnapshotRef.current = {
        rapport: reportToSave,
        commentaires,
        heureArrivee: arriveeToSave,
        heureDepart: departToSave,
      };
      // Mémoriser ce qu'on vient de sauver : le polling ignorera une relecture
      // Notion périmée (encore l'ancienne valeur) tant que ce n'est pas propagé.
      pendingSaveRef.current = {
        rapport: reportToSave,
        commentaires,
        heureArrivee: arriveeToSave,
        heureDepart: departToSave,
        ts: Date.now(),
      };
      invalidateApiCache();
    }, 2000); // 2 s de debounce
  }, [id]); // id stable pour toute la durée du projet ; latestSaveDataRef est lu au moment du fire

  const [signature, setSignature] = useState("");

  // Restaure la signature depuis le localStorage tant que le projet n'a
  // pas encore été chargé. Filet de sécurité au cas où Notion / cache
  // serveur tarderaient à propager une signature fraîchement enregistrée.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`tm-sig-${id}`);
      if (stored) setSignature((cur) => cur || stored);
    } catch {}
  }, [id]);

  // Sauvegarde locale dès qu'on a une signature non-vide. La signature
  // est une preuve légale d'acceptation des travaux : on la persiste
  // localement en plus de Notion pour qu'elle survive à un rechargement
  // ou un cache serveur incohérent.
  useEffect(() => {
    if (signature) {
      try { localStorage.setItem(`tm-sig-${id}`, signature); } catch {}
    }
  }, [signature, id]);

  // Synchronisation depuis project.signatureUrl :
  //   - Si le serveur a une URL non-vide → on adopte cette URL
  //     (canonique, lisible par le PDF). Replace la valeur locale,
  //     même si elle était un data-URL temporaire.
  //   - Si le serveur renvoie une chaîne vide alors qu'on a déjà une
  //     signature locale → on NE TOUCHE PAS au state local (Notion
  //     peut avoir un délai de propagation, ne pas effacer la preuve).
  useEffect(() => {
    if (project?.signatureUrl) {
      setSignature((cur) => (cur === project.signatureUrl ? cur : project.signatureUrl));
    }
  }, [project?.signatureUrl]);
  const [fav, setFav] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showHeuresCard, setShowHeuresCard] = useState(false);
  const [downloadingPhotos, setDownloadingPhotos] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingFiche, setDownloadingFiche] = useState(false);
  const [copyingFicheLink, setCopyingFicheLink] = useState(false);
  // Quel type de rapport est en cours (pour n'animer que le bon bouton) :
  // "interne" (avec heures) ou "client" (sans heures).
  const [sendKind, setSendKind] = useState<null | "interne" | "client">(null);
  const [downloadKind, setDownloadKind] = useState<null | "interne" | "client">(null);
  // Fenêtre de choix interne/client (déclenchée par les icônes du header qui
  // reprennent les fonctions Envoyer / Actualiser-télécharger).
  const [audienceChoice, setAudienceChoice] = useState<null | "send" | "download">(null);
  // Mémorise le type demandé (interne/client) pour le propager à travers les
  // fenêtres de confirmation (photos manquantes / signature) qui rappellent
  // handleSendReport sans l'argument d'origine.
  const pendingSendClientRef = useRef(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(60);
  const [headerScrollOpacity, setHeaderScrollOpacity] = useState(1);

  useEffect(() => { setFav(isFavorite(id)); }, [id]);

  // Header translucide au scroll (mode rapport uniquement) : plus on descend,
  // plus la barre titre devient transparente pour laisser voir le contenu
  // derrière. Plancher à 0.4 pour rester lisible/cliquable.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!showRapport) { setHeaderScrollOpacity(1); return; }
    const onScroll = () => {
      const y = window.scrollY || 0;
      setHeaderScrollOpacity(Math.max(0.4, 1 - y / 320));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [showRapport]);

  // Scroll automatique vers la liste des cabines quand la page est ouverte
  // depuis le portail client via "Saisir rapport".
  // Mécanisme : sessionStorage flag "tm-goto-<id>" = "cabines" posé par le
  // portail avant navigation. On relit + efface ici, puis on scrolle dès que
  // la liste est rendue (isCabineMode = true + DOM prêt). On retente 3× avec
  // des délais croissants pour absorber les temps de rendu variables sur mobile.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `tm-goto-${id}`;
    let target: string | null = null;
    try { target = sessionStorage.getItem(key); } catch {}
    if (target !== "cabines") return;
    if (!isCabineMode) return;

    // Efface immédiatement pour ne pas re-scroller à chaque re-render
    try { sessionStorage.removeItem(key); } catch {}

    const scrollToCabines = () => {
      const el = document.getElementById("cabines-list");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    // 3 tentatives avec délais croissants (rendu mobile peut être lent)
    const t1 = setTimeout(scrollToCabines, 200);
    const t2 = setTimeout(scrollToCabines, 700);
    const t3 = setTimeout(scrollToCabines, 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [id, isCabineMode]);

  // ── Sync "Nb. Cabines installées" → Notion ──────────────────────────────────
  // Dès qu'une cabine reçoit ses photos de montage, on met à jour le compteur
  // dans Notion afin que la progression soit visible depuis la base de données.
  // On utilise un ref pour n'envoyer un PATCH que lorsque le count CHANGE
  // réellement (évite les appels redondants lors des re-renders normaux).
  useEffect(() => {
    if (!isCabineMode || !id) return;
    const montagePhotos = project?.photosMontage || [];
    const count = new Set(
      montagePhotos
        .map((f) => { const m = f.name?.match(/\.Cab(\d+)\./); return m ? parseInt(m[1], 10) : null; })
        .filter((n): n is number => n !== null)
    ).size;
    // Au 1er passage, on cale le repère sur la valeur DÉJÀ enregistrée dans
    // Notion (ou 0). Sans ça, le ref démarrait à -1 → un PATCH redondant partait
    // à CHAQUE ouverture du projet, même sans changement (et apparaissait dans
    // le bandeau de synchro si le réseau venait juste de se connecter).
    if (lastSyncedInstalledRef.current === -1) {
      lastSyncedInstalledRef.current = project?.nbCabinesInstallees ?? 0;
    }
    if (count === lastSyncedInstalledRef.current) return; // pas de changement réel
    lastSyncedInstalledRef.current = count;
    offlineFetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nbCabinesInstallees: count }),
    }).catch(() => {});
  }, [project?.photosMontage, isCabineMode, id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const header = document.getElementById("main-header");
    if (header) setHeaderHeight(header.offsetHeight);
  }, []);

  interface PointageEntry {
    date: string;
    collaborateur: string;
    arrivee: string;
    depart: string;
  }
  const COLLABORATEURS_LIST = ["Micael", "Claudio", "Jean-Marc", "Jacobo", "Miguel", "Loïc"];
  const today = new Date().toISOString().split("T")[0];
  const [pointages, setPointages] = useState<PointageEntry[]>([]);
  const [isMultiDay, setIsMultiDay] = useState(false);

  // ── Auto-remplissage depuis la prise de photo ─────────────────────────────
  // Déclenché dès que l'utilisateur sélectionne des fichiers dans un champ
  // photo du rapport. Ne remplace jamais une valeur déjà saisie manuellement.
  // Ignoré si l'utilisateur connecté est ferreira.micael@gmail.com.
  const handleAutoFill = useCallback((
    bucket: PhotoBucketKey,
    captureTime: string,
    cabineIdx?: number,
  ) => {
    // Sauvegarde silencieuse en arrière-plan après CHAQUE upload photo : le
    // rapport (texte, heures, cabines) est persisté automatiquement, sans toast
    // ni spinner (debounce 2 s). Le bouton « Enregistrer le rapport » devient un
    // simple filet de sécurité au cas où une sauvegarde aurait échoué.
    scheduleAutoSave();
    const userCollab = autoCollab;
    const todayStr = new Date().toISOString().split("T")[0];
    const isMontageOrAfter = (b: string) =>
      ["MONTAGE_GAUCHE", "MONTAGE_CENTRE", "MONTAGE_DROITE", "APRES_INTERVENTION"].includes(b);

    if (isCabineMode && cabineIdx !== undefined) {
      const idx0 = cabineIdx - 1; // cabineIdx est 1-based
      const next = cabines.map((c, i) => {
        if (i !== idx0) return c;
        const u = { ...c };
        // Jour du montage : toujours rempli avec aujourd'hui si vide
        if (!u.date) u.date = todayStr;
        // Heure d'arrivée : photos avant intervention
        if (bucket === "AVANT_INTERVENTION" && !u.arrivee) u.arrivee = captureTime;
        // Heure de départ : photos montage ou après intervention
        if (isMontageOrAfter(bucket) && !u.depart) u.depart = captureTime;
        // Monteur responsable : utilisateur actuel (si non admin)
        if (userCollab && !u.monteur) u.monteur = userCollab;
        return u;
      });
      const changed = next.some((c, i) =>
        c.date !== cabines[i].date ||
        c.arrivee !== cabines[i].arrivee ||
        c.depart !== cabines[i].depart ||
        c.monteur !== cabines[i].monteur
      );
      if (!changed) return;
      setCabines(next);
      // Ouvrir le modal rapport après upload montage/après (uniquement si pas déjà rempli)
      if (isMontageOrAfter(bucket) && !cabines[idx0]?.rapport) {
        setRapportModalCabineIdx(idx0);
      }
      // PATCH heures immédiatement
      const arriveeStr = next
        .map((c, i) => (!c.arrivee && !c.date ? "" : `Cab${i + 1}:${c.date ? `${c.date}:` : ""}${c.arrivee}`))
        .filter(Boolean).join(" | ");
      const departStr = next
        .map((c, i) => (!c.depart && !c.date ? "" : `Cab${i + 1}:${c.date ? `${c.date}:` : ""}${c.depart}`))
        .filter(Boolean).join(" | ");
      offlineFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heureArrivee: arriveeStr, heureDepart: departStr }),
      }).catch(console.error);
      // PATCH attribution si monteur auto-assigné
      if (userCollab && next[idx0].monteur !== cabines[idx0].monteur) {
        // Envoie uniquement la cabine auto-assignée, pas toutes les cabines,
        // pour éviter d'écraser d'autres attributions avec un état local périmé.
        const autoAttrEnc = `Cab${idx0 + 1}:${next[idx0].monteur || ""}`;
        offlineFetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attributionCabines: autoAttrEnc }),
        }).catch(console.error);
      }
    } else if (isMultiDay) {
      // Multi-interventions (mono-cabine) : NE JAMAIS écraser la chaîne de
      // pointages avec une heure unique (bug : les horaires étaient perdus dès
      // qu'on uploadait une photo). On remplit la 1re intervention sans heure.
      if (bucket === "AVANT_INTERVENTION") {
        setPointages((prev) => {
          const i = prev.findIndex((p) => !p.arrivee);
          if (i < 0) return prev;
          const next = [...prev];
          next[i] = { ...next[i], arrivee: captureTime, date: next[i].date || todayStr };
          return next;
        });
        scheduleAutoSave();
      }
      if (isMontageOrAfter(bucket)) {
        setPointages((prev) => {
          const i = prev.findIndex((p) => !p.depart);
          if (i < 0) return prev;
          const next = [...prev];
          next[i] = { ...next[i], depart: captureTime, date: next[i].date || todayStr };
          return next;
        });
        scheduleAutoSave();
      }
      if (userCollab && !project?.collaborateurs) {
        setProject((prev) => prev ? { ...prev, collaborateurs: userCollab } : prev);
        offlineFetch(`/api/projects/${id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collaborateurs: userCollab }),
        }).catch(console.error);
      }
    } else {
      // Mode simple (1 cabine)
      if (bucket === "AVANT_INTERVENTION" && !heureArrivee) {
        setHeureArrivee(captureTime);
        offlineFetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ heureArrivee: captureTime }),
        }).catch(console.error);
      }
      if (isMontageOrAfter(bucket) && !heureDepart) {
        setHeureDepart(captureTime);
        offlineFetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ heureDepart: captureTime }),
        }).catch(console.error);
      }
      // Collaborateur (field "collaborateurs" in Notion)
      if (userCollab && !project?.collaborateurs) {
        setProject((prev) => prev ? { ...prev, collaborateurs: userCollab } : prev);
        offlineFetch(`/api/projects/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ collaborateurs: userCollab }),
        }).catch(console.error);
      }
    }
  }, [isCabineMode, cabines, autoCollab, isMultiDay, heureArrivee, heureDepart, project?.collaborateurs, id, scheduleAutoSave]);

  const addPointage = () => {
    setPointages((prev) => [...prev, { date: today, collaborateur: "", arrivee: "", depart: "" }]);
    scheduleAutoSave();
  };
  const updatePointage = (idx: number, field: keyof PointageEntry, value: string) => {
    setPointages((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
    scheduleAutoSave();
  };
  const removePointage = (idx: number) => {
    setPointages((prev) => prev.filter((_, i) => i !== idx));
    scheduleAutoSave();
  };

  // ── Filet de sécurité anti-perte des interventions (mono-cabine) ──────────
  // Sauvegarde locale immédiate des pointages : si une écriture Notion se perd
  // (réseau, race, reload), la liste est restaurée au chargement (voir plus bas
  // dans initProject). Reflète aussi les suppressions (donc pas de résurrection).
  useEffect(() => {
    if (isCabineMode || typeof window === "undefined") return;
    try {
      if (isMultiDay && pointages.length > 0) {
        localStorage.setItem(`tm-pointages-${id}`, JSON.stringify(pointages));
      } else if (!isMultiDay) {
        localStorage.removeItem(`tm-pointages-${id}`);
      }
    } catch {}
  }, [pointages, isMultiDay, isCabineMode, id]);

  // ── Bascule mode simple ⇆ plusieurs interventions (mono-cabine) ──────────────
  // Active le tableau de pointages (date + collaborateur(s) + heures) pour un
  // montage qui a nécessité plusieurs déplacements. La 1re ligne reprend les
  // heures déjà saisies + les collaborateurs du montage.
  const enableMultiInterventions = () => {
    setPointages((prev) => {
      if (prev.length) return prev;
      // Si les heures sont déjà au format daté (relecture serveur d'une 1re
      // intervention), on les parse pour ne rien perdre ; sinon on crée la 1re
      // intervention à partir des heures simples affichées.
      if (isMultiDayHours(heureArrivee, heureDepart)) {
        const pts = parsePointages(heureArrivee, heureDepart);
        if (pts.length) return pts;
      }
      return [{
        date: project?.dateMontage?.slice(0, 10) || today,
        collaborateur: project?.collaborateurs || "",
        arrivee: heureArrivee || "",
        depart: heureDepart || "",
      }];
    });
    setIsMultiDay(true);
    scheduleAutoSave();
  };
  // Revient au mode simple : conserve les heures de la 1re intervention.
  const disableMultiInterventions = () => {
    const first = pointages[0];
    setHeureArrivee(first?.arrivee || "");
    setHeureDepart(first?.depart || "");
    setIsMultiDay(false);
    setPointages([]);
    scheduleAutoSave();
  };

  const initProject = (data: any) => {
    if (!data?.id) return;
    setProject((prev) => {
      if (!prev) return data;
      // Préserve les champs édités inline récemment (grâce 30 s) pour ne pas
      // réafficher une relecture Notion périmée.
      const incoming = { ...data } as Record<string, unknown>;
      const now = Date.now();
      for (const [field, ts] of Object.entries(pendingFieldsRef.current)) {
        if (now - ts < 30000) incoming[field] = (prev as unknown as Record<string, unknown>)[field];
        else delete pendingFieldsRef.current[field];
      }
      return incoming as typeof data;
    });

    // Fusion anti-écrasement des champs éditables.
    // 1er chargement de ce projet → on pose les valeurs serveur.
    // Rechargements suivants (fetch frais après cache) → on ne réécrit un champ
    // QUE si l'utilisateur n'y a pas touché depuis la dernière snapshot, sinon
    // on effacerait sa saisie en cours (bug : le rapport tapé disparaissait).
    const firstInit = editablesInitializedRef.current !== data.id;
    editablesInitializedRef.current = data.id;
    const prevSnap = { ...serverSnapshotRef.current };
    const sRapportRaw = data.rapportMonteur || "";
    // ── Rapport général : on SÉPARE la partie générale des lignes PAR LOT. ──
    // Les lignes « Nom : texte » deviennent la propriété de chaque cabine (source
    // de vérité → tri auto, renommage auto, gras) ; la zone « Rapport général »
    // ne conserve que le texte général. `splitPerCabine` alimente les cabines.
    const nbForSplit = data.nbCabines || 1;
    let splitPerCabine: Record<number, string> = {};
    let sRapport = sRapportRaw;
    if (nbForSplit > 1) {
      const nomsMapEarly = new Map<number, string>();
      { const re = /Cab(\d+)\s*:([^|]*)/g; let mm: RegExpExecArray | null;
        while ((mm = re.exec(data.nomsCabines || ""))) nomsMapEarly.set(parseInt(mm[1], 10), mm[2].trim()); }
      let storedNomsEarly: string[] | null = null;
      try { const s = localStorage.getItem(`tm-cabin-noms-${data.id}`); if (s) storedNomsEarly = JSON.parse(s); } catch {}
      const nomsForSplit = Array.from({ length: nbForSplit }, (_, i) => {
        const nn = nomsMapEarly.get(i + 1) || "";
        return (nn && nn !== `Cabine ${i + 1}`) ? nn : (storedNomsEarly?.[i] || `Cabine ${i + 1}`);
      });
      const sp = splitRapportByCabine(sRapportRaw, nomsForSplit);
      sRapport = sp.general;
      splitPerCabine = sp.perCabine;
    }
    const sCommentaires = data.commentairesMontages || "";
    const sHA = data.heureArrivee || "";
    const sHD = data.heureDepart || "";
    if (firstInit) {
      setRapport(sRapport);
      setCommentaires(sCommentaires);
      setHeureArrivee(sHA);
      setHeureDepart(sHD);
      serverSnapshotRef.current = {
        rapport: sRapport, commentaires: sCommentaires, heureArrivee: sHA, heureDepart: sHD,
      };
    } else {
      // Rechargement : ne réécrire un champ que si l'utilisateur n'y a pas
      // touché ET si le serveur n'est pas une relecture périmée de ce qu'on
      // vient de sauver (fenêtre de grâce). Sinon on garde la valeur sauvée.
      const pend = pendingSaveRef.current;
      const grace = !!(pend && Date.now() - pend.ts < 30000);
      const merge = (
        serverVal: string,
        key: "rapport" | "commentaires" | "heureArrivee" | "heureDepart",
        setter: React.Dispatch<React.SetStateAction<string>>,
      ): string => {
        if (grace && pend && serverVal !== pend[key]) return pend[key]; // périmé → garde le sauvé
        setter((cur) => (cur === prevSnap[key] ? serverVal : cur));
        return serverVal;
      };
      serverSnapshotRef.current = {
        rapport: merge(sRapport, "rapport", setRapport),
        commentaires: merge(sCommentaires, "commentaires", setCommentaires),
        heureArrivee: merge(sHA, "heureArrivee", setHeureArrivee),
        heureDepart: merge(sHD, "heureDepart", setHeureDepart),
      };
    }
    const nb = data.nbCabines || 1;
    if (nb > 1) {
      setIsCabineMode(true);
      setIsMultiDay(true);
      // Parse les heures stockées au format "Cab1:08:00 | Cab2:09:30..." si
      // la valeur Notion est sous cette forme (multi-cabine). Sinon laisse
      // les heures par cabine vides et la valeur brute ira côté multi-day.
      const parseCabineTimes = (raw: string): Record<number, string> => {
        const map: Record<number, string> = {};
        if (!raw) return map;
        // Gère l'ancien format "Cab1:08:00" et le nouveau "Cab1:2026-05-02:08:00"
        const re = /Cab(\d+)\s*:(?:\d{4}-\d{2}-\d{2}:)?(\d{1,2}:\d{2})/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(raw))) {
          map[parseInt(m[1], 10) - 1] = m[2];
        }
        return map;
      };
      const parseCabineDates = (raw: string): Record<number, string> => {
        const map: Record<number, string> = {};
        if (!raw) return map;
        const re = /Cab(\d+)\s*:(\d{4}-\d{2}-\d{2}):/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(raw))) {
          map[parseInt(m[1], 10) - 1] = m[2];
        }
        return map;
      };
      const arriveeMap = parseCabineTimes(data.heureArrivee || "");
      const departMap = parseCabineTimes(data.heureDepart || "");
      const dateMap = parseCabineDates(data.heureArrivee || "");

      // ── Décodage des propriétés Notion (source de vérité principale) ─────────
      // "Lot (nom de cabine)"   → "Cab1:Apt 28F | Cab2:Apt 28A | ..."
      // "Monteur responsable"   → "Cab1:Micael | Cab2:Claudio | ..."
      const parseNotionCabineField = (raw: string): Map<number, string> => {
        const map = new Map<number, string>();
        if (!raw) return map;
        const re = /Cab(\d+)\s*:([^|]*)/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(raw))) {
          const val = m[2].trim();
          map.set(parseInt(m[1], 10), val);
        }
        return map;
      };
      const notionNomsMap = parseNotionCabineField(data.nomsCabines || "");
      const notionAttrMap = parseNotionCabineField(data.attributionCabines || "");
      const notionHasNoms = data.nomsCabines && data.nomsCabines.includes("Cab");
      const notionHasAttr = data.attributionCabines && data.attributionCabines.includes("Cab");

      // ── Restauration depuis localStorage (cache immédiat, évite le flash) ─────
      let storedNoms: string[] | null = null;
      let storedMonteurs: string[] | null = null;
      try {
        const s = localStorage.getItem(`tm-cabin-noms-${data.id}`);
        if (s) storedNoms = JSON.parse(s);
      } catch {}
      try {
        const s = localStorage.getItem(`tm-cabin-monteurs-${data.id}`);
        if (s) storedMonteurs = JSON.parse(s);
      } catch {}

      const alreadyInit = cabinesInitializedRef.current === data.id;

      if (!alreadyInit) {
        // Premier appel pour ce projet — initialisation complète.
        // Priorité : Notion > localStorage > défaut
        cabinesInitializedRef.current = data.id;
        setCabines(
          Array.from({ length: nb }, (_, i) => {
            const notionNom = notionNomsMap.get(i + 1) || "";
            const notionMonteur = notionAttrMap.get(i + 1) || "";
            const notionNomIsCustom = notionNom && notionNom !== `Cabine ${i + 1}`;
            return {
              nom: notionNomIsCustom
                ? notionNom
                : storedNoms?.[i] || `Cabine ${i + 1}`,
              rapport: splitPerCabine[i] || "",
              open: false,
              monteur: notionMonteur || storedMonteurs?.[i] || "",
              arrivee: arriveeMap[i] || "",
              depart: departMap[i] || "",
              date: dateMap[i] || "",
              activeTab: "infos" as const,
              qrEnabled: false,
              garantieEnabled: false,
            };
          })
        );
      } else {
        // Second appel (données fraîches Notion) — mise à jour complète.
        // Notion est la source de vérité : on applique ses valeurs si présentes.
        // Exception : cabine récemment réinitialisée (< 10 min) → on préserve l'état
        // local vide pour ne pas annuler un reset dont le PATCH n'a pas encore été
        // confirmé par Notion (queue offline, rate-limit, etc.).
        const nowInit = Date.now();
        const RESET_PROTECT_MS = 10 * 60 * 1000;
        setCabines((prev) =>
          prev.map((c, i) => {
            const notionNom = notionNomsMap.get(i + 1) || "";
            const notionMonteur = notionAttrMap.get(i + 1) || "";
            const notionNomIsCustom = notionNom && notionNom !== `Cabine ${i + 1}`;
            const resetAt = resetCabinesRef.current.get(i);
            const recentlyReset = resetAt && (nowInit - resetAt < RESET_PROTECT_MS);
            return {
              ...c,
              nom: notionNomIsCustom ? notionNom : c.nom,
              // Si cabine récemment réinitialisée : on garde les valeurs locales vides
              monteur: recentlyReset ? c.monteur : (notionMonteur || c.monteur || storedMonteurs?.[i] || ""),
              arrivee: recentlyReset ? c.arrivee : (arriveeMap[i] !== undefined ? arriveeMap[i] : c.arrivee),
              depart:  recentlyReset ? c.depart  : (departMap[i]  !== undefined ? departMap[i]  : c.depart),
              date:    recentlyReset ? c.date    : (dateMap[i]    !== undefined ? dateMap[i]    : c.date),
              // Rapport par lot : on garde l'édition locale en cours (non vide) ;
              // sinon on prend la valeur serveur (issue du découpage du rapport).
              rapport: recentlyReset ? c.rapport : (c.rapport && c.rapport.trim() ? c.rapport : (splitPerCabine[i] || "")),
            };
          })
        );
      }

      // ── Migration KV → Notion (one-shot, projets existants) ───────────────────
      // Si les nouvelles propriétés Notion sont encore vides, on va chercher
      // les données dans l'ancien KV store et on les copie dans Notion.
      // Après cette migration, tous les chargements suivants lisent Notion directement.
      if (!alreadyInit && !notionHasNoms && !notionHasAttr) {
        fetch(`/api/cabine-attribution?projectId=${data.id}`)
          .then(async (r) => (r.ok ? r.json() : null))
          .then((attr) => {
            if (!attr || typeof attr !== "object" || attr.error) return;
            const kvNoms: string[] = attr.noms || [];
            const kvMonteurs: string[] = attr.attribution || [];
            const hasCustomNoms = kvNoms.some((n, i) => n && n !== `Cabine ${i + 1}`);
            const hasCustomMonteurs = kvMonteurs.some((m) => m && m.trim());
            if (!hasCustomNoms && !hasCustomMonteurs) return;

            // Appliquer dans React
            setCabines((prev) => prev.map((c, i) => ({
              ...c,
              nom: (kvNoms[i] && kvNoms[i] !== `Cabine ${i + 1}`) ? kvNoms[i] : c.nom,
              monteur: kvMonteurs[i] || c.monteur,
            })));

            // Backup localStorage
            try {
              localStorage.setItem(`tm-cabin-noms-${data.id}`, JSON.stringify(kvNoms));
              localStorage.setItem(`tm-cabin-monteurs-${data.id}`, JSON.stringify(kvMonteurs));
            } catch {}

            // Écrire dans Notion — migration persistante
            const encNoms = kvNoms.map((n, i) => `Cab${i + 1}:${n || `Cabine ${i + 1}`}`).join(" | ");
            const encAttr = kvMonteurs.map((m, i) => (m ? `Cab${i + 1}:${m}` : null)).filter(Boolean).join(" | ");
            offlineFetch(`/api/projects/${data.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nomsCabines: encNoms, attributionCabines: encAttr }),
            }).catch(() => {});
          })
          .catch(() => {});
      }
      // Si les heures Notion ne sont PAS au format multi-cabine (projet
      // saisi avant cette feature), on les charge dans la ligne pointages
      // par défaut — retrocompat. Uniquement au 1er chargement (sinon un
      // refresh écraserait les pointages en cours d'édition).
      if (firstInit && (data.heureArrivee || data.heureDepart) && Object.keys(arriveeMap).length === 0) {
        setPointages([{ date: today, collaborateur: "", arrivee: data.heureArrivee || "", depart: data.heureDepart || "" }]);
      }
    } else if (firstInit) {
      // Mono-cabine : si les heures sont au format multi-interventions daté
      // ("2026-06-09 Micael 08:30 | …"), on réactive le mode pointages et on
      // recharge la liste. Sinon on reste en mode simple (heures HH:MM).
      // Uniquement au 1er chargement, pour ne pas écraser une saisie en cours.
      const serverPts = isMultiDayHours(data.heureArrivee, data.heureDepart)
        ? parsePointages(data.heureArrivee, data.heureDepart)
        : [];
      // Filet anti-perte : si le backup local a PLUS d'interventions que le
      // serveur (une écriture Notion s'est perdue), on restaure le backup.
      let backup: PointageEntry[] | null = null;
      try {
        const s = localStorage.getItem(`tm-pointages-${data.id}`);
        if (s) { const arr = JSON.parse(s); if (Array.isArray(arr)) backup = arr; }
      } catch {}
      const chosen = backup && backup.length > serverPts.length ? backup : serverPts;
      if (chosen.length) {
        setPointages(chosen);
        setIsMultiDay(true);
      }
    }
  };

  useEffect(() => {
    // 1. Cache-first: charger depuis le cache des projets instantanément
    let hadCache = false;
    // 1a. Clé DÉDIÉE déposée par la recherche/dashboard au moment du clic →
    //     affichage immédiat même si le projet n'est pas dans tm-projects-cache.
    try {
      const direct = localStorage.getItem(`tm-project-${id}`);
      if (direct) {
        localStorage.removeItem(`tm-project-${id}`); // usage unique (données fraîches suivent)
        const p = JSON.parse(direct);
        if (p?.id === id) { initProject(p); setLoading(false); hadCache = true; }
      }
    } catch {}
    try {
      const cached = localStorage.getItem("tm-projects-cache");
      if (!hadCache && cached) {
        const allCached = JSON.parse(cached);
        for (const key of Object.keys(allCached)) {
          const arr = allCached[key];
          if (Array.isArray(arr)) {
            const found = arr.find((p: any) => p.id === id);
            if (found) {
              initProject(found);
              setLoading(false);
              hadCache = true;
              break;
            }
          }
        }
      }
    } catch {}

    // On a affiché un cache (peut-être périmé/incomplet) → on signale qu'une
    // actualisation est en cours, pour que l'utilisateur ne croie pas le
    // rapport vide ou effacé pendant le fetch des données fraîches.
    if (hadCache) setRefreshing(true);

    // 2. Fetch API en arrière-plan avec retry (protection rate-limit Notion)
    const fetchWithProjectRetry = async (retries = 3, delayMs = 1500) => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetch(`/api/projects/${id}`);
          const data = await res.json();
          if (data?.id) {
            initProject(data);
            setFetchError(null);
            setLoading(false);
            setRefreshing(false);
            return;
          }
          // Erreur serveur : temporaire (rate-limit/timeout) ou définitive
          const isTemporary = res.status === 429 || res.status === 504 || res.status === 503;
          if (isTemporary && attempt < retries) {
            await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
            continue;
          }
          // Pas de données après tous les retries
          setFetchError(isTemporary ? "temporary" : "notfound");
          setLoading(false);
          setRefreshing(false);
          return;
        } catch {
          if (attempt < retries) {
            await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
            continue;
          }
          setFetchError("temporary");
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    fetchWithProjectRetry();
  }, [id]);

  // Enregistre chaque champ édité inline (dates, "traité par"…) → le polling le
  // préservera pendant une fenêtre de grâce (pas de clignotement / retour arrière).
  useEffect(() => {
    const onEdited = (e: Event) => {
      const field = (e as CustomEvent<{ field?: string }>).detail?.field;
      if (field) pendingFieldsRef.current[field] = Date.now();
    };
    window.addEventListener("tm-project-field-edited", onEdited);
    return () => window.removeEventListener("tm-project-field-edited", onEdited);
  }, []);

  // Polling: re-fetch project data toutes les 15 s pour la collaboration
  // temps réel. Visibility-aware : si l'onglet n'est pas visible, on
  // saute le tick — pas la peine de saturer le réseau pour un projet
  // que personne ne regarde. Au retour de visibilité, on déclenche
  // immédiatement un fetch (instant fresh data).
  useEffect(() => {
    if (!project?.id) return;
    const refetch = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(`/api/projects/${project.id}`, { cache: "no-store" });
        const data = await res.json();
        if (!data?.id) return;

        // setProject met à jour les photos, relations, dates... (tout ce
        // qui n'est pas une zone de saisie active).
        // Garde-fou critique : si la réponse serveur a un signatureUrl
        // vide alors qu'on en a un localement (state ou prev project),
        // on PRÉSERVE la valeur locale. La signature est la preuve
        // légale d'acceptation des travaux par le client : elle ne
        // doit jamais disparaître à cause d'un cache serveur incohérent
        // ou d'un délai de propagation Notion.
        setProject((prev) => {
          const incoming = { ...data } as typeof data;

          // Garde signature locale si le serveur n'en a pas.
          if (!incoming.signatureUrl) {
            const localSig = prev?.signatureUrl || signature;
            if (localSig) incoming.signatureUrl = localSig;
          }

          // Les champs photos ne sont JAMAIS écrasés par le polling.
          // Raison : le cache edge (sMaxAge 15s / swr 60s) peut renvoyer
          // des données périmées juste après une suppression, ce qui fait
          // "revenir" la photo dans l'UI. Les photos sont toujours
          // autoritatives côté local (upload/delete gèrent l'état direct).
          // Le polling sert uniquement à la collaboration sur les textes.
          if (prev) {
            const photoFields = [
              "photosAvant", "photosDemontage", "photosMontage", "photosQRCode", "photosGaranties",
              "photosCartons", "photosSituations", "photosMesures", "photosLocalite",
              "photosPiecesManquantes", "photosDefautsSignale",
            ] as const;
            for (const field of photoFields) {
              (incoming as Record<string, unknown>)[field] = prev[field];
            }
            // Commentaires édités via le champ inline (EditableTextField) :
            // autoritatifs en local. Sans ça, une lecture Notion non encore
            // propagée juste après l'enregistrement effaçait le commentaire
            // fraîchement saisi.
            const localTextFields = ["commentairesMontages", "commentairesMesures"] as const;
            for (const field of localTextFields) {
              (incoming as Record<string, unknown>)[field] = prev[field];
            }

            // Champs édités inline récemment (dates, "traité par"…) : on garde la
            // valeur locale tant que Notion n'a pas propagé (fenêtre de grâce),
            // sinon la relecture périmée fait "clignoter" l'ancienne valeur.
            const now = Date.now();
            for (const [field, ts] of Object.entries(pendingFieldsRef.current)) {
              if (now - ts < 30000) {
                (incoming as Record<string, unknown>)[field] = (prev as unknown as Record<string, unknown>)[field];
              } else {
                delete pendingFieldsRef.current[field];
              }
            }
          }

          return incoming;
        });

        // Merge intelligent des champs texte éditables : on ne pousse la
        // valeur serveur que si la valeur locale n'a pas été modifiée
        // depuis la dernière snapshot. Ça permet à B de voir les ajouts
        // de A en temps quasi-réel, sans effacer ce que B est en train
        // de taper. Si un conflit est détecté (A a modifié ET B est en
        // train de saisir), on garde le local et on affiche un toast
        // discret pour inviter à recharger après avoir sauvé.
        let conflict = false;
        const snap = serverSnapshotRef.current;
        const sRapport = data.rapportMonteur || "";
        const sCommentaires = data.commentairesMontages || "";
        const sHA = data.heureArrivee || "";
        const sHD = data.heureDepart || "";

        // Fenêtre de grâce après une sauvegarde : Notion peut renvoyer encore
        // l'ANCIENNE valeur (propagation). On ignore alors le serveur pour ne
        // JAMAIS écraser ce qu'on vient de taper/sauver.
        const GRACE_MS = 30000;
        const applyField = (
          serverVal: string,
          key: "rapport" | "commentaires" | "heureArrivee" | "heureDepart",
          setter: React.Dispatch<React.SetStateAction<string>>,
        ) => {
          if (serverVal === snap[key]) return;
          const pend = pendingSaveRef.current;
          if (pend && Date.now() - pend.ts < GRACE_MS && serverVal !== pend[key]) {
            return; // relecture Notion périmée → on garde le local
          }
          setter((cur) => {
            if (cur === snap[key]) { snap[key] = serverVal; return serverVal; }
            snap[key] = serverVal; conflict = true; return cur;
          });
        };

        applyField(sRapport, "rapport", setRapport);
        applyField(sCommentaires, "commentaires", setCommentaires);
        applyField(sHA, "heureArrivee", setHeureArrivee);
        applyField(sHD, "heureDepart", setHeureDepart);

        // Le serveur reflète enfin tout ce qu'on a sauvé → on lève le garde.
        const pend = pendingSaveRef.current;
        if (pend && sRapport === pend.rapport && sCommentaires === pend.commentaires &&
            sHA === pend.heureArrivee && sHD === pend.heureDepart) {
          pendingSaveRef.current = null;
        }
        if (conflict) setCollabUpdateToast(true);

        // ── Sync noms de cabines depuis Notion ─────────────────────────
        // setProject (ci-dessus) met à jour project.nomsCabines mais
        // N'actualise PAS `cabines` (l'état UI) — il est initialisé une
        // seule fois au chargement initial. Résultat : si l'admin renomme
        // une cabine après que le collaborateur a ouvert la page, le
        // collaborateur ne voit jamais le nouveau nom, même après des heures.
        // Ce bloc corrige ça : à chaque refetch, si Notion a un nom
        // personnalisé différent du nom affiché, on le pousse dans `cabines`.
        if (data.nomsCabines) {
          const notionNomRe = /Cab(\d+)\s*:([^|]*)/g;
          const freshNomMap = new Map<number, string>();
          let mn: RegExpExecArray | null;
          while ((mn = notionNomRe.exec(data.nomsCabines))) {
            const v = mn[2].trim();
            if (v) freshNomMap.set(parseInt(mn[1], 10), v);
          }
          if (freshNomMap.size > 0) {
            setCabines((prev) => {
              const now = Date.now();
              let changed = false;
              const next = prev.map((c, i) => {
                const freshNom = freshNomMap.get(i + 1) || "";
                // Ne met à jour que si Notion a un nom personnalisé (≠ défaut)
                // qui diffère de ce qui est affiché — préserve les saisies locales
                // en cours si elles diffèrent du nom précédemment connu.
                if (freshNom && freshNom !== `Cabine ${i + 1}` && freshNom !== c.nom) {
                  // Garde-fou : si l'utilisateur vient de modifier ce nom (< 60 s),
                  // ne pas laisser le cache CDN périmé (s-maxage=15) le réverter.
                  // Sans ça : admin edit → PATCH → CDN stale 15 s → refetch retourne
                  // l'ancien nom → setCabines révertit → prochain onChange envoie le
                  // nom réverté à Notion → boucle de perte de données.
                  const dirtyAt = dirtyNomRef.current.get(i);
                  if (dirtyAt && now - dirtyAt < 60_000) return c;
                  changed = true;
                  return { ...c, nom: freshNom };
                }
                return c;
              });
              if (!changed) return prev; // pas de re-render inutile
              // Sync localStorage pour éviter le flash au prochain rechargement
              try {
                localStorage.setItem(`tm-cabin-noms-${id}`, JSON.stringify(next.map((c) => c.nom)));
              } catch {}
              return next;
            });
          }
        }

        // ── Sync monteurs responsables depuis Notion ────────────────────
        // Même logique que pour les noms : le polling met à jour les monteurs
        // si Notion a une valeur différente ET que la cabine locale est vide.
        // Règle : on ne remplace JAMAIS un monteur déjà renseigné localement
        // (état local est autoritatif pour ce qu'on a explicitement saisie).
        if (data.attributionCabines && data.attributionCabines.includes("Cab")) {
          const notionAttrRe = /Cab(\d+)\s*:([^|]*)/g;
          const freshAttrMap = new Map<number, string>();
          let ma: RegExpExecArray | null;
          while ((ma = notionAttrRe.exec(data.attributionCabines))) {
            const v = ma[2].trim();
            if (v) freshAttrMap.set(parseInt(ma[1], 10), v);
          }
          if (freshAttrMap.size > 0) {
            setCabines((prev) => {
              const now = Date.now();
              const RESET_PROTECT_MS = 10 * 60 * 1000; // 10 minutes
              let changed = false;
              const next = prev.map((c, i) => {
                const freshMonteur = freshAttrMap.get(i + 1) || "";
                // Ne met à jour que si Notion a un monteur ET la cabine locale est vide.
                // Si le monteur local est déjà renseigné, on le conserve (priorité locale).
                // Exception : cabine récemment réinitialisée → on NE restaure PAS le monteur
                // même si Notion en a encore un (le PATCH de reset n'a peut-être pas encore
                // été appliqué dans Notion — le polling ne doit pas annuler le reset).
                const resetAt = resetCabinesRef.current.get(i);
                const recentlyReset = resetAt && (now - resetAt < RESET_PROTECT_MS);
                if (freshMonteur && !c.monteur && !recentlyReset) {
                  changed = true;
                  return { ...c, monteur: freshMonteur };
                }
                return c;
              });
              if (!changed) return prev;
              try {
                localStorage.setItem(`tm-cabin-monteurs-${id}`, JSON.stringify(next.map((c) => c.monteur)));
              } catch {}
              return next;
            });
          }
        }
      } catch {}
    };
    const interval = setInterval(refetch, 15_000); // 15 s — sans cache CDN, pas d'ISR Writes
    // Refetch immédiat quand l'onglet redevient visible : "instant
    // fresh" au retour sur l'app sans attendre le prochain tick.
    const onVisible = () => {
      if (typeof document !== "undefined" && !document.hidden) {
        refetch();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [project?.id]);

  /** Helper : enregistre une entrée dans l'historique des modifications. */
  const logAction = useCallback((action: string, details: string) => {
    if (!project) return;
    fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: id, projectName: project.projet, action, details }),
    }).catch(() => {});
  }, [id, project]);

  const handleSave = async (opts: { force?: boolean } = {}) => {
    // La vérification "photos manquantes" ne s'applique qu'au rapport
    // (mode cmd / rapport / dashboard) — pas aux mesures qui ont leurs
    // propres champs photo.
    const checkPhotos = mode !== "mesures";
    if (!opts.force && checkPhotos && project) {
      const missing = missingBucketLabels(project, {
        multiCabine: isCabineMode,
        nbCabines: isCabineMode ? cabines.length : (project.nbCabines || 0),
      });
      if (missing.length > 0) {
        setMissingPhotosPrompt({ kind: "save", missing });
        return;
      }
    }
    setSaving(true);
    // On pré-calcule le rapport qui sera envoyé à Notion (peut contenir du
    // vocal + texte, et on en aura besoin pour mettre à jour le state local
    // quand le save réussit — sinon un polling 15 s plus tard risque
    // d'écraser la saisie courante avec une réponse Notion vide).
    const reportToSave = normalizeRapportMonteur(
      isCabineMode
        ? [rapport.trim(), buildCabineReportLines(cabines)].filter(Boolean).join("\n\n")
        : rapport
    );
    // Priorité 1 : mode multi-cabine → heures par cabine
    // ("Cab1:08:00 | Cab2:09:30")
    // Priorité 2 : mode multi-jour → pointages par date
    // Priorité 3 : cas simple → valeur unique
    const arriveeToSave = isCabineMode
      ? cabines.map((c, i) => {
          if (!c.arrivee) return ""; // pas d'heure → on n'envoie rien (évite "Cab2:2026-06-09:")
          const dateStr = c.date ? `${c.date}:` : "";
          return `Cab${i + 1}:${dateStr}${c.arrivee}`;
        }).filter(Boolean).join(" | ")
      : isMultiDay
        ? pointages.map((p) => `${p.date} ${p.collaborateur} ${p.arrivee}`).join(" | ")
        : heureArrivee;
    const departToSave = isCabineMode
      ? cabines.map((c, i) => {
          if (!c.depart) return ""; // pas d'heure → on n'envoie rien (évite "Cab2:2026-06-09:")
          const dateStr = c.date ? `${c.date}:` : "";
          return `Cab${i + 1}:${dateStr}${c.depart}`;
        }).filter(Boolean).join(" | ")
      : isMultiDay
        ? pointages.map((p) => `${p.date} ${p.collaborateur} ${p.depart}`).join(" | ")
        : heureDepart;
    try {
      const res = await offlineFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heureArrivee: arriveeToSave,
          heureDepart: departToSave,
          commentairesMontages: commentaires,
          rapportMonteur: reportToSave,
        }),
      });
      // Backup localStorage noms/attribution — PAS de PATCH Notion.
      // Les noms sont gérés exclusivement par le handler onChange dédié.
      if (isCabineMode) {
        try {
          localStorage.setItem(`tm-cabin-noms-${id}`, JSON.stringify(cabines.map((c, i) => c.nom || `Cabine ${i + 1}`)));
          localStorage.setItem(`tm-cabin-monteurs-${id}`, JSON.stringify(cabines.map((c) => c.monteur)));
        } catch {}
      }
      if (res.ok) {
        // Purge le cache SW + aligne l'état React sur ce qu'on vient
        // d'écrire, sinon le polling 15 s plus tard peut réécraser
        // rapport/commentaires avec une réponse antérieure.
        invalidateApiCache();
        setProject((prev) => prev ? {
          ...prev,
          rapportMonteur: reportToSave,
          commentairesMontages: commentaires,
          heureArrivee: arriveeToSave,
          heureDepart: departToSave,
        } : prev);
        // La snapshot serveur est maintenant ce qu'on vient d'envoyer :
        // comme ça le prochain polling ne détectera pas un "faux conflit"
        // sur notre propre écriture.
        serverSnapshotRef.current = {
          rapport: reportToSave,
          commentaires: commentaires,
          heureArrivee: arriveeToSave,
          heureDepart: departToSave,
        };
        toast.success("Rapport enregistré avec succès");
        // Log des modifications
        const snap = serverSnapshotRef.current;
        const changes: string[] = [];
        if (reportToSave !== snap?.rapport) changes.push("Rapport mis à jour");
        if (commentaires !== snap?.commentaires) changes.push("Commentaires mis à jour");
        if (arriveeToSave !== snap?.heureArrivee) changes.push("Heure arrivée modifiée");
        if (departToSave !== snap?.heureDepart) changes.push("Heure départ modifiée");
        if (changes.length > 0) logAction("Enregistrement rapport", changes.join(" · "));
      } else {
        // Message d'erreur explicite (long toast) pour que l'utilisateur
        // comprenne que la sauvegarde a échoué et n'abandonne pas sa saisie.
        let detail = "";
        try { const j = await res.json(); detail = j?.error || ""; } catch {}
        toast.error(
          detail
            ? `Sauvegarde échouée : ${detail}. Votre texte reste dans le champ, retentez.`
            : "Sauvegarde échouée. Votre texte reste dans le champ, retentez.",
          { duration: 8000 }
        );
      }
    } catch {
      toast.error(
        "Erreur réseau pendant la sauvegarde. Votre texte reste dans le champ, retentez.",
        { duration: 8000 }
      );
    } finally {
      setSaving(false);
    }
  };

  /** Enregistrement rapide d'une cabine individuelle (heures + monteur + noms + rapport).
   *  Sans vérification photo — l'utilisateur peut sauvegarder à tout moment. */
  // Sauvegarde d'un champ texte PAR CABINE (delta → merge serveur), optimiste.
  // field : colonne Notion encodée "CabN:valeur" (commentairesSav / savRetouchesCabines).
  const saveCabineText = (field: "commentairesSav" | "savRetouchesCabines", cabineIdx: number, value: string) => {
    const clean = value.replace(/\|/g, " / ").trim();
    setProject((prev) => {
      if (!prev) return prev;
      const cur = (prev as unknown as Record<string, string>)[field] || "";
      const map = parseCabineTextMulti(cur);
      if (clean) map[cabineIdx + 1] = clean; else delete map[cabineIdx + 1];
      return { ...prev, [field]: encodeSousTraitance(map) };
    });
    window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field } }));
    offlineFetch(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: `Cab${cabineIdx + 1}:${clean}` }),
    }).catch(() => {});
  };

  const handleSaveCabineData = async (cabineIdx: number) => {
    setSaving(true);
    try {
      const arriveeToSave = cabines
        .map((c, i) => {
          if (!c.arrivee) return ""; // pas d'heure → skip (évite "Cab2:2026-06-09:")
          const dateStr = c.date ? `${c.date}:` : "";
          return `Cab${i + 1}:${dateStr}${c.arrivee}`;
        })
        .filter(Boolean)
        .join(" | ");

      const departToSave = cabines
        .map((c, i) => {
          if (!c.depart) return ""; // pas d'heure → skip (évite "Cab2:2026-06-09:")
          const dateStr = c.date ? `${c.date}:` : "";
          return `Cab${i + 1}:${dateStr}${c.depart}`;
        })
        .filter(Boolean)
        .join(" | ");

      const reportToSave = normalizeRapportMonteur(
        [rapport.trim(), buildCabineReportLines(cabines)].filter(Boolean).join("\n\n")
      );

      const res = await offlineFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heureArrivee: arriveeToSave,
          heureDepart: departToSave,
          rapportMonteur: reportToSave,
          commentairesMontages: commentaires,
        }),
      });

      // Vérifie si la sauvegarde a réellement abouti (res.ok) ou a été mise en queue
      // ({ queued: true } → 200 synthétique retourné par offlineFetch hors-ligne / 5xx).
      // On ne check PAS res.ok si la réponse est "queued" : dans ce cas les données
      // seront rejouées automatiquement dès que la connexion revient.
      let resQueued = false;
      let resError = "";
      if (!res.ok) {
        try {
          const j = await res.json();
          if (j?.queued) {
            resQueued = true; // queued synthétique → c'est un succès différé
          } else {
            resError = j?.error || "";
          }
        } catch {}
      }

      if (!res.ok && !resQueued) {
        toast.error(
          resError
            ? `Sauvegarde échouée : ${resError}. Votre saisie reste, retentez.`
            : "Sauvegarde échouée. Votre saisie reste dans le champ, retentez.",
          { duration: 8000 }
        );
        return;
      }

      // Backup localStorage noms + attribution — PAS de PATCH Notion.
      // Les noms/monteurs sont gérés exclusivement par leurs handlers dédiés
      // (onChange nom + onClick monteur). Inclure nomsCabines ici causerait
      // des écrasements Notion avec l'état local potentiellement périmé d'un
      // autre utilisateur (ex : collaborateur qui sauvegarde ses heures alors
      // que ses cabines.nom n'ont pas encore été rafraîchies depuis Notion).
      try {
        localStorage.setItem(`tm-cabin-noms-${id}`, JSON.stringify(cabines.map((c, i) => c.nom || `Cabine ${i + 1}`)));
        localStorage.setItem(`tm-cabin-monteurs-${id}`, JSON.stringify(cabines.map((c) => c.monteur)));
      } catch {}

      // Aligne le snapshot serveur pour éviter un faux conflit au prochain polling
      serverSnapshotRef.current = {
        rapport: reportToSave,
        commentaires,
        heureArrivee: arriveeToSave,
        heureDepart: departToSave,
      };
      invalidateApiCache();

      const cab = cabines[cabineIdx];
      const cabLabel = cab?.nom || `Cabine ${cabineIdx + 1}`;
      if (resQueued) {
        toast.success(`${cabLabel} — sauvegardée hors-ligne, sera synchronisée à la reconnexion.`, { duration: 5000 });
      } else {
        toast.success(`${cabLabel} — enregistrée ✓`);
      }
      // Log de la modification
      const details: string[] = [];
      if (cab?.monteur) details.push(`Monteur: ${cab.monteur}`);
      if (cab?.date) details.push(`Date: ${cab.date}`);
      if (cab?.arrivee && cab?.depart) details.push(`Heures: ${cab.arrivee}→${cab.depart}`);
      if (cab?.rapport?.trim()) details.push("Rapport cabine mis à jour");
      logAction(`${cabLabel} enregistrée`, details.join(" · ") || "Données cabine sauvegardées");
    } catch {
      toast.error("Erreur lors de la sauvegarde — votre saisie reste dans le champ, retentez.");
    } finally {
      setSaving(false);
    }
  };

  /**
   * Réinitialise complètement une cabine : efface ses photos (tous les buckets),
   * ses heures, son rapport, son monteur et sa date — localement ET dans Notion.
   * La badge retourne à l'état bleu (rien de fait).
   * N'affecte pas les autres cabines.
   */
  const handleResetCabine = async (idx: number) => {
    if (!project) return;
    const cabNum = idx + 1; // 1-based
    const cabPatternRe = new RegExp(`\\.Cab${cabNum}\\.`);

    // 1. Nouvelles listes de photos sans la cabine réinitialisée
    const newPhotosAvant     = (project.photosAvant     || []).filter((f) => !cabPatternRe.test(f.name || ""));
    const newPhotosMontage   = (project.photosMontage   || []).filter((f) => !cabPatternRe.test(f.name || ""));
    const newPhotosDemontage = (project.photosDemontage || []).filter((f) => !cabPatternRe.test(f.name || ""));
    const newPhotosQRCode    = (project.photosQRCode    || []).filter((f) => !cabPatternRe.test(f.name || ""));
    const newPhotosGaranties = (project.photosGaranties || []).filter((f) => !cabPatternRe.test(f.name || ""));

    // 2. Cabines avec la cabine ciblée vidée
    const newCabines = cabines.map((c, i) =>
      i === idx ? { ...c, monteur: "", arrivee: "", depart: "", date: "", rapport: "" } : c
    );

    // 3. Recalcul des champs texte pour Notion.
    // IMPORTANT : on envoie "Cab${cabNum}:" (vide explicite) pour la cabine réinitialisée.
    // Le serveur (mergeCabineTimes) traite une valeur vide comme une suppression explicite,
    // ce qui efface les anciennes heures dans Notion au lieu de les préserver.
    // Sans ça, le merge côté serveur omettrait simplement la cabine et garderait
    // l'ancienne valeur Notion — les heures reviendraient à la prochaine visite.
    const newArriveeToSave = newCabines
      .map((c, i) => {
        if (i === idx) return `Cab${i + 1}:`; // vide explicite → suppression côté serveur
        if (!c.arrivee) return null;
        const ds = c.date ? `${c.date}:` : "";
        return `Cab${i + 1}:${ds}${c.arrivee}`;
      })
      .filter((s): s is string => s !== null)
      .join(" | ");
    const newDepartToSave = newCabines
      .map((c, i) => {
        if (i === idx) return `Cab${i + 1}:`; // vide explicite → suppression côté serveur
        if (!c.depart) return null;
        const ds = c.date ? `${c.date}:` : "";
        return `Cab${i + 1}:${ds}${c.depart}`;
      })
      .filter((s): s is string => s !== null)
      .join(" | ");
    const newRapportToSave = [rapport.trim(), buildCabineReportLines(newCabines)].filter(Boolean).join("\n\n");

    // 4. Mise à jour UI immédiate (badge repasse en bleu, données disparaissent)
    // Enregistre le timestamp de reset pour protéger contre la restauration par le polling.
    resetCabinesRef.current.set(idx, Date.now());
    setCabines(newCabines);
    setProject((prev) =>
      prev
        ? {
            ...prev,
            photosAvant:     newPhotosAvant,
            photosMontage:   newPhotosMontage,
            photosDemontage: newPhotosDemontage,
            photosQRCode:    newPhotosQRCode,
            photosGaranties: newPhotosGaranties,
          }
        : prev
    );

    // 5. Mise à jour localStorage (noms inchangés, monteur vidé)
    try {
      localStorage.setItem(`tm-cabin-noms-${id}`, JSON.stringify(newCabines.map((c, i) => c.nom || `Cabine ${i + 1}`)));
      localStorage.setItem(`tm-cabin-monteurs-${id}`, JSON.stringify(newCabines.map((c) => c.monteur)));
    } catch {}

    // 6. PATCH Notion — toutes les données de la cabine effacées
    const cabLabel = cabines[idx]?.nom || `Cabine ${cabNum}`;
    try {
      const res = await offlineFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heureArrivee:      newArriveeToSave,
          heureDepart:       newDepartToSave,
          rapportMonteur:    newRapportToSave,
          // Suppression EXPLICITE du monteur de cette cabine (signal dédié).
          // On n'utilise plus un slot vide "Cab${cabNum}:" : un slot vide est
          // désormais ignoré (préservation), pour éviter les disparitions.
          clearAttributionCabs: [cabNum],
          photosAvant:       newPhotosAvant,
          photosMontage:     newPhotosMontage,
          photosDemontage:   newPhotosDemontage,
          photosQRCode:      newPhotosQRCode,
          photosGaranties:   newPhotosGaranties,
        }),
      });

      invalidateApiCache();

      // Aligner la snapshot serveur pour ne pas créer de faux conflit au prochain polling
      serverSnapshotRef.current = {
        rapport:      newRapportToSave,
        commentaires,
        heureArrivee: newArriveeToSave,
        heureDepart:  newDepartToSave,
      };

      let resQueued = false;
      if (res.ok) {
        try { const j = await res.json(); if (j?.queued) resQueued = true; } catch {}
      }

      if (resQueued) {
        toast.success(`${cabLabel} — réinitialisée (synchronisation Notion en attente).`, { duration: 5000 });
      } else if (res.ok) {
        toast.success(`${cabLabel} — réinitialisée ✓`);
      } else {
        let errMsg = "";
        try { const j = await res.json(); errMsg = j?.error || ""; } catch {}
        toast.error(
          errMsg
            ? `Réinitialisation non enregistrée dans Notion : ${errMsg}`
            : "Réinitialisation non enregistrée dans Notion — réessayez.",
          { duration: 8000 }
        );
      }

      logAction(`${cabLabel} réinitialisée`, "Toutes les données de la cabine effacées");
    } catch {
      toast.error("Erreur lors de la réinitialisation — réessayez.");
    }
  };

  // Présence sélectionnée dans le rapport (dérivée du texte → aucun état en double).
  const presenceInRapport: "client" | "personne" | null =
    rapport.includes(PRESENCE_CLIENT) ? "client"
    : rapport.includes(PRESENCE_PERSONNE) ? "personne"
    : null;

  /** Coche l'une des deux mentions de présence (exclusives) dans le rapport. */
  const applyPresence = (choice: "client" | "personne") => {
    const stmt = choice === "client" ? PRESENCE_CLIENT : PRESENCE_PERSONNE;
    setRapport((prev) => {
      const cleaned = prev
        .replace(PRESENCE_CLIENT, "")
        .replace(PRESENCE_PERSONNE, "")
        .replace(/\n{2,}/g, "\n")
        .trim();
      return (cleaned ? cleaned + "\n" : "") + stmt;
    });
    scheduleAutoSave();
  };

  const handleSendReport = async (opts: { force?: boolean; skipSignature?: boolean; client?: boolean } = {}) => {
    if (!project) return;

    // Type de rapport : "client" = SANS heures. On mémorise le choix dans la ref
    // pour le conserver lorsque les fenêtres photos/signature rappellent la
    // fonction sans repasser l'argument.
    const client = opts.client ?? pendingSendClientRef.current;
    pendingSendClientRef.current = client;

    const photoOpts = {
      multiCabine: isCabineMode,
      nbCabines: isCabineMode ? cabines.length : (project.nbCabines || 0),
    };
    const computeRequired = () => missingRequiredPhotos(project, photoOpts);
    const computeOptional = () => missingOptionalPhotoLabels(project, photoOpts);

    const needsPresence = !hasPresenceStatement(rapport);
    const required = computeRequired();   // BLOQUANT (minimums non atteints)
    const optional = computeOptional();   // recommandé (contournable)

    // ── Porte 1 : présence + photos ──
    // • Présence client OBLIGATOIRE (jamais contournable).
    // • Photos OBLIGATOIRES : minimums avant 2 / montage 3 / après 2 → BLOQUANT.
    // • Photos recommandées (démontage/QR/garantie) : rappel contournable.
    // On ouvre l'alerte si l'un de ces points est en défaut. Le bouton « Envoyer »
    // ne s'active que quand présence choisie ET aucune photo obligatoire manquante.
    if (needsPresence || required.length > 0 || (!opts.force && optional.length > 0)) {
      setMissingPhotosPrompt({ kind: "send", missing: optional, required, needsPresence });
      return;
    }

    // ── Porte 3 : signature OBLIGATOIRE si client présent (contournable en dernier
    // recours si le client n'a pas pu signer). Placée APRÈS les photos pour que
    // le monteur voie d'abord l'alerte photos. ──
    if (!opts.skipSignature && rapport.includes(PRESENCE_CLIENT) && !signature) {
      setSignatureRequiredPrompt(true);
      return;
    }

    // ── Heure de départ automatique (MONO-CABINE uniquement) ──
    // Certains monteurs oublient d'arrêter le chrono. Si, en mono-cabine, l'heure
    // de départ est vide MAIS qu'il y a des photos de montage (le montage a donc
    // bien eu lieu), on fixe automatiquement l'heure de départ à l'instant de
    // l'envoi. Impossible en multi-cabine (une heure par cabine → ambigu).
    let effectiveDepart = heureDepart;
    if (!isCabineMode && !isMultiDay && !heureDepart.trim()) {
      const nbMontagePhotos =
        filterByBucket(project.photosMontage, "MONTAGE_GAUCHE").length +
        filterByBucket(project.photosMontage, "MONTAGE_CENTRE").length +
        filterByBucket(project.photosMontage, "MONTAGE_DROITE").length;
      if (nbMontagePhotos > 0) {
        const now = new Date();
        effectiveDepart = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        setHeureDepart(effectiveDepart); // reflète dans l'UI
        serverSnapshotRef.current.heureDepart = effectiveDepart;
        toast.info(`Heure de départ non saisie — fixée à l'envoi (${effectiveDepart})`);
      }
    }

    setSending(true);
    setSendKind(client ? "client" : "interne");
    try {
      // 1. Save the report data first
      const saveRes = await offlineFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heureArrivee: isCabineMode
            ? cabines.map((c, i) => c.arrivee ? `Cab${i + 1}:${c.arrivee}` : "").filter(Boolean).join(" | ")
            : isMultiDay
              ? pointages.map((p) => `${p.date} ${p.collaborateur} ${p.arrivee}`).join(" | ")
              : heureArrivee,
          heureDepart: isCabineMode
            ? cabines.map((c, i) => c.depart ? `Cab${i + 1}:${c.depart}` : "").filter(Boolean).join(" | ")
            : isMultiDay
              ? pointages.map((p) => `${p.date} ${p.collaborateur} ${p.depart}`).join(" | ")
              : effectiveDepart,
          commentairesMontages: commentaires,
          rapportMonteur: normalizeRapportMonteur(
            isCabineMode
              ? [rapport.trim(), buildCabineReportLines(cabines)].filter(Boolean).join("\n\n")
              : rapport
          ),
        }),
      });
      if (!saveRes.ok) {
        toast.error("Erreur lors de l'enregistrement du rapport");
        setSending(false);
        return;
      }

      // 2. Generate PDF with override params (don't rely on Notion propagation)
      const arriveeFinal = isMultiDay
        ? pointages.map((p) => `${p.date} ${p.collaborateur} ${p.arrivee}`).join(" | ")
        : heureArrivee;
      const departFinal = isMultiDay
        ? pointages.map((p) => `${p.date} ${p.collaborateur} ${p.depart}`).join(" | ")
        : effectiveDepart;
      const pdfParams = new URLSearchParams();
      if (arriveeFinal) pdfParams.set("arrivee", arriveeFinal);
      if (departFinal) pdfParams.set("depart", departFinal);
      // Rapport client → PDF SANS heures (mail/Telegram interne reçoit alors la
      // version exacte que verra le client).
      if (client) pdfParams.set("client", "1");
      // send=1 : c'est l'envoi DÉLIBÉRÉ du rapport → déclenche mail + Telegram.
      // Les simples consultations du PDF (portail, téléchargement) ne le passent
      // pas et n'envoient donc aucun mail.
      pdfParams.set("send", "1");
      await new Promise((r) => setTimeout(r, 2000));
      const pdfRes = await fetch(`/api/pdf/${id}?${pdfParams.toString()}`);
      if (!pdfRes.ok) {
        toast.error("Erreur lors de la generation du PDF");
        setSending(false);
        return;
      }

      // 3. Generate client portal link and copy to clipboard
      const token = btoa(id);
      const clientPortalUrl = `${window.location.origin}/client/${token}`;
      try {
        await navigator.clipboard.writeText(clientPortalUrl);
      } catch {}

      // 4. Show success toast + fenêtre de confirmation persistante
      toast.success("Rapport envoye", {
        description: "Lien client copie dans le presse-papiers",
        duration: 5000,
      });
      setShowSentConfirm(true);

      // 5. Log the action
      Promise.all([
        fetch("/api/logs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: id,
            projectName: project.projet,
            action: "Rapport envoye",
            details: `PDF genere et email envoye`,
          }),
        }),
        fetch("/api/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: project.projet,
            projectId: project.id,
            action: "Rapport envoye",
            details: `PDF genere et email envoye. Lien client: ${clientPortalUrl}`,
          }),
        }),
      ]).catch(() => {});
    } catch {
      toast.error("Erreur reseau");
    } finally {
      setSending(false);
      setSendKind(null);
    }
  };

  // Mise à jour synchrone de la ref à chaque render pour que le timer
  // de scheduleAutoSave lise toujours les valeurs les plus récentes.
  latestSaveDataRef.current = {
    rapport, commentaires, heureArrivee, heureDepart,
    cabines, isCabineMode, isMultiDay, pointages,
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-6">
        <Loader2 className="w-10 h-10 animate-spin text-[#1e3a5f] dark:text-blue-300" />
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Chargement du rapport…</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">Récupération des photos et des informations</p>
      </div>
    );
  }

  if (!project) {
    const isTemporary = fetchError === "temporary";
    return (
      <div className="px-4 py-12 text-center">
        {isTemporary ? (
          <>
            <div className="flex flex-col items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-amber-400" />
              <p className="text-gray-700 dark:text-gray-200 font-medium">
                Impossible de charger le projet
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
                Notion est momentanément surchargé. Le projet existe bien —
                réessayez dans quelques secondes.
              </p>
              <Button
                className="mt-2"
                onClick={() => {
                  setLoading(true);
                  setFetchError(null);
                  const retry = async (retries = 3, delayMs = 1500) => {
                    for (let attempt = 0; attempt <= retries; attempt++) {
                      try {
                        const res = await fetch(`/api/projects/${id}`);
                        const data = await res.json();
                        if (data?.id) {
                          initProject(data);
                          setFetchError(null);
                          setLoading(false);
                          return;
                        }
                        const isTemp = res.status === 429 || res.status === 504 || res.status === 503;
                        if (isTemp && attempt < retries) {
                          await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
                          continue;
                        }
                        setFetchError(isTemp ? "temporary" : "notfound");
                        setLoading(false);
                        return;
                      } catch {
                        if (attempt < retries) {
                          await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, attempt)));
                          continue;
                        }
                        setFetchError("temporary");
                        setLoading(false);
                      }
                    }
                  };
                  retry();
                }}
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Réessayer
              </Button>
            </div>
            <Button variant="ghost" className="mt-4" onClick={() => router.push("/")}>
              Retour à l'accueil
            </Button>
          </>
        ) : (
          <>
            <p className="text-gray-500">Projet introuvable</p>
            <Button variant="ghost" className="mt-4" onClick={() => router.push("/")}>
              Retour
            </Button>
          </>
        )}
      </div>
    );
  }

  const isAdmin = currentUser?.role === "admin";

  // ── Actions du rapport (partagées entre les boutons du bas et les boutons
  //    ronds de l'en-tête macOS) ─────────────────────────────────────────────
  const handleSaveClick = () => {
    if (!isCabineMode && !rapport.trim()) { setShowRapportRequiredModal(true); return; }
    handleSave();
  };
  const handleDownloadPdf = async (client = false) => {
    setDownloadingPdf(true);
    setDownloadKind(client ? "client" : "interne");
    try {
      // client=1 → PDF SANS les heures d'arrivée/départ (version client).
      const res = await fetch(`/api/pdf/${id}${client ? "?client=1" : ""}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      let filename = "Rapport de montage.pdf";
      const cd = res.headers.get("Content-Disposition");
      const m = cd?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      if (m?.[1]) filename = decodeURIComponent(m[1]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error("Téléchargement PDF échoué:", e);
      alert("Impossible de générer le PDF. Veuillez réessayer.");
    } finally { setDownloadingPdf(false); setDownloadKind(null); }
  };
  // ── Fiche de travail : PDF + lien public (calendrier) ──────────────────────
  const handleDownloadFiche = async () => {
    setDownloadingFiche(true);
    try {
      const res = await fetch(`/api/fiche/${id}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      let filename = "Fiche de travail.pdf";
      const cd = res.headers.get("Content-Disposition");
      const m = cd?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
      if (m?.[1]) filename = decodeURIComponent(m[1]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      console.error("Téléchargement Fiche échoué:", e);
      toast.error("Impossible de générer le PDF de la fiche.");
    } finally { setDownloadingFiche(false); }
  };
  const handleCopyFicheLink = async () => {
    setCopyingFicheLink(true);
    try {
      const res = await fetch(`/api/fiche/${id}?link=1`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data?.url) throw new Error("no url");
      await navigator.clipboard.writeText(data.url);
      toast.success("Lien de la fiche copié", { description: "Collez-le dans un événement de calendrier." });
    } catch (e) {
      console.error("Lien Fiche échoué:", e);
      toast.error("Impossible de créer le lien (SHARE_LINK_KEY manquant ?)");
    } finally { setCopyingFicheLink(false); }
  };
  const handleDownloadPhotos = async () => {
    setDownloadingPhotos(true);
    try {
      const res = await fetch(`/api/photos/${id}/download`);
      if (!res.ok) throw new Error("Erreur serveur");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `${project.nomChantier || id} - Photos.zip`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert("Impossible de télécharger les photos. Veuillez réessayer.");
    } finally { setDownloadingPhotos(false); }
  };

  // Cabines dont au moins une photo "montage" ou "après intervention" a été uploadée.
  // Les noms de fichiers multi-cabine encodent l'index via `.Cab{N}.` (1-based).
  // On se base sur project.photosMontage qui contient les buckets MONTAGE_* et APRES_INTERVENTION.
  const installedCabineIndices = new Set<number>(
    (project.photosMontage || [])
      .map((f) => { const m = f.name.match(/\.Cab(\d+)\./); return m ? parseInt(m[1], 10) - 1 : null; })
      .filter((n): n is number => n !== null)
  );
  const installedCabineCount = installedCabineIndices.size;

  // Nombre de LOTS ayant au moins un signalement (pièce manquante ou défaut) —
  // affiché entre parenthèses sur le bouton filtre « Avec signalement ».
  const signalementLotsCount = cabines.reduce((n, c) => {
    const has =
      cabineSignalements.pieces.some((p) => normCabineLabel(p.cabineLabel) === normCabineLabel(c.nom)) ||
      cabineSignalements.defauts.some((d) => normCabineLabel(d.cabineLabel) === normCabineLabel(c.nom));
    return has ? n + 1 : n;
  }, 0);

  // Nombre de LOTS ayant un rapport personnalisé (texte ajouté à la main) —
  // affiché entre parenthèses sur le bouton filtre « Avec rapport ».
  const rapportLotsCount = cabines.reduce((n, c) => (hasManualRapport(c.rapport) ? n + 1 : n), 0);

  // Un lot a un SAV s'il a une réclamation, un descriptif d'intervention, OU des
  // photos (demande / réglé) pour cette cabine.
  const savCommentMap = parseCabineTextMulti(project?.commentairesSav || "");
  const savRetoucheMap = parseCabineTextMulti(project?.savRetouchesCabines || "");
  const cabineHasSav = (idx: number): boolean => {
    if (savCommentMap[idx + 1] || savRetoucheMap[idx + 1]) return true;
    const hasPhotoForCab = (list?: { name?: string }[]) =>
      (list || []).some((f) => {
        const m = (f.name || "").match(/\.Cab(\d+)\./);
        return m ? parseInt(m[1], 10) === idx + 1 : false;
      });
    return hasPhotoForCab(project?.documentsSavDemande) || hasPhotoForCab(project?.photosSavRetouches);
  };
  const savLotsCount = cabines.reduce((n, _c, i) => (cabineHasSav(i) ? n + 1 : n), 0);

  // Statut du rapport pour la pastille sur l'icône "Rapport" (macOS).
  // Cabine : basé sur les cabines installées. Simple : checklist 5 critères.
  const reportPercent = isCabineMode
    ? (cabines.length === 0 ? 0 : Math.round((installedCabineCount / cabines.length) * 100))
    : Math.round(
        ([
          !!heureArrivee,
          !!heureDepart,
          rapport.trim().length > 0,
          (project?.photosAvant || []).length > 0,
          (project?.photosMontage || []).length > 0,
        ].filter(Boolean).length /
          5) *
          100,
      );
  const reportStatus: "done" | "progress" | "notStarted" =
    reportPercent >= 100 ? "done" : reportPercent > 0 ? "progress" : "notStarted";

  // Définition des onglets (rail vertical macOS + barre horizontale iOS).
  // "rapport" n'est présent que sur macOS : sur iOS le rapport reste piloté
  // par le bouton dédié (« Consulter / Démarrer le rapport de montage »).
  const tabDefs = [
    { id: "projet", label: "Informations projet", Icon: FileText, bg: "bg-blue-100/80 dark:bg-blue-900/30", fg: "text-blue-600 dark:text-blue-400" },
    { id: "dates", label: "Informations dates", Icon: Clock, bg: "bg-cyan-100/80 dark:bg-cyan-900/30", fg: "text-cyan-600 dark:text-cyan-400" },
    { id: "client", label: "Informations client", Icon: Users, bg: "bg-violet-100/80 dark:bg-violet-900/30", fg: "text-violet-600 dark:text-violet-400" },
    { id: "cabines", label: "Informations cabines", Icon: Package, bg: "bg-sky-100/80 dark:bg-sky-900/30", fg: "text-sky-600 dark:text-sky-400" },
    { id: "mesures", label: "Documents & commentaires (Mesures / Montage)", Icon: Ruler, bg: "bg-teal-100/80 dark:bg-teal-900/30", fg: "text-teal-600 dark:text-teal-400" },
    { id: "commentaires", label: "Commentaires", Icon: MessageSquare, bg: "bg-amber-100/80 dark:bg-amber-900/30", fg: "text-amber-600 dark:text-amber-400" },
    { id: "fiche", label: "Fiche de travail", Icon: FileSpreadsheet, bg: "bg-indigo-100/80 dark:bg-indigo-900/30", fg: "text-indigo-600 dark:text-indigo-400" },
    { id: "rapport", label: "Rapport", Icon: ClipboardList, bg: "bg-emerald-100/80 dark:bg-emerald-900/30", fg: "text-emerald-600 dark:text-emerald-400" },
  ] as const;

  const renderTabButton = ({ id, label, Icon, bg, fg }: (typeof tabDefs)[number]) => {
    const active = macTabs.has(id);
    const commentCount = id === "commentaires"
      ? notionCommentsCount
        + ((project.commentairesMesures || "").trim() ? 1 : 0)
        + ((project.commentairesMontages || "").trim() ? 1 : 0)
      : 0;
    // Pastille "Mesures" : nombre de fichiers dans Documents Montage.
    const montageDocsCount = id === "mesures" ? (project.documentsMontagee || []).length : 0;
    // Pastille "Cabines" : nombre de cabines du projet (Nb. Cabines).
    const cabCount = id === "cabines" ? (project.nbCabines || 0) : 0;
    // Dates affichées dans l'icône "dates" (jj/mm/aa).
    const fmtBadgeDate = (d?: string | null) => {
      if (!d) return "—";
      const [y, m, day] = d.slice(0, 10).split("-");
      return y && m && day ? `${day}/${m}/${y.slice(2)}` : "—";
    };
    const showDates = id === "dates" && (!!project.dateMesures || !!project.dateMontage);
    return (
      <button
        key={id}
        type="button"
        onClick={() => toggleMacTab(id)}
        title={label}
        className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95 ${bg} ${
          active ? "ring-2 ring-[#1e3a5f] dark:ring-blue-400 shadow-md scale-105" : "opacity-90 hover:opacity-100 hover:scale-105"
        }`}
      >
        {showDates ? (
          // Onglet "dates" : date de mesures (haut) + date RDV montage (bas),
          // directement dans le rond de l'icône.
          <div className={`flex flex-col items-center justify-center leading-none ${fg}`}>
            <span className="text-[7px] font-bold tracking-tight">{fmtBadgeDate(project.dateMesures)}</span>
            <span className="w-3.5 h-px my-[2px] bg-current opacity-40" />
            <span className="text-[7px] font-bold tracking-tight">{fmtBadgeDate(project.dateMontage)}</span>
          </div>
        ) : (
          <Icon className={`w-[18px] h-[18px] ${fg}`} />
        )}
        {commentCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-900 shadow">
            {commentCount}
          </span>
        )}
        {/* Pastille rouge "Mesures" : nombre de fichiers Documents Montage. */}
        {montageDocsCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-900 shadow">
            {montageDocsCount}
          </span>
        )}
        {/* Pastille "Cabines" (teal, nuance de l'icône Mesures) : nombre de cabines. */}
        {cabCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white dark:border-slate-900 shadow">
            {cabCount}
          </span>
        )}
        {id === "rapport" && (
          <span
            className={`absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow ${
              reportStatus === "done" ? "bg-green-500" : reportStatus === "progress" ? "bg-orange-500" : "bg-blue-500"
            }`}
            title={reportStatus === "done" ? "Rapport clôturé" : reportStatus === "progress" ? "Rapport en cours" : "Rapport pas encore débuté"}
          >
            {reportStatus === "done" ? (
              <Check className="w-[11px] h-[11px] text-white" strokeWidth={3} />
            ) : reportStatus === "progress" ? (
              <Hourglass className="w-[10px] h-[10px] text-white" strokeWidth={2.5} />
            ) : (
              <Minus className="w-[11px] h-[11px] text-white" strokeWidth={3} />
            )}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="w-full pb-8 px-4 sm:px-6">
      {/* Bannière d'actualisation : un cache (peut-être périmé) est affiché
          pendant que les données fraîches se chargent. Évite de croire que le
          rapport est vide ou effacé. */}
      {refreshing && (
        <div className="sticky top-0 z-30 -mx-4 sm:-mx-6 px-4 sm:px-6 py-1.5 bg-blue-50/95 dark:bg-blue-900/40 border-b border-blue-200 dark:border-blue-800 flex items-center justify-center gap-2 text-xs font-medium text-[#1e3a5f] dark:text-blue-200 backdrop-blur">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Actualisation des données du rapport…
        </div>
      )}
      {/* Modal d'édition admin */}
      {isAdmin && project && (
        <AdminEditModal
          project={project}
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          onSave={(updated) => setProject(updated)}
        />
      )}

      {/* Banner de conflit de collaboration : un autre utilisateur a
          modifié un champ pendant qu'on était en train de saisir. On
          le signale discrètement pour inviter à sauvegarder puis
          recharger plutôt que d'écraser son travail. */}
      {collabUpdateToast && (
        <div className="mt-2 mb-2 flex items-center gap-3 rounded-xl px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-xs text-amber-800 dark:text-amber-200">
          <span className="flex-1">
            Un collègue a modifié ce rapport pendant que vous éditiez.
            Enregistrez votre saisie, puis rechargez pour voir ses ajouts.
          </span>
          <button
            onClick={() => { setCollabUpdateToast(false); window.location.reload(); }}
            className="shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors"
          >
            Recharger
          </button>
          <button
            onClick={() => setCollabUpdateToast(false)}
            aria-label="Fermer"
            className="shrink-0 text-amber-600 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-100"
          >
            ×
          </button>
        </div>
      )}
      {/* Header */}
      <div className="sticky z-40 glass-card border-b px-4 py-3 transition-opacity duration-150" style={{ borderRadius: 0, top: headerHeight, opacity: showRapport ? headerScrollOpacity : 1 }}>
        {(() => {
          // Boutons d'action (crayon, partage, étoile, historique) — rendus
          // soit à droite de la ligne titre (mode normal), soit sur la ligne
          // OFR (mode rapport). Définis une seule fois ici.
          const actionButtons = (
            <>
              {/* Actions rapides du rapport (macOS, quand le panneau rapport est
                  ouvert) : mêmes fonctions que les boutons du bas de page. */}
              {isMac && macTabs.has("rapport") && (
                <>
                  <button
                    onClick={handleSaveClick}
                    disabled={saving}
                    title="Enregistrer le rapport"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 active:scale-90 transition-all disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => setAudienceChoice("send")}
                    disabled={sending}
                    title="Envoyer le rapport (interne / client)"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/30 active:scale-90 transition-all disabled:opacity-50"
                  >
                    {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={() => setAudienceChoice("download")}
                    disabled={downloadingPdf}
                    title="Actualiser et télécharger le PDF (interne / client)"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-90 transition-all disabled:opacity-50"
                  >
                    <RefreshCw className={`w-5 h-5 ${downloadingPdf ? "animate-spin" : ""}`} />
                  </button>
                  <button
                    onClick={handleDownloadPhotos}
                    disabled={downloadingPhotos}
                    title="Télécharger toutes les photos"
                    className="w-9 h-9 flex items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 active:scale-90 transition-all disabled:opacity-50"
                  >
                    {downloadingPhotos ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageDown className="w-5 h-5" />}
                  </button>
                  <span className="w-px h-5 self-center bg-gray-200 dark:bg-slate-600 mx-0.5" />
                </>
              )}
              {isAdmin && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-transform"
                  title="Modifier le projet"
                >
                  <PenLine className="w-5 h-5 text-gray-500" />
                </button>
              )}
              <button
                onClick={() => {
                  const token = btoa(id);
                  const url = `${window.location.origin}/client/${token}`;
                  navigator.clipboard.writeText(url).then(() => {
                    toast.success("Lien client copie dans le presse-papiers");
                  }).catch(() => {
                    toast.error("Impossible de copier le lien");
                  });
                }}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-transform"
                title="Partager avec le client"
              >
                <Share2 className="w-5 h-5 text-blue-400" />
              </button>
              <button
                onClick={() => setFav(toggleFavorite(id))}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-transform"
              >
                <Star className={`w-5 h-5 ${fav ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
              </button>
              {isAdmin && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={`relative w-9 h-9 flex items-center justify-center rounded-full active:scale-90 transition-all ${historyCount > 0 ? "bg-yellow-50" : ""} hover:bg-gray-100`}
                  title="Historique des modifications"
                >
                  <History className={`w-5 h-5 ${showHistory ? "text-blue-500" : historyCount > 0 ? "text-yellow-500" : "text-gray-300"}`} />
                  {historyCount > 0 && !showHistory && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-yellow-400 text-[8px] font-bold text-white rounded-full flex items-center justify-center">{historyCount > 9 ? "9+" : historyCount}</span>
                  )}
                </button>
              )}
            </>
          );

          return (
            <div className="flex items-start gap-3">
              <button
                onClick={() => {
                  // Retour à la VRAIE page précédente (une page à la fois). Repli
                  // sur le dashboard du bon onglet si le projet a été ouvert
                  // directement (deep-link, nouvel onglet → pas d'historique).
                  if (typeof window !== "undefined" && window.history.length > 1) router.back();
                  else router.push(`/?mode=${mode}`);
                }}
                className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                {/* En mode rapport : titre plus petit, pleine largeur, 2 lignes max */}
                <h1 className={`font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 ios-line-clamp break-words leading-tight ${showRapport ? "text-sm" : ""}`}>
                  {project.projet}
                </h1>

                {/* Mode normal : OFR + états sous le titre ; icônes à droite (hors de ce bloc) */}
                {!showRapport && (
                  <>
                    {project.ofrTM && (
                      <div className="text-xs text-gray-500">
                        {splitOfrNumbers(project.ofrTM).map((n, i) => (
                          <p key={i}>{i === 0 ? "OFR " : ""}{n}</p>
                        ))}
                      </div>
                    )}
                    {isAdmin && (
                      <div className="mt-1.5 flex flex-wrap items-start gap-x-3 gap-y-2">
                        <StatusDropdown
                          project={project}
                          mode="mesures"
                          label="État – Mesures"
                          onUpdate={(field, value) => {
                            setProject((prev) => prev ? { ...prev, [field]: value } : prev);
                          }}
                        />
                        <StatusDropdown
                          project={project}
                          mode="cmd"
                          label="État – CMD"
                          onUpdate={(field, value) => {
                            setProject((prev) => prev ? { ...prev, [field]: value } : prev);
                          }}
                        />
                      </div>
                    )}
                  </>
                )}

                {/* Mode rapport : OFR + État – CMD + icônes sur une ligne. */}
                {showRapport && (
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <div className="flex items-center gap-2 min-w-0">
                      {project.ofrTM && (
                        <p className="text-xs text-gray-500 truncate">OFR {project.ofrTM}</p>
                      )}
                      {isAdmin && (
                        <StatusDropdown
                          project={project}
                          mode="cmd"
                          label="État – CMD"
                          onUpdate={(field, value) => {
                            setProject((prev) => prev ? { ...prev, [field]: value } : prev);
                          }}
                        />
                      )}
                    </div>
                    <div className="flex items-center shrink-0">
                      {actionButtons}
                    </div>
                  </div>
                )}
              </div>

              {/* Mode normal : icônes d'action à droite de la ligne titre.
                  iOS : empilées à la verticale pour libérer toute la largeur au titre. */}
              {!showRapport && (
                isIOS
                  ? <div className="flex flex-col items-center shrink-0 -my-1">{actionButtons}</div>
                  : actionButtons
              )}
            </div>
          );
        })()}
      </div>

      {/* Rail d'onglets vertical (macOS), fixé tout à gauche. Icône colorée dans
          un carré arrondi ; l'onglet actif est entouré. Clic = déplie/replie. */}
      {isMac && (
        <div className="fixed left-2 top-[124px] z-30 flex flex-col gap-2">
          {/* Onglet « Fiche de travail » : admin uniquement pour l'instant. */}
          {tabDefs.filter((t) => t.id !== "fiche" || isAdmin).map(renderTabButton)}
        </div>
      )}

      {/* Barre d'onglets horizontale (iOS). Même principe que le rail macOS mais
          à l'horizontale, sous l'en-tête. "rapport" est exclu : sur iOS il reste
          piloté par le bouton dédié. Cachée en mode rapport. */}
      {isIOS && !showRapport && (
        <div className="px-4 mt-3">
          <div className="flex justify-between items-center pb-1">
            {tabDefs.filter((t) => t.id !== "rapport" && (t.id !== "fiche" || isAdmin)).map(renderTabButton)}
          </div>
        </div>
      )}

      {/* Historique des modifications (toggle) — même gabarit/alignement que les
          panneaux du dessous (padding du rail macOS inclus). */}
      {showHistory && isAdmin && (
        <div className={`px-4 sm:px-6 mt-4 ${isMac ? "!pl-24" : ""}`}>
          <ProjectHistory projectId={id} onCountChange={setHistoryCount} />
        </div>
      )}

      <div className={`px-4 sm:px-6 mt-4 ${
        isMac ? "w-full space-y-4 !pl-24"
        : showRapport ? "grid grid-cols-1 lg:grid-cols-2 gap-4"
        : isIOS ? "w-full space-y-4"
        : "w-full"
      }`}>
        {/* Colonne gauche - Informations (masquée sur mobile quand rapport ouvert) */}
        <div className={`space-y-4 ${!isMac && showRapport ? "hidden lg:block" : ""}`}>
        {/* Bouton démarrer/consulter le rapport — placé juste sous le header,
            au-dessus des cartes d'informations (demande utilisateur).
            Caché pour les modes ayant leur propre flux (mesures, services, sav). */}
        {!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode) && !showRapport && !isMac && (
          <button
            onClick={() => { setShowRapport(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className={`w-full py-4 rounded-2xl active:scale-[0.98] text-white font-semibold text-base flex items-center justify-center gap-2 shadow-lg transition-all ${
              project.rapportMonteur ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
            }`}
          >
            <FileText className="w-5 h-5" />
            {project.rapportMonteur ? "Consulter le rapport de montage" : "Démarrer le rapport de montage"}
          </button>
        )}
        {/* === Grille 2 colonnes sur md+ : gauche = projet+dates, droite = client+cabines === */}
        <div className={`grid grid-cols-1 gap-4 ${!showRapport && !isTab ? "md:grid-cols-2" : ""}`}>

        {/* --- Colonne gauche : Informations projet + Dates --- */}
        <div className="flex flex-col gap-4">

        {/* === SECTION 1 : Informations projet === */}
        <Card className={macHidden("projet") ? "!hidden" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Informations projet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">

            {/* Nom projet | Adresse chantier */}
            <div className="grid grid-cols-2 gap-3 py-1">
              <InlineField
                icon={FileText} label="Nom projet"
                value={project.nomChantier} projectId={id} fieldName="nomChantier"
                isAdmin={isAdmin}
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, nomChantier: v || "" } : prev)}
              />
              {/* Adresse : MapAddressLink en lecture, input en édition (admin) */}
              <InlineAddressField
                value={project.adresseChantier}
                projectId={id}
                isAdmin={isAdmin}
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, adresseChantier: v } : prev)}
              />
            </div>

            {/* Sous-titre N° TM */}
            <div className="flex items-center gap-2 pt-3 pb-1">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">N° TM</span>
              <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
            </div>
            <div className="grid grid-cols-3 gap-3 py-1">
              <InlineField icon={Hash} label="N° OFR TM" value={project.ofrTM} projectId={id} fieldName="ofrTM" isAdmin={isAdmin}
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, ofrTM: v || "" } : prev)} />
              <InlineField icon={Hash} label="N° CMD TM" value={project.cmdTM} projectId={id} fieldName="cmdTM" isAdmin={isAdmin}
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, cmdTM: v || "" } : prev)} />
              <InlineField icon={Hash} label="N° CMD TM - Usine" value={project.cmdTMUsine} projectId={id} fieldName="cmdTMUsine" isAdmin={isAdmin}
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, cmdTMUsine: v || "" } : prev)} />
            </div>

            {/* Sous-titre N° Grossistes (toujours visible pour admin) */}
            {(isAdmin || project.ofrGrossiste || project.cmdGrossiste) && (
              <>
                <div className="flex items-center gap-2 pt-3 pb-1">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">N° Grossistes</span>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="grid grid-cols-3 gap-3 py-1">
                  <InlineField icon={Hash} label="N° OFR Grossiste" value={project.ofrGrossiste} projectId={id} fieldName="ofrGrossiste" isAdmin={isAdmin}
                    onUpdate={(v) => setProject((prev) => prev ? { ...prev, ofrGrossiste: v || "" } : prev)} />
                  <InlineField icon={Hash} label="N° CMD Grossiste" value={project.cmdGrossiste} projectId={id} fieldName="cmdGrossiste" isAdmin={isAdmin}
                    onUpdate={(v) => setProject((prev) => prev ? { ...prev, cmdGrossiste: v || "" } : prev)} />
                  <div />
                </div>
              </>
            )}

            {/* Sous-titre N° Fournisseurs (toujours visible pour admin) */}
            {(isAdmin || project.cmdFournisseurs || project.servMesuresFournisseurs || project.servCmdFournisseurs) && (
              <>
                <div className="flex items-center gap-2 pt-3 pb-1">
                  <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">N° Fournisseurs</span>
                  <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
                </div>
                <div className="flex flex-col py-1">
                  <InlineField icon={Hash} label="N° CMD Fournisseurs" value={project.cmdFournisseurs} projectId={id} fieldName="cmdFournisseurs" isAdmin={isAdmin}
                    onUpdate={(v) => setProject((prev) => prev ? { ...prev, cmdFournisseurs: v || "" } : prev)} />
                  <InlineField icon={Hash} label="N° CMD Mesures Fournisseurs" value={project.servMesuresFournisseurs} projectId={id} fieldName="servMesuresFournisseurs" isAdmin={isAdmin}
                    onUpdate={(v) => setProject((prev) => prev ? { ...prev, servMesuresFournisseurs: v || "" } : prev)} />
                  <InlineField icon={Hash} label="N° CMD Services Fournisseurs" value={project.servCmdFournisseurs} projectId={id} fieldName="servCmdFournisseurs" isAdmin={isAdmin}
                    onUpdate={(v) => setProject((prev) => prev ? { ...prev, servCmdFournisseurs: v || "" } : prev)} />
                </div>
              </>
            )}

          </CardContent>
        </Card>

        {/* === SECTION 3 : Informations Dates === */}
        <Card className={macHidden("dates") ? "!hidden" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Informations Dates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">

            {/* 1 — Demande de projet reçue le */}
            <ExtraDateField
              label="Demande de projet reçue le"
              value={project.dateDemandeProjet}
              projectId={id}
              fieldName="dateDemandeProjet"
              onUpdate={(v) => setProject((prev) => prev ? { ...prev, dateDemandeProjet: v } : prev)}
            />

            <div className="h-px bg-gray-100 dark:bg-gray-700" />

            {/* 2 — Date demande mesures / Mesures traitée le / Mesures traitée par */}
            <div className="grid grid-cols-3 gap-2">
              <ExtraDateField
                label="Date demande de mesures reçue le"
                value={project.dateMesuresRecue}
                projectId={id}
                fieldName="dateMesuresRecue"
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, dateMesuresRecue: v } : prev)}
              />
              <ExtraDateField
                label="Mesures traitée le"
                value={project.dateMesures}
                projectId={id}
                fieldName="dateMesures"
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, dateMesures: v } : prev)}
              />
              <MesuresParCell
                value={project.mesuresTraiteePar}
                projectId={id}
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, mesuresTraiteePar: v } : prev)}
              />
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-700" />

            {/* 3 — Date d'offre */}
            <ExtraDateField
              label="Date d'offre"
              value={project.dateOffre}
              projectId={id}
              fieldName="dateOffre"
              onUpdate={(v) => setProject((prev) => prev ? { ...prev, dateOffre: v } : prev)}
            />

            <div className="h-px bg-gray-100 dark:bg-gray-700" />

            {/* 4 — CMD reçue le / Date CMD Usine */}
            <div className="grid grid-cols-2 gap-2">
              <ExtraDateField
                label="CMD reçue le"
                value={project.dateCMDRecue}
                projectId={id}
                fieldName="dateCMDRecue"
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, dateCMDRecue: v } : prev)}
              />
              <ExtraDateField
                label="Date CMD – Usine"
                value={project.dateCMDUsine}
                projectId={id}
                fieldName="dateCMDUsine"
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, dateCMDUsine: v } : prev)}
              />
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-700" />

            {/* 5 — Arrivage Grossiste / Arrivage Dépôt TM */}
            <div className="grid grid-cols-2 gap-2">
              <ExtraDateField
                label="Date d'arrivage Grossiste"
                value={project.arrivageGrossiste}
                projectId={id}
                fieldName="arrivageGrossiste"
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, arrivageGrossiste: v } : prev)}
              />
              <ExtraDateField
                label="Date d'arrivage Dépôt TM"
                value={project.arrivageTM}
                projectId={id}
                fieldName="arrivageTM"
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, arrivageTM: v } : prev)}
              />
            </div>

            <div className="h-px bg-gray-100 dark:bg-gray-700" />

            {/* 5b — Date SAV reçu le (visible uniquement si projet SAV) */}
            {project.sav && (
              <>
                <div className="h-px bg-gray-100 dark:bg-gray-700" />
                <ExtraDateField
                  label="SAV reçu le"
                  value={project.dateSAVRecu}
                  projectId={id}
                  fieldName="dateSAVRecu"
                  onUpdate={(v) => setProject((prev) => prev ? { ...prev, dateSAVRecu: v } : prev)}
                />
              </>
            )}

            <div className="h-px bg-gray-100 dark:bg-gray-700" />

            {/* 6 — Date de montage / Montage traité par */}
            <div className="grid grid-cols-2 gap-3">
              <EditableDate
                project={project}
                mode={mode}
                onUpdate={(newDate) => {
                  const field = mode === "mesures" ? "dateMesures" : "dateMontage";
                  setProject({ ...project, [field]: newDate });
                }}
              />
              <EditableCollaborateur
                project={project}
                mode={mode}
                onUpdate={(newCollab) => {
                  const field = mode === "mesures" ? "mesuresTraiteePar" : "collaborateurs";
                  setProject({ ...project, [field]: newCollab });
                }}
              />
            </div>

            {/* 7 — Durée estimée */}
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <DurationEstimate project={project} />
            )}

          </CardContent>
        </Card>

        </div>{/* fin colonne gauche */}

        {/* --- Colonne droite : Informations client + Cabines --- */}
        <div className="space-y-4">

        {/* === SECTION 2 : Informations client === */}
        <Card className={macHidden("client") ? "!hidden" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Informations client</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Ligne 1 : Type de client | Grossistes/Fournisseurs */}
            <div className="grid grid-cols-2 gap-3">
              {project.typeClient && (
                <div className="flex items-start gap-2">
                  <Tag className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Type de client</p>
                    <Badge variant="secondary" className="text-xs mt-0.5">{project.typeClient}</Badge>
                  </div>
                </div>
              )}
              {/* Grossistes OU Fournisseurs selon Type de client */}
              {project.typeClient === "Fournisseurs" || project.typeClient === "Fournisseur" ? (
                project.fournisseursNames && project.fournisseursNames.length > 0 ? (
                  <div className="flex items-start gap-2">
                    <Building2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Fournisseurs</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {project.fournisseursNames.map((f) => (
                          <Badge key={f} variant="outline" className="text-xs">{f}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : <div />
              ) : (
                project.grossistesNames && project.grossistesNames.length > 0 ? (
                  <div className="flex items-start gap-2">
                    <Building2 className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Grossistes</p>
                      <div className="flex flex-wrap gap-1 mt-0.5">
                        {project.grossistesNames.map((g) => (
                          <Badge key={g} variant="outline" className="text-xs">{g}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : <div />
              )}
            </div>
            {/* Ligne 2 : Sanitaire | Contact Projet */}
            <div className="grid grid-cols-2 gap-3">
              {project.sanitaireNames && project.sanitaireNames.length > 0 && (
                <div className="flex items-start gap-2">
                  <Building2 className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Sanitaire (Entreprise)</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {project.sanitaireNames.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {project.contactsProjetNames && project.contactsProjetNames.length > 0 && (
                <div className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Contact Projet</p>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {project.contactsProjetNames.map((c) => (
                        <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Contacts pour RDV + Appeler/WhatsApp */}
            {project.contactsRDV && (
              <div className="pt-1">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Contacts pour RDV</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{project.contactsRDV}</p>
                  </div>
                </div>
                <div className="ml-6 mt-1">
                  <ContactButtons contactName={project.contactsRDV} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* === SECTION 4 : Informations cabines === */}
        <Card className={macHidden("cabines") ? "!hidden" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Informations cabines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <InlineField
                icon={Box} label="Nb. Cabines" type="number"
                value={project.nbCabines} projectId={id} fieldName="nbCabines"
                isAdmin={isAdmin}
                onUpdate={(v) => setProject((prev) => prev ? { ...prev, nbCabines: v } : prev)}
              />
              {project.fournisseurs.length > 0 && (
                <div className="flex items-start gap-2">
                  <Truck className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Fournisseurs</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {project.fournisseurs.map((f) => (
                        <Badge key={f} variant="secondary" className="text-xs">{f}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {project.seriesCabines.length > 0 && (
                <div className="flex items-start gap-2">
                  <Box className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Séries Cabines</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {project.seriesCabines.map((s) => (
                        <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            {/* Monteur sous-traitance (MONO-CABINE) — ADMIN UNIQUEMENT. En
                multi-cabine, le champ est PAR CABINE (dans chaque carte). Sync
                Notion « Monteurs sous-traitance ». */}
            {isAdmin && !isCabineMode && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
                <InlineField
                  icon={PenLine}
                  label="Monteur sous-traitance"
                  value={project.monteursSousTraitance}
                  projectId={id}
                  fieldName="monteursSousTraitance"
                  isAdmin={isAdmin}
                  onUpdate={(v) => setProject((prev) => prev ? { ...prev, monteursSousTraitance: v ?? "" } : prev)}
                />
                <p className="text-[10px] text-gray-400 mt-1 ml-6">Saisie libre — projets sous-traités (admin uniquement).</p>
              </div>
            )}
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <EmplacementSelect
                      value={project.emplacementCabine}
                      projectId={id}
                      isAdmin={isAdmin}
                      onUpdate={(v) => setProject((prev) => prev ? { ...prev, emplacementCabine: v } : prev)}
                    />
                  </div>
                </div>
                <InlineField
                  icon={Package} label="Nb. de cartons" type="number"
                  value={project.nbCartons} projectId={id} fieldName="nbCartons"
                  isAdmin={isAdmin}
                  onUpdate={(v) => setProject((prev) => prev ? { ...prev, nbCartons: v } : prev)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* === Commentaires Notion natifs === */}
        <div className={macHidden("commentaires") ? "!hidden" : ""}>
          <NotionComments projectId={id} onCountChange={setNotionCommentsCount} />
        </div>

        </div>{/* fin colonne droite */}
        </div>{/* fin grille 2 colonnes */}

        {/* === SECTION : Fiche de travail (admin uniquement, en cours de mise en place) === */}
        {isAdmin && (
        <Card className={macHidden("fiche") ? "!hidden" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 font-semibold text-indigo-700 dark:text-indigo-300">
              <span className="w-1 h-4 rounded-full bg-indigo-600 dark:bg-indigo-300 shrink-0" />
              Fiche de travail
            </CardTitle>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 pl-3">
              {project.ofrTM || "TM-—"}{project.projet ? ` · ${project.projet}` : ""}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {(() => {
              const val = (v: unknown) => {
                if (Array.isArray(v)) return v.filter(Boolean).join(", ") || "—";
                if (v === null || v === undefined || v === "") return "—";
                return String(v);
              };
              const fmt = (d?: string | null) => (d ? formatDate(d) : "—");
              // Plage de dates (Montage peut s'étaler sur plusieurs jours).
              const fmtRange = (start?: string | null, end?: string | null) => {
                if (!start) return "—";
                if (end && end.slice(0, 10) !== start.slice(0, 10)) return `${fmt(start)} → ${fmt(end)}`;
                return fmt(start);
              };
              // "date — personne(s)" ; masque le tiret si l'un des deux manque.
              const join2 = (a: string, b?: string) => {
                const parts = [a && a !== "—" ? a : "", (b || "").trim()].filter(Boolean);
                return parts.length ? parts.join(" — ") : "—";
              };
              const TODO = "à configurer dans Notion";
              const sections: { title: string; rows: [string, React.ReactNode][] }[] = [
                {
                  title: "Général",
                  rows: [
                    ["Nb. cabines", val(project.nbCabines)],
                    ["Fournisseurs", val(project.fournisseurs)],
                    ["Séries cabines", val(project.seriesCabines)],
                    ["Nb. de cartons", val(project.nbCartons)],
                    ["Emplacement de cabine", val(project.emplacementCabine)],
                  ],
                },
                {
                  title: "Rendez-vous",
                  rows: [
                    ["Mesures", join2(project.dateMesures ? fmt(project.dateMesures) : val(project.etatMesures), project.mesuresTraiteePar)],
                    ["Montage", join2(fmtRange(project.dateMontage, project.dateMontageEnd), project.collaborateurs)],
                    ["SAV", join2(fmt(project.dateRDVSAV), project.collaborateursSAV)],
                    ["Garantie", join2(fmt(project.dateRDVGarantie), project.collaborateurGarantie)],
                    ["Services", <span className="text-gray-400 italic">à venir</span>],
                  ],
                },
                {
                  title: "Lieu du RDV",
                  rows: [["Adresse chantier", val(project.adresseChantier)]],
                },
                {
                  title: "Numéro de commande",
                  rows: [
                    ["N° OFR TM", val(project.ofrTM)],
                    ["N° CMD TM", val(project.cmdTM)],
                    ["N° CMD TM - Usine", val(project.cmdTMUsine)],
                    ["N° OFR Grossiste", val(project.ofrGrossiste)],
                    ["N° CMD Grossiste", val(project.cmdGrossiste)],
                    ["N° CMD Fournisseur", val(project.cmdFournisseurs)],
                    ["N° Mesures Fournisseurs", val(project.servMesuresFournisseurs)],
                    ["N° Montage Fournisseurs", val(project.servCmdFournisseurs)],
                  ],
                },
                {
                  title: "Contact",
                  rows: [
                    ["Grossiste", val(project.grossistesNames)],
                    ["Installateur", <span className="text-gray-400 italic">{TODO}</span>],
                    ["Architecte", <span className="text-gray-400 italic">{TODO}</span>],
                    ["DT", <span className="text-gray-400 italic">{TODO}</span>],
                    ["Client final", <span className="text-gray-400 italic">{TODO}</span>],
                  ],
                },
              ];
              return sections.map((s) => (
                <div key={s.title}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-1">
                    {s.title}
                  </p>
                  <div className="rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
                    {s.rows.map(([label, value], i) => (
                      <div
                        key={label}
                        className={`flex items-start justify-between gap-3 px-3 py-2 ${
                          i > 0 ? "border-t border-gray-50 dark:border-slate-700/50" : ""
                        }`}
                      >
                        <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
                        <span className="text-sm font-medium text-gray-800 dark:text-gray-100 text-right break-words">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ));
            })()}
            {/* Export PDF + lien public (calendrier) */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                type="button"
                disabled={downloadingFiche}
                onClick={handleDownloadFiche}
                className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white active:scale-95 transition-all disabled:opacity-60"
              >
                {downloadingFiche ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
                Télécharger le PDF
              </button>
              <button
                type="button"
                disabled={copyingFicheLink}
                onClick={handleCopyFicheLink}
                title="Copier un lien public vers ce PDF (pour les calendriers)"
                className="flex-1 h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-semibold border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 active:scale-95 transition-all disabled:opacity-60"
              >
                {copyingFicheLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Copier le lien
              </button>
            </div>
            <p className="text-[10px] text-gray-400 text-center pt-1">
              Fiche visible uniquement par l&apos;admin — en cours de mise en place.
            </p>
          </CardContent>
        </Card>
        )}

        {/* === Documents (plateformes SANS onglets : tout ici ; macOS + iOS : réparti
              en cartes propres avec titres Notion plus bas) === */}
        <Card className={isTab ? "!hidden" : ""}>
          <CardContent className="pt-4">
            {/* Documents Mesures → onglet Mesures */}
            <div className={macHidden("mesures") ? "!hidden" : "contents"}>
            <DocumentLinks files={project.documentsMesures} label="Documents Mesures" projectId={id} notionField="Documents pour prise de mesures" />
            </div>

            {/* Commentaires Mesures — iOS : ici. macOS : carte propre plus bas. */}
            <div className={isMac ? "!hidden" : "contents"}>
            <div className="mt-2">
              <EditableTextField
                label="Commentaires Mesures"
                value={project.commentairesMesures}
                projectId={id}
                fieldName="commentairesMesures"
                notionField="Commentaires Mesures"
                multiline
                onUpdate={(v) => setProject({ ...project, commentairesMesures: v })}
              />
            </div>
            </div>

            {/* Documents Montage → onglet Mesures */}
            <div className={macHidden("mesures") ? "!hidden" : "contents"}>
            <DocumentLinks files={project.documentsMontagee} label="Documents Montage" projectId={id} notionField="Documents pour Montage" />
            </div>

            {/* Commentaires Montages — iOS : ici. macOS : carte propre plus bas. */}
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <div className={isMac ? "!hidden" : "contents"}>
              <div className="mt-3">
                <EditableTextField
                  label="Commentaires Montages"
                  value={project.commentairesMontages}
                  projectId={id}
                  fieldName="commentairesMontages"
                  notionField="Commentaires Montages"
                  multiline
                  onUpdate={(v) => {
                    setProject({ ...project, commentairesMontages: v });
                    // Même champ Notion que la zone "commentaires" du rapport :
                    // on synchronise l'état + la snapshot pour éviter qu'une
                    // auto-sauvegarde du rapport ne réécrive l'ancienne valeur.
                    setCommentaires(v);
                    serverSnapshotRef.current.commentaires = v;
                  }}
                />
              </div>
              </div>
            )}
            <div className={macHidden("cabines") ? "!hidden" : "contents"}>
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <DeliveryScan projectId={id} bonLivraison={project.bonLivraison} />
            )}
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <CartonPhotos projectId={id} initialPhotos={project.photosCartons} />
            )}
            </div>
          </CardContent>
        </Card>

        {/* macOS + iOS : chaque bloc (documents, commentaires, bon de livraison,
            cartons) dans sa propre carte avec titre style Notion. */}
        {isTab && (
          <>
            {/* Onglet Mesures — Documents Mesures + Commentaires Mesures dans une seule carte */}
            <Card className={macHidden("mesures") ? "!hidden" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Documents Mesures</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(project.documentsMesures || []).length > 0
                  ? <DocumentLinks files={project.documentsMesures} label="Documents Mesures" hideLabel projectId={id} notionField="Documents pour prise de mesures" />
                  : <p className="text-xs text-gray-400 dark:text-gray-500 italic">Aucun document</p>}
                <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                  <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300 mb-3"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Commentaires Mesures</CardTitle>
                  <EditableTextField
                    label="Commentaires Mesures"
                    hideLabel
                    value={project.commentairesMesures}
                    projectId={id}
                    fieldName="commentairesMesures"
                    notionField="Commentaires Mesures"
                    multiline
                    onUpdate={(v) => setProject({ ...project, commentairesMesures: v })}
                  />
                </div>
              </CardContent>
            </Card>
            {/* Onglet Mesures — Documents Montage + Commentaires Montage dans une seule carte */}
            <Card className={macHidden("mesures") ? "!hidden" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Documents Montage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {(project.documentsMontagee || []).length > 0
                  ? <DocumentLinks files={project.documentsMontagee} label="Documents Montage" hideLabel projectId={id} notionField="Documents pour Montage" />
                  : <p className="text-xs text-gray-400 dark:text-gray-500 italic">Aucun document</p>}
                {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
                    <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300 mb-3"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Commentaires Montage</CardTitle>
                    <EditableTextField
                      label="Commentaires Montages"
                      hideLabel
                      value={project.commentairesMontages}
                      projectId={id}
                      fieldName="commentairesMontages"
                      notionField="Commentaires Montages"
                      multiline
                      onUpdate={(v) => {
                        setProject({ ...project, commentairesMontages: v });
                        setCommentaires(v);
                        serverSnapshotRef.current.commentaires = v;
                      }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
            {/* Bon de livraison — onglet Cabines */}
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <Card className={macHidden("cabines") ? "!hidden" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Bon de livraison</CardTitle>
                </CardHeader>
                <CardContent>
                  <DeliveryScan projectId={id} bonLivraison={project.bonLivraison} hideTitle />
                </CardContent>
              </Card>
            )}
            {/* État des cartons réceptionnés — onglet Cabines */}
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <Card className={macHidden("cabines") ? "!hidden" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />État des cartons réceptionnés</CardTitle>
                </CardHeader>
                <CardContent>
                  <CartonPhotos projectId={id} initialPhotos={project.photosCartons} hideTitle />
                </CardContent>
              </Card>
            )}
            {/* Onglet Commentaires — cartes autonomes (affichées seulement si l'onglet
                Mesures est replié, sinon les commentaires sont déjà dans les cartes Mesures) */}
            <Card className={(macHidden("commentaires") || !macHidden("mesures")) ? "!hidden" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Commentaires Mesures</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableTextField
                  label="Commentaires Mesures"
                  hideLabel
                  value={project.commentairesMesures}
                  projectId={id}
                  fieldName="commentairesMesures"
                  notionField="Commentaires Mesures"
                  multiline
                  onUpdate={(v) => setProject({ ...project, commentairesMesures: v })}
                />
              </CardContent>
            </Card>
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <Card className={(macHidden("commentaires") || !macHidden("mesures")) ? "!hidden" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Commentaires Montage</CardTitle>
                </CardHeader>
                <CardContent>
                  <EditableTextField
                    label="Commentaires Montages"
                    hideLabel
                    value={project.commentairesMontages}
                    projectId={id}
                    fieldName="commentairesMontages"
                    notionField="Commentaires Montages"
                    multiline
                    onUpdate={(v) => {
                      setProject({ ...project, commentairesMontages: v });
                      setCommentaires(v);
                      serverSnapshotRef.current.commentaires = v;
                    }}
                  />
                </CardContent>
              </Card>
            )}
          </>
        )}

        {showRapport && !isMac && !["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode) && (
          <button
            onClick={() => { setShowRapport(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm flex items-center justify-center gap-2 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux informations projet
          </button>
        )}

        </div>
        {/* Colonne droite - Rapport. macOS : visible via l'onglet "Rapport". */}
        <div className={`space-y-4 ${isMac ? (macHidden("rapport") ? "!hidden" : "") : (!showRapport ? "hidden" : "")}`}>
        {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (() => {
          // ── Progression ──────────────────────────────────────────────────
          // Multi-cabine : % basé uniquement sur les cabines installées (photosMontage présentes)
          // Simple : % basé sur la checklist 5 critères
          let percent: number;
          let progressLabel: React.ReactNode;

          if (isCabineMode) {
            percent = cabines.length === 0 ? 0 : Math.round((installedCabineCount / cabines.length) * 100);
            progressLabel = (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">
                {installedCabineCount}/{cabines.length} cabine{cabines.length > 1 ? "s" : ""} installée{cabines.length > 1 ? "s" : ""}
              </p>
            );
          } else {
            const countPhotosForCab = (photos: { name: string; url: string }[] | undefined, cab: number | null): number => {
              if (!photos) return 0;
              if (cab === null) return photos.length;
              return photos.filter((p) => new RegExp(`\\.Cab${cab}\\.`).test(p.name || "")).length;
            };
            const checklist: { label: string; done: boolean }[] = [
              { label: "Heure d'arrivée",        done: !!heureArrivee },
              { label: "Heure de départ",         done: !!heureDepart },
              { label: "Rapport rempli",           done: rapport.trim().length > 0 },
              { label: "Photos avant montage",     done: countPhotosForCab(project?.photosAvant, null) > 0 },
              { label: "Photos montage terminé",   done: countPhotosForCab(project?.photosMontage, null) > 0 },
            ];
            const done = checklist.filter((c) => c.done).length;
            const total = checklist.length;
            percent = total === 0 ? 0 : Math.round((done / total) * 100);
            progressLabel = (
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">
                {done}/{total} étapes validées
              </p>
            );
          }

          // ── Cabines installées groupées par date ──────────────────────────
          // N'affiche que les cabines avec photos montage (= installées), groupées par date
          const cabinesByDate: Record<string, { nom: string; monteur: string }[]> = {};
          if (isCabineMode) {
            const sousTraitMap = parseSousTraitance(project?.monteursSousTraitance || "");
            cabines.forEach((c, i) => {
              if (!installedCabineIndices.has(i)) return;
              const key = c.date || "__nodate__";
              if (!cabinesByDate[key]) cabinesByDate[key] = [];
              // À défaut de monteur (employé), afficher le sous-traitant.
              cabinesByDate[key].push({ nom: c.nom || `Cabine ${i + 1}`, monteur: c.monteur || sousTraitMap[i + 1] || "" });
            });
          }
          const sortedDates = Object.keys(cabinesByDate).sort((a, b) =>
            a === "__nodate__" ? 1 : b === "__nodate__" ? -1 : a.localeCompare(b)
          );

          const fmtDate = (d: string) => {
            if (d === "__nodate__") return "Date inconnue";
            try {
              return new Date(d + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
            } catch { return d; }
          };

          return (
            <div className="space-y-1.5">
              {/* Barre de progression */}
              <div className="glass-card rounded-2xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Progression du montage</span>
                    {percent === 100 && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">
                        Terminé
                      </span>
                    )}
                  </div>
                  <span className={`text-sm font-bold ${percent === 100 ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-cyan-300"}`}>
                    {percent}%
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${percent}%`,
                      background: percent === 100
                        ? "linear-gradient(to right, #10b981, #22c55e)"
                        : "linear-gradient(to right, #2563eb, #06b6d4)",
                    }}
                  />
                </div>
                {progressLabel}
              </div>

              {/* Cabines installées par date — uniquement en mode multi-cabine */}
              {isCabineMode && sortedDates.length > 0 && (
                <div className="glass-card rounded-2xl overflow-hidden divide-y divide-gray-100 dark:divide-slate-700/60">
                  {sortedDates.map((dateKey) => {
                    const items = cabinesByDate[dateKey];
                    const isOpen = expandedCabineDate === dateKey;
                    return (
                      <div key={dateKey}>
                        <button
                          type="button"
                          onClick={() => setExpandedCabineDate(isOpen ? null : dateKey)}
                          className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5 active:bg-gray-100 dark:active:bg-white/10 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500 shrink-0" />
                            <span className="text-[11px] font-medium text-gray-700 dark:text-gray-300">
                              {items.length} cabine{items.length > 1 ? "s" : ""} installée{items.length > 1 ? "s" : ""} le {fmtDate(dateKey)}
                            </span>
                          </div>
                          {isOpen
                            ? <ChevronUp className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                        </button>
                        {isOpen && (
                          <div className="px-3 pb-3 pt-1 space-y-1.5">
                            {items.map((item, j) => (
                              <div key={j} className="flex items-center justify-between gap-2">
                                <span className="text-[11px] text-gray-700 dark:text-gray-300 font-medium">{item.nom}</span>
                                {item.monteur && (
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{item.monteur}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
          <>
            {/* Heures & statistiques — en MULTI-CABINE c'est la vue STATS agrégée
                (heures/perf par collaborateur) → réservée à l'ADMIN. En
                mono-cabine c'est la SAISIE des heures de l'employé → toujours
                visible. */}
            {!(isCabineMode && !isAdmin) && (
            <Card>
              <CardHeader className="pb-2">
                <button
                  type="button"
                  onClick={() => setShowHeuresCard((v) => !v)}
                  className="w-full flex items-center justify-between"
                >
                  <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Suivi des heures</CardTitle>
                  {showHeuresCard
                    ? <ChevronUp className="w-4 h-4 text-gray-400" />
                    : <ChevronDown className="w-4 h-4 text-gray-400" />}
                </button>
              </CardHeader>
              {showHeuresCard && <CardContent className="space-y-4">
                {/* Mode simple (1 cabine) */}
                {!isMultiDay && (
                  <>
                  <SiteTimer
                    projectId={project.id}
                    heureArrivee={heureArrivee}
                    heureDepart={heureDepart}
                    onArrival={(time) => {
                      setHeureArrivee(time);
                      offlineFetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heureArrivee: time }) }).catch(console.error);
                    }}
                    onDeparture={(time) => {
                      setHeureDepart(time);
                      offlineFetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heureDepart: time }) }).catch(console.error);
                    }}
                    onArriveeChange={(time) => {
                      setHeureArrivee(time);
                      offlineFetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heureArrivee: time }) }).catch(console.error);
                    }}
                    onDepartChange={(time) => {
                      setHeureDepart(time);
                      offlineFetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heureDepart: time }) }).catch(console.error);
                    }}
                  />
                  {/* GPS DÉSACTIVÉ — décommenter le bloc ci-dessous pour réactiver
                  <GPSTracker
                    chantierAddress={project.adresseChantier}
                    projectId={id}
                    silent={currentUser?.role !== "admin"}
                    heureArrivee={project.heureArrivee}
                    heureDepart={project.heureDepart}
                  />
                  {isAdmin && (
                    <AdminGpsTimer projectId={id} />
                  )}
                  */}
                  {/* Heures arrivée/départ intégrées dans le SiteTimer ci-dessus */}
                  {heureArrivee && heureDepart && (() => {
                    const [ah, am] = heureArrivee.split(":").map(Number);
                    const [dh, dm] = heureDepart.split(":").map(Number);
                    const diff = (dh * 60 + dm) - (ah * 60 + am);
                    if (diff > 0) {
                      const h = Math.floor(diff / 60);
                      const m = diff % 60;
                      return (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium">
                          <Clock className="w-4 h-4" />
                          Total : {h}h {m.toString().padStart(2, "0")}min
                        </div>
                      );
                    }
                    return null;
                  })()}
                  {/* Passer en plusieurs interventions datées (déplacements multiples) */}
                  <button
                    type="button"
                    onClick={enableMultiInterventions}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 active:bg-blue-50 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Plusieurs interventions (jours / collaborateurs)
                  </button>
                  </>
                )}

                {/* Mode tableau multi-jours (mono-cabine uniquement) */}
                {isMultiDay && !isCabineMode && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Interventions</Label>
                      <button
                        type="button"
                        onClick={disableMultiInterventions}
                        className="text-xs text-gray-400 hover:text-gray-600 underline"
                      >
                        Revenir au mode simple
                      </button>
                    </div>
                    {pointages.map((entry, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500">Intervention {idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => removePointage(idx)}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-red-50 text-gray-400 hover:text-red-500"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <Label className="text-xs">Date</Label>
                            <Input
                              type="date"
                              value={entry.date}
                              onChange={(e) => updatePointage(idx, "date", e.target.value)}
                              className="mt-0.5 h-10 text-sm max-w-[200px] bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Collaborateurs</Label>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              {COLLABORATEURS_LIST.map((c) => {
                                const selected = (entry.collaborateur || "").split(" & ").map((s) => s.trim()).includes(c);
                                const colors = getCollaboratorColor(c);
                                return (
                                  <button
                                    key={c}
                                    type="button"
                                    onClick={() => {
                                      const current = (entry.collaborateur || "").split(" & ").map((s) => s.trim()).filter(Boolean);
                                      const newVal = selected
                                        ? current.filter((n) => n !== c).join(" & ")
                                        : [...current, c].join(" & ");
                                      updatePointage(idx, "collaborateur", newVal);
                                    }}
                                    className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-full transition-all ${
                                      selected ? "ring-2 ring-offset-1 ring-blue-400" : "opacity-40"
                                    }`}
                                    style={{ backgroundColor: colors.bg, color: colors.text }}
                                  >
                                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.dot }} />
                                    {c}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Arrivée</Label>
                            <Input
                              type="time"
                              value={entry.arrivee}
                              onChange={(e) => updatePointage(idx, "arrivee", e.target.value)}
                              className="mt-0.5 h-10 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Départ</Label>
                            <Input
                              type="time"
                              value={entry.depart}
                              min={entry.arrivee || undefined}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v && entry.arrivee && v < entry.arrivee) {
                                  toast.error("L'heure de départ ne peut pas être avant l'arrivée.");
                                  return;
                                }
                                updatePointage(idx, "depart", v);
                              }}
                              className="mt-0.5 h-10 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addPointage}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-500 active:bg-blue-50 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Ajouter une intervention
                    </button>
                    {pointages.some((e) => e.arrivee && e.depart) && (() => {
                      const dayMinutes = pointages.map((e) => {
                        if (!e.arrivee || !e.depart) return 0;
                        const [ah, am] = e.arrivee.split(":").map(Number);
                        const [dh, dm] = e.depart.split(":").map(Number);
                        const diff = (dh * 60 + dm) - (ah * 60 + am);
                        return diff > 0 ? diff : 0;
                      });
                      const totalMin = dayMinutes.reduce((s, m) => s + m, 0);
                      if (totalMin === 0) return null;
                      return (
                        <div className="space-y-1 px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 text-sm">
                          {pointages.map((e, i) => {
                            if (dayMinutes[i] === 0) return null;
                            const h = Math.floor(dayMinutes[i] / 60);
                            const m = dayMinutes[i] % 60;
                            return (
                              <div key={i} className="flex justify-between text-blue-600 dark:text-blue-400">
                                <span>{e.date}{e.collaborateur ? ` - ${e.collaborateur}` : ""}</span>
                                <span className="font-medium">{h}h {m.toString().padStart(2, "0")}min</span>
                              </div>
                            );
                          })}
                          <div className="flex items-center justify-between pt-1 border-t border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold">
                            <span className="flex items-center gap-2"><Clock className="w-4 h-4" />Total</span>
                            <span>{Math.floor(totalMin / 60)}h {(totalMin % 60).toString().padStart(2, "0")}min</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* ── Statistiques automatiques (mode multi-cabines, admin uniquement) ── */}
                {isCabineMode && isAdmin && (() => {
                  const fmtMin = (m: number) =>
                    m === 0 ? "—" : `${Math.floor(m / 60)}h${(m % 60).toString().padStart(2, "0")}`;

                  // Durée en minutes pour une cabine
                  const cabMin = (c: typeof cabines[0]) => {
                    if (!c.arrivee || !c.depart) return 0;
                    const [ah, am] = c.arrivee.split(":").map(Number);
                    const [dh, dm] = c.depart.split(":").map(Number);
                    const diff = (dh * 60 + dm) - (ah * 60 + am);
                    return diff > 0 ? diff : 0;
                  };

                  // Regroupement par collaborateur. À défaut de monteur employé,
                  // on compte le SOUS-TRAITANT (sans heures → total « — »).
                  const stMapCollab = parseSousTraitance(project?.monteursSousTraitance || "");
                  const byCollab = new Map<string, { count: number; minutes: number; days: Set<string> }>();
                  cabines.forEach((c, i) => {
                    const min = cabMin(c);
                    const monteurs = (c.monteur || "").split(" & ").map((s) => s.trim()).filter(Boolean);
                    const names = monteurs.length > 0 ? monteurs : (stMapCollab[i + 1] ? [stMapCollab[i + 1]] : []);
                    names.forEach((m) => {
                      let cur = byCollab.get(m);
                      if (!cur) { cur = { count: 0, minutes: 0, days: new Set<string>() }; byCollab.set(m, cur); }
                      cur.count += 1;
                      cur.minutes += min;
                      if (c.date) cur.days.add(c.date); // nombre de jours DISTINCTS travaillés
                    });
                  });

                  // Regroupement par date. À défaut de monteur (employé), on
                  // affiche le SOUS-TRAITANT (les heures restent vides « — »).
                  const sousTraitMap = parseSousTraitance(project?.monteursSousTraitance || "");
                  const byDay = new Map<string, { nom: string; monteur: string; minutes: number; arrivee: string; depart: string; idx: number }[]>();
                  cabines.forEach((c, i) => {
                    if (!c.date) return;
                    const nom = c.nom || `Cabine ${i + 1}`;
                    if (!byDay.has(c.date)) byDay.set(c.date, []);
                    byDay.get(c.date)!.push({ nom, monteur: c.monteur || sousTraitMap[i + 1] || "", minutes: cabMin(c), arrivee: c.arrivee || "", depart: c.depart || "", idx: i });
                  });

                  const totalMin = cabines.reduce((s, c) => s + cabMin(c), 0);
                  const hasAnyData = byCollab.size > 0 || byDay.size > 0;

                  if (!hasAnyData) {
                    return (
                      <p className="text-xs text-gray-400 text-center py-2">
                        Les statistiques apparaîtront au fur et à mesure de la saisie des heures par cabine.
                      </p>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {/* Par collaborateur */}
                      {byCollab.size > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                            Par collaborateur
                          </p>
                          <div className="space-y-1.5">
                            {[...byCollab.entries()].map(([name, { count, minutes, days }]) => {
                              const colors = getCollaboratorColor(name);
                              const nbJours = days.size;
                              const active = heuresFilterCollab === name;
                              // Part des cabines installées par ce collaborateur sur le
                              // total DÉJÀ installé (ex. Jacobo 3 / 24).
                              const pctInstalle = installedCabineCount > 0 ? Math.round((count / installedCabineCount) * 1000) / 10 : 0;
                              return (
                                <button
                                  key={name}
                                  type="button"
                                  onClick={() => setHeuresFilterCollab(active ? "" : name)}
                                  title={active ? "Cliquer pour tout réafficher" : "Cliquer pour ne voir que ses lots"}
                                  className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl transition-colors ${active ? "bg-blue-100 dark:bg-blue-900/40 ring-2 ring-blue-400" : "bg-gray-50 dark:bg-slate-700/50 hover:bg-gray-100 dark:hover:bg-slate-700"}`}
                                >
                                  <span
                                    className="w-2 h-2 rounded-full shrink-0"
                                    style={{ backgroundColor: colors.dot }}
                                  />
                                  <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200">{name}</span>
                                  {installedCabineCount > 0 && (
                                    <span className="shrink-0 text-xs font-bold text-blue-600 dark:text-blue-400 tabular-nums min-w-[46px] text-right" title={`${count} sur ${installedCabineCount} cabines installées`}>
                                      {pctInstalle}%
                                    </span>
                                  )}
                                  <div className="text-right">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                      {count} cabine{count > 1 ? "s" : ""}
                                      {nbJours > 0 && <> · {nbJours} jour{nbJours > 1 ? "s" : ""}</>}
                                    </p>
                                    {minutes > 0 && (
                                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                                        moy.&nbsp;{fmtMin(Math.round(minutes / count))}/cab
                                      </p>
                                    )}
                                  </div>
                                  <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 min-w-[52px] text-right">
                                    {fmtMin(minutes)}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          {heuresFilterCollab && (
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1.5 px-1">
                              Filtré sur <b>{heuresFilterCollab}</b> — <button type="button" onClick={() => setHeuresFilterCollab("")} className="underline">tout afficher</button>
                            </p>
                          )}
                        </div>
                      )}

                      {/* Par journée */}
                      {byDay.size > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                            Par journée
                          </p>
                          <div className="space-y-2">
                            {[...byDay.entries()]
                              .sort(([a], [b]) => a.localeCompare(b))
                              .map(([date, allItems]) => {
                                // Filtre par collaborateur (clic dans « Par collaborateur »).
                                const items = heuresFilterCollab
                                  ? allItems.filter((it) => (it.monteur || "").split(" & ").map((s) => s.trim()).includes(heuresFilterCollab))
                                  : allItems;
                                if (items.length === 0) return null;
                                const dayTotal = items.reduce((s, i) => s + i.minutes, 0);
                                const dateLabel = (() => {
                                  try {
                                    return new Date(date + "T00:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit" });
                                  } catch { return date; }
                                })();
                                // Plage horaire globale de la journée : 1ʳᵉ arrivée → dernier départ
                                // (parmi les lots qui ont des heures saisies).
                                const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
                                const fmtHM = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
                                const timed = items.filter((it) => it.arrivee && it.depart);
                                const dayRange = timed.length
                                  ? `${fmtHM(Math.min(...timed.map((it) => toMin(it.arrivee))))} → ${fmtHM(Math.max(...timed.map((it) => toMin(it.depart))))}`
                                  : "";
                                return (
                                  <div key={date} className="rounded-xl border border-gray-100 dark:border-slate-700 overflow-hidden">
                                    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-gray-50 dark:bg-slate-700/60">
                                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{dateLabel}</span>
                                      {dayRange && (
                                        <span className="text-[10px] font-medium text-gray-400 dark:text-gray-500 tabular-nums">{dayRange}</span>
                                      )}
                                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{fmtMin(dayTotal)}</span>
                                    </div>
                                    <div className="divide-y divide-gray-50 dark:divide-slate-700/50">
                                      {items.map((item, i) => (
                                        <div key={i} className="flex items-center gap-2 px-3 py-1.5">
                                          <button
                                            type="button"
                                            onClick={() => openCabineByIndex(item.idx)}
                                            title="Ouvrir ce lot"
                                            className="flex-1 min-w-0 text-left text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline truncate"
                                          >
                                            {item.nom}
                                          </button>
                                          {item.monteur && (
                                            <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[90px]">{item.monteur}</span>
                                          )}
                                          {item.arrivee && item.depart && (
                                            <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">{item.arrivee} → {item.depart}</span>
                                          )}
                                          <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[40px] text-right shrink-0">{fmtMin(item.minutes)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                          </div>
                        </div>
                      )}

                      {/* Total général */}
                      {totalMin > 0 && (
                        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
                          <span className="flex items-center gap-2 text-sm font-semibold text-blue-700 dark:text-blue-300">
                            <Clock className="w-4 h-4" />
                            Total projet
                          </span>
                          <span className="text-sm font-bold text-blue-700 dark:text-blue-300">{fmtMin(totalMin)}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </CardContent>}
            </Card>
            )}

            <Separator />

            {/* Mode mono-cabine */}
            {!isCabineMode && (
              <>
                <Card>
                  <CardHeader className="pb-0">
                    <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Rapport & Photos</CardTitle>
                  </CardHeader>
                  {/* ── Onglets Rapport / Photos (mono-cabine) : contrôle segmenté
                        (pilules) → clairement cliquable, segment actif rempli de
                        la couleur du thème. ── */}
                  <div className="mx-6 mt-1 flex gap-1.5 p-1 rounded-xl bg-gray-100 dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setMonoActiveTab("rapport")}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-1.5 active:scale-[0.98] ${
                        monoActiveTab === "rapport"
                          ? "bg-[#1e3a5f] text-white shadow-sm"
                          : "text-[#1e3a5f] dark:text-blue-200 hover:bg-white/70 dark:hover:bg-white/5"
                      }`}
                    >
                      Rapport
                      {!rapport.trim() && <span className={`w-2 h-2 rounded-full ${monoActiveTab === "rapport" ? "bg-red-300" : "bg-red-400 dark:bg-red-500"}`} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setMonoActiveTab("photos")}
                      className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all active:scale-[0.98] ${
                        monoActiveTab === "photos"
                          ? "bg-[#1e3a5f] text-white shadow-sm"
                          : "text-[#1e3a5f] dark:text-blue-200 hover:bg-white/70 dark:hover:bg-white/5"
                      }`}
                    >
                      Photos
                    </button>
                  </div>
                  <CardContent className="space-y-4 pt-4">
                    {monoActiveTab === "rapport" && (
                      <>
                        <div className="rounded-2xl border-2 border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center shrink-0">
                              <FileText className="w-3.5 h-3.5 text-[#1e3a5f] dark:text-blue-300" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#1e3a5f] dark:text-blue-200 leading-tight">
                                Rapport du monteur <span className="text-red-500">*</span>
                              </p>
                              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">
                                Visible par le client dans le rapport
                              </p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            {[
                              "L'installation s'est déroulée sans encombre.",
                              "Nous avons rencontré quelques difficultés à l'assemblage de la cabine.",
                              "Client présent lors du montage, travaux validés par client.",
                              "Personne sur site lors du montage.",
                            ].map((option) => {
                              const isSelected = rapport.includes(option);
                              return (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => {
                                    if (isSelected) {
                                      setRapport(rapport.replace(option, "").replace(/\n{2,}/g, "\n").trim());
                                    } else {
                                      setRapport((rapport ? rapport + "\n" : "") + option);
                                    }
                                    scheduleAutoSave();
                                  }}
                                  className={`w-full text-left text-sm px-3 py-2.5 rounded-xl border-2 transition-colors ${
                                    isSelected
                                      ? "border-[#1e3a5f] bg-blue-50 dark:bg-blue-900/30 text-[#1e3a5f] dark:text-blue-200 font-medium"
                                      : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 active:bg-gray-50 dark:active:bg-slate-700"
                                  }`}
                                >
                                  <span className="flex items-center gap-2">
                                    <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                                      isSelected ? "border-[#1e3a5f] bg-[#1e3a5f]" : "border-gray-300 dark:border-slate-600"
                                    }`}>
                                      {isSelected && <span className="text-white text-xs">✓</span>}
                                    </span>
                                    {option}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                          <Textarea
                            placeholder="Précisions supplémentaires..."
                            value={rapport}
                            onChange={(e) => { setRapport(e.target.value); scheduleAutoSave(); }}
                            rows={3}
                            className="bg-white/70 dark:bg-slate-900/40"
                          />
                          <button
                            type="button"
                            onClick={handleReformulate}
                            disabled={reformulating || rapport.trim().length < 10}
                            title={rapport.trim().length < 10 ? "Écrivez d'abord quelques mots" : undefined}
                            className="flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {reformulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {reformulating ? "Reformulation en cours..." : "Reformuler avec l'IA"}
                          </button>
                          <div>
                            <VoiceRecorder
                              onTranscript={(text) => {
                                setRapport((prev) => (prev ? prev + "\n" + text : text));
                                scheduleAutoSave();
                              }}
                            />
                          </div>
                        </div>
                        <InternalNoteField
                          projectId={id}
                          value={project.noteInterneMontage}
                          onUpdate={(v) => setProject({ ...project, noteInterneMontage: v })}
                        />
                        {rapport.trim() && (
                          <button
                            type="button"
                            onClick={() => setMonoActiveTab("photos")}
                            className="w-full py-2.5 rounded-xl bg-[#1e3a5f] text-white text-sm font-medium active:opacity-80 transition-opacity"
                          >
                            Continuer → Photos
                          </button>
                        )}
                      </>
                    )}
                    {monoActiveTab === "photos" && (
                      <>
                        <BucketPhotoUpload bucket="AVANT_INTERVENTION" projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} onLog={logAction} />
                        <BucketPhotoUpload bucket="DEMONTAGE" projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} onLog={logAction} />
                        <CombinedMontageUpload projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} onLog={logAction} />
                        <BucketPhotoUpload bucket="APRES_INTERVENTION" projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} onLog={logAction} />
                        <BucketPhotoUpload bucket="QR_CODE" projectId={id} project={project} setProject={setProject} onLog={logAction} />
                        <BucketPhotoUpload bucket="GARANTIE" projectId={id} project={project} setProject={setProject} onLog={logAction} />
                        <Separator />
                        <BeforeAfterPhotos
                          projectId={id}
                          projectName={project.projet}
                          initialBefore={filterByBucket(project.photosAvant, "AVANT_INTERVENTION")}
                          initialAfter={[
                            ...filterByBucket(project.photosMontage, "MONTAGE_GAUCHE"),
                            ...filterByBucket(project.photosMontage, "MONTAGE_CENTRE"),
                            ...filterByBucket(project.photosMontage, "MONTAGE_DROITE"),
                            ...filterByBucket(project.photosMontage, "APRES_INTERVENTION"),
                          ]}
                        />
                        <Separator />
                        {/* Signalements — déplacés ici depuis la racine du rapport.
                            En mono-cabine, le signalement est rattaché au projet
                            (pas de lots multiples à distinguer). */}
                        <div className="pt-1 space-y-3">
                          <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">Signalements</p>
                          <PiecesList projectId={id} refreshKey={pieceRefreshKey} />
                          <DefautsList projectId={id} refreshKey={defautRefreshKey} project={project} setProject={setProject} />
                          <PiecesForm
                            projectId={id}
                            projectName={project.projet}
                            onSubmitted={() => setPieceRefreshKey((k) => k + 1)}
                          />
                          <DefautForm
                            projectId={id}
                            projectName={project.projet}
                            onSubmitted={() => setDefautRefreshKey((k) => k + 1)}
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Mode multi-cabines */}
            {isCabineMode && (
              <>
                <div id="cabines-list" className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex flex-wrap items-center gap-2 min-w-0 max-w-full">
                      <h3 className="text-sm font-semibold text-gray-700 shrink-0">
                        {installedCabineCount > 0
                          ? <><span className="text-green-600">{installedCabineCount}</span>/{cabines.length} cabine{cabines.length > 1 ? "s" : ""}</>
                          : <>{cabines.length} cabine{cabines.length > 1 ? "s" : ""}</>
                        }
                      </h3>
                      {/* Recherche de lot (>10 cabines) — déplie et défile jusqu'au lot. */}
                      {cabines.length > 10 && !cabineDragMode && (
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={cabineSearch}
                            onChange={(e) => setCabineSearch(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); jumpToCabine(cabineSearch); } }}
                            placeholder="Rechercher un lot (ex. G.15)…"
                            className="h-8 w-44 sm:w-52 pl-8 pr-2 text-xs rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                          />
                        </div>
                      )}
                      {/* Filtre : n'afficher que les lots AVEC signalement (pièce
                          manquante = orange, défaut = rouge). Couleurs des titres. */}
                      {!cabineDragMode && (
                        <button
                          type="button"
                          onClick={() => setShowOnlySignalements((v) => !v)}
                          title="N'afficher que les lots avec signalement ou défaut"
                          className={`h-8 shrink-0 flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border transition-colors ${
                            showOnlySignalements
                              ? "border-red-400 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300 dark:border-red-500" // actif → rempli
                              : signalementLotsCount > 0
                              ? "border-red-400 text-red-600 dark:text-red-400 dark:border-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" // signalement présent → contour rouge
                              : "border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:border-red-300 hover:text-red-500" // aucun → gris
                          }`}
                        >
                          <AlertCircle className="w-3.5 h-3.5" />
                          Avec signalement{signalementLotsCount > 0 ? ` (${signalementLotsCount})` : ""}
                        </button>
                      )}
                      {/* Filtre : n'afficher que les lots AVEC rapport personnalisé
                          (texte ajouté à la main = icône violette sur le lot). */}
                      {!cabineDragMode && (
                        <button
                          type="button"
                          onClick={() => setShowOnlyRapport((v) => !v)}
                          title="N'afficher que les lots avec un rapport personnalisé"
                          className={`h-8 shrink-0 flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border transition-colors ${
                            showOnlyRapport
                              ? "border-violet-400 bg-violet-50 text-violet-600 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-500" // actif → rempli
                              : rapportLotsCount > 0
                              ? "border-violet-400 text-violet-600 dark:text-violet-400 dark:border-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20" // rapport présent → contour violet
                              : "border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:border-violet-300 hover:text-violet-500" // aucun → gris
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5" />
                          Avec rapport{rapportLotsCount > 0 ? ` (${rapportLotsCount})` : ""}
                        </button>
                      )}
                      {/* Filtre : n'afficher que les lots AVEC SAV / retouche. */}
                      {!cabineDragMode && (
                        <button
                          type="button"
                          onClick={() => setShowOnlySav((v) => !v)}
                          title="N'afficher que les lots avec un SAV / retouche"
                          className={`h-8 shrink-0 flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border transition-colors ${
                            showOnlySav
                              ? "border-amber-400 bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-500"
                              : savLotsCount > 0
                              ? "border-amber-400 text-amber-600 dark:text-amber-400 dark:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                              : "border-gray-200 dark:border-slate-700 text-gray-500 dark:text-gray-400 hover:border-amber-300 hover:text-amber-500"
                          }`}
                        >
                          <Wrench className="w-3.5 h-3.5" />
                          Avec SAV{savLotsCount > 0 ? ` (${savLotsCount})` : ""}
                        </button>
                      )}
                      {/* Chip du filtre collaborateur (activé depuis « Suivi des heures »). */}
                      {heuresFilterCollab && (
                        <button
                          type="button"
                          onClick={() => setHeuresFilterCollab("")}
                          title="Retirer le filtre collaborateur"
                          className="h-8 shrink-0 flex items-center gap-1.5 px-2.5 text-xs font-medium rounded-lg border border-blue-400 bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-500"
                        >
                          Lots de {heuresFilterCollab}
                          <span className="text-blue-400">✕</span>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {cabineDragMode ? (
                        <button
                          type="button"
                          onClick={() => { setCabineDragMode(false); setDragCabSrc(null); setDragCabOver(null); }}
                          className="text-xs font-semibold text-blue-600 px-2 py-1 rounded-lg bg-blue-50"
                        >
                          Terminer
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCabineDragMode(true)}
                          className="text-xs text-gray-400 flex items-center gap-1 hover:text-gray-600"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                          Réorganiser
                        </button>
                      )}
                      {!cabineDragMode && <span className="text-xs text-gray-400">Cliquez pour déplier</span>}
                    </div>
                  </div>

                  {cabines
                    .map((cabine, idx) => ({ cabine, idx }))
                    .filter(({ cabine, idx }) => {
                      // Filtre « Avec signalement »
                      if (showOnlySignalements &&
                        !cabineSignalements.pieces.some((p) => normCabineLabel(p.cabineLabel) === normCabineLabel(cabine.nom)) &&
                        !cabineSignalements.defauts.some((d) => normCabineLabel(d.cabineLabel) === normCabineLabel(cabine.nom))) return false;
                      // Filtre « Avec rapport » (texte personnalisé)
                      if (showOnlyRapport && !hasManualRapport(cabine.rapport)) return false;
                      // Filtre « Avec SAV »
                      if (showOnlySav && !cabineHasSav(idx)) return false;
                      // Filtre par collaborateur (clic dans « Suivi des heures »)
                      if (heuresFilterCollab) {
                        const monteurs = (cabine.monteur || "").split(" & ").map((s) => s.trim()).filter(Boolean);
                        const list = monteurs.length > 0 ? monteurs : [parseSousTraitance(project?.monteursSousTraitance || "")[idx + 1] || ""];
                        if (!list.includes(heuresFilterCollab)) return false;
                      }
                      return true;
                    })
                    .map(({ cabine, idx }) => (
                    <Card
                      key={idx}
                      data-cabineidx={idx}
                      className={`overflow-hidden transition-all ${cabineDragMode ? "cursor-grab active:cursor-grabbing" : ""} ${dragCabOver === idx && dragCabSrc !== idx ? "ring-2 ring-blue-400 ring-offset-1" : ""} ${dragCabSrc === idx ? "opacity-50" : ""}`}
                      draggable={cabineDragMode}
                      onDragStart={() => { if (cabineDragMode) setDragCabSrc(idx); }}
                      onDragOver={(e) => { e.preventDefault(); if (cabineDragMode && dragCabSrc !== null) setDragCabOver(idx); }}
                      onDrop={() => { if (cabineDragMode && dragCabSrc !== null) { reorderCabines(dragCabSrc, idx); setDragCabSrc(null); setDragCabOver(null); } }}
                      onDragEnd={() => { setDragCabSrc(null); setDragCabOver(null); }}
                    >
                      {/* Header cabine — wrapper div pour permettre le bouton "scroll en haut" indépendant */}
                      <div className="w-full flex items-center hover:bg-gray-50 active:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors">
                        {/* Zone cliquable principale (toggle accordéon + drag) */}
                        <button
                          type="button"
                          onClick={() => {
                            if (cabineDragMode) return;
                            setCabines((prev) =>
                              prev.map((c, i) => (i === idx ? { ...c, open: !c.open } : c))
                            );
                          }}
                          onTouchStart={() => {
                            if (cabineDragMode) { cabineTouchSrcRef.current = idx; return; }
                            cabineLongPressTimer.current = setTimeout(() => {
                              setCabineDragMode(true);
                              cabineTouchSrcRef.current = idx;
                              setDragCabSrc(idx);
                            }, 500);
                          }}
                          onTouchEnd={() => {
                            if (cabineLongPressTimer.current) { clearTimeout(cabineLongPressTimer.current); cabineLongPressTimer.current = null; }
                            if (cabineDragMode && cabineTouchSrcRef.current !== null && dragCabOver !== null && cabineTouchSrcRef.current !== dragCabOver) {
                              reorderCabines(cabineTouchSrcRef.current, dragCabOver);
                            }
                            cabineTouchSrcRef.current = null;
                            setDragCabSrc(null);
                            setDragCabOver(null);
                          }}
                          onTouchMove={(e) => {
                            if (!cabineDragMode) { if (cabineLongPressTimer.current) { clearTimeout(cabineLongPressTimer.current); cabineLongPressTimer.current = null; } return; }
                            const touch = e.touches[0];
                            const el = document.elementFromPoint(touch.clientX, touch.clientY);
                            const card = el?.closest("[data-cabineidx]");
                            if (card) {
                              const overIdx = parseInt(card.getAttribute("data-cabineidx") || "-1", 10);
                              if (overIdx >= 0 && overIdx !== dragCabOver) setDragCabOver(overIdx);
                            }
                          }}
                          className="flex-1 flex items-center gap-3 px-4 py-3 text-left min-w-0"
                        >
                          {cabineDragMode ? (
                            <GripVertical className="w-4 h-4 text-gray-400 shrink-0" />
                          ) : (
                            <span className={`w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center shrink-0 transition-colors ${
                              etatMontageBadgeClass(parseSousTraitance(project?.etatMontage || "")[idx + 1])
                              || (installedCabineIndices.has(idx)
                                ? "bg-green-600"
                                : (!!cabine.arrivee || (project?.photosAvant || []).some(f => new RegExp(`\\.Cab${idx + 1}\\.`).test(f.name || "")))
                                ? "bg-orange-500"
                                : "bg-[#1e3a5f]")
                            }`}>
                              {idx + 1}
                            </span>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-medium text-sm truncate">{cabine.nom}</span>
                              {/* Icônes signalement : pièce manquante (orange) + défaut (rouge) */}
                              {cabineSignalements.pieces.some((p) => normCabineLabel(p.cabineLabel) === normCabineLabel(cabine.nom)) && (
                                <Package className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                              )}
                              {cabineSignalements.defauts.some((d) => normCabineLabel(d.cabineLabel) === normCabineLabel(cabine.nom)) && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  title="Voir le défaut signalé"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Ouvre la cabine sur l'onglet Signalements
                                    setCabines((prev) =>
                                      prev.map((c, i) =>
                                        i === idx ? { ...c, open: true, activeTab: "signalements" } : c
                                      )
                                    );
                                    // Scroll vers la section signalement une fois le DOM mis à jour
                                    setTimeout(() => {
                                      const el = document.getElementById(`signalement-cab-${idx}`);
                                      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
                                    }, 150);
                                  }}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
                                  className="shrink-0 cursor-pointer rounded hover:opacity-75 transition-opacity"
                                >
                                  <AlertTriangle className="w-4 h-4 text-red-500" />
                                </span>
                              )}
                              {/* Icône « rapport personnalisé » (violet) : le rapport
                                  contient un texte ajouté à la main, au-delà des phrases
                                  classiques. Clic → ouvre l'onglet Rapport. */}
                              {hasManualRapport(cabine.rapport) && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  title="Rapport personnalisé — voir le texte ajouté"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCabines((prev) =>
                                      prev.map((c, i) =>
                                        i === idx ? { ...c, open: true, activeTab: "rapport" } : c
                                      )
                                    );
                                  }}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
                                  className="shrink-0 cursor-pointer rounded hover:opacity-75 transition-opacity"
                                >
                                  <FileText className="w-4 h-4 text-violet-500" />
                                </span>
                              )}
                              {/* Icône SAV (ambre) : un SAV/retouche existe pour ce lot.
                                  Clic → ouvre l'onglet SAV. */}
                              {cabineHasSav(idx) && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  title="SAV / Retouche — voir"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setCabines((prev) => prev.map((c, i) => i === idx ? { ...c, open: true, activeTab: "sav" } : c));
                                  }}
                                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
                                  className="shrink-0 cursor-pointer rounded hover:opacity-75 transition-opacity"
                                >
                                  <Wrench className="w-4 h-4 text-amber-500" />
                                </span>
                              )}
                            </div>
                            {/* Sous-titre : QUI a monté + date. Monteur employé → affiché
                                seulement avec la date (install complète). À défaut de monteur,
                                on affiche le SOUS-TRAITANT (même sans date), pour toujours
                                savoir qui a procédé au montage. */}
                            {(() => {
                              const sousTraitant = parseSousTraitance(project.monteursSousTraitance)[idx + 1] || "";
                              const who = cabine.monteur || sousTraitant;
                              if (!who || (!cabine.date && !sousTraitant)) return null;
                              return (
                                <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate leading-tight mt-0.5">
                                  {who}{cabine.date ? ` · ${cabine.date.split("-").reverse().join(".")}` : ""}
                                </p>
                              );
                            })()}
                          </div>
                        </button>

                        {/* Actions droite : reset + scroll-en-haut (quand ouverte) + chevron */}
                        <div className="flex items-center gap-1.5 px-3 py-3 shrink-0">
                          {!cabineDragMode && isAdmin && (
                            <button
                              type="button"
                              onClick={() => setResetConfirmIdx(idx)}
                              className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center text-gray-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-900/40 dark:hover:text-red-400 transition-colors"
                              title={`Réinitialiser ${cabine.nom}`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {cabine.open && !cabineDragMode && (
                            <button
                              type="button"
                              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                              className="w-7 h-7 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center text-gray-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/40 dark:hover:text-blue-400 transition-colors"
                              title="Remonter en haut de page"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {!cabineDragMode && (
                            <button
                              type="button"
                              onClick={() => setCabines((prev) =>
                                prev.map((c, i) => (i === idx ? { ...c, open: !c.open } : c))
                              )}
                              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-slate-600 transition-colors"
                            >
                              {cabine.open ? (
                                <ChevronUp className="w-4 h-4 text-gray-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-400" />
                              )}
                            </button>
                          )}
                        </div>
                      </div>

                      {cabine.open && (
                        <CardContent className="border-t pt-0 pb-4 px-0">
                          {/* ── Onglets Infos / Photos / Signalements ──────────── */}
                          <div className="flex justify-evenly sm:justify-normal border-b border-gray-100 dark:border-slate-700 mb-4">
                            <button
                              type="button"
                              onClick={() => setCabines((prev) => prev.map((c, i) => i === idx ? { ...c, activeTab: "infos" } : c))}
                              className={`px-2 py-2.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap sm:flex-1 ${
                                cabine.activeTab === "infos"
                                  ? "text-[#1e3a5f] dark:text-blue-300 border-b-2 border-[#1e3a5f] dark:border-blue-300"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              Infos
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                // Sous-traité (nom saisi dans « Monteur sous-traitance ») →
                                // photos DÉBLOQUÉES immédiatement : ni monteur, ni jour, ni
                                // heures ne sont exigés (on ne suit pas les heures des
                                // sous-traitants, ce ne sont pas nos employés).
                                const estSousTraite = !!parseSousTraitance(project.monteursSousTraitance)[idx + 1];
                                const missing: string[] = [];
                                if (!estSousTraite) {
                                  if (!cabine.monteur) missing.push("monteur responsable");
                                  if (!cabine.date) missing.push("jour de montage");
                                  if (!cabine.arrivee) missing.push("heure d'arrivée");
                                }
                                if (missing.length > 0) {
                                  toast.error(`Renseignez d'abord : ${missing.join(", ")}`);
                                  return;
                                }
                                setCabines((prev) => prev.map((c, i) => i === idx ? { ...c, activeTab: "photos" } : c));
                              }}
                              className={`px-2 py-2.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap sm:flex-1 flex items-center justify-center gap-1 ${
                                cabine.activeTab === "photos"
                                  ? "text-[#1e3a5f] dark:text-blue-300 border-b-2 border-[#1e3a5f] dark:border-blue-300"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              Photos
                              {!parseSousTraitance(project.monteursSousTraitance)[idx + 1] && (!cabine.monteur || !cabine.date || !cabine.arrivee) && (
                                <span className="text-[11px] text-gray-300 dark:text-slate-500">🔒</span>
                              )}
                            </button>
                            {/* Onglet Rapport (rapport cabine) — libre d'accès. Couleur
                                VIOLETTE, comme l'icône « rapport personnalisé ». Le point
                                s'affiche quand un texte a été ajouté à la main. */}
                            <button
                              type="button"
                              onClick={() => setCabines((prev) => prev.map((c, i) => i === idx ? { ...c, activeTab: "rapport" } : c))}
                              className={`px-2 py-2.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap sm:flex-1 flex items-center justify-center gap-1 ${
                                cabine.activeTab === "rapport"
                                  ? "text-violet-600 dark:text-violet-400 border-b-2 border-violet-500 dark:border-violet-400"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              Rapport
                              {hasManualRapport(cabine.rapport) && (
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 shrink-0" />
                              )}
                            </button>
                            {/* Onglet Signalements (pièces manquantes + défauts) — libre
                                d'accès. Couleur ROUGE, comme le titre « Défauts signalés ». */}
                            <button
                              type="button"
                              onClick={() => setCabines((prev) => prev.map((c, i) => i === idx ? { ...c, activeTab: "signalements" } : c))}
                              className={`px-2 py-2.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap sm:flex-1 flex items-center justify-center gap-1.5 ${
                                cabine.activeTab === "signalements"
                                  ? "text-red-600 dark:text-red-400 border-b-2 border-red-500 dark:border-red-400"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              <AlertCircle className="w-3.5 h-3.5" />
                              Signalements
                              {(cabineSignalements.pieces.some((p) => normCabineLabel(p.cabineLabel) === normCabineLabel(cabine.nom)) ||
                                cabineSignalements.defauts.some((d) => normCabineLabel(d.cabineLabel) === normCabineLabel(cabine.nom))) && (
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                              )}
                            </button>
                            {/* Onglet SAV / Retouches (réglages à faire) — libre d'accès.
                                Couleur AMBRE. Point si du texte est saisi. */}
                            <button
                              type="button"
                              onClick={() => setCabines((prev) => prev.map((c, i) => i === idx ? { ...c, activeTab: "sav" } : c))}
                              className={`px-2 py-2.5 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap sm:flex-1 flex items-center justify-center gap-1 ${
                                cabine.activeTab === "sav"
                                  ? "text-amber-600 dark:text-amber-400 border-b-2 border-amber-500 dark:border-amber-400"
                                  : "text-gray-400 hover:text-gray-600"
                              }`}
                            >
                              <Wrench className="w-3.5 h-3.5 shrink-0" />
                              SAV
                              {cabineHasSav(idx) && (
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                              )}
                            </button>
                          </div>

                          {/* ── Onglet Infos ────────────────────────────────── */}
                          {cabine.activeTab === "infos" && (
                            <div className="space-y-4 px-4">
                              {/* Nom de la cabine */}
                              <div>
                                <Label>Nom / Emplacement</Label>
                                <Input
                                  value={cabine.nom}
                                  onChange={(e) => {
                                    const newNom = e.target.value;
                                    setCabines((prev) => {
                                      const next = prev.map((c, i) => (i === idx ? { ...c, nom: newNom } : c));
                                      // ── Sauvegarde locale immédiate ──────────────────────────────
                                      try {
                                        localStorage.setItem(
                                          `tm-cabin-noms-${id}`,
                                          JSON.stringify(next.map((c) => c.nom))
                                        );
                                      } catch {}
                                      // ── Marquer la cabine comme "dirty" pour protéger du revert CDN ─
                                      dirtyNomRef.current.set(idx, Date.now());
                                      // ── Sauvegarde Notion (debounce court pour grouper la frappe) ──
                                      if (nomKvDebounceRef.current) clearTimeout(nomKvDebounceRef.current);
                                      nomKvDebounceRef.current = setTimeout(() => {
                                        const nomsEnc = next.map((c, i) => `Cab${i + 1}:${c.nom || `Cabine ${i + 1}`}`).join(" | ");
                                        // N'envoie PAS attributionCabines : le monteur n'a pas changé.
                                        // Envoyer l'attrEnc complet avec des monteurs locaux potentiellement
                                        // périmés déclencherait des suppressions involontaires dans mergeCabineAttribution.
                                        offlineFetch(`/api/projects/${id}`, {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ nomsCabines: nomsEnc }),
                                        }).catch(console.error);
                                      }, 150); // 150 ms — assez court pour survivre à une fermeture d'onglet rapide
                                      return next;
                                    });
                                  }}
                                  placeholder="Ex: SDD Parental, Lot 3..."
                                  className="mt-1 h-11"
                                />
                              </div>

                              {/* Monteur responsable */}
                              <div>
                                <Label className="text-xs text-gray-600 dark:text-gray-300">Monteur responsable</Label>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {COLLABORATEURS_LIST.map((name) => {
                                    const selected = (cabine.monteur || "").split(" & ").map((s) => s.trim()).includes(name);
                                    return (
                                      <button
                                        key={name}
                                        type="button"
                                        onClick={() => setCabines((prev) => {
                                          const next = prev.map((c, i) => {
                                            if (i !== idx) return c;
                                            const current = (c.monteur || "").split(" & ").map((s) => s.trim()).filter(Boolean);
                                            const updated = selected
                                              ? current.filter((n) => n !== name)
                                              : [...current, name];
                                            return { ...c, monteur: updated.join(" & ") };
                                          });
                                          // ── Sauvegarde immédiate du Monteur Responsable ──────────────
                                          // 1. localStorage : backup local instantané (survit aux erreurs réseau)
                                          try {
                                            localStorage.setItem(
                                              `tm-cabin-monteurs-${id}`,
                                              JSON.stringify(next.map((c) => c.monteur))
                                            );
                                          } catch {}
                                          // 2. Notion : seule la cabine modifiée est envoyée.
                                          // Envoyer TOUTES les cabines (même celles à monteur vide)
                                          // avec un état local potentiellement périmé déclencherait
                                          // des suppressions involontaires dans mergeCabineAttribution
                                          // (vide = suppression explicite côté merge).
                                          // → On envoie uniquement "Cab${idx+1}:<monteur>" — la merge
                                          // logic ne touche alors que cette cabine et préserve toutes les autres.
                                          const changedMonteur = next[idx].monteur || "";
                                          const attrEnc = `Cab${idx + 1}:${changedMonteur}`;
                                          offlineFetch(`/api/projects/${id}`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ attributionCabines: attrEnc }),
                                          }).catch(console.error);
                                          return next;
                                        })}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-colors ${
                                          selected
                                            ? "border-blue-600 bg-blue-600 text-white"
                                            : "border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 hover:border-blue-300"
                                        }`}
                                      >
                                        {name}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Monteur sous-traitance (par cabine) — ADMIN UNIQUEMENT */}
                              {isAdmin && (
                                <div>
                                  <Label className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1">
                                    <PenLine className="w-3 h-3 text-orange-500" /> Monteur sous-traitance
                                  </Label>
                                  <CabineSousTraitantInput
                                    value={parseSousTraitance(project.monteursSousTraitance)[idx + 1] || ""}
                                    onSave={(v) => {
                                      // Optimiste : maj de l'affichage local (map complète).
                                      const map = parseSousTraitance(project.monteursSousTraitance);
                                      if (v) map[idx + 1] = v; else delete map[idx + 1];
                                      setProject((prev) => prev ? { ...prev, monteursSousTraitance: encodeSousTraitance(map) } : prev);
                                      // Protège la saisie du revert par le polling (fenêtre 30 s)
                                      // → l'enregistrement tient dès la 1re fois.
                                      window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field: "monteursSousTraitance" } }));
                                      // Serveur : DELTA d'une seule cabine (vide = suppression),
                                      // mergé côté API pour ne jamais écraser les autres cabines.
                                      offlineFetch(`/api/projects/${id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ monteursSousTraitance: `Cab${idx + 1}:${v}` }),
                                      }).catch(console.error);
                                    }}
                                  />
                                </div>
                              )}

                              {/* Jour de montage + case « Montage partiel » */}
                              <div>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <Label className="text-xs text-gray-600 dark:text-gray-300">Jour de montage</Label>
                                  {/* État du montage (3 états). Change la couleur du numéro
                                      de lot : terminé=vert, partiel=violet, pas possible=rouge. */}
                                  <select
                                    value={parseSousTraitance(project?.etatMontage || "")[idx + 1] || ""}
                                    onChange={(e) => {
                                      const val = e.target.value; // "" = non défini
                                      const map = parseSousTraitance(project?.etatMontage || "");
                                      if (val) map[idx + 1] = val; else delete map[idx + 1];
                                      setProject((prev) => prev ? { ...prev, etatMontage: encodeSousTraitance(map) } : prev);
                                      window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field: "etatMontage" } }));
                                      offlineFetch(`/api/projects/${id}`, {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ etatMontage: `Cab${idx + 1}:${val}` }),
                                      }).catch(console.error);
                                    }}
                                    className="text-xs font-medium rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
                                  >
                                    <option value="">État du montage…</option>
                                    {ETATS_MONTAGE.map((etat) => (
                                      <option key={etat} value={etat}>{etat}</option>
                                    ))}
                                  </select>
                                </div>
                                <Input
                                  type="date"
                                  value={cabine.date}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCabines((prev) =>
                                      prev.map((c, i) => (i === idx ? { ...c, date: v } : c))
                                    );
                                    scheduleAutoSave();
                                  }}
                                  className="mt-1 h-11 glass-input"
                                />
                              </div>

                              {/* Heures arrivée / départ */}
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <Label className="text-xs text-gray-600 dark:text-gray-300">Heure d&apos;arrivée</Label>
                                  <Input
                                    type="time"
                                    value={cabine.arrivee}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setCabines((prev) =>
                                        prev.map((c, i) => (i === idx ? { ...c, arrivee: v } : c))
                                      );
                                      scheduleAutoSave();
                                    }}
                                    className="mt-1 h-11 glass-input"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-600 dark:text-gray-300">Heure de départ</Label>
                                  <Input
                                    type="time"
                                    value={cabine.depart}
                                    min={cabine.arrivee || undefined}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      // Le départ ne peut pas précéder l'arrivée.
                                      if (v && cabine.arrivee && v < cabine.arrivee) {
                                        toast.error("L'heure de départ ne peut pas être avant l'arrivée.");
                                        return;
                                      }
                                      setCabines((prev) =>
                                        prev.map((c, i) => (i === idx ? { ...c, depart: v } : c))
                                      );
                                      scheduleAutoSave();
                                    }}
                                    className="mt-1 h-11 glass-input"
                                  />
                                </div>
                              </div>

                              {/* Bouton Enregistrer par cabine */}
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleSaveCabineData(idx)}
                                className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50 transition-all"
                              >
                                {saving ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement...</>
                                ) : (
                                  <><Check className="w-4 h-4" />Enregistrer</>
                                )}
                              </button>

                              {/* Remonter en haut — onglet Infos */}
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center text-gray-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/40 dark:hover:text-blue-400 transition-colors"
                                  title="Remonter en haut de page"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                              </div>

                              {/* Bouton accès rapide Photos si tout est rempli */}
                              {cabine.monteur && cabine.date && cabine.arrivee && (
                                <button
                                  type="button"
                                  onClick={() => setCabines((prev) => prev.map((c, i) => i === idx ? { ...c, activeTab: "photos" } : c))}
                                  className="w-full py-2.5 rounded-xl bg-[#1e3a5f] text-white text-sm font-medium active:opacity-80 transition-opacity"
                                >
                                  Continuer → Photos
                                </button>
                              )}
                            </div>
                          )}

                          {/* ── Onglet Photos ────────────────────────────────── */}
                          {/* ── Onglet Signalements (pièces manquantes + défauts) ── */}
                          {cabine.activeTab === "signalements" && (
                            <div id={`signalement-cab-${idx}`} className="space-y-3 px-4">
                              <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">Signalement — {cabine.nom}</p>
                              <PiecesList projectId={id} refreshKey={pieceRefreshKey} cabineLabel={cabine.nom} />
                              <DefautsList projectId={id} refreshKey={defautRefreshKey} cabineLabel={cabine.nom} project={project} setProject={setProject} />
                              <PiecesForm projectId={id} projectName={project.projet} cabineLabel={cabine.nom} onSubmitted={() => setPieceRefreshKey((k) => k + 1)} />
                              <DefautForm projectId={id} projectName={project.projet} cabineLabel={cabine.nom} onSubmitted={() => setDefautRefreshKey((k) => k + 1)} />
                            </div>
                          )}

                          {cabine.activeTab === "photos" && (
                            <div className="space-y-4 px-4">
                              <BucketPhotoUpload bucket="AVANT_INTERVENTION" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} onLog={logAction} />
                              <BucketPhotoUpload bucket="DEMONTAGE" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onLog={logAction} />
                              <CombinedMontageUpload cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} onLog={logAction} />
                              <BucketPhotoUpload bucket="APRES_INTERVENTION" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} onLog={logAction} />

                              {/* QR Code toggle */}
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => setCabines((prev) => prev.map((c, i) => i === idx ? { ...c, qrEnabled: !c.qrEnabled } : c))}
                                  className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                                    cabine.qrEnabled
                                      ? "border-[#1e3a5f] bg-blue-50 dark:bg-blue-900/20 text-[#1e3a5f] dark:text-blue-300"
                                      : "border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-400"
                                  }`}
                                >
                                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                                    cabine.qrEnabled ? "border-[#1e3a5f] bg-[#1e3a5f]" : "border-gray-300 dark:border-slate-500"
                                  }`}>
                                    {cabine.qrEnabled && <span className="text-white text-[10px]">✓</span>}
                                  </span>
                                  QR Code présent
                                </button>
                                {cabine.qrEnabled && (
                                  <BucketPhotoUpload bucket="QR_CODE" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onLog={logAction} />
                                )}
                              </div>

                              {/* Garantie toggle */}
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  onClick={() => setCabines((prev) => prev.map((c, i) => i === idx ? { ...c, garantieEnabled: !c.garantieEnabled } : c))}
                                  className={`flex items-center gap-2 w-full px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                                    cabine.garantieEnabled
                                      ? "border-[#1e3a5f] bg-blue-50 dark:bg-blue-900/20 text-[#1e3a5f] dark:text-blue-300"
                                      : "border-gray-200 dark:border-slate-600 text-gray-500 dark:text-gray-400"
                                  }`}
                                >
                                  <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                                    cabine.garantieEnabled ? "border-[#1e3a5f] bg-[#1e3a5f]" : "border-gray-300 dark:border-slate-500"
                                  }`}>
                                    {cabine.garantieEnabled && <span className="text-white text-[10px]">✓</span>}
                                  </span>
                                  Garantie présente
                                </button>
                                {cabine.garantieEnabled && (
                                  <BucketPhotoUpload bucket="GARANTIE" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onLog={logAction} />
                                )}
                              </div>

                              {/* Bouton Enregistrer — onglet Photos */}
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleSaveCabineData(idx)}
                                className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50 transition-all"
                              >
                                {saving ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement...</>
                                ) : (
                                  <><Check className="w-4 h-4" />Enregistrer</>
                                )}
                              </button>

                              {/* Remonter en haut — onglet Photos */}
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center text-gray-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/40 dark:hover:text-blue-400 transition-colors"
                                  title="Remonter en haut de page"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* ── Onglet Rapport ──────────────────────────────── */}
                          {cabine.activeTab === "rapport" && (
                            <div className="space-y-4 px-4">
                              <div>
                                <Label>Rapport cabine</Label>
                                <div className="mt-2 space-y-1.5">
                                  {RAPPORT_CABINE_CLASSIQUES.map((option) => {
                                    const isSelected = cabine.rapport.includes(option);
                                    return (
                                      <button
                                        key={option}
                                        type="button"
                                        onClick={() => {
                                          setCabines((prev) =>
                                            prev.map((c, i) => {
                                              if (i !== idx) return c;
                                              const newRapport = isSelected
                                                ? c.rapport.replace(option, "").replace(/\n{2,}/g, "\n").trim()
                                                : (c.rapport ? c.rapport + "\n" : "") + option;
                                              return { ...c, rapport: newRapport };
                                            })
                                          );
                                          scheduleAutoSave();
                                        }}
                                        className={`w-full text-left text-xs px-2.5 py-2 rounded-lg border-2 transition-colors ${
                                          isSelected
                                            ? "border-[#1e3a5f] bg-blue-50 dark:bg-blue-900/30 text-[#1e3a5f] dark:text-blue-200 font-medium"
                                            : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 active:bg-gray-50 dark:active:bg-slate-700"
                                        }`}
                                      >
                                        <span className="flex items-center gap-2">
                                          <span className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 ${
                                            isSelected ? "border-[#1e3a5f] bg-[#1e3a5f]" : "border-gray-300 dark:border-slate-600"
                                          }`}>
                                            {isSelected && <span className="text-white text-[10px]">✓</span>}
                                          </span>
                                          {option}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                                {/* Texte libre : tout ce qui va AU-DELÀ des phrases classiques
                                    = ajout manuel → déclenche l'icône violette sur le lot. */}
                                <Textarea
                                  placeholder="Précisions ajoutées à la main pour cette cabine..."
                                  value={cabine.rapport}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setCabines((prev) =>
                                      prev.map((c, i) => (i === idx ? { ...c, rapport: v } : c))
                                    );
                                    scheduleAutoSave();
                                  }}
                                  rows={4}
                                  className="mt-2"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleReformulateCabine(idx)}
                                  disabled={reformulatingCabineIdx === idx || cabine.rapport.trim().length < 5}
                                  className="mt-1.5 flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
                                >
                                  {reformulatingCabineIdx === idx
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <Sparkles className="w-3.5 h-3.5" />}
                                  {reformulatingCabineIdx === idx ? "Reformulation en cours..." : "Reformuler avec l'IA"}
                                </button>
                              </div>

                              {/* Bouton Enregistrer — onglet Rapport */}
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleSaveCabineData(idx)}
                                className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-600 text-white text-sm font-medium flex items-center justify-center gap-2 active:opacity-80 disabled:opacity-50 transition-all"
                              >
                                {saving ? (
                                  <><Loader2 className="w-4 h-4 animate-spin" />Enregistrement...</>
                                ) : (
                                  <><Check className="w-4 h-4" />Enregistrer</>
                                )}
                              </button>

                              {/* Remonter en haut — onglet Rapport */}
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center text-gray-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/40 dark:hover:text-blue-400 transition-colors"
                                  title="Remonter en haut de page"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}

                          {/* ── Onglet SAV / Retouches ──────────────────────── */}
                          {cabine.activeTab === "sav" && (
                            <div className="space-y-4 px-4">
                              {/* Réclamation : brève description du SAV à traiter → « Commentaires SAV ». */}
                              <div>
                                <Label className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                                  <Wrench className="w-4 h-4" />
                                  Réclamation — SAV à traiter
                                </Label>
                                <p className="text-[11px] text-gray-400 mt-0.5 mb-1">
                                  Brève explication du SAV / retouche demandé. Enregistré automatiquement.
                                </p>
                                <CabineSavInput
                                  value={parseCabineTextMulti(project?.commentairesSav || "")[idx + 1] || ""}
                                  onSave={(v) => saveCabineText("commentairesSav", idx, v)}
                                />
                              </div>

                              {/* Documents de la DEMANDE (photos/vidéos reçus pour déclencher le SAV). */}
                              <BucketPhotoUpload bucket="SAV_DEMANDE" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onLog={logAction} accept="image/*,video/*" />

                              {/* Photos/vidéos une fois le souci RÉGLÉ. */}
                              <BucketPhotoUpload bucket="SAV_RETOUCHE" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onLog={logAction} accept="image/*,video/*" />

                              {/* Ce que nous avons fait → « SAV / Retouches cabines ». */}
                              <div>
                                <Label>Ce que nous avons fait</Label>
                                <p className="text-[11px] text-gray-400 mt-0.5 mb-1">
                                  Décrire l&apos;intervention réalisée. Enregistré automatiquement.
                                </p>
                                <CabineSavInput
                                  value={parseCabineTextMulti(project?.savRetouchesCabines || "")[idx + 1] || ""}
                                  onSave={(v) => saveCabineText("savRetouchesCabines", idx, v)}
                                />
                              </div>

                              {/* SAV clôturé (coche verte, niveau projet). */}
                              <label className="flex items-center gap-2 cursor-pointer select-none pt-1 border-t border-gray-100 dark:border-slate-700">
                                <input
                                  type="checkbox"
                                  checked={!!project?.savCloture}
                                  onChange={(e) => {
                                    const checked = e.target.checked;
                                    setProject((prev) => prev ? { ...prev, savCloture: checked } : prev);
                                    window.dispatchEvent(new CustomEvent("tm-project-field-edited", { detail: { field: "savCloture" } }));
                                    offlineFetch(`/api/projects/${id}`, {
                                      method: "PATCH",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ savCloture: checked }),
                                    }).catch(() => {});
                                  }}
                                  className="w-4 h-4 accent-green-600"
                                />
                                <span className="text-sm font-medium text-green-700 dark:text-green-400 flex items-center gap-1">
                                  <Check className="w-4 h-4" /> SAV clôturé
                                </span>
                              </label>

                              {/* Remonter en haut — onglet SAV */}
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-600 flex items-center justify-center text-gray-400 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/40 dark:hover:text-blue-400 transition-colors"
                                  title="Remonter en haut de page"
                                >
                                  <ArrowUp className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  ))}
                  {(showOnlySignalements || showOnlyRapport || showOnlySav || heuresFilterCollab) && !cabines.some((c, i) => {
                    if (showOnlySignalements &&
                      !cabineSignalements.pieces.some((p) => normCabineLabel(p.cabineLabel) === normCabineLabel(c.nom)) &&
                      !cabineSignalements.defauts.some((d) => normCabineLabel(d.cabineLabel) === normCabineLabel(c.nom))) return false;
                    if (showOnlyRapport && !hasManualRapport(c.rapport)) return false;
                    if (showOnlySav && !cabineHasSav(i)) return false;
                    if (heuresFilterCollab) {
                      const monteurs = (c.monteur || "").split(" & ").map((s) => s.trim()).filter(Boolean);
                      const list = monteurs.length > 0 ? monteurs : [parseSousTraitance(project?.monteursSousTraitance || "")[i + 1] || ""];
                      if (!list.includes(heuresFilterCollab)) return false;
                    }
                    return true;
                  }) && (
                    <p className="text-sm text-gray-400 text-center py-6">Aucun lot ne correspond au filtre.</p>
                  )}
                </div>

                {/* Rapport global multi-cabines */}
                <Card>
                  <button
                    type="button"
                    onClick={() => setShowRapportGeneral((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left"
                  >
                    <span className="text-base font-semibold">Rapport général</span>
                    {showRapportGeneral ? (
                      <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </button>
                  {showRapportGeneral && (
                    <CardContent className="border-t pt-3 space-y-2">
                      <div className="space-y-2">
                        {[
                          "Les installations se sont déroulées sans encombre.",
                          "Nous avons rencontré quelques difficultés à l'assemblage de la cabine.",
                          "Client présent lors des montages, travaux validés par client.",
                          "Personne sur site lors du montage.",
                        ].map((option) => {
                          const isSelected = rapport.includes(option);
                          return (
                            <button
                              key={option}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  setRapport(rapport.replace(option, "").replace(/\n{2,}/g, "\n").trim());
                                } else {
                                  setRapport((rapport ? rapport + "\n" : "") + option);
                                }
                                scheduleAutoSave();
                              }}
                              className={`w-full text-left text-sm px-3 py-2.5 rounded-xl border-2 transition-colors ${
                                isSelected
                                  ? "border-[#1e3a5f] bg-blue-50 text-[#1e3a5f] font-medium"
                                  : "border-gray-200 bg-white text-gray-700 active:bg-gray-50"
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                                  isSelected ? "border-[#1e3a5f] bg-[#1e3a5f]" : "border-gray-300"
                                }`}>
                                  {isSelected && <span className="text-white text-xs">✓</span>}
                                </span>
                                {option}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <Textarea
                        placeholder="Remarques générales (facultatif)…"
                        value={rapport}
                        onChange={(e) => { setRapport(e.target.value); scheduleAutoSave(); }}
                        rows={3}
                        className="mt-3"
                      />
                      {rapport.trim().length > 10 && (
                        <button
                          type="button"
                          onClick={handleReformulate}
                          disabled={reformulating}
                          className="mt-1.5 flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 disabled:opacity-50"
                        >
                          {reformulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                          {reformulating ? "Reformulation en cours..." : "Reformuler avec l'IA"}
                        </button>
                      )}

                      {/* Section PAR LOT — générée automatiquement depuis les cabines :
                          triée (A→B, 1→99), noms À JOUR (renommage répercuté) et en
                          GRAS. Cliquer un lot ouvre son rapport pour l'éditer. */}
                      {(() => {
                        const items = cabines
                          .map((c, i) => ({ i, nom: c.nom, rapport: c.rapport }))
                          .filter((c) => c.rapport && c.rapport.trim())
                          .sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr", { numeric: true, sensitivity: "base" }));
                        if (items.length === 0) return null;
                        return (
                          <div className="mt-4 border-t border-gray-100 dark:border-slate-700 pt-3">
                            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">
                              Par lot <span className="font-normal text-gray-400">(généré automatiquement — cliquer pour modifier)</span>
                            </p>
                            <div className="space-y-1.5">
                              {items.map((c) => (
                                <button
                                  key={c.i}
                                  type="button"
                                  onClick={() => setRapportModalCabineIdx(c.i)}
                                  className="w-full text-left text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800/60 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <span className="font-bold text-[#1e3a5f] dark:text-blue-200">{c.nom}</span>
                                  <span className="text-gray-700 dark:text-gray-300"> : {c.rapport}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </CardContent>
                  )}
                </Card>
              </>
            )}

            {/* ── Modal rapport cabine (après upload photo montage/après) ── */}
            {rapportModalCabineIdx !== null && cabines[rapportModalCabineIdx] && createPortal(
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4 pb-8">
                <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                  <div className="px-5 pt-5 pb-2">
                    <p className="text-sm font-semibold text-[#1e3a5f] dark:text-blue-200 mb-1">
                      Rapport — {cabines[rapportModalCabineIdx].nom}
                    </p>
                    <p className="text-xs text-gray-400 mb-4">Comment s&apos;est déroulé le montage ?</p>
                    <div className="space-y-2">
                      {[
                        "L'installation s'est déroulée sans encombre.",
                        "Nous avons rencontré quelques difficultés à l'assemblage de la cabine.",
                      ].map((option) => {
                        const idx = rapportModalCabineIdx;
                        const isSelected = cabines[idx].rapport.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              setCabines((prev) =>
                                prev.map((c, i) => {
                                  if (i !== idx) return c;
                                  const newRapport = isSelected
                                    ? c.rapport.replace(option, "").replace(/\n{2,}/g, "\n").trim()
                                    : (c.rapport ? c.rapport + "\n" : "") + option;
                                  return { ...c, rapport: newRapport };
                                })
                              );
                            }}
                            className={`w-full text-left text-sm px-3 py-2.5 rounded-xl border-2 transition-colors ${
                              isSelected
                                ? "border-[#1e3a5f] bg-blue-50 dark:bg-blue-900/30 text-[#1e3a5f] dark:text-blue-200 font-medium"
                                : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300"
                            }`}
                          >
                            <span className="flex items-center gap-2.5">
                              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                                isSelected ? "border-[#1e3a5f] bg-[#1e3a5f]" : "border-gray-300 dark:border-slate-600"
                              }`}>
                                {isSelected && <span className="text-white text-xs">✓</span>}
                              </span>
                              {option}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <Textarea
                      placeholder="Précisions supplémentaires..."
                      value={cabines[rapportModalCabineIdx].rapport}
                      onChange={(e) => {
                        const idx = rapportModalCabineIdx;
                        setCabines((prev) => prev.map((c, i) => i === idx ? { ...c, rapport: e.target.value } : c));
                        scheduleAutoSave();
                      }}
                      rows={2}
                      className="mt-3"
                    />
                  </div>
                  <div className="px-5 pt-2 pb-5">
                    <button
                      type="button"
                      onClick={() => setRapportModalCabineIdx(null)}
                      className="w-full py-3 rounded-xl bg-[#1e3a5f] text-white text-sm font-semibold active:opacity-80 transition-opacity"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* ── Modal rapport général obligatoire (mono-cabine) ── */}
            {showRapportRequiredModal && createPortal(
              <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4 pb-8">
                <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
                  <div className="px-5 pt-5 pb-2">
                    <p className="text-sm font-semibold text-red-600 dark:text-red-400 mb-1">Rapport général manquant</p>
                    <p className="text-xs text-gray-500 mb-4">Veuillez renseigner le rapport avant d&apos;enregistrer.</p>
                    <div className="space-y-2">
                      {[
                        "L'installation s'est déroulée sans encombre.",
                        "Nous avons rencontré quelques difficultés à l'assemblage de la cabine.",
                        "Client présent lors des montages, travaux validés par client.",
                        "Personne sur site lors du montage.",
                      ].map((option) => {
                        const isSelected = rapport.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setRapport(rapport.replace(option, "").replace(/\n{2,}/g, "\n").trim());
                              } else {
                                setRapport((rapport ? rapport + "\n" : "") + option);
                              }
                              scheduleAutoSave();
                            }}
                            className={`w-full text-left text-sm px-3 py-2.5 rounded-xl border-2 transition-colors ${
                              isSelected
                                ? "border-[#1e3a5f] bg-blue-50 text-[#1e3a5f] font-medium"
                                : "border-gray-200 bg-white text-gray-700 active:bg-gray-50"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                                isSelected ? "border-[#1e3a5f] bg-[#1e3a5f]" : "border-gray-300"
                              }`}>
                                {isSelected && <span className="text-white text-xs">✓</span>}
                              </span>
                              {option}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <Textarea
                      placeholder="Précisions supplémentaires..."
                      value={rapport}
                      onChange={(e) => setRapport(e.target.value)}
                      rows={3}
                      className="mt-3"
                    />
                  </div>
                  <div className="px-5 pt-2 pb-5 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowRapportRequiredModal(false)}
                      className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium active:opacity-80 transition-opacity"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowRapportRequiredModal(false);
                        if (rapport.trim()) handleSave();
                      }}
                      disabled={!rapport.trim()}
                      className="flex-1 py-3 rounded-xl bg-[#1e3a5f] text-white text-sm font-semibold disabled:opacity-40 active:opacity-80 transition-opacity"
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              </div>,
              document.body
            )}

            {/* Signalements enregistrés — vue globale agrégée.
                Multi-cabine uniquement : les signalements (liste + formulaires)
                vivent dans chaque onglet cabine, on conserve ici une vue d'ensemble.
                En mono-cabine, liste + formulaires sont dans l'onglet Photos.
                Les FORMULAIRES de signalement à la racine ont été retirés : ils ne
                rattachaient pas le signalement à un lot précis (demande utilisateur). */}
            {isCabineMode && (() => {
              const nbSignalements = cabineSignalements.pieces.length + cabineSignalements.defauts.length;
              return (
              <Card>
                <CardHeader className="pb-2">
                  <button
                    type="button"
                    onClick={() => setShowSignalementsCard((v) => !v)}
                    className="w-full flex items-center justify-between gap-2"
                  >
                    <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300">
                      <span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />
                      Signalements enregistrés{nbSignalements > 0 ? ` (${nbSignalements})` : ""}
                    </CardTitle>
                    {showSignalementsCard
                      ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                  </button>
                </CardHeader>
                {showSignalementsCard && (
                  <CardContent className="space-y-4 border-t pt-3">
                    <PiecesList projectId={id} refreshKey={pieceRefreshKey} />
                    <DefautsList projectId={id} refreshKey={defautRefreshKey} project={project} setProject={setProject} />
                    {nbSignalements === 0 && (
                      <p className="text-sm text-gray-400 text-center py-2">Aucun signalement enregistré.</p>
                    )}
                  </CardContent>
                )}
              </Card>
              );
            })()}

            {/* Note interne (niveau projet) — en multi-cabine seulement : en
                mono-cabine elle est déjà rendue dans la carte du rapport. */}
            {isCabineMode && (
              <InternalNoteField
                projectId={id}
                value={project.noteInterneMontage}
                onUpdate={(v) => setProject({ ...project, noteInterneMontage: v })}
              />
            )}

            {/* Signature client */}
            <Card id="signature-card">
              <CardHeader className="pb-2">
                <button type="button" onClick={() => setShowSignatureCard((v) => !v)} className="w-full flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300">
                    <span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />
                    Signature du client
                    {signature && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300">✓ signée</span>}
                  </CardTitle>
                  {showSignatureCard
                    ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />}
                </button>
              </CardHeader>
              {showSignatureCard && (
              <CardContent className="pt-1 border-t">
                <SignaturePad
                  label=""
                  existingSignature={signature}
                  onSave={async (dataUrl) => {
                    // Affichage immédiat : le data-URL local rend la
                    // signature visible avant même le retour Cloudinary.
                    setSignature(dataUrl);
                    try { localStorage.setItem(`tm-sig-${id}`, dataUrl); } catch {}
                    try {
                      const blob = await fetch(dataUrl).then(r => r.blob());
                      const formData = new FormData();
                      formData.append("files", new File([blob], "signature.png", { type: "image/png" }));
                      formData.append("category", "signatures");
                      formData.append("projectId", id);
                      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
                      const uploadData = await uploadRes.json();
                      const cloudinaryUrl = uploadData.files?.[0]?.url;
                      if (cloudinaryUrl) {
                        // Bascule vers l'URL canonique : elle est lisible
                        // par le PDF et plus stable que le data-URL en
                        // localStorage (taille).
                        setSignature(cloudinaryUrl);
                        try { localStorage.setItem(`tm-sig-${id}`, cloudinaryUrl); } catch {}
                        setProject((prev) => prev ? { ...prev, signatureUrl: cloudinaryUrl } : prev);
                        await offlineFetch(`/api/projects/${id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ signatureUrl: cloudinaryUrl }),
                        });
                        invalidateApiCache();
                      }
                    } catch (err) { console.error("Signature upload error:", err); }
                  }}
                />
              </CardContent>
              )}
            </Card>

            {/* Actions CMD */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={handleSaveClick}
                disabled={saving}
                className="w-full h-12 rounded-xl text-base font-medium save-btn text-white"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <Save className="w-5 h-5 mr-2" />
                )}
                Enregistrer le rapport
              </Button>

              {/* Deux envois distincts : INTERNE (avec heures, inchangé) et
                  CLIENT (sans les heures d'arrivée/départ). */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 h-auto min-h-[3.25rem] py-2 rounded-xl glass-btn text-white flex flex-col items-center justify-center gap-0.5 leading-tight"
                  onClick={() => handleSendReport({ client: false })}
                  disabled={sending}
                  title="Envoyer le rapport interne (avec les heures)"
                >
                  {sending && sendKind === "interne" ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Send className="w-4 h-4 shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-center">Envoyer rapport interne</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 h-auto min-h-[3.25rem] py-2 rounded-xl glass-btn text-white flex flex-col items-center justify-center gap-0.5 leading-tight"
                  onClick={() => handleSendReport({ client: true })}
                  disabled={sending}
                  title="Envoyer le rapport client (sans les heures)"
                >
                  {sending && sendKind === "client" ? (
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                  ) : (
                    <Send className="w-4 h-4 shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-center">Envoyer rapport clients</span>
                </Button>
              </div>

              {/* Actualiser + télécharger : version INTERNE (avec heures) et
                  version CLIENT (sans les heures). */}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={downloadingPdf}
                  onClick={() => handleDownloadPdf(false)}
                  title="Actualiser et télécharger le rapport interne (avec les heures)"
                  className="flex-1 h-auto min-h-[3.25rem] py-2 rounded-xl flex flex-col items-center justify-center gap-0.5 leading-tight bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95 transition-all border border-red-200 dark:border-red-800 disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 shrink-0 ${downloadingPdf && downloadKind === "interne" ? "animate-spin" : ""}`} />
                  <span className="text-sm font-semibold text-center">PDF interne</span>
                </button>
                <button
                  type="button"
                  disabled={downloadingPdf}
                  onClick={() => handleDownloadPdf(true)}
                  title="Actualiser et télécharger le rapport client (sans les heures)"
                  className="flex-1 h-auto min-h-[3.25rem] py-2 rounded-xl flex flex-col items-center justify-center gap-0.5 leading-tight bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95 transition-all border border-red-200 dark:border-red-800 disabled:opacity-60"
                >
                  <RefreshCw className={`w-4 h-4 shrink-0 ${downloadingPdf && downloadKind === "client" ? "animate-spin" : ""}`} />
                  <span className="text-sm font-semibold text-center">PDF clients</span>
                </button>
              </div>
              <p className="text-[10px] text-gray-400 text-center -mt-2">
                Régénère le rapport avec toutes les dernières photos et données
              </p>

              {/* Téléchargement de toutes les photos en ZIP */}
              <button
                type="button"
                disabled={downloadingPhotos}
                onClick={handleDownloadPhotos}
                className="w-full h-12 rounded-xl text-base font-medium flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 active:scale-95 transition-all border border-blue-200 dark:border-blue-800 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {downloadingPhotos ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ImageDown className="w-5 h-5" />
                )}
                {downloadingPhotos ? "Préparation du ZIP…" : "Télécharger toutes les photos"}
              </button>
              <p className="text-[10px] text-gray-400 text-center -mt-2">
                {isCabineMode
                  ? "Toutes les photos regroupées par cabine en ZIP"
                  : "Toutes les photos du projet en ZIP"}
              </p>

              {/* Suivi consultations rapport */}
              {isAdmin && <ReportConsultations projectId={id} />}
            </div>
          </>
        )}

        {mode === "mesures" && (
          <>
            <Separator />

            {/* Photos Mesures */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2 font-semibold text-[#1e3a5f] dark:text-blue-300"><span className="w-1 h-4 rounded-full bg-[#1e3a5f] dark:bg-blue-300 shrink-0" />Photos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <PhotoUpload
                  category="situations"
                  label="Photos situations"
                  projectId={id}
                  notionField="Photos situations"
                  filePrefix="Photos - Situations"
                  existingPhotos={project.photosSituations}
                  onUpload={(newFiles) => setProject((prev) => {
                    if (!prev) return prev;
                    const cur = prev.photosSituations || [];
                    const seen = new Set(cur.map((f) => f.url));
                    const toAdd = newFiles.filter((f) => f.url && !seen.has(f.url));
                    return toAdd.length ? { ...prev, photosSituations: [...cur, ...toAdd] } : prev;
                  })}
                  onDelete={(files) => {
                    setProject((prev) => prev ? { ...prev, photosSituations: files } : prev);
                    offlineFetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photosSituations: files }) }).catch(() => {});
                  }}
                />
                <PhotoUpload
                  category="mesures"
                  label="Photos mesures"
                  projectId={id}
                  notionField="Photos mesures"
                  filePrefix="Photos - Mesures"
                  existingPhotos={project.photosMesures}
                  onUpload={(newFiles) => setProject((prev) => {
                    if (!prev) return prev;
                    const cur = prev.photosMesures || [];
                    const seen = new Set(cur.map((f) => f.url));
                    const toAdd = newFiles.filter((f) => f.url && !seen.has(f.url));
                    return toAdd.length ? { ...prev, photosMesures: [...cur, ...toAdd] } : prev;
                  })}
                  onDelete={(files) => {
                    setProject((prev) => prev ? { ...prev, photosMesures: files } : prev);
                    offlineFetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photosMesures: files }) }).catch(() => {});
                  }}
                />
                <PhotoUpload
                  category="localite"
                  label="Photos localité"
                  projectId={id}
                  notionField="Photos localité"
                  filePrefix="Photos - Localite"
                  existingPhotos={project.photosLocalite}
                  onUpload={(newFiles) => setProject((prev) => {
                    if (!prev) return prev;
                    const cur = prev.photosLocalite || [];
                    const seen = new Set(cur.map((f) => f.url));
                    const toAdd = newFiles.filter((f) => f.url && !seen.has(f.url));
                    return toAdd.length ? { ...prev, photosLocalite: [...cur, ...toAdd] } : prev;
                  })}
                  onDelete={(files) => {
                    setProject((prev) => prev ? { ...prev, photosLocalite: files } : prev);
                    offlineFetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photosLocalite: files }) }).catch(() => {});
                  }}
                />
              </CardContent>
            </Card>

            {/* Actions Mesures */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={() => handleSave()}
                disabled={saving}
                className="w-full h-12 rounded-xl text-base font-medium glass-btn text-white"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <Send className="w-5 h-5 mr-2" />
                )}
                Enregistrer
              </Button>
            </div>
          </>
        )}

        {mode === "sav" && (
          <>
            <Separator />
            <SAVForm projectId={id} projectName={project.projet} />
          </>
        )}
        </div>
      </div>

      {/* Chat flottant */}
      <ProjectChat projectId={id} />

      {/* Confirmation : réinitialisation cabine */}
      {resetConfirmIdx !== null && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 70, transform: "translateZ(0)" }}
          className="flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setResetConfirmIdx(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-red-500 text-white px-5 py-4 flex items-center gap-2">
              <RotateCcw className="w-5 h-5" />
              <h3 className="text-base font-semibold">
                Réinitialiser {cabines[resetConfirmIdx]?.nom || `Cabine ${resetConfirmIdx + 1}`}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Cette action effacera <strong>définitivement</strong> toutes les données de cette cabine :
              </p>
              <ul className="text-sm space-y-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
                {[
                  "Photos (avant, montage, démontage, QR, garanties)",
                  "Heures d'arrivée et de départ",
                  "Rapport et remarques",
                  "Monteur responsable",
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-red-900 dark:text-red-200">
                    <span className="mt-0.5 text-red-500 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-600 dark:text-gray-300 font-medium">
                Cette action est irréversible. Continuer ?
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => setResetConfirmIdx(null)}
                className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  const idx = resetConfirmIdx;
                  setResetConfirmIdx(null);
                  await handleResetCabine(idx);
                }}
                className="flex-1 h-10 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium transition-colors"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Confirmation : photos manquantes avant enregistrement / envoi */}
      {missingPhotosPrompt && typeof document !== "undefined" && createPortal(
        // Rendu via Portal vers document.body : sinon un ancêtre
        // transformé/filtré (typique du thème Ocean) casse
        // `position: fixed` et la modale tombe en flow normal au
        // bas de la page — l'utilisateur devait alors scroller pour
        // la trouver. En portail au niveau body le containing block
        // est garanti = viewport, donc la modale se centre vraiment
        // au milieu de l'écran.
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            transform: "translateZ(0)",
          }}
          className="flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setMissingPhotosPrompt(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const required = missingPhotosPrompt.required || [];
              const hasRequired = required.length > 0;
              const hasMissing = missingPhotosPrompt.missing.length > 0;
              const needsPresence = !!missingPhotosPrompt.needsPresence;
              const presenceMissing = needsPresence && !presenceInRapport;
              // Le bouton d'envoi est BLOQUÉ tant qu'il manque des photos
              // obligatoires ou que la présence n'est pas renseignée.
              const blocked = hasRequired || presenceMissing;
              const title = hasRequired
                ? "Photos obligatoires manquantes"
                : needsPresence
                ? (hasMissing ? "Avant d'envoyer le rapport" : "Client sur place ?")
                : "Photos manquantes";
              return (
                <>
                  <div className="bg-amber-500 text-white px-5 py-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5" />
                    <h3 className="text-base font-semibold">{title}</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    {/* Bloc PRÉSENCE — coche la bonne case du rapport du monteur. */}
                    {needsPresence && (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-700 dark:text-gray-200">
                          Merci d'indiquer si un client était présent lors du montage :
                        </p>
                        {([
                          { key: "client" as const, label: PRESENCE_CLIENT },
                          { key: "personne" as const, label: PRESENCE_PERSONNE },
                        ]).map((opt) => {
                          const selected = presenceInRapport === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => applyPresence(opt.key)}
                              className={`w-full text-left text-sm px-3 py-2.5 rounded-xl border-2 transition-colors ${
                                selected
                                  ? "border-[#1e3a5f] bg-blue-50 dark:bg-blue-900/30 text-[#1e3a5f] dark:text-blue-200 font-medium"
                                  : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              <span className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                  selected ? "border-[#1e3a5f] bg-[#1e3a5f]" : "border-gray-300 dark:border-slate-600"
                                }`}>
                                  {selected && <span className="text-white text-xs">✓</span>}
                                </span>
                                {opt.label}
                              </span>
                            </button>
                          );
                        })}
                        {presenceInRapport === "client" && (
                          <p className="text-[11px] text-blue-600 dark:text-blue-300">
                            La signature du client sera demandée avant l'envoi.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Bloc PHOTOS OBLIGATOIRES (bloquant, ROUGE) — avec compteur. */}
                    {hasRequired && (
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-red-700 dark:text-red-300">
                          Ces photos sont obligatoires avant l'envoi :
                        </p>
                        <ul className="text-sm space-y-1.5 max-h-56 overflow-y-auto bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                          {required.map((r) => {
                            const manque = r.min - r.have;
                            return (
                              <li key={r.label} className="flex items-start justify-between gap-2 text-red-900 dark:text-red-200">
                                <span className="flex items-start gap-2">
                                  <span className="mt-0.5 text-red-500">•</span>
                                  <span>{r.label}</span>
                                </span>
                                <span className="shrink-0 font-semibold whitespace-nowrap">
                                  {r.have}/{r.min} — il manque {manque}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}

                    {/* Bloc PHOTOS RECOMMANDÉES (contournable, AMBRÉ). */}
                    {hasMissing && (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-700 dark:text-gray-200">
                          Photos recommandées non ajoutées :
                        </p>
                        <ul className="text-sm space-y-1 max-h-40 overflow-y-auto bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                          {missingPhotosPrompt.missing.map((label) => (
                            <li key={label} className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                              <span className="mt-0.5 text-amber-500">•</span>
                              <span>{label}</span>
                            </li>
                          ))}
                        </ul>
                        {!hasRequired && (
                          <p className="text-sm text-gray-600 dark:text-gray-300">
                            Vous pouvez continuer sans ces photos.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="px-5 pb-5 flex gap-2">
                    <button
                      onClick={() => setMissingPhotosPrompt(null)}
                      className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
                    >
                      {hasRequired || hasMissing ? "Ajouter les photos" : "Annuler"}
                    </button>
                    <button
                      disabled={blocked}
                      title={hasRequired ? "Ajoutez d'abord les photos obligatoires" : undefined}
                      onClick={() => {
                        const kind = missingPhotosPrompt.kind;
                        setMissingPhotosPrompt(null);
                        if (kind === "send") handleSendReport({ force: true });
                        else handleSave({ force: true });
                      }}
                      className="flex-1 h-10 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {hasMissing && !hasRequired ? "Continuer quand même" : "Envoyer le rapport"}
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* Signature obligatoire — client présent mais rapport pas encore signé. */}
      {signatureRequiredPrompt && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 70, transform: "translateZ(0)" }}
          className="flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setSignatureRequiredPrompt(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1e3a5f] text-white px-5 py-4 flex items-center gap-2">
              <PenLine className="w-5 h-5" />
              <h3 className="text-base font-semibold">Signature du client requise</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                Vous avez indiqué que le client était présent et a validé les travaux.
                La signature du client est nécessaire avant d'envoyer le rapport.
              </p>
            </div>
            <div className="px-5 pb-5 space-y-2">
              <button
                onClick={() => {
                  setSignatureRequiredPrompt(false);
                  const el = document.getElementById("signature-card");
                  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                className="w-full h-11 rounded-lg bg-[#1e3a5f] hover:bg-[#2a4a73] text-white text-sm font-semibold"
              >
                Faire signer le client
              </button>
              <button
                onClick={() => {
                  setSignatureRequiredPrompt(false);
                  handleSendReport({ skipSignature: true, force: true });
                }}
                className="w-full h-9 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                Le client n'a pas pu signer — envoyer sans signature
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Choix interne / client — déclenché par les icônes du header (envoyer /
          actualiser-télécharger) qui reprennent les fonctions du bas de page. */}
      {audienceChoice && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 70, transform: "translateZ(0)" }}
          className="flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setAudienceChoice(null)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-[#1e3a5f] text-white px-5 py-4 flex items-center gap-2">
              {audienceChoice === "send" ? <Send className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
              <h3 className="text-base font-semibold">
                {audienceChoice === "send" ? "Envoyer le rapport" : "Actualiser et télécharger"}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-600 dark:text-gray-300">Quelle version du rapport ?</p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => {
                    const a = audienceChoice;
                    setAudienceChoice(null);
                    if (a === "send") handleSendReport({ client: false });
                    else handleDownloadPdf(false);
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700 active:scale-[0.99] transition-all"
                >
                  <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Rapport interne</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Avec les heures d&apos;arrivée et de départ</span>
                </button>
                <button
                  onClick={() => {
                    const a = audienceChoice;
                    setAudienceChoice(null);
                    if (a === "send") handleSendReport({ client: true });
                    else handleDownloadPdf(true);
                  }}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 border-[#1e3a5f]/30 dark:border-blue-400/40 bg-blue-50/40 dark:bg-blue-900/10 hover:bg-blue-50 dark:hover:bg-blue-900/20 active:scale-[0.99] transition-all"
                >
                  <span className="block text-sm font-semibold text-gray-800 dark:text-gray-100">Rapport client</span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">Sans les heures — version à partager au client</span>
                </button>
              </div>
              <button
                onClick={() => setAudienceChoice(null)}
                className="w-full h-9 rounded-lg text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Confirmation persistante "Rapport envoyé" — évite les envois répétés. */}
      {showSentConfirm && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 70, transform: "translateZ(0)" }}
          className="flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowSentConfirm(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-7 pb-2 flex flex-col items-center gap-3">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center">
                <Check className="w-9 h-9 text-green-600 dark:text-green-400" strokeWidth={3} />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Rapport envoyé</h3>
            </div>
            <div className="px-6 pb-2 text-center">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Le rapport a bien été envoyé.
              </p>
            </div>
            <div className="p-5">
              <button
                onClick={() => setShowSentConfirm(false)}
                className="w-full h-11 rounded-xl bg-green-600 hover:bg-green-700 text-white text-base font-semibold active:scale-[0.98] transition-all"
              >
                OK
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
