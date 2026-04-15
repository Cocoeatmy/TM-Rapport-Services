"use client";

import { Suspense, useEffect, useState, use } from "react";
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
} from "lucide-react";
import { MontageChecklist } from "@/components/checklist";
import { ProjectChat } from "@/components/project-chat";
import { GPSTracker } from "@/components/gps-tracker";
import { SiteTimer } from "@/components/site-timer";
import { StockUsage } from "@/components/stock-usage";
import { SAVForm } from "@/components/sav-form";
import { ContactButtons } from "@/components/contact-buttons";
import { Star, Share2 } from "lucide-react";
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
import { addToQueue, isOnline } from "@/lib/offline";
import { fetchWithRetry } from "@/lib/api-helpers";
import { showRetryToast } from "@/components/error-toast";
import { STATUS_CMD_COLORS, STATUS_MESURES_COLORS } from "@/lib/constants";

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
            body: JSON.stringify({ projectName: project.projet, action: `Modification ${label}`, details: logDetails }),
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
      await fetch(`/api/projects/${projectId}`, {
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
          <div className="flex items-center gap-1 mt-0.5">
            <input type="date" value={draft} onChange={(e) => setDraft(e.target.value)}
              className="text-xs border rounded px-1.5 py-1 dark:bg-slate-700 dark:border-gray-600 dark:text-gray-200 w-full" />
            <button onClick={handleSave} disabled={saving}
              className="text-[10px] bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600 shrink-0">✓</button>
            <button onClick={() => { setEditing(false); setDraft(value ? value.split("T")[0] : ""); }}
              className="text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded shrink-0">✕</button>
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

function EditableSignalement({ label, color, text, photos, projectId, notionTextField, onUpdate }: {
  label: string; color: "orange" | "red"; text: string; photos: { name: string; url: string }[];
  projectId: string; notionTextField: string; onUpdate: (newText: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [saving, setSaving] = useState(false);

  const borderColor = color === "orange" ? "border-orange-300" : "border-red-300";
  const textColor = color === "orange" ? "text-orange-600 dark:text-orange-400" : "text-red-600 dark:text-red-400";

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [notionTextField.includes("Pièces") ? "infoPiecesManquantes" : "infoDefautsSignale"]: draft }),
      });
      onUpdate(draft);
      setEditing(false);
    } catch {} finally { setSaving(false); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <p className={`text-sm font-medium ${textColor}`}>{label}</p>
        <button onClick={() => { setDraft(text); setEditing(!editing); }}
          className="text-gray-400 hover:text-blue-500 p-1">
          <Pencil className="w-3.5 h-3.5" />
        </button>
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
      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {photos.map((f, i) => (
            <a key={i} href={f.url} target="_blank" rel="noopener noreferrer">
              <img src={f.url} alt={f.name} className="w-16 h-16 object-cover rounded border" />
            </a>
          ))}
        </div>
      )}
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
      await fetch(`/api/projects/${projectId}`, {
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

function EditableCollaborateur({ project, mode, onUpdate }: { project: Project; mode: string; onUpdate: (collab: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const currentCollab = mode === "mesures" ? project.mesuresTraiteePar : project.collaborateurs;
  const COLLABS = ["Micael", "Claudio", "Jean-Marc", "Jacobo", "Miguel", "Loïc"];
  const [selected, setSelected] = useState<string[]>(
    currentCollab ? currentCollab.split(" & ").map((n) => n.trim()).filter(Boolean) : []
  );
  const notionField = mode === "mesures" ? "mesuresTraiteePar" : "collaborateurs";

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
            body: JSON.stringify({ projectName: project.projet, action: "Modification collaborateur", details: logDetails }),
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
        <p className="text-xs text-gray-500">Collaborateurs</p>
        {editing ? (
          <div className="space-y-2 mt-1">
            <div className="flex flex-wrap gap-1.5">
              {COLLABS.map((name) => {
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
  onUpdate,
}: {
  project: Project;
  mode: string;
  onUpdate: (field: string, value: string) => void;
}) {
  const isMesures = mode === "mesures";
  const statusColors = isMesures ? STATUS_MESURES_COLORS : STATUS_CMD_COLORS;
  const currentStatus = isMesures ? project.etatMesures : project.etatCMD;
  const field = isMesures ? "etatMesures" : "etatCMD";
  const label = isMesures ? "Mesures" : "CMD";
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
        toast.success(`Statut ${label} mis a jour`);
        // Log the change
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
      toast.error("Erreur reseau");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${colorClass}`}>
        {currentStatus || "---"}
      </span>
      <select
        value={currentStatus || ""}
        onChange={(e) => handleChange(e.target.value)}
        disabled={saving}
        className="text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-gray-700 dark:text-gray-300 disabled:opacity-50"
      >
        {!currentStatus && <option value="">---</option>}
        {Object.keys(statusColors).map((status) => (
          <option key={status} value={status}>{status}</option>
        ))}
      </select>
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
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [reformulating, setReformulating] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ name: string; role: string } | null>(null);
  const [showAllDates, setShowAllDates] = useState(false);
  const [showRapport, setShowRapport] = useState(false);

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
  const [cabines, setCabines] = useState<{ nom: string; rapport: string; open: boolean }[]>([]);
  const [isCabineMode, setIsCabineMode] = useState(false);
  const [signature, setSignature] = useState("");

  // Load signature from Notion
  useEffect(() => {
    if (project?.signatureUrl && !signature) {
      setSignature(project.signatureUrl);
    }
  }, [project?.signatureUrl]);
  const [fav, setFav] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
    const nb = data.nbCabines || 1;
    if (nb > 1) {
      setIsCabineMode(true);
      setIsMultiDay(true);
      setCabines(
        Array.from({ length: nb }, (_, i) => ({
          nom: `Cabine ${i + 1}`,
          rapport: "",
          open: i === 0,
        }))
      );
      if (data.heureArrivee || data.heureDepart) {
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

    // 2. Fetch API en arrière-plan pour les données fraîches
    fetch(`/api/projects/${id}`)
      .then((r) => r.json())
      .then((data) => {
        initProject(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heureArrivee: isMultiDay
            ? pointages.map((p) => `${p.date} ${p.collaborateur} ${p.arrivee}`).join(" | ")
            : heureArrivee,
          heureDepart: isMultiDay
            ? pointages.map((p) => `${p.date} ${p.collaborateur} ${p.depart}`).join(" | ")
            : heureDepart,
          commentairesMontages: commentaires,
          rapportMonteur: isCabineMode
            ? rapport + "\n\n" + cabines.map((c) => c.rapport ? `${c.nom} : ${c.rapport}` : "").filter(Boolean).join("\n")
            : rapport,
        }),
      });
      if (res.ok) {
        toast.success("Rapport enregistré avec succès");
      } else {
        toast.error("Erreur lors de l'enregistrement");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const handleSendReport = async () => {
    if (!project) return;
    setSending(true);
    try {
      // 1. Save the report data first
      const saveRes = await fetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heureArrivee: isMultiDay
            ? pointages.map((p) => `${p.date} ${p.collaborateur} ${p.arrivee}`).join(" | ")
            : heureArrivee,
          heureDepart: isMultiDay
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
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-gray-500">Projet introuvable</p>
        <Button variant="ghost" className="mt-4" onClick={() => router.push("/")}>
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto w-full pb-8 px-4">
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
            <h1 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {project.projet}
            </h1>
            {project.ofrTM && (
              <p className="text-xs text-gray-500">OFR {project.ofrTM}</p>
            )}
            {currentUser?.role === "admin" && (
              <div className="mt-1">
                <StatusDropdown
                  project={project}
                  mode={mode}
                  onUpdate={(field, value) => {
                    setProject((prev) => prev ? { ...prev, [field]: value } : prev);
                  }}
                />
              </div>
            )}
          </div>
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
          {currentUser?.role === "admin" && (
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
      {showHistory && currentUser?.role === "admin" && (
        <div className="px-4 mt-2">
          <ProjectHistory projectId={id} onCountChange={setHistoryCount} />
        </div>
      )}

      <div className={`px-4 mt-4 ${showRapport ? "grid grid-cols-1 lg:grid-cols-2 gap-4" : "max-w-2xl mx-auto"}`}>
        {/* Colonne gauche - Informations (masquée sur mobile quand rapport ouvert) */}
        <div className={`space-y-4 ${showRapport ? "hidden lg:block" : ""}`}>
        {/* === SECTION 1 : Informations projet === */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Informations projet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            {/* Ligne 1 : N° OFR TM | N° CMD TM | N° CMD TM - Usine */}
            <div className="grid grid-cols-3 gap-3 py-2">
              <InfoRow icon={Hash} label="N° OFR TM" value={project.ofrTM} />
              <InfoRow icon={Hash} label="N° CMD TM" value={project.cmdTM} />
              <InfoRow icon={Hash} label="N° CMD TM - Usine" value={project.cmdTMUsine} />
            </div>

            {/* Ligne 2 : N° OFR Grossiste | N° CMD Grossiste | (vide) */}
            {(project.ofrGrossiste || project.cmdGrossiste) && (
              <div className="grid grid-cols-3 gap-3 py-2">
                <InfoRow icon={Hash} label="N° OFR Grossiste" value={project.ofrGrossiste} />
                <InfoRow icon={Hash} label="N° CMD Grossiste" value={project.cmdGrossiste} />
                <div />
              </div>
            )}

            {/* Ligne 3 : N° CMD Fournisseurs | N° Serv. Mesures Fournisseurs | N° Serv. CMD Fournisseurs */}
            {(project.cmdFournisseurs || project.servMesuresFournisseurs || project.servCmdFournisseurs) && (
              <div className="grid grid-cols-3 gap-3 py-2">
                <InfoRow icon={Hash} label="N° CMD Fournisseurs" value={project.cmdFournisseurs} />
                <InfoRow icon={Hash} label="N° Serv. Mesures Fourn." value={project.servMesuresFournisseurs} />
                <InfoRow icon={Hash} label="N° Serv. CMD Fourn." value={project.servCmdFournisseurs} />
              </div>
            )}

            {/* Ligne 4 : Nom projet | Adresse chantier */}
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Nom projet</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{project.nomChantier || "---"}</p>
                </div>
              </div>
              {project.adresseChantier && (
                <MapAddressLink address={project.adresseChantier} />
              )}
            </div>
          </CardContent>
        </Card>

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
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{project.contactsRDV}</p>
                  </div>
                </div>
                <div className="ml-6 mt-1">
                  <ContactButtons contactName={project.contactsRDV} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* === SECTION 3 : Informations Dates === */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Informations Dates</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Mesures traitée le + Mesures traitée par (au-dessus de date montage) */}
            {(mode === "cmd" || mode === "dashboard" || mode === "rapport") && (project.dateMesures || project.mesuresTraiteePar) && (
              <div className="grid grid-cols-2 gap-3 mb-3 pb-3 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-start gap-2">
                  <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Mesures traitée le</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {project.dateMesures ? new Date(project.dateMesures.split("T")[0] + "T00:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" }) : "---"}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Mesures traitée par</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{project.mesuresTraiteePar || "---"}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Date de montage/mesures + Collaborateurs */}
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
            {(mode === "cmd" || mode === "dashboard" || mode === "rapport") && (
              <DurationEstimate project={project} />
            )}

            {/* Dates additionnelles — visibles uniquement si remplies, ou toutes si mode édition */}
            {(() => {
              const extraDates = [
                { label: "Demande projet reçue le", value: project.dateDemandeProjet, field: "dateDemandeProjet" },
                { label: "Date Mesures reçue le", value: project.dateMesuresRecue, field: "dateMesuresRecue" },
                { label: "Date Offre", value: project.dateOffre, field: "dateOffre" },
                { label: "CMD reçue le", value: project.dateCMDRecue, field: "dateCMDRecue" },
                { label: "Date CMD – Usine", value: project.dateCMDUsine, field: "dateCMDUsine" },
              ];
              const filledDates = extraDates.filter(d => d.value);
              const datesToShow = showAllDates ? extraDates : filledDates;
              const emptyCount = 5 - filledDates.length;
              return (
                <>
                  {datesToShow.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
                      {datesToShow.map((d) => (
                        <ExtraDateField
                          key={d.field}
                          label={d.label}
                          value={d.value}
                          projectId={id}
                          fieldName={d.field}
                          onUpdate={(v) => setProject((prev) => prev ? { ...prev, [d.field]: v } : prev)}
                        />
                      ))}
                    </div>
                  )}
                  {emptyCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDates(!showAllDates)}
                      className="text-xs text-blue-500 hover:text-blue-700 mt-2 flex items-center gap-1"
                    >
                      <Pencil className="w-3 h-3" />
                      {showAllDates ? "Masquer les dates vides" : `Modifier les dates (${emptyCount} non remplies)`}
                    </button>
                  )}
                </>
              );
            })()}

          </CardContent>
        </Card>

        {/* === SECTION 4 : Informations cabines === */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Informations cabines</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-start gap-2">
                <Box className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Nb. Cabines</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{project.nbCabines ?? "---"}</p>
                </div>
              </div>
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
            {(mode === "cmd" || mode === "dashboard" || mode === "rapport") && (
              <div className="grid grid-cols-2 gap-3 mt-3">
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-500">Emplacement cabine</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{project.emplacementCabine || "---"}</p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* === Documents === */}
        <Card>
          <CardContent className="pt-4">
            <DocumentLinks files={project.documentsMesures} label="Documents Mesures" projectId={id} notionField="Documents pour prise de mesures" />
            <DocumentLinks files={project.documentsMontagee} label="Documents Montage" projectId={id} notionField="Documents pour Montage" />

            {/* Commentaires Montages — sous Documents Montage */}
            {(mode === "cmd" || mode === "dashboard" || mode === "rapport") && (
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

            {/* Commentaires Mesures — sous Documents Montage */}
            {mode === "mesures" && (
              <div className="mt-3">
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
            )}
            {(mode === "cmd" || mode === "dashboard" || mode === "rapport") && (
              <DeliveryScan projectId={id} bonLivraison={project.bonLivraison} />
            )}
            {(mode === "cmd" || mode === "dashboard" || mode === "rapport") && (
              <CartonPhotos projectId={id} initialPhotos={project.photosCartons} />
            )}
          </CardContent>
        </Card>

        {/* Bouton démarrer le rapport */}
        {(mode === "cmd" || mode === "dashboard" || mode === "rapport") && !showRapport && (
          <button
            onClick={() => { setShowRapport(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="w-full py-4 rounded-2xl bg-green-600 hover:bg-green-700 active:scale-[0.98] text-white font-semibold text-base flex items-center justify-center gap-2 shadow-lg transition-all"
          >
            <FileText className="w-5 h-5" />
            Démarrer le rapport de services
          </button>
        )}

        {showRapport && (mode === "cmd" || mode === "dashboard" || mode === "rapport") && (
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
        {(mode === "cmd" || mode === "dashboard" || mode === "rapport") && (
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
                      fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heureArrivee: time }) }).catch(console.error);
                    }}
                    onDeparture={(time) => {
                      setHeureDepart(time);
                      fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heureDepart: time }) }).catch(console.error);
                    }}
                    onArriveeChange={(time) => {
                      setHeureArrivee(time);
                      fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heureArrivee: time }) }).catch(console.error);
                    }}
                    onDepartChange={(time) => {
                      setHeureDepart(time);
                      fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heureDepart: time }) }).catch(console.error);
                    }}
                  />
                  {currentUser?.role === "admin" && (
                    <GPSTracker
                      chantierAddress={project.adresseChantier}
                      onArrival={(time) => {
                        setHeureArrivee(time);
                        fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heureArrivee: time }) }).catch(console.error);
                      }}
                      onDeparture={(time) => {
                        setHeureDepart(time);
                        fetch(`/api/projects/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heureDepart: time }) }).catch(console.error);
                      }}
                    />
                  )}
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
                              className="mt-0.5 h-10 text-sm max-w-[200px]"
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
                              className="mt-0.5 h-10 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Départ</Label>
                            <Input
                              type="time"
                              value={entry.depart}
                              onChange={(e) => updatePointage(idx, "depart", e.target.value)}
                              className="mt-0.5 h-10 text-sm"
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
                      <div className="mt-3">
                        <VoiceRecorder
                          onTranscript={(text) =>
                            setRapport((prev) => (prev ? prev + "\n" + text : text))
                          }
                        />
                      </div>
                    </div>
                    <Separator />
                    <PhotoUpload category="avant" label="Photos avant montage" projectId={id} notionField="Photos avant montage" existingPhotos={project.photosAvant} />
                    <PhotoUpload category="montage" label="Photos montage terminé" projectId={id} notionField="Photos montage terminé" existingPhotos={project.photosMontage} />
                    <PhotoUpload category="qrcode" label="Photos QR Code" projectId={id} notionField="Photos QR Code" existingPhotos={project.photosQRCode} />
                    <PhotoUpload category="garanties" label="Photos garanties" projectId={id} notionField="Photos garanties" existingPhotos={project.photosGaranties} />
                    <Separator />
                    <BeforeAfterPhotos projectId={id} projectName={project.projet} initialBefore={project.photosAvant} initialAfter={project.photosMontage} />
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
                      {cabines.length} cabines
                    </h3>
                    <span className="text-xs text-gray-400">Cliquez pour déplier</span>
                  </div>

                  {cabines.map((cabine, idx) => (
                    <Card key={idx} className="overflow-hidden">
                      <button
                        type="button"
                        onClick={() => {
                          setCabines((prev) =>
                            prev.map((c, i) => (i === idx ? { ...c, open: !c.open } : c))
                          );
                        }}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-[#1e3a5f] text-white text-sm font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-medium text-sm">{cabine.nom}</span>
                        </div>
                        {cabine.open ? (
                          <ChevronUp className="w-4 h-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </button>

                      {cabine.open && (
                        <CardContent className="space-y-4 border-t pt-4">
                          {/* Nom de la cabine */}
                          <div>
                            <Label>Nom / Emplacement</Label>
                            <Input
                              value={cabine.nom}
                              onChange={(e) =>
                                setCabines((prev) =>
                                  prev.map((c, i) => (i === idx ? { ...c, nom: e.target.value } : c))
                                )
                              }
                              placeholder="Ex: SDD Parental, Lot 3..."
                              className="mt-1 h-11"
                            />
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
                                        ? "border-[#1e3a5f] bg-blue-50 text-[#1e3a5f] font-medium"
                                        : "border-gray-200 bg-white text-gray-700 active:bg-gray-50"
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <span className={`w-4 h-4 rounded-md border-2 flex items-center justify-center shrink-0 ${
                                        isSelected ? "border-[#1e3a5f] bg-[#1e3a5f]" : "border-gray-300"
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
                          <PhotoUpload
                            category={`cabine-${idx + 1}-avant`}
                            label="Photos avant montage"
                            projectId={id}
                          />
                          <PhotoUpload
                            category={`cabine-${idx + 1}-montage`}
                            label="Photos montage terminé"
                            projectId={id}
                          />
                          <PhotoUpload
                            category={`cabine-${idx + 1}-qrcode`}
                            label="Photos QR Code"
                            projectId={id}
                          />
                          <PhotoUpload
                            category={`cabine-${idx + 1}-garanties`}
                            label="Photos garanties"
                            projectId={id}
                          />
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

            {/* Historique Notion - Pièces manquantes & Défauts signalés */}
            {(project.infoPiecesManquantes || project.infoDefautsSignale) && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Signalements enregistrés</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {project.infoPiecesManquantes && (
                    <EditableSignalement
                      label="Pièces manquantes"
                      color="orange"
                      text={project.infoPiecesManquantes}
                      photos={project.photosPiecesManquantes}
                      projectId={id}
                      notionTextField="Infos - Pièces manquantes"
                      onUpdate={(newText) => setProject((prev) => prev ? { ...prev, infoPiecesManquantes: newText } : prev)}
                    />
                  )}
                  {project.infoDefautsSignale && (
                    <EditableSignalement
                      label="Défauts signalés"
                      color="red"
                      text={project.infoDefautsSignale}
                      photos={project.photosDefautsSignale}
                      projectId={id}
                      notionTextField="Infos - Défauts signalé"
                      onUpdate={(newText) => setProject((prev) => prev ? { ...prev, infoDefautsSignale: newText } : prev)}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {/* Pièce manquante */}
            <PiecesForm projectId={id} projectName={project.projet} onSubmitted={() => {
              // Re-fetch project to show new signalement
              setTimeout(() => {
                fetch(`/api/projects/${id}`).then(r => r.json()).then(data => {
                  if (data?.id) setProject(data);
                }).catch(() => {});
              }, 1500);
            }} />

            {/* Signaler un défaut */}
            <DefautForm projectId={id} projectName={project.projet} onSubmitted={() => {
              setTimeout(() => {
                fetch(`/api/projects/${id}`).then(r => r.json()).then(data => {
                  if (data?.id) setProject(data);
                }).catch(() => {});
              }, 1500);
            }} />

            {/* Consommables utilisés */}
            <StockUsage projectId={id} />

            {/* Checklist de montage */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Vérifications</CardTitle>
              </CardHeader>
              <CardContent>
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
                    setSignature(dataUrl);
                    // Upload signature to Cloudinary and save URL in Notion
                    try {
                      const blob = await fetch(dataUrl).then(r => r.blob());
                      const formData = new FormData();
                      formData.append("files", new File([blob], "signature.png", { type: "image/png" }));
                      formData.append("category", "signatures");
                      formData.append("projectId", id);
                      const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
                      const uploadData = await uploadRes.json();
                      if (uploadData.files?.[0]?.url) {
                        await fetch(`/api/projects/${id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ signatureUrl: uploadData.files[0].url }),
                        });
                      }
                    } catch (err) { console.error("Signature upload error:", err); }
                  }}
                />
              </CardContent>
            </Card>

            {/* Actions CMD */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={handleSave}
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
                onClick={handleSendReport}
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
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8l-6-6H7zm0 2h5v5h5v11H7V4zm2 8v2h6v-2H9zm0 4v2h4v-2H9z"/></svg>
                Voir le PDF
              </a>

              {/* Suivi consultations rapport */}
              {currentUser?.role === "admin" && <ReportConsultations projectId={id} />}
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
                  existingPhotos={project.photosSituations}
                />
                <PhotoUpload
                  category="mesures"
                  label="Photos mesures"
                  projectId={id}
                  notionField="Photos mesures"
                  existingPhotos={project.photosMesures}
                />
                <PhotoUpload
                  category="localite"
                  label="Photos localité"
                  projectId={id}
                  notionField="Photos localité"
                  existingPhotos={project.photosLocalite}
                />
              </CardContent>
            </Card>

            {/* Actions Mesures */}
            <div className="space-y-3 pt-2">
              <Button
                onClick={handleSave}
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
    </div>
  );
}
