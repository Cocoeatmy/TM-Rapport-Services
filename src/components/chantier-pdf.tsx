"use client";

/**
 * Rapport PDF d'un chantier PPE / locatif.
 *
 * Généré côté client via @react-pdf/renderer, comme les autres rapports de
 * l'application. Il couvre le chantier ENTIER — tous les onglets, tous les
 * lots, terminés compris — là où l'export Excel ne reprend que le tableau
 * affiché : un rapport qu'on transmet doit se suffire à lui-même.
 *
 * Format paysage : le tableau porte dix colonnes, et un A4 portrait les
 * écraserait au point de rendre les dates illisibles.
 *
 * Usage :
 *   const { generateChantierPDF } = await import("@/components/chantier-pdf");
 *   const blob = await generateChantierPDF(data);
 */

import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";
import type { LigneLot } from "@/lib/chantiers";

export interface SectionChantier {
  /** « Milliquet SA · Gétaz-Miauton SA - Givisiez » */
  label: string;
  lignes: LigneLot[];
  total: number;
  mesurees: number;
  commandees: number;
  livrees: number;
  posees: number;
}

export interface ChantierPdfData {
  nom: string;
  adresse: string;
  localite: string;
  fournisseurs: string[];
  nbOffres: number;
  nbLots: number;
  nbCabines: number;
  mesurees: number;
  commandees: number;
  livrees: number;
  posees: number;
  sections: SectionChantier[];
  offres: { ofrTM: string; projet: string; cabines: number; statut: string }[];
}

/* ── Palette — celle des autres rapports de l'app ───────────────────────── */
const C = {
  navy: "#1e3a5f",
  blue: "#2563eb",
  slate: "#64748b",
  light: "#f1f5f9",
  border: "#e2e8f0",
  white: "#ffffff",
  black: "#0f172a",
  green: "#16a34a",
  greenBg: "#e7f6ec",
  red: "#b42318",
  redBg: "#fdecea",
  amber: "#92500e",
  amberBg: "#fff3da",
  muted: "#94a3b8",
};

const s = StyleSheet.create({
  page: { paddingHorizontal: 30, paddingTop: 28, paddingBottom: 38, fontFamily: "Helvetica", fontSize: 8, color: C.black, backgroundColor: C.white },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
  logoTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.navy, letterSpacing: 0.5 },
  logoSub: { fontSize: 7.5, color: C.slate, marginTop: 1 },
  headerRight: { alignItems: "flex-end" },
  headerLabel: { fontSize: 7, color: C.muted },
  headerVal: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.slate },

  titleBand: { backgroundColor: C.navy, borderRadius: 5, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  titleText: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.white },
  titleSub: { fontSize: 8, color: "#93c5fd", marginTop: 2 },
  titleRight: { fontSize: 8, color: "#93c5fd", textAlign: "right" },

  kpiRow: { flexDirection: "row", gap: 5, marginBottom: 14 },
  kpi: { flex: 1, borderRadius: 4, borderWidth: 1, borderColor: C.border, paddingHorizontal: 6, paddingVertical: 6, alignItems: "center" },
  kpiVal: { fontSize: 12, fontFamily: "Helvetica-Bold", color: C.blue },
  kpiLabel: { fontSize: 6.5, color: C.slate, marginTop: 2, textAlign: "center" },
  kpiSub: { fontSize: 6, color: C.muted, marginTop: 1 },
  kpiFort: { backgroundColor: C.navy, borderColor: C.navy },
  kpiValFort: { color: C.white },
  kpiLabelFort: { color: "#93c5fd" },

  sectionTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.navy, marginTop: 12, marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.6 },
  sectionMeta: { fontSize: 7.5, color: C.slate, marginBottom: 5 },

  table: { borderWidth: 1, borderColor: C.border, borderRadius: 3, overflow: "hidden" },
  thead: { flexDirection: "row", backgroundColor: C.light, paddingVertical: 4, paddingHorizontal: 6 },
  th: { fontFamily: "Helvetica-Bold", fontSize: 6.5, color: C.slate, textTransform: "uppercase", letterSpacing: 0.3 },
  tr: { flexDirection: "row", paddingVertical: 3.5, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: C.border, alignItems: "flex-start" },
  trAlt: { backgroundColor: "#f8fafc" },
  td: { fontSize: 7.5, color: C.black },
  tdMuted: { fontSize: 6.5, color: C.slate, marginTop: 1 },
  tdBold: { fontFamily: "Helvetica-Bold" },

  pill: { fontSize: 6.5, fontFamily: "Helvetica-Bold", paddingHorizontal: 4, paddingVertical: 1.5, borderRadius: 6, textAlign: "center" },
  pillOui: { backgroundColor: C.greenBg, color: C.green },
  pillNon: { backgroundColor: C.redBg, color: C.red },
  pillPart: { backgroundColor: C.amberBg, color: C.amber },

  // Largeurs du tableau des lots
  cLot: { flex: 3 },
  cQte: { flex: 0.5, textAlign: "center" },
  cMarque: { flex: 2.2 },
  cGrossiste: { flex: 2.2 },
  cMesure: { flex: 1.1, alignItems: "center" },
  cOfr: { flex: 1.9 },
  cCmd: { flex: 1.3 },
  cLiv: { flex: 1.1, textAlign: "center" },
  cPose: { flex: 1.1, alignItems: "center" },
  cStatut: { flex: 2.1 },

  // Tableau des offres
  oOfr: { flex: 2 },
  oProjet: { flex: 9 },
  oCab: { flex: 1, textAlign: "center" },
  oStatut: { flex: 2.4 },

  piedPage: { position: "absolute", bottom: 16, left: 30, right: 30, flexDirection: "row", justifyContent: "space-between" },
  piedTxt: { fontSize: 6.5, color: C.muted },
});

/* ── Helpers ────────────────────────────────────────────────────────────── */

function jour(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function pourcent(n: number, total: number): string {
  return total > 0 ? `${Math.round((n / total) * 100)} %` : "—";
}

function aujourdhui(): string {
  return new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function Kpi({ valeur, label, sous, fort }: {
  valeur: string; label: string; sous?: string; fort?: boolean;
}) {
  return (
    <View style={fort ? [s.kpi, s.kpiFort] : s.kpi}>
      <Text style={fort ? [s.kpiVal, s.kpiValFort] : s.kpiVal}>{valeur}</Text>
      <Text style={fort ? [s.kpiLabel, s.kpiLabelFort] : s.kpiLabel}>{label}</Text>
      {sous ? <Text style={s.kpiSub}>{sous}</Text> : null}
    </View>
  );
}

/** OUI / NON / « 1/2 » — la même lecture que le tableau à l'écran. */
function Pastille({ faits, total }: { faits: number; total: number }) {
  const style = faits >= total ? s.pillOui : faits > 0 ? s.pillPart : s.pillNon;
  const txt = faits >= total ? "OUI" : faits > 0 ? `${faits}/${total}` : "NON";
  return <Text style={[s.pill, style]}>{txt}</Text>;
}

/* ── Document ───────────────────────────────────────────────────────────── */

function LigneTableau({ g, alt }: { g: LigneLot; alt: boolean }) {
  const l = g.chef;
  const pieces = [...new Set(g.lots.map((x) => x.piece).filter(Boolean))].join(" / ");
  return (
    <View style={alt ? [s.tr, s.trAlt] : s.tr} wrap={false}>
      <View style={s.cLot}>
        <Text style={[s.td, s.tdBold]}>{l.nom}</Text>
        {pieces ? <Text style={s.tdMuted}>{pieces}</Text> : null}
        {l.infos ? <Text style={s.tdMuted}>{l.infos}</Text> : null}
      </View>
      <Text style={[s.td, s.cQte]}>{g.qte}</Text>
      <View style={s.cMarque}>
        <Text style={s.td}>{l.marque || "—"}</Text>
        {l.serie ? <Text style={s.tdMuted}>{l.serie}</Text> : null}
      </View>
      <View style={s.cGrossiste}>
        <Text style={s.td}>{l.grossiste || "—"}</Text>
        {l.ofrGrossiste ? <Text style={s.tdMuted}>{l.ofrGrossiste}</Text> : null}
      </View>
      <View style={s.cMesure}>
        <Pastille faits={l.mesure ? 1 : 0} total={1} />
        {l.dateMesures ? <Text style={s.tdMuted}>{jour(l.dateMesures)}</Text> : null}
      </View>
      <View style={s.cOfr}>
        <Text style={s.td}>{l.ofrTM || "—"}</Text>
        {l.dateOffre ? <Text style={s.tdMuted}>{jour(l.dateOffre)}</Text> : null}
      </View>
      <View style={s.cCmd}>
        <Text style={s.td}>{l.cmd || (l.dateCMD ? "" : "—")}</Text>
        {l.dateCMD ? <Text style={s.tdMuted}>{jour(l.dateCMD)}</Text> : null}
      </View>
      <Text style={[s.td, s.cLiv]}>{jour(l.livraison) || "—"}</Text>
      <View style={s.cPose}>
        <Pastille faits={g.poses} total={g.qte} />
        {l.datePose ? <Text style={s.tdMuted}>{jour(l.datePose)}</Text> : null}
      </View>
      <Text style={[s.td, s.cStatut]}>{l.statut || "—"}</Text>
    </View>
  );
}

function ChantierDocument({ d }: { d: ChantierPdfData }) {
  const date = aujourdhui();
  return (
    <Document title={`Chantier — ${d.nom}`} author="TM Douche Montage">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.logoTitle}>TM DOUCHE MONTAGE</Text>
            <Text style={s.logoSub}>Suivi de chantier — PPE &amp; locatif</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.headerLabel}>Édité le</Text>
            <Text style={s.headerVal}>{date}</Text>
          </View>
        </View>

        <View style={s.titleBand}>
          <View>
            <Text style={s.titleText}>{d.nom}</Text>
            <Text style={s.titleSub}>
              {[d.adresse, d.localite].filter(Boolean).join(" · ")}
            </Text>
          </View>
          <View>
            <Text style={s.titleRight}>
              {d.nbLots} lot{d.nbLots > 1 ? "s" : ""} · {d.nbCabines} cabine{d.nbCabines > 1 ? "s" : ""} · {d.nbOffres} offre{d.nbOffres > 1 ? "s" : ""}
            </Text>
            {d.fournisseurs.length > 0 && (
              <Text style={s.titleRight}>{d.fournisseurs.join(", ")}</Text>
            )}
          </View>
        </View>

        <View style={s.kpiRow}>
          <Kpi valeur={String(d.nbLots)} label="Lots" sous={`${d.nbCabines} cabines`} />
          <Kpi valeur={pourcent(d.mesurees, d.nbLots)} label="Mesurés" sous={`${d.mesurees} / ${d.nbLots}`} />
          <Kpi valeur={pourcent(d.commandees, d.nbLots)} label="Commandés" sous={`${d.commandees} / ${d.nbLots}`} />
          <Kpi valeur={pourcent(d.livrees, d.nbLots)} label="Livrés" sous={`${d.livrees} / ${d.nbLots}`} />
          <Kpi valeur={pourcent(d.posees, d.nbLots)} label="Posés" sous={`${d.posees} / ${d.nbLots}`} fort />
        </View>

        {d.sections.map((sec, i) => (
          <View key={sec.label || i} break={i > 0 && d.sections.length > 2}>
            <Text style={s.sectionTitle}>
              {d.sections.length > 1 ? sec.label : "Lots du chantier"}
            </Text>
            <Text style={s.sectionMeta}>
              {sec.lignes.length} lot{sec.lignes.length > 1 ? "s" : ""} · {sec.total} cabine{sec.total > 1 ? "s" : ""}
              {"  —  "}mesurés {sec.mesurees}/{sec.total} · commandés {sec.commandees}/{sec.total}
              {" · "}livrés {sec.livrees}/{sec.total} · posés {sec.posees}/{sec.total}
            </Text>
            <View style={s.table}>
              <View style={s.thead} fixed>
                <Text style={[s.th, s.cLot]}>Lot</Text>
                <Text style={[s.th, s.cQte]}>Cab.</Text>
                <Text style={[s.th, s.cMarque]}>Marque / série</Text>
                <Text style={[s.th, s.cGrossiste]}>Grossiste</Text>
                <Text style={[s.th, s.cMesure]}>Mesure</Text>
                <Text style={[s.th, s.cOfr]}>OFR TM</Text>
                <Text style={[s.th, s.cCmd]}>CMD</Text>
                <Text style={[s.th, s.cLiv]}>Livraison</Text>
                <Text style={[s.th, s.cPose]}>Posé</Text>
                <Text style={[s.th, s.cStatut]}>Statut</Text>
              </View>
              {sec.lignes.map((g, j) => (
                <LigneTableau key={g.cle} g={g} alt={j % 2 === 1} />
              ))}
            </View>
          </View>
        ))}

        <View break>
          <Text style={s.sectionTitle}>Offres du chantier</Text>
          <View style={s.table}>
            <View style={s.thead} fixed>
              <Text style={[s.th, s.oOfr]}>OFR TM</Text>
              <Text style={[s.th, s.oProjet]}>Projet</Text>
              <Text style={[s.th, s.oCab]}>Cab.</Text>
              <Text style={[s.th, s.oStatut]}>Statut</Text>
            </View>
            {d.offres.map((o, i) => (
              <View key={o.ofrTM + i} style={i % 2 === 1 ? [s.tr, s.trAlt] : s.tr} wrap={false}>
                <Text style={[s.td, s.tdBold, s.oOfr]}>{o.ofrTM || "—"}</Text>
                <Text style={[s.td, s.oProjet]}>{o.projet}</Text>
                <Text style={[s.td, s.oCab]}>{o.cabines}</Text>
                <Text style={[s.td, s.oStatut]}>{o.statut || "—"}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.piedPage} fixed>
          <Text style={s.piedTxt}>{d.nom} — {[d.adresse, d.localite].filter(Boolean).join(", ")}</Text>
          <Text style={s.piedTxt} render={({ pageNumber, totalPages }) => `${date} · page ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function generateChantierPDF(d: ChantierPdfData): Promise<Blob> {
  return await pdf(<ChantierDocument d={d} />).toBlob();
}
