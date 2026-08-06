"use client";

import { useState, useEffect } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/lib/notion";
import { COLLABORATEURS_LIST } from "@/lib/constants";

const ETAT_CMD_OPTIONS = [
  "En attente de mesures",
  "Cabines mesurées",
  "OFR envoyées sans mesures",
  "Cabines en CMD",
  "Cabines à recevoir",
  "Livraison partielle",
  "Cabine à aller chercher",
  "Récéptionné - RDV à fixer",
  "RDV - fixé",
  "RDV - Attendre news",
  "Montage partiel",
  "Soucis montage",
  "Annulé",
  "Terminé",
];

const ETAT_MESURES_OPTIONS = [
  "Pas contacté",
  "Contact sans réponse",
  "OFR envoyée sans mesures",
  "Mesures non relevées - attendre news",
  "RDV - Fixé",
  "RDV - Attendre news",
  "Mesures partielles",
  "Mesures relevées - attente news",
  "Projet sans de mesures",
  "Annulé",
  "Terminé",
];

const TYPE_CLIENT_OPTIONS = [
  "Client direct",
  "Grossiste",
  "Grossistes",
  "Fournisseur",
  "Fournisseurs",
];

const COLLABORATEURS_BINOMES = [
  "Jean-Marc & Miguel",
  "Micael & Claudio",
  "Jacobo & Loïc",
  "Micael & Jean-Marc",
  "Claudio & Jacobo",
];

interface Props {
  project: Project;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Project) => void;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors";

export function AdminEditModal({ project, isOpen, onClose, onSave }: Props) {
  const [form, setForm] = useState<Project>({ ...project });
  const [saving, setSaving] = useState(false);
  const [emplacementOptions, setEmplacementOptions] = useState<string[]>([]);

  // Charge les options depuis Notion au premier affichage
  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/projects/field-options?fields=Emplacement+de+cabine")
      .then((r) => r.json())
      .then((data) => {
        const opts: string[] = data["Emplacement de cabine"] ?? [];
        if (opts.length > 0) setEmplacementOptions(opts);
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const set = <K extends keyof Project>(field: K, value: Project[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    if (!form.projet.trim()) {
      toast.error("Le nom du projet est requis");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projet: form.projet,
          ofrTM: form.ofrTM,
          cmdTM: form.cmdTM,
          cmdTMUsine: form.cmdTMUsine,
          ofrGrossiste: form.ofrGrossiste,
          cmdGrossiste: form.cmdGrossiste,
          cmdFournisseurs: form.cmdFournisseurs,
          servMesuresFournisseurs: form.servMesuresFournisseurs,
          servCmdFournisseurs: form.servCmdFournisseurs,
          nomChantier: form.nomChantier,
          adresseChantier: form.adresseChantier,
          nbCabines: form.nbCabines ?? undefined,
          typeClient: form.typeClient,
          emplacementCabine: form.emplacementCabine,
          contactsRDV: form.contactsRDV,
          contacts: form.contacts,
          etatCMD: form.etatCMD,
          etatMesures: form.etatMesures,
          collaborateurs: form.collaborateurs,
          mesuresTraiteePar: form.mesuresTraiteePar,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Erreur serveur");
      }
      toast.success("Projet mis à jour dans Notion");
      onSave(form);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative flex flex-col w-full max-w-lg bg-white dark:bg-gray-900 h-full overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">Modifier le projet</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{project.projet}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">

          {/* === Identification === */}
          <section>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Identification
            </h3>
            <div className="space-y-3">
              <Field label="Nom du projet *">
                <input
                  className={inputCls}
                  value={form.projet}
                  onChange={(e) => set("projet", e.target.value)}
                  placeholder="Nom du projet"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="N° OFR TM">
                  <input className={inputCls} value={form.ofrTM || ""} onChange={(e) => set("ofrTM", e.target.value)} placeholder="TM-25-..." />
                </Field>
                <Field label="N° CMD TM">
                  <input className={inputCls} value={form.cmdTM || ""} onChange={(e) => set("cmdTM", e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="N° CMD TM Usine">
                  <input className={inputCls} value={form.cmdTMUsine || ""} onChange={(e) => set("cmdTMUsine", e.target.value)} />
                </Field>
                <Field label="N° OFR Grossiste">
                  <input className={inputCls} value={form.ofrGrossiste || ""} onChange={(e) => set("ofrGrossiste", e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="N° CMD Grossiste">
                  <input className={inputCls} value={form.cmdGrossiste || ""} onChange={(e) => set("cmdGrossiste", e.target.value)} />
                </Field>
                <Field label="N° CMD Fournisseurs">
                  <input className={inputCls} value={form.cmdFournisseurs || ""} onChange={(e) => set("cmdFournisseurs", e.target.value)} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="N° Serv. Mesures Fourn.">
                  <input className={inputCls} value={form.servMesuresFournisseurs || ""} onChange={(e) => set("servMesuresFournisseurs", e.target.value)} />
                </Field>
                <Field label="N° CMD Services">
                  <input className={inputCls} value={form.servCmdFournisseurs || ""} onChange={(e) => set("servCmdFournisseurs", e.target.value)} />
                </Field>
              </div>
            </div>
          </section>

          {/* === Chantier === */}
          <section>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Chantier
            </h3>
            <div className="space-y-3">
              <Field label="Nom du chantier">
                <input className={inputCls} value={form.nomChantier || ""} onChange={(e) => set("nomChantier", e.target.value)} />
              </Field>
              <Field label="Adresse chantier">
                <input
                  className={inputCls}
                  value={form.adresseChantier || ""}
                  onChange={(e) => set("adresseChantier", e.target.value)}
                  placeholder="Rue, Numéro, NPA Localité"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Nb. Cabines">
                  <input
                    type="number"
                    min="1"
                    className={inputCls}
                    value={form.nbCabines ?? ""}
                    onChange={(e) => set("nbCabines", e.target.value ? Number(e.target.value) : null)}
                  />
                </Field>
                <Field label="Emplacement cabine">
                  {emplacementOptions.length > 0 ? (
                    <select
                      className={inputCls}
                      value={(form.emplacementCabine || "").split(",")[0].trim()}
                      onChange={(e) => set("emplacementCabine", e.target.value)}
                    >
                      <option value="">— Choisir —</option>
                      {emplacementOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inputCls}
                      value={form.emplacementCabine || ""}
                      onChange={(e) => set("emplacementCabine", e.target.value)}
                      placeholder="Salle de bain, etc."
                    />
                  )}
                </Field>
              </div>
            </div>
          </section>

          {/* === Client === */}
          <section>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Client
            </h3>
            <div className="space-y-3">
              <Field label="Type de client">
                <select
                  className={inputCls}
                  value={form.typeClient || ""}
                  onChange={(e) => set("typeClient", e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {TYPE_CLIENT_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="Contacts pour RDV">
                <input
                  className={inputCls}
                  value={form.contactsRDV || ""}
                  onChange={(e) => set("contactsRDV", e.target.value)}
                  placeholder="Nom + téléphone"
                />
              </Field>
              <Field label="Contacts projet (notes)">
                <textarea
                  rows={2}
                  className={inputCls}
                  value={form.contacts || ""}
                  onChange={(e) => set("contacts", e.target.value)}
                />
              </Field>
            </div>
          </section>

          {/* === Statuts & Planification === */}
          <section>
            <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Statuts &amp; Planification
            </h3>
            <div className="space-y-3">
              <Field label="État CMD">
                <select
                  className={inputCls}
                  value={form.etatCMD || ""}
                  onChange={(e) => set("etatCMD", e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {ETAT_CMD_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <Field label="État Mesures">
                <select
                  className={inputCls}
                  value={form.etatMesures || ""}
                  onChange={(e) => set("etatMesures", e.target.value)}
                >
                  <option value="">— Choisir —</option>
                  {ETAT_MESURES_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Collaborateur montage">
                  <select
                    className={inputCls}
                    value={form.collaborateurs || ""}
                    onChange={(e) => set("collaborateurs", e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {COLLABORATEURS_LIST.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    <optgroup label="Binômes">
                      {COLLABORATEURS_BINOMES.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </optgroup>
                  </select>
                </Field>
                <Field label="Mesures par">
                  <select
                    className={inputCls}
                    value={form.mesuresTraiteePar || ""}
                    onChange={(e) => set("mesuresTraiteePar", e.target.value)}
                  >
                    <option value="">— Choisir —</option>
                    {COLLABORATEURS_LIST.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </section>

          {/* Note relations */}
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
            Les relations (Grossistes, Fournisseurs, Sanitaire, Contact Projet) restent gérées directement dans Notion.
          </p>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex gap-2 shrink-0 bg-white dark:bg-gray-900">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.projet.trim()}
            className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Sauvegarder
          </button>
        </div>
      </div>
    </div>
  );
}
