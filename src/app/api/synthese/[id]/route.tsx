/**
 * /api/synthese/[id]            → PDF « Rapport de suivi du chantier »
 * /api/synthese/[id]?s=<sig>    → PDF public (lien), protégé par HMAC (signSynthese)
 * /api/synthese/[id]?link=1     → JSON { url } : lien public signé (cookie admin requis)
 *
 * Vue d'ensemble d'un chantier : infos + contact, puis TOUS les lots avec leur
 * état (vert = terminé, orange = entamé, bleu = à faire, rouge = pas possible),
 * le rapport par lot et l'état du SAV (réglé / en attente).
 */
import { NextRequest, NextResponse } from "next/server";
import { getProject, type Project, type ContactDetail } from "@/lib/notion";
import { getData } from "@/lib/kv-store";
import { LOGO_BASE64 } from "@/lib/logo";
import { verifyToken } from "@/lib/auth";
import { signSynthese } from "@/lib/doc-link";
import { splitRapportByCabine } from "@/lib/rapport";
import { formatSwissDate } from "@/lib/time-utils";
import { timingSafeEqual } from "crypto";
import ReactPDF, {
  Document, Page, Text, View, Image, Svg, Path, StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Helpers données par cabine ──────────────────────────────────────────────
function parseCabMulti(raw: string | undefined | null): Record<number, string> {
  const map: Record<number, string> = {};
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw || ""))) { const v = m[2].trim(); if (v) map[parseInt(m[1], 10)] = v; }
  return map;
}
// Dates de montage par cabine, encodées dans « Heure arrivée » ("CabN:YYYY-MM-DD:HH:MM").
function parseCabDates(raw: string | undefined | null): Record<number, string> {
  const map: Record<number, string> = {};
  const re = /Cab(\d+)\s*:(\d{4}-\d{2}-\d{2}):/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw || ""))) map[parseInt(m[1], 10)] = m[2];
  return map;
}
// Heures par cabine ("CabN:08:00" ou "CabN:2026-05-02:08:00") → "HH:MM".
function parseCabTimes(raw: string | undefined | null): Record<number, string> {
  const map: Record<number, string> = {};
  const re = /Cab(\d+)\s*:(?:\d{4}-\d{2}-\d{2}:)?(\d{1,2}:\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw || ""))) map[parseInt(m[1], 10)] = m[2];
  return map;
}
function cabIndicesFromFiles(files: { name?: string }[] | undefined): Set<number> {
  const set = new Set<number>();
  (files || []).forEach((f) => { const m = (f.name || "").match(/\.Cab(\d+)\./); if (m) set.add(parseInt(m[1], 10)); });
  return set;
}
function cabHasFile(files: { name?: string }[] | undefined, cab: number): boolean {
  return (files || []).some((f) => { const m = (f.name || "").match(/\.Cab(\d+)\./); return m ? parseInt(m[1], 10) === cab : false; });
}
// Signalements (KV store) — pièces manquantes + défauts, rattachés par lot.
type Piece = { projectId: string; description?: string; reference?: string; status?: string; cabineLabel?: string };
type Defaut = { projectId: string; typesLabel?: string; types?: string[]; description?: string; cabineLabel?: string; resolved?: boolean; phase?: string };
function normLabel(s: string | undefined | null): string { return (s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
function nfc(s: string) { return (s || "").normalize("NFC"); }
function fmtDate(d?: string | null) { try { return d ? formatSwissDate(d) : ""; } catch { return ""; } }
function ddmmyyyy(d?: string | null) { const s = (d || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join(".") : ""; }
// Plage horaire « 08:00–12:30 (4h30) ».
function hoursStr(arr?: string, dep?: string): string {
  const clean = (t?: string) => { const m = /(\d{1,2}):(\d{2})/.exec(t || ""); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : ""; };
  const a = clean(arr), b = clean(dep);
  if (a && b) {
    const toMin = (t: string) => { const [h, mn] = t.split(":").map(Number); return h * 60 + mn; };
    const diff = toMin(b) - toMin(a);
    const dur = diff > 0 ? ` (${Math.floor(diff / 60)}h${String(diff % 60).padStart(2, "0")})` : "";
    return `${a}–${b}${dur}`;
  }
  return a || b || "";
}

// ── Couleurs d'état ─────────────────────────────────────────────────────────
const COLORS = {
  done: "#15803d",       // vert — terminé
  started: "#ea580c",    // orange — entamé
  todo: "#2563eb",       // bleu — à faire
  impossible: "#dc2626", // rouge — pas possible
  navy: "#1e3a5f",
  savOpen: "#b45309",    // ambre — SAV en attente
  savClosed: "#15803d",  // vert — SAV réglé
};
type CabState = "done" | "started" | "todo" | "impossible";
const STATE_LABEL: Record<CabState, string> = {
  done: "Terminé", started: "Entamé", todo: "À faire", impossible: "Pas possible",
};

const styles = StyleSheet.create({
  page: { padding: 36, paddingBottom: 50, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a" },
  header: { flexDirection: "column", marginBottom: 12, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: "#1e3a5f" },
  title: { fontSize: 19, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 8 },
  tm: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 5 },
  subtitle: { fontSize: 10, color: "#666", marginTop: 2 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginBottom: 5, paddingBottom: 3, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  section: { marginBottom: 10 },
  infoCell: { width: "25%", paddingRight: 8, marginBottom: 5 },
  infoLabel: { fontSize: 7.5, color: "#888", marginBottom: 1 },
  infoValue: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  cab: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  num: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", marginRight: 8 },
  numTxt: { color: "#fff", fontSize: 9, fontFamily: "Helvetica-Bold" },
  cabName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a" },
  chip: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#fff", borderRadius: 3, paddingVertical: 1.5, paddingHorizontal: 4, marginLeft: 6 },
  meta: { fontSize: 8, color: "#555" },
  sub: { fontSize: 8.5, color: "#333", marginTop: 2 },
  subLabel: { fontFamily: "Helvetica-Bold", color: "#666" },
  legend: { flexDirection: "row", flexWrap: "wrap", marginBottom: 10 },
  legendItem: { flexDirection: "row", alignItems: "center", marginRight: 14, marginBottom: 3 },
  dot: { width: 9, height: 9, borderRadius: 4.5, marginRight: 4 },
  footer: { position: "absolute", bottom: 24, left: 36, right: 36, textAlign: "center", fontSize: 7, color: "#999", borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 6 },
});

function joinNames(arr?: string[]): string { return arr && arr.length ? arr.map((s) => nfc(s)).join(", ") : ""; }
function ContactCell({ label, company, contacts }: { label: string; company?: string; contacts?: ContactDetail[] }) {
  const list = (contacts || []).filter((c) => c && (c.name || c.email || c.phone));
  const hasCompany = !!company && company.trim() !== "" && company !== "—";
  if (!hasCompany && list.length === 0) return null;
  return (
    <View style={{ width: "33.33%", paddingRight: 10, marginBottom: 8 }}>
      <Text style={{ fontSize: 7.5, color: "#888", marginBottom: 2 }}>{label}</Text>
      {hasCompany ? <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>{nfc(company!)}</Text> : null}
      {list.map((c, i) => (
        <View key={i} style={{ marginTop: 3 }}>
          {c.name ? <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>{nfc(c.name)}</Text> : null}
          {c.email ? <Text style={{ fontSize: 7.5, color: "#555" }}>{c.email}</Text> : null}
          {c.phone ? <Text style={{ fontSize: 7.5, color: "#555" }}>{c.phone}</Text> : null}
        </View>
      ))}
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={{ ...styles.dot, backgroundColor: color }} />
      <Text style={{ fontSize: 8, color: "#444" }}>{label}</Text>
    </View>
  );
}

const PIECE_STATUS: Record<string, string> = { demande: "à commander", commande: "commandée", recu: "reçue" };
const SIG_COLORS = { piece: "#ea580c", defaut: "#dc2626", avant: "#4f46e5" };

// Icônes vectorielles (tracés lucide) affichées devant chaque sous-ligne.
const IC = {
  user: ["M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z", "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"],
  doc: ["M7 3h10v18H7z", "M10 9h6", "M10 13h6", "M10 17h4"],
  wrench: ["M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"],
  package: ["M12 2 21 7v10l-9 5-9-5V7z", "M3 7l9 5 9-5", "M12 12v10"],
  shield: ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "M12 8v4", "M12 16h0.01"],
  eye: ["M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z", "M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z"],
  check: ["M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20z", "M8 12l2.5 2.5L16 9"],
} as const;
const SIG_DONE = "#15803d"; // vert — signalement réglé

function Icn({ paths, color, size = 9 }: { paths: readonly string[]; color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {paths.map((d, i) => <Path key={i} d={d} stroke={color} strokeWidth={2} fill="none" />)}
    </Svg>
  );
}

// Sous-ligne d'un lot : icône colorée + texte (qui peut passer à la ligne).
function SubRow({ paths, iconColor, textColor = "#333", bold = false, children }: {
  paths: readonly string[]; iconColor: string; textColor?: string; bold?: boolean; children: React.ReactNode;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", marginTop: 2 }}>
      <View style={{ width: 13, marginTop: 0.5 }}><Icn paths={paths} color={iconColor} /></View>
      <Text style={{ fontSize: 8.5, color: textColor, flex: 1, fontFamily: bold ? "Helvetica-Bold" : "Helvetica" }}>{children}</Text>
    </View>
  );
}

function SynthesePDF({ project, pieces = [], defauts = [] }: { project: Project; pieces?: Piece[]; defauts?: Defaut[] }) {
  const total = project.nbCabines || 0;
  const names = parseCabMulti(project.nomsCabines);
  const attribution = parseCabMulti(project.attributionCabines);
  const sousTrait = parseCabMulti(project.monteursSousTraitance);
  const etat = parseCabMulti(project.etatMontage);
  const montageDates = parseCabDates(project.heureArrivee);
  const arriveeTimes = parseCabTimes(project.heureArrivee);
  const departTimes = parseCabTimes(project.heureDepart);
  const installed = cabIndicesFromFiles(project.photosMontage);
  const avant = cabIndicesFromFiles(project.photosAvant);

  // Rapport par lot (découpé depuis « Rapport monteur »).
  const nomsArr = Array.from({ length: total }, (_, i) => names[i + 1] || `Cabine ${i + 1}`);
  const rapportPer = splitRapportByCabine(project.rapportMonteur, nomsArr).perCabine;

  // SAV par cabine.
  const savReclam = parseCabMulti(project.commentairesSav);
  const savCause = parseCabMulti(project.causeSavCabines);
  const savRdv = parseCabMulti(project.datesRdvSavCabines);
  const savCollab = parseCabMulti(project.collaborateursSavCabines);
  const savFait = parseCabMulti(project.savRetouchesCabines);
  const savRecu = parseCabMulti(project.dateSAVRecu);
  const savCloture = parseCabMulti(project.datesSavClotureCabines);

  const cabHasSav = (n: number) =>
    !!(savReclam[n] || savCause[n] || savRdv[n] || savCollab[n] || savFait[n] || savRecu[n]
      || cabHasFile(project.documentsSavDemande, n) || cabHasFile(project.photosSavRetouches, n));

  const stateOf = (n: number): CabState => {
    const e = etat[n];
    if (e === "Montage terminé") return "done";
    if (e === "Montage pas possible") return "impossible";
    if (e === "Montage partiel") return "started";
    if (installed.has(n)) return "done";
    if (arriveeTimes[n] || avant.has(n)) return "started";
    return "todo";
  };

  // Décompte pour le résumé.
  const counts = { done: 0, started: 0, todo: 0, impossible: 0 };
  let savOpen = 0, savClosed = 0, hasImpossible = false;
  for (let n = 1; n <= total; n++) {
    const st = stateOf(n);
    counts[st]++;
    if (st === "impossible") hasImpossible = true;
    if (cabHasSav(n)) { if (ddmmyyyy(savCloture[n])) savClosed++; else savOpen++; }
  }

  const montageRange = (() => {
    const s = fmtDate(project.dateMontage);
    const e = project.dateMontageEnd && project.dateMontageEnd.slice(0, 10) !== (project.dateMontage || "").slice(0, 10)
      ? fmtDate(project.dateMontageEnd) : "";
    return s ? (e ? `${s} → ${e}` : s) : "—";
  })();

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête */}
        <View style={styles.header}>
          <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
          <Text style={styles.title}>Suivi du chantier</Text>
          <Text style={styles.tm}>{project.ofrTM || "TM-—"}</Text>
          {project.projet ? <Text style={styles.subtitle}>{nfc(project.projet)}</Text> : null}
        </View>

        {/* Chantier — infos + résumé d'avancement */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Chantier</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <View style={{ width: "50%", paddingRight: 8, marginBottom: 5 }}>
              <Text style={styles.infoLabel}>Adresse chantier</Text>
              <Text style={styles.infoValue}>{nfc(project.adresseChantier || "—") || "—"}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Nb. cabines</Text>
              <Text style={styles.infoValue}>{total || "—"}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Dates de montage</Text>
              <Text style={styles.infoValue}>{montageRange}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2 }}>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Terminés</Text>
              <Text style={{ ...styles.infoValue, color: COLORS.done }}>{counts.done} / {total}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>Entamés</Text>
              <Text style={{ ...styles.infoValue, color: COLORS.started }}>{counts.started}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>À faire</Text>
              <Text style={{ ...styles.infoValue, color: COLORS.todo }}>{counts.todo}</Text>
            </View>
            <View style={styles.infoCell}>
              <Text style={styles.infoLabel}>SAV</Text>
              <Text style={styles.infoValue}>
                <Text style={{ color: COLORS.savClosed }}>{savClosed} réglé{savClosed > 1 ? "s" : ""}</Text>
                {savOpen > 0 ? <Text style={{ color: COLORS.savOpen }}>  ·  {savOpen} en attente</Text> : null}
                {savClosed === 0 && savOpen === 0 ? "—" : ""}
              </Text>
            </View>
          </View>
        </View>

        {/* Légende des couleurs */}
        <View style={styles.legend}>
          <LegendItem color={COLORS.done} label="Terminé" />
          <LegendItem color={COLORS.started} label="Entamé" />
          <LegendItem color={COLORS.todo} label="À faire" />
          {hasImpossible ? <LegendItem color={COLORS.impossible} label="Pas possible" /> : null}
        </View>

        {/* Contact */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <ContactCell label="GROSSISTE" company={joinNames(project.grossistesNames)} contacts={project.contactsGrossisteDetails} />
            <ContactCell label="INSTALLATEUR" company={joinNames(project.sanitaireNames)} contacts={project.contactsSanitaireDetails} />
            <ContactCell label="ARCHITECTE" company={joinNames(project.architecteNames)} contacts={project.contactsArchitecteDetails} />
            <ContactCell label="DT" company={joinNames(project.dtNames)} contacts={project.contactsDTDetails} />
            <ContactCell label="CLIENT FINAL" contacts={project.contactsClientsFinauxDetails} />
          </View>
        </View>

        {/* Lots */}
        <View>
          <Text style={styles.sectionTitle}>Lots ({total})</Text>
          {total === 0 ? (
            <Text style={{ fontSize: 10, color: "#888" }}>Aucun lot renseigné pour ce projet.</Text>
          ) : Array.from({ length: total }, (_, i) => i + 1).map((n) => {
            const st = stateOf(n);
            const color = COLORS[st];
            const nom = names[n] || `Cabine ${n}`;
            const who = attribution[n] || sousTrait[n] || project.collaborateurs || "";
            const montage = montageDates[n] || (project.dateMontage || "").slice(0, 10);
            const hrs = hoursStr(arriveeTimes[n], departTimes[n]);
            const dateHours = [montage ? (fmtDate(montage) || montage) : "", hrs].filter(Boolean).join("  ·  ");
            const rapport = (rapportPer[n - 1] || "").trim();
            // Ligne SAV
            let savLine: { txt: string; color: string } | null = null;
            if (cabHasSav(n)) {
              const closed = ddmmyyyy(savCloture[n]);
              if (closed) {
                savLine = { txt: `SAV réglé le ${closed}${savFait[n] ? " — " + nfc(savFait[n]) : ""}`, color: COLORS.savClosed };
              } else {
                const recu = ddmmyyyy(savRecu[n]);
                const parts = ["SAV en attente"];
                if (recu) parts.push(`reçu le ${recu}`);
                if (savReclam[n]) parts.push(nfc(savReclam[n]));
                savLine = { txt: parts.join(" — "), color: COLORS.savOpen };
              }
            }
            // Signalements rattachés à ce lot (par libellé de cabine ; mono = lot 1).
            const belongs = (label?: string) =>
              normLabel(label) === normLabel(nom) || (!label && total === 1 && n === 1);
            const sigLines: { txt: string; color: string; kind: "piece" | "defaut" | "avant"; resolved: boolean }[] = [];
            for (const p of pieces) {
              if (!belongs(p.cabineLabel)) continue;
              const ref = (p.reference || "").trim();
              const desc = (p.description || "").trim();
              const body = [ref, desc].filter(Boolean).join(" — ") || "pièce";
              const st = PIECE_STATUS[p.status || ""] || "";
              const resolved = p.status === "recu"; // pièce reçue = réglée
              sigLines.push({ txt: `Pièce manquante : ${nfc(body)}${st ? ` (${st})` : ""}`, color: resolved ? SIG_DONE : SIG_COLORS.piece, kind: "piece", resolved });
            }
            for (const d of defauts) {
              if (!belongs(d.cabineLabel)) continue;
              const typ = (d.typesLabel || (d.types || []).join(", ") || "").trim();
              const desc = (d.description || "").trim();
              const body = [typ, desc].filter(Boolean).join(" — ") || "défaut";
              const avant = d.phase === "avant-intervention";
              const resolved = !!d.resolved;
              const prefix = avant ? "Constat avant intervention" : "Défaut";
              const suffix = resolved ? " (réglé)" : (avant ? "" : " (à traiter)");
              const baseColor = avant ? SIG_COLORS.avant : SIG_COLORS.defaut;
              sigLines.push({ txt: `${prefix} : ${nfc(body)}${suffix}`, color: resolved ? SIG_DONE : baseColor, kind: avant ? "avant" : "defaut", resolved });
            }
            return (
              <View key={n} style={styles.cab} wrap={false}>
                <View style={{ ...styles.num, backgroundColor: color }}>
                  <Text style={styles.numTxt}>{n}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <Text style={styles.cabName}>{nfc(nom)}</Text>
                    <Text style={{ ...styles.chip, backgroundColor: color }}>{STATE_LABEL[st]}</Text>
                    <View style={{ flex: 1 }} />
                    {dateHours ? <Text style={styles.meta}>{dateHours}</Text> : null}
                  </View>
                  {who ? <SubRow paths={IC.user} iconColor="#64748b"><Text style={styles.subLabel}>Monteur : </Text>{nfc(who)}</SubRow> : null}
                  {rapport ? <SubRow paths={IC.doc} iconColor={COLORS.navy}><Text style={styles.subLabel}>Rapport : </Text>{nfc(rapport)}</SubRow> : null}
                  {savLine ? <SubRow paths={IC.wrench} iconColor={savLine.color} textColor={savLine.color} bold>{savLine.txt}</SubRow> : null}
                  {sigLines.map((sg, i) => (
                    <SubRow key={i} paths={sg.resolved ? IC.check : sg.kind === "piece" ? IC.package : sg.kind === "avant" ? IC.eye : IC.shield} iconColor={sg.color} textColor={sg.color}>{sg.txt}</SubRow>
                  ))}
                </View>
              </View>
            );
          })}
        </View>

        <Text style={styles.footer} fixed>
          TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon | Tél : +41 79 555 24 74 | www.douche-montage.ch
        </Text>
      </Page>
    </Document>
  );
}

function asciiFilename(s: string): string {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "").replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return false;
  try { return !!(await verifyToken(token)); } catch { return false; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const s = sp.get("s") || "";
  const wantLink = sp.get("link") === "1";
  const secret = process.env.SHARE_LINK_KEY || "";

  const sigValid = (() => {
    if (!secret || !s) return false;
    const a = Buffer.from(s); const b = Buffer.from(signSynthese(id));
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  const authed = await isAuthed(req);

  if (wantLink) {
    if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!secret) return NextResponse.json({ error: "SHARE_LINK_KEY non configuré" }, { status: 503 });
    return NextResponse.json({ url: `${req.nextUrl.origin}/api/synthese/${encodeURIComponent(id)}?s=${signSynthese(id)}` });
  }
  if (!sigValid && !authed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const project = await getProject(id);
    // Signalements (pièces + défauts) du projet, depuis le KV store.
    const [allPieces, allDefauts] = await Promise.all([
      getData<Piece>("pieces").catch(() => [] as Piece[]),
      getData<Defaut>("defauts").catch(() => [] as Defaut[]),
    ]);
    const pieces = allPieces.filter((p) => p.projectId === id);
    const defauts = allDefauts.filter((d) => d.projectId === id);
    const pdfStream = await ReactPDF.renderToStream(<SynthesePDF project={project} pieces={pieces} defauts={defauts} />);
    const chunks: Buffer[] = [];
    // @ts-ignore - ReadableStream from react-pdf
    for await (const chunk of pdfStream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);

    const ofr = asciiFilename((project.ofrTM || "").replace(/-/g, " "));
    const filename = asciiFilename(`Suivi chantier - ${ofr} - ${project.projet || ""}`) + ".pdf";
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: "server_error", message: String(err?.message || err) }, { status: 500 });
  }
}
