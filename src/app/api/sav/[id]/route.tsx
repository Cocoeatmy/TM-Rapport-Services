/**
 * /api/sav/[id]            → PDF « Rapport SAV » (par cabine)
 * /api/sav/[id]?s=<sig>    → PDF public (lien), protégé par HMAC (signSav)
 * /api/sav/[id]?link=1     → JSON { url } : lien public signé (cookie admin requis)
 *
 * Même esthétique que le rapport de montage. Photos/vidéos CLIQUABLES →
 * téléchargement (Cloudinary fl_attachment).
 */
import { NextRequest, NextResponse } from "next/server";
import { getProject, type Project, type ContactDetail } from "@/lib/notion";
import { LOGO_BASE64 } from "@/lib/logo";
import { verifyToken } from "@/lib/auth";
import { signSav } from "@/lib/doc-link";
import { formatSwissDate } from "@/lib/time-utils";
import { timingSafeEqual } from "crypto";
import ReactPDF, {
  Document, Page, Text, View, Image, Link, Svg, Path, StyleSheet,
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
function nfc(s: string) { return (s || "").normalize("NFC"); }
function fmtDate(d?: string | null) { try { return d ? formatSwissDate(d) : ""; } catch { return ""; } }
// Photos d'un champ appartenant à la cabine N (nom de fichier « .CabN. »).
function photosForCab(files: { name?: string; url: string }[] | undefined, cab: number) {
  return (files || []).filter((f) => {
    const m = (f.name || "").match(/\.Cab(\d+)\./);
    return m ? parseInt(m[1], 10) === cab : false;
  });
}
function isVideoUrl(u: string) { return u.includes("/video/upload/") || /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u); }
function isPdfUrl(u: string) { return /\.pdf(\?|$)/i.test(u); }
// URL de TÉLÉCHARGEMENT (fl_attachment force Content-Disposition: attachment).
function downloadUrl(u: string) {
  if (u.includes("res.cloudinary.com")) return u.replace("/upload/", "/upload/fl_attachment/");
  return u;
}
// Aperçu image (compressé) / poster vidéo.
function previewUrl(u: string) {
  if (isVideoUrl(u)) {
    const i = u.indexOf("/video/upload/");
    if (i < 0) return u;
    const after = u.slice(i + "/video/upload/".length).replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg");
    return `${u.slice(0, i + "/video/upload/".length)}so_0,w_500,c_fill,q_auto/${after}`;
  }
  if (u.includes("res.cloudinary.com") && u.includes("/upload/")) return u.replace("/upload/", "/upload/w_600,q_60,f_jpg/");
  return u;
}

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a" },
  header: { flexDirection: "column", marginBottom: 16, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: "#b45309" },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#b45309", marginTop: 10 },
  reportBtn: { backgroundColor: "#b45309", borderRadius: 6, paddingVertical: 7, paddingHorizontal: 12, textDecoration: "none", maxWidth: 175 },
  reportBtnText: { color: "#ffffff", fontSize: 9.5, fontFamily: "Helvetica-Bold", textAlign: "center" },
  tm: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 6 },
  subtitle: { fontSize: 10, color: "#666", marginTop: 2 },
  cabTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#b45309" },
  cabSub: { fontSize: 9, color: "#666", marginTop: 1 },
  row: { flexDirection: "row", paddingVertical: 3 },
  label: { width: 140, color: "#666", fontSize: 9 },
  value: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#1a1a1a" },
  photoLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#444", marginTop: 6, marginBottom: 4 },
  photoRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  cabBlock: { marginBottom: 14, paddingBottom: 10, borderBottomWidth: 0.5, borderBottomColor: "#ddd" },
  badgeOpen: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#b45309" },
  badgeClosed: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#15803d" },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7, color: "#999", borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 6 },
});

function DownloadArrow() {
  return (
    <Svg width={9} height={9} viewBox="0 0 24 24">
      <Path d="M12 3 L12 15 M7 10 L12 15 L17 10 M5 20 L19 20" stroke="#1e3a5f" strokeWidth={2} fill="none" />
    </Svg>
  );
}

// Vignette cliquable → télécharge la photo/vidéo. Vidéo : poster + ▶. PDF : tuile.
function MediaThumb({ url }: { url: string }) {
  const video = isVideoUrl(url);
  if (isPdfUrl(url)) {
    // PDF : lien direct (SANS fl_attachment — les fichiers `raw` renvoient 401
    // avec une transformation quand le compte a les transformations strictes).
    return (
      <Link src={url} style={{ width: 110, height: 82, textDecoration: "none" }}>
        <View style={{ width: 110, height: 82, borderRadius: 4, borderWidth: 1, borderColor: "#fca5a5", backgroundColor: "#fef2f2", alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#dc2626", fontSize: 14, fontFamily: "Helvetica-Bold" }}>PDF</Text>
          <Text style={{ color: "#b91c1c", fontSize: 7, marginTop: 3 }}>cliquer pour ouvrir</Text>
        </View>
      </Link>
    );
  }
  return (
    <Link src={downloadUrl(url)} style={{ width: 110, height: 82, textDecoration: "none" }}>
      <View style={{ width: 110, height: 82, position: "relative" }}>
        <Image src={previewUrl(url)} style={{ width: 110, height: 82, objectFit: "cover", borderRadius: 4 }} />
        {video ? (
          <View style={{ position: "absolute", top: 30, left: 46, width: 20, height: 20, backgroundColor: "#000000", opacity: 0.55, borderRadius: 10 }}>
            <Text style={{ color: "#fff", fontSize: 11, textAlign: "center", marginTop: 3 }}>▶</Text>
          </View>
        ) : null}
      </View>
    </Link>
  );
}

function joinNames(arr?: string[]): string { return arr && arr.length ? arr.map((s) => nfc(s)).join(", ") : ""; }
// Cellule Contact : entreprise (gras) + contacts (Nom / email / téléphone).
function ContactCell({ label, company, contacts }: { label: string; company?: string; contacts?: ContactDetail[] }) {
  const list = (contacts || []).filter((c) => c && (c.name || c.email || c.phone));
  const hasCompany = !!company && company.trim() !== "";
  return (
    <View style={{ width: "33.33%", paddingRight: 10, marginBottom: 8 }}>
      <Text style={{ fontSize: 7.5, color: "#888", marginBottom: 2 }}>{label}</Text>
      {hasCompany ? <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>{company}</Text> : null}
      {list.map((c, i) => (
        <View key={i} style={{ marginTop: 3 }}>
          {c.name ? <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>{nfc(c.name)}</Text> : null}
          {c.email ? <Text style={{ fontSize: 7.5, color: "#555" }}>{c.email}</Text> : null}
          {c.phone ? <Text style={{ fontSize: 7.5, color: "#555" }}>{c.phone}</Text> : null}
        </View>
      ))}
      {!hasCompany && list.length === 0 ? <Text style={{ fontSize: 9.5, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>—</Text> : null}
    </View>
  );
}

function SavPDF({ project, collabFilter = "", cabineFilter = 0, reportBaseUrl = "" }: { project: Project; collabFilter?: string; cabineFilter?: number; reportBaseUrl?: string }) {
  const total = project.nbCabines || 0;
  const names = parseCabMulti(project.nomsCabines);
  const attribution = parseCabMulti(project.attributionCabines);
  const sousTrait = parseCabMulti(project.monteursSousTraitance);
  const montageDates = parseCabDates(project.heureArrivee);
  const reclam = parseCabMulti(project.commentairesSav);
  const cause = parseCabMulti(project.causeSavCabines);
  const dateRdv = parseCabMulti(project.datesRdvSavCabines);
  const collab = parseCabMulti(project.collaborateursSavCabines);
  const cloture = parseCabMulti(project.datesSavClotureCabines);
  const fait = parseCabMulti(project.savRetouchesCabines);
  const dateRecu = parseCabMulti(project.dateSAVRecu); // par cabine (texte)

  const cabHasSav = (n: number) =>
    !!(reclam[n] || cause[n] || dateRdv[n] || collab[n] || fait[n]
      || photosForCab(project.documentsSavDemande, n).length || photosForCab(project.photosSavRetouches, n).length);

  // Filtre par monteur / sous-traitant : ne garde que les lots dont il s'occupe.
  const norm = (x: string) => nfc(x || "").toLowerCase().trim();
  const wantCollab = norm(collabFilter);
  const belongsTo = (n: number) => {
    if (!wantCollab) return true;
    const monteurs = (attribution[n] || "").split("&").map(norm).filter(Boolean);
    return monteurs.includes(wantCollab) || norm(sousTrait[n]) === wantCollab;
  };

  const savCabs: number[] = [];
  for (let n = 1; n <= total; n++) {
    if (!cabHasSav(n) || !belongsTo(n)) continue;
    if (cabineFilter && n !== cabineFilter) continue;
    savCabs.push(n);
  }

  // Titre orange tant qu'un SAV rendu n'est pas clôturé ; vert si tous clôturés.
  const allClosed = savCabs.length > 0 && savCabs.every((n) => !!(cloture[n] || "").slice(0, 10));
  const titleColor = allClosed ? "#15803d" : "#b45309";

  return (
    <Document>
      <Page size="A4" style={{ ...styles.page, paddingBottom: 50 }}>
        <View style={{ ...styles.header, borderBottomColor: titleColor }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
            {reportBaseUrl ? (
              <Link src={`${reportBaseUrl}&savCabine=${cabineFilter || savCabs[0] || 1}`} style={styles.reportBtn}>
                <Text style={styles.reportBtnText}>Ouvrir le rapport SAV</Text>
              </Link>
            ) : null}
          </View>
          <Text style={{ ...styles.title, color: titleColor }}>Rapport SAV{allClosed ? " — clôturé" : ""}</Text>
          <Text style={styles.tm}>{project.ofrTM || "TM-—"}</Text>
          {project.projet ? <Text style={styles.subtitle}>{nfc(project.projet)}</Text> : null}
          {collabFilter ? <Text style={{ ...styles.subtitle, fontFamily: "Helvetica-Bold", color: "#b45309" }}>SAV de {nfc(collabFilter)}</Text> : null}
          {!cabineFilter ? <Text style={styles.subtitle}>{savCabs.length} SAV{collabFilter ? "" : ` / ${total} cabine${total > 1 ? "s" : ""}`}</Text> : null}
        </View>

        {savCabs.length === 0 ? (
          <Text style={{ fontSize: 11, color: "#888" }}>Aucun SAV enregistré pour ce projet.</Text>
        ) : savCabs.map((n) => {
          const nom = names[n] || `Cabine ${n}`;
          // Monteur : par cabine (multi) sinon collaborateurs du projet (mono).
          const who = attribution[n] || sousTrait[n] || project.collaborateurs || "";
          // Date de montage : par cabine (multi) sinon date du projet (mono).
          const montage = montageDates[n] || (project.dateMontage || "").slice(0, 10);
          const closedDate = (cloture[n] || "").slice(0, 10);
          const demandePhotos = photosForCab(project.documentsSavDemande, n);
          const reglePhotos = photosForCab(project.photosSavRetouches, n);
          return (
            <View key={n} style={styles.cabBlock} wrap={false}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <View>
                  <Text style={styles.cabTitle}>{nfc(nom)}</Text>
                </View>
                {closedDate
                  ? <Text style={styles.badgeClosed}>Clôturé le {closedDate.split("-").reverse().join(".")}</Text>
                  : <Text style={styles.badgeOpen}>SAV en cours</Text>}
              </View>

              {montage ? (
                <View style={styles.row}><Text style={styles.label}>Date de montage</Text><Text style={styles.value}>{fmtDate(montage) || montage}</Text></View>
              ) : null}
              {who ? (
                <View style={styles.row}><Text style={styles.label}>Collaborateur de montage</Text><Text style={styles.value}>{nfc(who)}</Text></View>
              ) : null}
              {(() => {
                const recu = (dateRecu[n] || "").slice(0, 10);
                if (!recu) return null;
                // Nombre de jours écoulés entre le montage et la réception du SAV.
                let delai = "";
                if (montage) {
                  const d = Math.round((new Date(recu + "T12:00:00").getTime() - new Date(montage + "T12:00:00").getTime()) / 86400000);
                  if (!isNaN(d) && d >= 0) delai = ` (${d} jour${d > 1 ? "s" : ""})`;
                }
                return (
                  <View style={styles.row}><Text style={styles.label}>Date de réception SAV</Text><Text style={styles.value}>{(fmtDate(recu) || recu) + delai}</Text></View>
                );
              })()}

              {reclam[n] ? (
                <View style={styles.row}><Text style={styles.label}>Réclamation</Text><Text style={styles.value}>{nfc(reclam[n])}</Text></View>
              ) : null}
              {cause[n] ? (
                <View style={styles.row}><Text style={styles.label}>Cause</Text><Text style={styles.value}>{nfc(cause[n])}</Text></View>
              ) : null}
              {dateRdv[n] ? (
                <View style={styles.row}><Text style={styles.label}>Date intervention</Text><Text style={styles.value}>{fmtDate(dateRdv[n].slice(0, 10)) || dateRdv[n]}</Text></View>
              ) : null}
              {collab[n] ? (
                <View style={styles.row}><Text style={styles.label}>Collaborateur(s)</Text><Text style={styles.value}>{nfc(collab[n])}</Text></View>
              ) : null}
              {fait[n] ? (
                <View style={styles.row}><Text style={styles.label}>Ce qui a été fait</Text><Text style={styles.value}>{nfc(fait[n])}</Text></View>
              ) : null}

              {demandePhotos.length > 0 ? (
                <View>
                  <Text style={styles.photoLabel}>Documents de la demande ({demandePhotos.length}) — cliquer pour télécharger <DownloadArrow /></Text>
                  <View style={styles.photoRow}>{demandePhotos.map((f, i) => <MediaThumb key={i} url={f.url} />)}</View>
                </View>
              ) : null}
              {reglePhotos.length > 0 ? (
                <View>
                  <Text style={styles.photoLabel}>Photos une fois réglé ({reglePhotos.length}) — cliquer pour télécharger <DownloadArrow /></Text>
                  <View style={styles.photoRow}>{reglePhotos.map((f, i) => <MediaThumb key={i} url={f.url} />)}</View>
                </View>
              ) : null}
            </View>
          );
        })}

        {/* Contact — même présentation que la fiche de travail. */}
        <View style={{ marginTop: 14, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: "#ddd" }} wrap={false}>
          <Text style={{ fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginBottom: 6 }}>Contact</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <ContactCell label="GROSSISTE" company={joinNames(project.grossistesNames)} contacts={project.contactsGrossisteDetails} />
            <ContactCell label="INSTALLATEUR" company={joinNames(project.sanitaireNames)} contacts={project.contactsSanitaireDetails} />
            <ContactCell label="ARCHITECTE" company={joinNames(project.architecteNames)} contacts={project.contactsArchitecteDetails} />
            <ContactCell label="DT" company={joinNames(project.dtNames)} contacts={project.contactsDTDetails} />
            <ContactCell label="CLIENT FINAL" contacts={project.contactsClientsFinauxDetails} />
          </View>
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
  const collab = (sp.get("collab") || "").trim();
  const cabine = parseInt(sp.get("cabine") || "0", 10) || 0;
  const wantLink = sp.get("link") === "1";
  const secret = process.env.SHARE_LINK_KEY || "";

  const sigValid = (() => {
    if (!secret || !s) return false;
    const a = Buffer.from(s); const b = Buffer.from(signSav(id, collab));
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  const authed = await isAuthed(req);

  if (wantLink) {
    if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!secret) return NextResponse.json({ error: "SHARE_LINK_KEY non configuré" }, { status: 503 });
    const q = collab ? `?s=${signSav(id, collab)}&collab=${encodeURIComponent(collab)}` : `?s=${signSav(id)}`;
    return NextResponse.json({ url: `${req.nextUrl.origin}/api/sav/${encodeURIComponent(id)}${q}` });
  }
  if (!sigValid && !authed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const project = await getProject(id);
    const reportBaseUrl = `${req.nextUrl.origin}/projet/${encodeURIComponent(id)}?mode=dashboard`;
    const stream = await ReactPDF.renderToStream(<SavPDF project={project} collabFilter={collab} cabineFilter={cabine} reportBaseUrl={reportBaseUrl} />);
    const chunks: Buffer[] = [];
    // @ts-ignore
    for await (const c of stream) chunks.push(Buffer.from(c));
    const buffer = Buffer.concat(chunks);
    const ofr = asciiFilename((project.ofrTM || "").replace(/-/g, " "));
    const filename = asciiFilename(`Rapport SAV - ${ofr}${collab ? " - " + collab : ` - ${project.projet || ""}`}`) + ".pdf";
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
