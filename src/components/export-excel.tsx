"use client";

import { FileSpreadsheet, Loader2 } from "lucide-react";
import { useState } from "react";
import type { Project } from "@/lib/notion";

export function ExportExcel({ projects, label = "Exporter Excel" }: { projects: Project[]; label?: string }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");

      const data = projects.map((p) => ({
        "N° OFR TM": p.ofrTM,
        "Projet": p.projet,
        "Nom chantier": p.nomChantier,
        "Adresse": p.adresseChantier,
        "Nb. Cabines": p.nbCabines,
        "Fournisseurs": p.fournisseurs.join(", "),
        "Séries": p.seriesCabines.join(", "),
        "Collaborateurs": p.collaborateurs,
        "Date Montage": p.dateMontage,
        "Statut CMD": p.etatCMD,
        "Emplacement": p.emplacementCabine,
        "Heure arrivée": p.heureArrivee,
        "Heure départ": p.heureDepart,
        "Rapport": p.rapportMonteur,
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Projets");

      // Auto-width columns
      const colWidths = Object.keys(data[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...data.map((r) => String((r as any)[key] || "").length).slice(0, 20)) + 2,
      }));
      ws["!cols"] = colWidths;

      const date = new Date().toISOString().split("T")[0];
      XLSX.writeFile(wb, `tm-rapport-${date}.xlsx`);
    } catch (e) {
      console.error("Export error:", e);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting || projects.length === 0}
      className="shrink-0 whitespace-nowrap flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl glass-card hover:bg-white/80 transition-all active:scale-95 disabled:opacity-50"
    >
      {exporting ? (
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
      ) : (
        <FileSpreadsheet className="w-4 h-4 shrink-0 text-green-600" />
      )}
      {label}
    </button>
  );
}
