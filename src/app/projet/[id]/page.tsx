"use client";

import { Suspense, useEffect, useRef, useState, use, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Clock,
  MapPin,
  Navigation,
  Users,
  FileText,
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
} from "lucide-react";
import { MontageChecklist } from "@/components/checklist";
import { ProjectChat } from "@/components/project-chat";
// GPS DÉSACTIVÉ — décommenter pour réactiver le pointage GPS automatique
// import { GPSTracker } from "@/components/gps-tracker";
// import { AdminGpsTimer } from "@/components/admin-gps-timer";
import { SiteTimer } from "@/components/site-timer";
import { StockUsage } from "@/components/stock-usage";
import { SAVForm } from "@/components/sav-form";
import { ContactButtons } from "@/components/contact-buttons";
import { Star, Share2, RefreshCw, PenLine, ImageDown } from "lucide-react";
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
  extractCabine,
} from "@/lib/photo-buckets";
import { STATUS_CMD_COLORS, STATUS_MESURES_COLORS } from "@/lib/constants";
import { thumbnailUrl } from "@/lib/image-url";

/** Photo upload tied to a logical bucket (sub-section dans une colonne Notion). */
function BucketPhotoUpload({
  bucket,
  cabineIdx,
  projectId,
  project,
  setProject,
  onAutoFill,
}: {
  bucket: PhotoBucketKey;
  cabineIdx?: number;
  projectId: string;
  project: Project | null;
  setProject: React.Dispatch<React.SetStateAction<Project | null>>;
  onAutoFill?: (bucket: PhotoBucketKey, captureTime: string, cabineIdx?: number) => void;
}) {
  if (!project) return null;
  const notionFieldKey = BUCKET_NOTION_FIELD[bucket];
  const notionFieldName: Record<typeof notionFieldKey, string> = {
    photosAvant: "Photos avant montage",
    photosDemontage: "Photos démontage",
    photosMontage: "Photos montage terminé",
    photosQRCode: "Photos QR Code",
    photosGaranties: "Photos garanties",
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
      return { ...prev, [notionFieldKey]: [...current, ...toAdd] };
    });
  };

  // Suppression : mise à jour immédiate et définitive de l'état React.
  // On calcule nextFullList depuis project (closure fraîche au moment du
  // clic) plutôt qu'à l'intérieur de setProject pour éviter tout edge-case
  // React 18 Concurrent Mode où l'updater peut être appelé plusieurs fois.
  const handleDelete = (newBucketFiles: { name: string; url: string }[]) => {
    if (!project) return;
    const nextFullList = buildNextFullList(project, newBucketFiles);
    // Mise à jour UI immédiate — la photo disparaît définitivement du rendu.
    setProject((prev) => prev ? { ...prev, [notionFieldKey]: nextFullList } : prev);
    // PATCH Notion en arrière-plan (état déjà correct côté UI).
    offlineFetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [notionFieldKey]: nextFullList }),
    }).catch(() => {});
  };

  const hint = BUCKET_HINT[bucket];
  return (
    <div>
      {hint && (
        <p className="text-xs text-gray-400 mb-1 mt-0.5">({hint})</p>
      )}
      <PhotoUpload
        category={`${bucket.toLowerCase()}${cabineIdx ? `-cab${cabineIdx}` : ""}`}
        label={BUCKET_LABEL[bucket]}
        projectId={projectId}
        notionField={notionFieldName[notionFieldKey]}
        filePrefix={bucketFilePrefix(bucket, cabineIdx)}
        existingPhotos={existingPhotos}
        onUpload={handleUpload}
        onDelete={handleDelete}
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
}: {
  cabineIdx?: number;
  projectId: string;
  project: Project | null;
  setProject: React.Dispatch<React.SetStateAction<Project | null>>;
  onAutoFill?: (bucket: PhotoBucketKey, captureTime: string, cabineIdx?: number) => void;
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

  return (
    <div>
      <p className="text-xs text-gray-400 mb-1 mt-0.5">(1 photo gauche, 1 photo centre, 1 photo droite)</p>
      <PhotoUpload
        category={`montage${cabineIdx ? `-cab${cabineIdx}` : ""}`}
        label="Photos montage"
        projectId={projectId}
        notionField="Photos montage terminé"
        filePrefix={bucketFilePrefix("MONTAGE_GAUCHE", cabineIdx)}
        existingPhotos={existingPhotos}
        onUpload={handleUpload}
        onDelete={handleDelete}
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
      const res = await fetch("/api/logs");
      if (res.ok) {
        const all = await res.json();
        if (Array.isArray(all)) {
          const filtered = all.filter((l: any) => l.projectId === projectId);
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
                  <span className="text-gray-400 shrink-0 w-14">
                    {new Date(log.timestamp).toLocaleDateString("fr-CH", { day: "2-digit", month: "short" })}
                  </span>
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
function PiecesList({ projectId, refreshKey }: { projectId: string; refreshKey?: number }) {
  type Piece = {
    id: string;
    description?: string;
    reference?: string;
    user?: string;
    timestamp?: number;
    photoUrls?: string[];
    photoUrl?: string;
    status?: string;
  };
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{ description: string; reference: string }>({ description: "", reference: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pieces?projectId=${projectId}`);
      if (res.ok) {
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

  if (!loaded || pieces.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-orange-600 dark:text-orange-400">
        Pièces manquantes ({pieces.length})
      </p>
      {pieces.map((p, idx) => {
        const num = idx + 1;
        const isDeleting = deleting === p.id;
        const isEditing = editing === p.id;
        const photos = p.photoUrls?.length ? p.photoUrls : (p.photoUrl ? [p.photoUrl] : []);
        return (
          <div key={p.id} className="rounded-lg border border-orange-200 dark:border-orange-800 bg-orange-50/40 dark:bg-orange-900/10 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-orange-700 dark:text-orange-400">Pièce n°{num}</span>
              <div className="flex items-center gap-1">
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
              <div className="flex flex-wrap gap-1.5 mt-2">
                {photos.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={thumbnailUrl(url, 120)} alt={`Photo ${i + 1}`} loading="lazy" decoding="async"
                      className="w-16 h-16 object-cover rounded-md border border-orange-200 dark:border-orange-700 hover:opacity-90 transition-opacity" />
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
function DefautsList({ projectId, refreshKey }: { projectId: string; refreshKey?: number }) {
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
        const data = await res.json();
        if (Array.isArray(data)) setDefauts(data);
      }
    } catch {} finally { setLoaded(true); }
  }, [projectId]);

  useEffect(() => { load(); }, [load, refreshKey]);

  const toggleDisplay = async (id: string, current: boolean) => {
    const next = !current;
    setDefauts((prev) => prev.map((d) => d.id === id ? { ...d, displayInRapport: next } : d));
    try {
      await fetch("/api/defauts", { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, displayInRapport: next }) });
    } catch {
      setDefauts((prev) => prev.map((d) => d.id === id ? { ...d, displayInRapport: current } : d));
      toast.error("Erreur de mise à jour");
    }
  };

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

  if (!loaded || defauts.length === 0) return null;

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-red-600 dark:text-red-400">Défauts signalés ({defauts.length})</p>
      {defauts.map((d, idx) => {
        const num = idx + 1;
        const visible = d.displayInRapport !== false;
        const isDeleting = deleting === d.id;
        const isEditing = editing === d.id;
        return (
          <div key={d.id} className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10 p-3">
            {/* En-tête : numéro + actions */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-red-700 dark:text-red-400">Défaut n°{num}</span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => toggleDisplay(d.id, visible)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${visible ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 text-emerald-700 dark:text-emerald-300" : "bg-gray-100 dark:bg-slate-700 border-gray-300 dark:border-gray-600 text-gray-500"}`}
                  title={visible ? "Affiché sur le rapport — cliquer pour masquer" : "Masqué du rapport — cliquer pour afficher"}>
                  {visible ? "Sur rapport ✓" : "Masqué"}
                </button>
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
              <div className="flex flex-wrap gap-1.5 mt-2">
                {d.photoUrls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={thumbnailUrl(url, 120)} alt={`Photo ${i + 1}`} loading="lazy" decoding="async"
                      className="w-16 h-16 object-cover rounded-md border border-red-200 dark:border-red-700 hover:opacity-90 transition-opacity" />
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
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const uploadingRef = useRef(false);

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

  const handleAddPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    // Garde synchrone : empêche un 2e onChange de relancer un upload
    // pendant que le 1er est en cours (cf. bug iOS capture + multiple).
    if (uploadingRef.current) {
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
      return;
    }
    uploadingRef.current = true;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));
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
    } catch {
      toast.error("Erreur réseau");
    } finally {
      uploadingRef.current = false;
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
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
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={uploading}
            className={`w-16 h-7 rounded border-2 border-dashed flex items-center justify-center gap-1 text-[10px] transition-colors ${
              color === "orange"
                ? "border-orange-300 text-orange-500 hover:bg-orange-50"
                : "border-red-300 text-red-500 hover:bg-red-50"
            } disabled:opacity-50`}
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><Camera className="w-3 h-3" /> Photo</>}
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={uploading}
            className={`w-16 h-7 rounded border-2 border-dashed flex items-center justify-center gap-1 text-[10px] transition-colors ${
              color === "orange"
                ? "border-orange-300 text-orange-500 hover:bg-orange-50"
                : "border-red-300 text-red-500 hover:bg-red-50"
            } disabled:opacity-50`}
          >
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <><ImagePlus className="w-3 h-3" /> Galerie</>}
          </button>
        </div>
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleAddPhotos(e.target.files)} />
        <input ref={galleryRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleAddPhotos(e.target.files)} />
      </div>
    </div>
  );
}

function EditableTextField({ label, value, projectId, fieldName, notionField, multiline, onUpdate }: {
  label: string; value: string; projectId: string; fieldName: string; notionField: string; multiline?: boolean; onUpdate: (v: string) => void;
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
      <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
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
  const currentStatus = isMesures ? project.etatMesures : project.etatCMD;
  const field = isMesures ? "etatMesures" : "etatCMD";
  const colorClass = statusColors[currentStatus] || "bg-gray-100 text-gray-700";
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
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap leading-tight ${colorClass}`}>
          {currentStatus || "—"}
        </span>
        <select
          value={currentStatus || ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={saving}
          className="text-[11px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-0.5 text-gray-700 dark:text-gray-300 disabled:opacity-50 max-w-[130px]"
        >
          {!currentStatus && <option value="">---</option>}
          {Object.keys(statusColors).map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
        {saving && <span className="text-[10px] text-gray-400 animate-pulse">…</span>}
      </div>
    </div>
  );
}

/** Parse time from formats: "HH:MM" or "date collab HH:MM | ..." — returns minutes since midnight */
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

/** Estimate duration for a project based on supplier historical data */
function estimateDuration(
  fournisseur: string,
  nbCabines: number,
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
      const arrive = parseTimeRaw(p.heureArrivee);
      const depart = parseTimeRaw(p.heureDepart);
      if (arrive === null || depart === null) return null;
      let mins = depart - arrive;
      if (mins <= 0) mins += 24 * 60;
      const cabines = p.nbCabines || 1;
      const minsPerCabine = mins / cabines;
      return { project: p, minsPerCabine };
    })
    .filter(Boolean) as { project: Project; minsPerCabine: number }[];

  // Filter by supplier
  const supplierProjects = projectsWithTime.filter((p) =>
    p.project.fournisseurs.includes(fournisseur),
  );

  let avgMinsPerCabine: number;
  let confidence: string;

  if (supplierProjects.length >= 3) {
    avgMinsPerCabine =
      supplierProjects.reduce((s, p) => s + p.minsPerCabine, 0) /
      supplierProjects.length;
    confidence = `${supplierProjects.length} projets ${fournisseur}`;
  } else if (projectsWithTime.length >= 3) {
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
    if (!fournisseur) {
      setLoaded(true);
      return;
    }

    fetch("/api/projects/cmd-termine")
      .then((r) => (r.ok ? r.json() : []))
      .then((completedProjects: Project[]) => {
        const result = estimateDuration(fournisseur, nbCabines, completedProjects);
        setEstimate(result);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [project.fournisseurs, project.nbCabines]);

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

function DocumentLinks({ files, label, projectId, notionField }: { files: { name: string; url: string }[]; label: string; projectId?: string; notionField?: string }) {
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
    <div className="mt-3">
      <p className="text-xs text-gray-500 mb-1.5">{label}</p>
      <div className="space-y-1.5">
        {files.map((f, i) => (
          <button
            key={i}
            onClick={() => handleOpen(i, f.url)}
            className="w-full flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg active:bg-blue-100 text-left"
          >
            <FileText className="w-4 h-4 shrink-0" />
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

function NotionComments({ projectId }: { projectId: string }) {
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
        <CardTitle className="text-base">Commentaires Notion</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-3/4" />
            <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-1/2" />
          </div>
        ) : commentsError ? (
          <p className="text-xs text-red-500 italic">Erreur : {commentsError}</p>
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
  const [fetchError, setFetchError] = useState<"temporary" | "notfound" | null>(null);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [reformulating, setReformulating] = useState(false);
  const [missingPhotosPrompt, setMissingPhotosPrompt] = useState<{
    kind: "save" | "send";
    missing: string[];
  } | null>(null);
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
  // Notif discret si on n'a pas pu fusionner automatiquement (conflit).
  const [collabUpdateToast, setCollabUpdateToast] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string; email?: string } | null>(null);
  const [showRapport, setShowRapport] = useState(false);
  // Clé de rafraîchissement pour DefautsList : incrémentée à chaque
  // nouveau défaut soumis pour forcer le rechargement des données KV.
  const [defautRefreshKey, setDefautRefreshKey] = useState(0);
  const [pieceRefreshKey, setPieceRefreshKey] = useState(0);
  const [showEditModal, setShowEditModal] = useState(false);

  useEffect(() => {
    fetch("/api/auth").then((r) => r.json()).then((d) => {
      if (d.user) setCurrentUser(d.user);
    }).catch(() => {});
  }, []);

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
  const [cabines, setCabines] = useState<{ nom: string; rapport: string; open: boolean; monteur: string; arrivee: string; depart: string; date: string }[]>([]);
  const [isCabineMode, setIsCabineMode] = useState(false);
  const [expandedCabineDate, setExpandedCabineDate] = useState<string | null>(null);

  // ── Auto-fill depuis email connecté (hors admin) ──────────────────────────
  const EMAIL_TO_COLLAB: Record<string, string> = {
    "tm.douche.montage.1@gmail.com": "Claudio",
    "tm.douche.montage.2@gmail.com": "Jean-Marc",
    "tm.douche.montage.3@gmail.com": "Jacobo",
    "tm.douche.montage.4@gmail.com": "Miguel",
    "tm.douche.montage.5@gmail.com": "Loïc",
  };
  const autoCollab = currentUser?.email ? (EMAIL_TO_COLLAB[currentUser.email] ?? null) : null;

  // ── Drag-and-drop reorder cabines ────────────────────────────────────────
  const [cabineDragMode, setCabineDragMode] = useState(false);
  const [dragCabSrc, setDragCabSrc] = useState<number | null>(null);
  const [dragCabOver, setDragCabOver] = useState<number | null>(null);
  const cabineLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cabineTouchSrcRef = useRef<number | null>(null);
  const nomKvDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reorderCabines = (srcIdx: number, dstIdx: number) => {
    if (srcIdx === dstIdx) return;
    setCabines(prev => {
      const arr = [...prev];
      const [moved] = arr.splice(srcIdx, 1);
      arr.splice(dstIdx, 0, moved);
      return arr;
    });
  };
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
  const [downloadingPhotos, setDownloadingPhotos] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(60);

  useEffect(() => { setFav(isFavorite(id)); }, [id]);

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
        offlineFetch("/api/cabine-attribution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: id,
            attribution: next.map((c) => c.monteur),
            noms: next.map((c, i) => c.nom || `Cabine ${i + 1}`),
          }),
        }).catch(console.error);
      }
    } else {
      // Mode simple (1 cabine) ou multi-jour
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
  }, [isCabineMode, cabines, autoCollab, heureArrivee, heureDepart, project?.collaborateurs, id]);

  const addPointage = () => {
    setPointages((prev) => [...prev, { date: today, collaborateur: "", arrivee: "", depart: "" }]);
  };
  const updatePointage = (idx: number, field: keyof PointageEntry, value: string) => {
    setPointages((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: value } : p)));
  };
  const removePointage = (idx: number) => {
    setPointages((prev) => prev.filter((_, i) => i !== idx));
  };

  const initProject = (data: any) => {
    if (!data?.id) return;
    setProject(data);
    setHeureArrivee(data.heureArrivee || "");
    setHeureDepart(data.heureDepart || "");
    setCommentaires(data.commentairesMontages || "");
    setRapport(data.rapportMonteur || "");
    // Initialise la snapshot : le local est synchrone avec le serveur
    // juste après le mount.
    serverSnapshotRef.current = {
      rapport: data.rapportMonteur || "",
      commentaires: data.commentairesMontages || "",
      heureArrivee: data.heureArrivee || "",
      heureDepart: data.heureDepart || "",
    };
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

      // Restauration instantanée depuis localStorage — évite le flash des noms
      // par défaut pendant que le fetch API d'attribution est en cours.
      let storedNoms: string[] | null = null;
      try {
        const s = localStorage.getItem(`tm-cabin-noms-${data.id}`);
        if (s) storedNoms = JSON.parse(s);
      } catch {}

      setCabines(
        Array.from({ length: nb }, (_, i) => ({
          // Priorité : localStorage → sinon valeur par défaut
          nom: storedNoms?.[i] || `Cabine ${i + 1}`,
          rapport: "",
          open: i === 0,
          monteur: "",
          arrivee: arriveeMap[i] || "",
          depart: departMap[i] || "",
          date: dateMap[i] || "",
        }))
      );

      // Load existing attribution depuis l'API (source de vérité serveur)
      fetch(`/api/cabine-attribution?projectId=${data.id}`)
        .then((r) => r.json())
        .then((attr) => {
          if (!attr) return;
          setCabines((prev) => {
            const next = prev.map((c, i) => {
              // Nom : on prend la valeur la plus "custom" disponible :
              // API > localStorage > état actuel (jamais "Cabine N" par défaut
              // n'écrase une valeur personnalisée déjà en place).
              const apiNom = attr.noms?.[i];
              const isApiDefault = !apiNom || apiNom === `Cabine ${i + 1}`;
              const nom = isApiDefault ? c.nom : apiNom;
              return {
                ...c,
                monteur: attr.attribution?.[i] ?? c.monteur,
                nom,
              };
            });
            // Persiste les noms frais dans localStorage pour le prochain chargement
            try {
              localStorage.setItem(
                `tm-cabin-noms-${data.id}`,
                JSON.stringify(next.map((c) => c.nom))
              );
            } catch {}
            return next;
          });
        })
        .catch(() => {});
      // Si les heures Notion ne sont PAS au format multi-cabine (projet
      // saisi avant cette feature), on les charge dans la ligne pointages
      // par défaut — retrocompat.
      if ((data.heureArrivee || data.heureDepart) && Object.keys(arriveeMap).length === 0) {
        setPointages([{ date: today, collaborateur: "", arrivee: data.heureArrivee || "", depart: data.heureDepart || "" }]);
      }
    }
  };

  useEffect(() => {
    // 1. Cache-first: charger depuis le cache des projets instantanément
    try {
      const cached = localStorage.getItem("tm-projects-cache");
      if (cached) {
        const allCached = JSON.parse(cached);
        for (const key of Object.keys(allCached)) {
          const arr = allCached[key];
          if (Array.isArray(arr)) {
            const found = arr.find((p: any) => p.id === id);
            if (found) {
              initProject(found);
              setLoading(false);
              break;
            }
          }
        }
      }
    } catch {}

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
    fetchWithProjectRetry();
  }, [id]);

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

        if (sRapport !== snap.rapport) {
          setRapport((cur) => {
            if (cur === snap.rapport) { snap.rapport = sRapport; return sRapport; }
            snap.rapport = sRapport; conflict = true; return cur;
          });
        }
        if (sCommentaires !== snap.commentaires) {
          setCommentaires((cur) => {
            if (cur === snap.commentaires) { snap.commentaires = sCommentaires; return sCommentaires; }
            snap.commentaires = sCommentaires; conflict = true; return cur;
          });
        }
        if (sHA !== snap.heureArrivee) {
          setHeureArrivee((cur) => {
            if (cur === snap.heureArrivee) { snap.heureArrivee = sHA; return sHA; }
            snap.heureArrivee = sHA; conflict = true; return cur;
          });
        }
        if (sHD !== snap.heureDepart) {
          setHeureDepart((cur) => {
            if (cur === snap.heureDepart) { snap.heureDepart = sHD; return sHD; }
            snap.heureDepart = sHD; conflict = true; return cur;
          });
        }
        if (conflict) setCollabUpdateToast(true);
      } catch {}
    };
    const interval = setInterval(refetch, 8000);
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
    const reportToSave = isCabineMode
      ? rapport + "\n\n" + cabines.map((c) => c.rapport ? `${c.nom} : ${c.rapport}` : "").filter(Boolean).join("\n")
      : rapport;
    // Priorité 1 : mode multi-cabine → heures par cabine
    // ("Cab1:08:00 | Cab2:09:30")
    // Priorité 2 : mode multi-jour → pointages par date
    // Priorité 3 : cas simple → valeur unique
    const arriveeToSave = isCabineMode
      ? cabines.map((c, i) => {
          if (!c.arrivee && !c.date) return "";
          const dateStr = c.date ? `${c.date}:` : "";
          return `Cab${i + 1}:${dateStr}${c.arrivee}`;
        }).filter(Boolean).join(" | ")
      : isMultiDay
        ? pointages.map((p) => `${p.date} ${p.collaborateur} ${p.arrivee}`).join(" | ")
        : heureArrivee;
    const departToSave = isCabineMode
      ? cabines.map((c, i) => {
          if (!c.depart && !c.date) return "";
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
      // Save cabine attribution if in multi-cabin mode
      if (isCabineMode) {
        const nomsToSave = cabines.map((c, i) => c.nom || `Cabine ${i + 1}`);
        // Persiste toujours dans localStorage (restauration immédiate au prochain chargement)
        try { localStorage.setItem(`tm-cabin-noms-${id}`, JSON.stringify(nomsToSave)); } catch {}
        await offlineFetch("/api/cabine-attribution", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: id,
            attribution: cabines.map((c) => c.monteur),
            noms: nomsToSave,
          }),
        });
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

  const handleSendReport = async (opts: { force?: boolean } = {}) => {
    if (!project) return;
    if (!opts.force) {
      const missing = missingBucketLabels(project, {
        multiCabine: isCabineMode,
        nbCabines: isCabineMode ? cabines.length : (project.nbCabines || 0),
      });
      if (missing.length > 0) {
        setMissingPhotosPrompt({ kind: "send", missing });
        return;
      }
    }
    setSending(true);
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
              : heureDepart,
          commentairesMontages: commentaires,
          rapportMonteur: isCabineMode
            ? rapport + "\n\n" + cabines.map((c) => c.rapport ? `${c.nom} : ${c.rapport}` : "").filter(Boolean).join("\n")
            : rapport,
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
        : heureDepart;
      const pdfParams = new URLSearchParams();
      if (arriveeFinal) pdfParams.set("arrivee", arriveeFinal);
      if (departFinal) pdfParams.set("depart", departFinal);
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

      // 4. Show success toast
      toast.success("Rapport envoye", {
        description: "Lien client copie dans le presse-papiers",
        duration: 5000,
      });

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
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
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

  // Cabines dont au moins une photo "montage" ou "après intervention" a été uploadée.
  // Les noms de fichiers multi-cabine encodent l'index via `.Cab{N}.` (1-based).
  // On se base sur project.photosMontage qui contient les buckets MONTAGE_* et APRES_INTERVENTION.
  const installedCabineIndices = new Set<number>(
    (project.photosMontage || [])
      .map((f) => { const m = f.name.match(/\.Cab(\d+)\./); return m ? parseInt(m[1], 10) - 1 : null; })
      .filter((n): n is number => n !== null)
  );
  const installedCabineCount = installedCabineIndices.size;

  return (
    <div className="max-w-4xl mx-auto w-full pb-8 px-4">
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
      <div className="sticky z-40 glass-card border-b px-4 py-3" style={{ borderRadius: 0, top: headerHeight }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/?mode=${mode}`)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 ios-line-clamp break-words leading-tight">
              {project.projet}
            </h1>
            {project.ofrTM && (
              <p className="text-xs text-gray-500">OFR {project.ofrTM}</p>
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
          </div>
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
        </div>
      </div>

      {/* Historique des modifications (toggle) */}
      {showHistory && isAdmin && (
        <div className="px-4 mt-2">
          <ProjectHistory projectId={id} onCountChange={setHistoryCount} />
        </div>
      )}

      <div className={`px-4 mt-4 ${showRapport ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "max-w-5xl mx-auto"}`}>
        {/* Colonne gauche - Informations (masquée sur mobile quand rapport ouvert) */}
        <div className={`space-y-4 ${showRapport ? "hidden lg:block" : ""}`}>
        {/* === Grille 2 colonnes sur md+ : gauche = projet+dates, droite = client+cabines === */}
        <div className={`grid grid-cols-1 gap-4 ${!showRapport ? "md:grid-cols-2" : ""}`}>

        {/* --- Colonne gauche : Informations projet + Dates --- */}
        <div className="flex flex-col gap-4">

        {/* === SECTION 1 : Informations projet === */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Informations projet</CardTitle>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Informations Dates</CardTitle>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Informations client</CardTitle>
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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Informations cabines</CardTitle>
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
        <NotionComments projectId={id} />

        </div>{/* fin colonne droite */}
        </div>{/* fin grille 2 colonnes */}

        {/* === Documents === */}
        <Card>
          <CardContent className="pt-4">
            <DocumentLinks files={project.documentsMesures} label="Documents Mesures" projectId={id} notionField="Documents pour prise de mesures" />

            {/* Commentaires Mesures — sous Documents Mesures, tous modes */}
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

            <DocumentLinks files={project.documentsMontagee} label="Documents Montage" projectId={id} notionField="Documents pour Montage" />

            {/* Commentaires Montages — sous Documents Montage */}
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <div className="mt-3">
                <EditableTextField
                  label="Commentaires Montages"
                  value={project.commentairesMontages}
                  projectId={id}
                  fieldName="commentairesMontages"
                  notionField="Commentaires Montages"
                  multiline
                  onUpdate={(v) => setProject({ ...project, commentairesMontages: v })}
                />
              </div>
            )}
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <DeliveryScan projectId={id} bonLivraison={project.bonLivraison} />
            )}
            {(!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode)) && (
              <CartonPhotos projectId={id} initialPhotos={project.photosCartons} />
            )}
          </CardContent>
        </Card>

        {/* Bouton démarrer/consulter le rapport de montage.
            On le cache seulement pour les modes qui ont leur propre flux
            (mesures, services, sav et leurs variantes terminées).
            Tous les autres modes (cmd, dashboard, rapport, stats, archives,
            projets-tous, calendrier, etc.) doivent afficher ce bouton. */}
        {!["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode) && !showRapport && (
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

        {showRapport && !["mesures", "mesures-termine", "services", "services-termine", "sav", "sav-termine"].includes(mode) && (
          <button
            onClick={() => { setShowRapport(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium text-sm flex items-center justify-center gap-2 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux informations projet
          </button>
        )}

        </div>
        {/* Colonne droite - Rapport (visible uniquement quand showRapport) */}
        <div className={`space-y-4 ${!showRapport ? "hidden" : ""}`}>
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
            cabines.forEach((c, i) => {
              if (!installedCabineIndices.has(i)) return;
              const key = c.date || "__nodate__";
              if (!cabinesByDate[key]) cabinesByDate[key] = [];
              cabinesByDate[key].push({ nom: c.nom || `Cabine ${i + 1}`, monteur: c.monteur || "" });
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
            {/* Horaires */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Rapport de montage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  </>
                )}

                {/* Mode tableau (multi-cabines / multi-jours) */}
                {isMultiDay && (
                  <div className="space-y-3">
                    <Label>Pointage des heures</Label>
                    {pointages.map((entry, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500">Journée {idx + 1}</span>
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
                              onChange={(e) => updatePointage(idx, "depart", e.target.value)}
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
                      Ajouter une journée
                    </button>
                    {/* Per-day hours and total */}
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

              </CardContent>
            </Card>

            <Separator />

            {/* Mode mono-cabine */}
            {!isCabineMode && (
              <>
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Rapport & Photos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label>Rapport du monteur</Label>
                      <div className="mt-2 space-y-2">
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
                        onChange={(e) => setRapport(e.target.value)}
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
                      <div className="mt-3">
                        <VoiceRecorder
                          onTranscript={(text) =>
                            setRapport((prev) => (prev ? prev + "\n" + text : text))
                          }
                        />
                      </div>
                    </div>
                    <Separator />
                    <BucketPhotoUpload bucket="AVANT_INTERVENTION" projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} />
                    <BucketPhotoUpload bucket="DEMONTAGE" projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} />
                    <CombinedMontageUpload projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} />
                    <BucketPhotoUpload bucket="APRES_INTERVENTION" projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} />
                    <BucketPhotoUpload bucket="QR_CODE" projectId={id} project={project} setProject={setProject} />
                    <BucketPhotoUpload bucket="GARANTIE" projectId={id} project={project} setProject={setProject} />
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
                  </CardContent>
                </Card>
              </>
            )}

            {/* Mode multi-cabines */}
            {isCabineMode && (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">
                      {installedCabineCount > 0
                        ? <><span className="text-green-600">{installedCabineCount}</span>/{cabines.length} cabine{cabines.length > 1 ? "s" : ""}</>
                        : <>{cabines.length} cabine{cabines.length > 1 ? "s" : ""}</>
                      }
                    </h3>
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

                  {cabines.map((cabine, idx) => (
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
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          {cabineDragMode ? (
                            <GripVertical className="w-4 h-4 text-gray-400 shrink-0" />
                          ) : (
                            <span className={`w-8 h-8 rounded-full text-white text-sm font-bold flex items-center justify-center shrink-0 transition-colors ${
                              installedCabineIndices.has(idx)
                                ? "bg-green-600"
                                : (!!cabine.arrivee || (project?.photosAvant || []).some(f => new RegExp(`\\.Cab${idx + 1}\\.`).test(f.name || "")))
                                ? "bg-orange-500"
                                : "bg-[#1e3a5f]"
                            }`}>
                              {idx + 1}
                            </span>
                          )}
                          <span className="font-medium text-sm">{cabine.nom}</span>
                        </div>
                        {!cabineDragMode && (cabine.open ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        ))}
                      </button>

                      {cabine.open && (
                        <CardContent className="space-y-4 border-t pt-4">
                          {/* Nom de la cabine */}
                          <div>
                            <Label>Nom / Emplacement</Label>
                            <Input
                              value={cabine.nom}
                              onChange={(e) => {
                                const newNom = e.target.value;
                                setCabines((prev) => {
                                  const next = prev.map((c, i) => (i === idx ? { ...c, nom: newNom } : c));
                                  // Sauvegarde immédiate dans localStorage à chaque frappe
                                  try {
                                    localStorage.setItem(
                                      `tm-cabin-noms-${id}`,
                                      JSON.stringify(next.map((c) => c.nom))
                                    );
                                  } catch {}
                                  // Debounce-save dans le KV — source de vérité serveur
                                  // pour que tous les appareils voient les noms corrects.
                                  if (nomKvDebounceRef.current) clearTimeout(nomKvDebounceRef.current);
                                  nomKvDebounceRef.current = setTimeout(() => {
                                    offlineFetch("/api/cabine-attribution", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        projectId: id,
                                        attribution: next.map((c) => c.monteur),
                                        noms: next.map((c, i) => c.nom || `Cabine ${i + 1}`),
                                      }),
                                    }).catch(console.error);
                                  }, 600);
                                  return next;
                                });
                              }}
                              placeholder="Ex: SDD Parental, Lot 3..."
                              className="mt-1 h-11"
                            />
                          </div>

                          {/* Monteur responsable de cette cabine */}
                          <div>
                            <Label className="text-xs text-gray-600 dark:text-gray-300">Monteur responsable</Label>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {COLLABORATEURS_LIST.map((name) => {
                                const selected = (cabine.monteur || "").split(" & ").map((s) => s.trim()).includes(name);
                                return (
                                  <button
                                    key={name}
                                    type="button"
                                    onClick={() => setCabines((prev) => prev.map((c, i) => {
                                      if (i !== idx) return c;
                                      const current = (c.monteur || "").split(" & ").map((s) => s.trim()).filter(Boolean);
                                      const next = selected
                                        ? current.filter((n) => n !== name)
                                        : [...current, name];
                                      return { ...c, monteur: next.join(" & ") };
                                    }))}
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

                          {/* Jour de montage pour cette cabine */}
                          <div>
                            <Label className="text-xs text-gray-600 dark:text-gray-300">Jour de montage</Label>
                            <Input
                              type="date"
                              value={cabine.date}
                              onChange={(e) =>
                                setCabines((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, date: e.target.value } : c))
                                )
                              }
                              className="mt-1 h-11 glass-input"
                            />
                          </div>

                          {/* Heures arrivée / départ pour cette cabine */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-gray-600 dark:text-gray-300">Heure d&apos;arrivée</Label>
                              <Input
                                type="time"
                                value={cabine.arrivee}
                                onChange={(e) =>
                                  setCabines((prev) =>
                                    prev.map((c, i) => (i === idx ? { ...c, arrivee: e.target.value } : c))
                                  )
                                }
                                className="mt-1 h-11 glass-input"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-600 dark:text-gray-300">Heure de départ</Label>
                              <Input
                                type="time"
                                value={cabine.depart}
                                onChange={(e) =>
                                  setCabines((prev) =>
                                    prev.map((c, i) => (i === idx ? { ...c, depart: e.target.value } : c))
                                  )
                                }
                                className="mt-1 h-11 glass-input"
                              />
                            </div>
                          </div>

                          {/* Rapport cabine */}
                          <div>
                            <Label>Rapport</Label>
                            <div className="mt-2 space-y-1.5">
                              {[
                                "L'installation s'est déroulée sans encombre.",
                                "Nous avons rencontré quelques difficultés à l'assemblage de la cabine.",
                              ].map((option) => {
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
                            <Textarea
                              placeholder="Précisions pour cette cabine..."
                              value={cabine.rapport}
                              onChange={(e) =>
                                setCabines((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, rapport: e.target.value } : c))
                                )
                              }
                              rows={2}
                              className="mt-2"
                            />
                          </div>

                          {/* Photos cabine */}
                          <BucketPhotoUpload bucket="AVANT_INTERVENTION" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} />
                          <BucketPhotoUpload bucket="DEMONTAGE" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} />
                          <CombinedMontageUpload cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} />
                          <BucketPhotoUpload bucket="APRES_INTERVENTION" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} onAutoFill={handleAutoFill} />
                          <BucketPhotoUpload bucket="QR_CODE" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} />
                          <BucketPhotoUpload bucket="GARANTIE" cabineIdx={idx + 1} projectId={id} project={project} setProject={setProject} />
                        </CardContent>
                      )}
                    </Card>
                  ))}
                </div>

                {/* Rapport global multi-cabines */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Rapport général</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
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
                  </CardContent>
                </Card>
              </>
            )}

            {/* Signalements enregistrés — pièces et défauts depuis le KV store */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Signalements enregistrés</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <PiecesList projectId={id} refreshKey={pieceRefreshKey} />
                <DefautsList projectId={id} refreshKey={defautRefreshKey} />
              </CardContent>
            </Card>

            {/* Pièce manquante */}
            <PiecesForm projectId={id} projectName={project.projet} onSubmitted={() => {
              setPieceRefreshKey((k) => k + 1);
            }} />

            {/* Signaler un défaut */}
            <DefautForm
              projectId={id}
              projectName={project.projet}
              cabineOptions={cabines.length > 1 ? cabines.map((c, i) => c.nom || `Cabine ${i + 1}`) : undefined}
              onSubmitted={() => {
              // Les photos du défaut sont stockées dans le KV store par défaut (per-defaut).
              // DefautsList les lit directement → on force son rechargement via refreshKey.
              // On ne touche PAS à photosDefautsSignale (qui est un champ agrégat legacy).
              setDefautRefreshKey((k) => k + 1);
              // Rafraîchir les textes du projet (infoDefautsSignale etc.) en préservant les photos locales
              setTimeout(() => {
                fetch(`/api/projects/${id}`).then(r => r.json()).then(data => {
                  if (!data?.id) return;
                  setProject((prev) => {
                    if (!prev) return data;
                    const incoming = { ...data } as typeof data;
                    const photoFields = [
                      "photosAvant", "photosDemontage", "photosMontage", "photosQRCode", "photosGaranties",
                      "photosCartons", "photosSituations", "photosMesures", "photosLocalite",
                      "photosPiecesManquantes", "photosDefautsSignale",
                    ] as const;
                    for (const field of photoFields) {
                      (incoming as Record<string, unknown>)[field] = prev[field];
                    }
                    return incoming;
                  });
                }).catch(() => {});
              }, 2000);
            }}
            />

            {/* Consommables utilisés */}
            <StockUsage projectId={id} />

            {/* Checklist de montage : titre retiré, en-tête intégré au
                composant (badge X/N + chevron pour plier/déplier). */}
            <Card>
              <CardContent className="pt-4">
                <MontageChecklist fournisseur={project.fournisseurs?.[0]} />
              </CardContent>
            </Card>

            {/* Signature client */}
            <Card>
              <CardContent className="pt-4">
                <SignaturePad
                  label="Signature du client"
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
            </Card>

            {/* Actions CMD */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={() => handleSave()}
                disabled={saving}
                className="w-full h-12 rounded-xl text-base font-medium glass-btn text-white"
              >
                {saving ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <FileText className="w-5 h-5 mr-2" />
                )}
                Enregistrer le rapport
              </Button>

              <Button
                variant="outline"
                className="w-full h-12 rounded-xl text-base font-medium glass-btn text-white"
                onClick={() => handleSendReport()}
                disabled={sending}
              >
                {sending ? (
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                ) : (
                  <Send className="w-5 h-5 mr-2" />
                )}
                Envoyer le rapport
              </Button>

              <a
                href={`/api/pdf/${id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full h-12 rounded-xl text-base font-medium flex items-center justify-center gap-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 active:scale-95 transition-all border border-red-200 dark:border-red-800"
              >
                <RefreshCw className="w-5 h-5" />
                Actualiser et télécharger le PDF
              </a>
              <p className="text-[10px] text-gray-400 text-center -mt-2">
                Régénère le rapport avec toutes les dernières photos et données
              </p>

              {/* Téléchargement de toutes les photos en ZIP */}
              <button
                type="button"
                disabled={downloadingPhotos}
                onClick={async () => {
                  setDownloadingPhotos(true);
                  try {
                    const res = await fetch(`/api/photos/${id}/download`);
                    if (!res.ok) throw new Error("Erreur serveur");
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${project.nomChantier || id} - Photos.zip`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  } catch {
                    alert("Impossible de télécharger les photos. Veuillez réessayer.");
                  } finally {
                    setDownloadingPhotos(false);
                  }
                }}
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
                <CardTitle className="text-base">Photos</CardTitle>
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
            <div className="bg-amber-500 text-white px-5 py-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-semibold">Photos manquantes</h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-gray-700 dark:text-gray-200">
                {missingPhotosPrompt.kind === "send"
                  ? "Vous êtes sur le point d'envoyer le rapport, mais certaines photos n'ont pas encore été ajoutées :"
                  : "Vous êtes sur le point d'enregistrer le rapport, mais certaines photos n'ont pas encore été ajoutées :"}
              </p>
              <ul className="text-sm space-y-1 max-h-60 overflow-y-auto bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                {missingPhotosPrompt.missing.map((label) => (
                  <li key={label} className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                    <span className="mt-0.5 text-amber-500">•</span>
                    <span>{label}</span>
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Êtes-vous sûr de vouloir continuer sans ces photos ?
              </p>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={() => setMissingPhotosPrompt(null)}
                className="flex-1 h-10 rounded-lg border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700"
              >
                Ajouter les photos
              </button>
              <button
                onClick={() => {
                  const kind = missingPhotosPrompt.kind;
                  setMissingPhotosPrompt(null);
                  if (kind === "send") handleSendReport({ force: true });
                  else handleSave({ force: true });
                }}
                className="flex-1 h-10 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium"
              >
                Continuer quand même
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
