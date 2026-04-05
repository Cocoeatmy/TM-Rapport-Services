"use client";

import { Suspense, useEffect, useState, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
} from "lucide-react";
import { SignaturePad } from "@/components/signature-pad";
import { MontageChecklist, DEFAULT_CHECKLIST } from "@/components/checklist";
import { ProjectChat } from "@/components/project-chat";
import { GPSTracker } from "@/components/gps-tracker";
import { PiecesForm } from "@/components/pieces-form";
import { DefautForm } from "@/components/defaut-form";
import { SAVForm } from "@/components/sav-form";
import { ContactButtons } from "@/components/contact-buttons";
import { Star } from "lucide-react";
import { toggleFavorite, isFavorite } from "@/lib/favorites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhotoUpload } from "@/components/photo-upload";
import { toast } from "sonner";
import type { Project } from "@/lib/notion";
import { getCollaboratorColor } from "@/lib/collaborators";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Non planifié";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
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
        <p className="text-sm font-medium text-gray-900">{String(value)}</p>
      </div>
    </div>
  );
}

function DocumentLinks({ files, label }: { files: { name: string; url: string }[]; label: string }) {
  if (!files.length) return null;
  return (
    <div className="mt-3">
      <p className="text-xs text-gray-500 mb-1.5">{label}</p>
      <div className="space-y-1.5">
        {files.map((f, i) => (
          <a
            key={i}
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 px-3 py-2 rounded-lg active:bg-blue-100"
          >
            <FileText className="w-4 h-4 shrink-0" />
            <span className="truncate flex-1">{f.name}</span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </a>
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

  const [heureArrivee, setHeureArrivee] = useState("");
  const [heureDepart, setHeureDepart] = useState("");
  const [commentaires, setCommentaires] = useState("");
  const [rapport, setRapport] = useState("");
  const [cabines, setCabines] = useState<{ nom: string; rapport: string; open: boolean }[]>([]);
  const [isCabineMode, setIsCabineMode] = useState(false);
  const [signature, setSignature] = useState("");
  const [fav, setFav] = useState(false);

  useEffect(() => { setFav(isFavorite(id)); }, [id]);

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
    <div className="max-w-lg mx-auto w-full pb-8">
      {/* Header */}
      <div className="sticky top-[60px] z-40 glass-card border-b px-4 py-3" style={{ borderRadius: 0 }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/?mode=${mode}`)}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-gray-900 truncate">
              {project.projet}
            </h1>
            {project.ofrTM && (
              <p className="text-xs text-gray-500">OFR {project.ofrTM}</p>
            )}
          </div>
          <button
            onClick={() => setFav(toggleFavorite(id))}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:scale-90 transition-transform"
          >
            <Star className={`w-5 h-5 ${fav ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
          </button>
        </div>
      </div>

      <div className="px-4 space-y-4 mt-4">
        {/* Informations projet */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Informations projet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <div className="flex flex-wrap gap-x-6 gap-y-0">
              <InfoRow icon={Hash} label="N° OFR TM" value={project.ofrTM} />
              {mode === "cmd" && (
                <>
                  {project.cmdGrossiste && <InfoRow icon={Hash} label="N° CMD Grossiste" value={project.cmdGrossiste} />}
                  {project.cmdFournisseurs && <InfoRow icon={Hash} label="N° CMD Fournisseurs" value={project.cmdFournisseurs} />}
                  {project.servCmdFournisseurs && <InfoRow icon={Hash} label="N° Serv. CMD Fournisseurs" value={project.servCmdFournisseurs} />}
                </>
              )}
              {mode === "mesures" && (
                <>
                  {project.ofrGrossiste && <InfoRow icon={Hash} label="N° OFR Grossiste" value={project.ofrGrossiste} />}
                  {project.cmdGrossiste && <InfoRow icon={Hash} label="N° CMD Grossiste" value={project.cmdGrossiste} />}
                  {project.servMesuresFournisseurs && <InfoRow icon={Hash} label="N° Serv. Mesures Fournisseurs" value={project.servMesuresFournisseurs} />}
                </>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="flex items-start gap-2">
                <FileText className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Nom projet</p>
                  <p className="text-sm font-medium text-gray-900">{project.nomChantier || "---"}</p>
                </div>
              </div>
              {project.adresseChantier && (
                <MapAddressLink address={project.adresseChantier} />
              )}
            </div>
            {project.contacts && (
              <div>
                <InfoRow icon={Users} label="Contact" value={project.contacts} />
                <div className="ml-7 mt-1">
                  <ContactButtons contactName={project.contacts} />
                </div>
              </div>
            )}
            {mode === "cmd" && (
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Emplacement cabine</p>
                  <p className="text-sm font-medium text-gray-900">{project.emplacementCabine || "---"}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Box className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Nb. Cabines</p>
                  <p className="text-sm font-medium text-gray-900">{project.nbCabines ?? "---"}</p>
                </div>
              </div>
            </div>
            )}

            {(project.fournisseurs.length > 0 || project.seriesCabines.length > 0) && (
              <div className="grid grid-cols-2 gap-3 py-2">
                {project.fournisseurs.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Truck className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs text-gray-500">Fournisseurs</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {project.fournisseurs.map((f) => (
                          <Badge key={f} variant="secondary" className="text-xs">
                            {f}
                          </Badge>
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
                          <Badge key={s} variant="outline" className="text-xs">
                            {s}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">Collaborateurs</p>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(() => {
                      const collab = mode === "mesures" ? project.mesuresTraiteePar : project.collaborateurs;
                      if (!collab) return <p className="text-sm font-medium text-gray-900">---</p>;
                      return collab.split(" & ").map((name) => (
                        <a
                          key={name}
                          href={`/?collaborateur=${encodeURIComponent(name.trim())}`}
                          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full active:scale-95 transition-transform"
                          style={{
                            backgroundColor: getCollaboratorColor(name.trim()).bg,
                            color: getCollaboratorColor(name.trim()).text,
                          }}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: getCollaboratorColor(name.trim()).dot }}
                          />
                          {name.trim()}
                        </a>
                      ));
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-500">{mode === "mesures" ? "Date de mesures" : "Date de montage"}</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatDate(mode === "mesures" ? project.dateMesures : project.dateMontage)}
                  </p>
                </div>
              </div>
            </div>

            <DocumentLinks files={project.documentsMesures} label="Documents Mesures" />
            <DocumentLinks files={project.documentsMontagee} label="Documents Montage" />
          </CardContent>
        </Card>

        {mode === "cmd" && (
          <>
            <Separator />

            {/* Horaires */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Rapport de montage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Mode simple (1 cabine) */}
                {!isMultiDay && (
                  <>
                  <GPSTracker
                    chantierAddress={project.adresseChantier}
                    onArrival={(time) => setHeureArrivee(time)}
                    onDeparture={(time) => setHeureDepart(time)}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="arrivee">Heure d'arrivée</Label>
                      <Input
                        id="arrivee"
                        type="time"
                        value={heureArrivee}
                        onChange={(e) => setHeureArrivee(e.target.value)}
                        className="mt-1 h-11"
                      />
                    </div>
                    <div>
                      <Label htmlFor="depart">Heure de départ</Label>
                      <Input
                        id="depart"
                        type="time"
                        value={heureDepart}
                        onChange={(e) => setHeureDepart(e.target.value)}
                        className="mt-1 h-11"
                      />
                    </div>
                  </div>
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
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Date</Label>
                            <Input
                              type="date"
                              value={entry.date}
                              onChange={(e) => updatePointage(idx, "date", e.target.value)}
                              className="mt-0.5 h-10 text-sm"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Collaborateur</Label>
                            <select
                              value={entry.collaborateur}
                              onChange={(e) => updatePointage(idx, "collaborateur", e.target.value)}
                              className="mt-0.5 h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm truncate"
                            >
                              <option value="">Sélectionner...</option>
                              {COLLABORATEURS_LIST.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
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
                  </div>
                )}

                {commentaires && (
                  <div>
                    <Label>Commentaires montage</Label>
                    <div className="mt-1 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                      {commentaires}
                    </div>
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
                    </div>
                    <Separator />
                    <PhotoUpload category="avant" label="Photos avant montage" projectId={id} notionField="Photos avant montage" existingPhotos={project.photosAvant} />
                    <PhotoUpload category="montage" label="Photos montage terminé" projectId={id} notionField="Photos montage terminé" existingPhotos={project.photosMontage} />
                    <PhotoUpload category="qrcode" label="Photos QR Code" projectId={id} notionField="Photos QR Code" existingPhotos={project.photosQRCode} />
                    <PhotoUpload category="garanties" label="Photos garanties" projectId={id} notionField="Photos garanties" existingPhotos={project.photosGaranties} />
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
                  </CardContent>
                </Card>
              </>
            )}

            {/* Pièce manquante */}
            <PiecesForm projectId={id} projectName={project.projet} />

            {/* Signaler un défaut */}
            <DefautForm projectId={id} projectName={project.projet} />

            {/* Checklist de montage */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Vérifications</CardTitle>
              </CardHeader>
              <CardContent>
                <MontageChecklist items={DEFAULT_CHECKLIST} />
              </CardContent>
            </Card>

            {/* Signature client */}
            <Card>
              <CardContent className="pt-4">
                <SignaturePad
                  label="Signature du client"
                  existingSignature={signature}
                  onSave={(dataUrl) => setSignature(dataUrl)}
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
                  <Send className="w-5 h-5 mr-2" />
                )}
                Enregistrer le rapport
              </Button>

              <Button
                variant="outline"
                className="w-full h-12 rounded-xl text-base font-medium glass-btn text-white"
                onClick={() => {
                  window.location.href = `/api/pdf/${id}`;
                }}
              >
                <FileText className="w-5 h-5 mr-2" />
                Finaliser le chantier (PDF)
              </Button>
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

      {/* Chat flottant */}
      <ProjectChat projectId={id} />
    </div>
  );
}
