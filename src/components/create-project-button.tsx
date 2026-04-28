"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, X, Loader2, FolderPlus } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { COLLABORATEURS_LIST } from "@/lib/constants";

const ETAT_CMD_OPTIONS = [
  "Cabines en CMD",
  "En attente de mesures",
  "Cabines à recevoir",
  "Livraison partielle",
  "Cabine à aller chercher",
  "Récéptionné - RDV à fixer",
  "RDV - fixé",
  "RDV - Attendre news",
  "Montage partiel",
  "Soucis montage",
  "Terminé",
  "Annulé",
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

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors";

const emptyForm = () => ({
  projet: "",
  ofrTM: "",
  nomChantier: "",
  nbCabines: "",
  dateMontage: "",
  dateMesures: "",
  collaborateurs: "",
  mesuresTraiteePar: "",
  etatCMD: "Récéptionné - RDV à fixer",
  etatMesures: "",
  contacts: "",
  contactsRDV: "",
  typeClient: "",
  cmdTM: "",
  cmdTMUsine: "",
});

export function CreateProjectButton() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => { if (d.user?.role === "admin") setIsAdmin(true); })
      .catch(() => {});
  }, []);

  if (!isAdmin) return null;

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleClose = () => {
    setIsOpen(false);
    setForm(emptyForm());
  };

  const handleSubmit = async () => {
    if (!form.projet.trim()) {
      toast.error("Le nom du projet est requis");
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, any> = {
        projet: form.projet.trim(),
      };
      if (form.ofrTM.trim()) body.ofrTM = form.ofrTM.trim();
      if (form.cmdTM.trim()) body.cmdTM = form.cmdTM.trim();
      if (form.cmdTMUsine.trim()) body.cmdTMUsine = form.cmdTMUsine.trim();
      if (form.nomChantier.trim()) body.nomChantier = form.nomChantier.trim();
      if (form.nbCabines) body.nbCabines = Number(form.nbCabines);
      if (form.dateMontage) body.dateMontage = form.dateMontage;
      if (form.dateMesures) body.dateMesures = form.dateMesures;
      if (form.collaborateurs) body.collaborateurs = form.collaborateurs;
      if (form.mesuresTraiteePar) body.mesuresTraiteePar = form.mesuresTraiteePar;
      if (form.etatCMD) body.etatCMD = form.etatCMD;
      if (form.etatMesures) body.etatMesures = form.etatMesures;
      if (form.contacts.trim()) body.contacts = form.contacts.trim();
      if (form.contactsRDV.trim()) body.contactsRDV = form.contactsRDV.trim();
      if (form.typeClient) body.typeClient = form.typeClient;

      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");

      toast.success("Projet créé avec succès !");
      handleClose();

      if (data.pageId) {
        router.push(`/projet/${data.pageId}?mode=cmd`);
      }
    } catch (e: any) {
      toast.error(e.message || "Erreur lors de la création");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Bouton dans le header */}
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Créer un nouveau projet"
        title="Nouveau projet"
        className="w-9 h-9 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-white hover:bg-white/25 active:scale-95 transition-all"
      >
        <Plus className="w-4 h-4" />
      </button>

      {/* Modal / slide-over — rendu via Portal hors du header pour éviter le clipping */}
      {isOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleClose}
          />

          {/* Panel */}
          <div className="relative flex flex-col w-full max-w-lg bg-white dark:bg-gray-900 h-full overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-blue-500" />
                <h2 className="font-semibold text-gray-900 dark:text-gray-100 text-base">Nouveau projet</h2>
              </div>
              <button
                onClick={handleClose}
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
                  <Field label="Nom du projet" required>
                    <input
                      className={inputCls}
                      value={form.projet}
                      onChange={(e) => set("projet", e.target.value)}
                      placeholder="Nom complet du projet"
                      autoFocus
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="N° OFR TM">
                      <input
                        className={inputCls}
                        value={form.ofrTM}
                        onChange={(e) => set("ofrTM", e.target.value)}
                        placeholder="TM-25-..."
                      />
                    </Field>
                    <Field label="N° CMD TM">
                      <input
                        className={inputCls}
                        value={form.cmdTM}
                        onChange={(e) => set("cmdTM", e.target.value)}
                      />
                    </Field>
                  </div>
                  <Field label="N° CMD TM Usine">
                    <input
                      className={inputCls}
                      value={form.cmdTMUsine}
                      onChange={(e) => set("cmdTMUsine", e.target.value)}
                    />
                  </Field>
                </div>
              </section>

              {/* === Chantier === */}
              <section>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Chantier
                </h3>
                <div className="space-y-3">
                  <Field label="Nom du chantier">
                    <input
                      className={inputCls}
                      value={form.nomChantier}
                      onChange={(e) => set("nomChantier", e.target.value)}
                      placeholder="Nom / adresse du chantier"
                    />
                  </Field>
                  <Field label="Nb. Cabines">
                    <input
                      type="number"
                      min="1"
                      className={inputCls}
                      value={form.nbCabines}
                      onChange={(e) => set("nbCabines", e.target.value)}
                      placeholder="1"
                    />
                  </Field>
                </div>
              </section>

              {/* === Client === */}
              <section>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Client
                </h3>
                <div className="space-y-3">
                  <Field label="Type de client">
                    <select className={inputCls} value={form.typeClient} onChange={(e) => set("typeClient", e.target.value)}>
                      <option value="">— Choisir —</option>
                      {TYPE_CLIENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </Field>
                  <Field label="Contacts pour RDV">
                    <input
                      className={inputCls}
                      value={form.contactsRDV}
                      onChange={(e) => set("contactsRDV", e.target.value)}
                      placeholder="Nom + téléphone"
                    />
                  </Field>
                  <Field label="Contacts projet (notes)">
                    <textarea
                      rows={2}
                      className={inputCls}
                      value={form.contacts}
                      onChange={(e) => set("contacts", e.target.value)}
                    />
                  </Field>
                </div>
              </section>

              {/* === Planification === */}
              <section>
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">
                  Planification
                </h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Date de montage">
                      <input
                        type="date"
                        className={inputCls}
                        value={form.dateMontage}
                        onChange={(e) => set("dateMontage", e.target.value)}
                      />
                    </Field>
                    <Field label="Date Mesures">
                      <input
                        type="date"
                        className={inputCls}
                        value={form.dateMesures}
                        onChange={(e) => set("dateMesures", e.target.value)}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Collaborateur montage">
                      <select className={inputCls} value={form.collaborateurs} onChange={(e) => set("collaborateurs", e.target.value)}>
                        <option value="">— Choisir —</option>
                        {COLLABORATEURS_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
                        <optgroup label="Binômes">
                          {COLLABORATEURS_BINOMES.map((b) => <option key={b} value={b}>{b}</option>)}
                        </optgroup>
                      </select>
                    </Field>
                    <Field label="Mesures par">
                      <select className={inputCls} value={form.mesuresTraiteePar} onChange={(e) => set("mesuresTraiteePar", e.target.value)}>
                        <option value="">— Choisir —</option>
                        {COLLABORATEURS_LIST.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="État CMD">
                      <select className={inputCls} value={form.etatCMD} onChange={(e) => set("etatCMD", e.target.value)}>
                        <option value="">— Choisir —</option>
                        {ETAT_CMD_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </Field>
                    <Field label="État Mesures">
                      <select className={inputCls} value={form.etatMesures} onChange={(e) => set("etatMesures", e.target.value)}>
                        <option value="">— Choisir —</option>
                        {ETAT_MESURES_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </Field>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 flex gap-2 shrink-0 bg-white dark:bg-gray-900">
              <button
                onClick={handleClose}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !form.projet.trim()}
                className="flex-1 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderPlus className="w-4 h-4" />}
                Créer le projet
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
