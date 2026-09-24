/**
 * /api/arrivage/[id]            → PDF « Rapport d'arrivage »
 * /api/arrivage/[id]?s=<sig>    → PDF public (lien signé, signArrivage)
 * /api/arrivage/[id]?link=1     → JSON { url } : lien public signé (cookie requis)
 *
 * Même esthétique que les autres rapports (logo/titre en haut, contacts en bas).
 * Contenu : arrivage Dépôt TM, nb cartons, bon de livraison, photos des cartons
 * reçus, état des cartons (dégâts), commentaire livraison.
 */
import { NextRequest, NextResponse } from "next/server";
import { getProject, type Project, type ContactDetail } from "@/lib/notion";
import { LOGO_BASE64 } from "@/lib/logo";
import { verifyToken } from "@/lib/auth";
import { signArrivage } from "@/lib/doc-link";
import { formatSwissDate } from "@/lib/time-utils";
import { timingSafeEqual } from "crypto";
import ReactPDF, {
  Document, Page, Text, View, Image, Link, Svg, Path, StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ACCENT = "#0891b2"; // cyan/teal — couleur propre au rapport d'arrivage

function nfc(s: string) { return (s || "").normalize("NFC"); }
function fmtDate(d?: string | null) { try { return d ? formatSwissDate(d) : ""; } catch { return ""; } }
function isVideoUrl(u: string) { return u.includes("/video/upload/") || /\.(mp4|mov|webm|m4v|avi)(\?|$)/i.test(u); }
function downloadUrl(u: string) { return u.includes("res.cloudinary.com") ? u.replace("/upload/", "/upload/fl_attachment/") : u; }
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
function joinNames(arr?: string[]): string { return arr && arr.length ? arr.map((s) => nfc(s)).join(", ") : ""; }
function joinVal(v: unknown): string {
  if (Array.isArray(v)) return nfc(v.filter(Boolean).join(", ")) || "—";
  if (v === null || v === undefined || v === "") return "—";
  return nfc(String(v));
}

const styles = StyleSheet.create({
  page: { padding: 40, paddingBottom: 50, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a" },
  header: { marginBottom: 16, paddingBottom: 6, borderBottomWidth: 2, borderBottomColor: ACCENT },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: ACCENT, marginTop: 8 },
  tm: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 4 },
  subtitle: { fontSize: 10, color: "#666", marginTop: 2 },
  section: { marginBottom: 14 },
  sectionTitle: { fontSize: 12, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginBottom: 6, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: "#e0e0e0" },
  row: { flexDirection: "row", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#eee" },
  label: { width: 200, color: "#666", fontSize: 9 },
  value: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#1a1a1a" },
  photoLabel: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginBottom: 4 },
  photo: { width: 110, height: 82, objectFit: "cover", borderRadius: 4 },
  footer: { position: "absolute", bottom: 24, left: 40, right: 40, textAlign: "center", fontSize: 7, color: "#999", borderTopWidth: 0.5, borderTopColor: "#ddd", paddingTop: 6 },
});

// Vignette téléchargeable (image/vidéo) avec badge play + téléchargement.
function MediaThumb({ url }: { url: string }) {
  const video = isVideoUrl(url);
  return (
    <Link src={downloadUrl(url)} style={{ width: 110, height: 82, textDecoration: "none" }}>
      <View style={{ width: 110, height: 82, position: "relative" }}>
        <Image src={previewUrl(url)} style={styles.photo} />
        {video ? (
          <View style={{ position: "absolute", top: 29, left: 44, width: 22, height: 22, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 11, alignItems: "center", justifyContent: "center" }}>
            <Svg width={11} height={11} viewBox="0 0 24 24"><Path d="M7 4 L20 12 L7 20 Z" fill="#ffffff" /></Svg>
          </View>
        ) : null}
        <View style={{ position: "absolute", bottom: 3, right: 3, width: 16, height: 16, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 8, alignItems: "center", justifyContent: "center" }}>
          <Svg width={9} height={9} viewBox="0 0 24 24"><Path d="M12 3 L12 15 M7 10 L12 15 L17 10 M5 20 L19 20" stroke="#ffffff" strokeWidth={2.4} fill="none" /></Svg>
        </View>
      </View>
    </Link>
  );
}
// Grille de vignettes par rangées de 4, chaque rangée insécable (saut de page).
function PhotoGrid({ photos, label }: { photos: { url: string }[]; label: string }) {
  const rows: { url: string }[][] = [];
  for (let i = 0; i < photos.length; i += 4) rows.push(photos.slice(i, i + 4));
  return (
    <>
      {rows.map((row, ri) => (
        <View key={ri} wrap={false} style={{ marginBottom: 6 }}>
          {ri === 0 ? <Text style={styles.photoLabel}>{label} ({photos.length}) — cliquer pour télécharger</Text> : null}
          <View style={{ flexDirection: "row", gap: 6 }}>
            {row.map((f, i) => <MediaThumb key={i} url={f.url} />)}
          </View>
        </View>
      ))}
    </>
  );
}

function ContactCell({ label, company, contacts }: { label: string; company?: string; contacts?: ContactDetail[] }) {
  const list = (contacts || []).filter((c) => c && (c.name || c.email || c.phone));
  const hasCompany = !!company && company.trim() !== "";
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

function ArrivagePDF({ project }: { project: Project }) {
  const cartonsRecus = project.photosCartonsRecus || [];
  const cartonsEtat = project.photosCartons || [];
  const bonLivraison = project.photosBonLivraison || [];
  const commentaire = nfc(project.commentaireLivraison || "").trim();
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
          <Text style={styles.title}>Rapport d&apos;arrivage</Text>
          <Text style={styles.tm}>{project.ofrTM || "TM-—"}</Text>
          {project.projet ? <Text style={styles.subtitle}>{nfc(project.projet)}</Text> : null}
          {project.adresseChantier ? <Text style={styles.subtitle}>{joinVal(project.adresseChantier)}</Text> : null}
        </View>

        {/* Livraison */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Livraison</Text>
          <View style={styles.row}><Text style={styles.label}>Date d&apos;arrivage Dépôt TM</Text><Text style={styles.value}>{fmtDate(project.arrivageTM) || "—"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Date d&apos;arrivage Grossiste</Text><Text style={styles.value}>{fmtDate(project.arrivageGrossiste) || "—"}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Nb. de cartons</Text><Text style={styles.value}>{joinVal(project.nbCartons)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Nb. cabines</Text><Text style={styles.value}>{joinVal(project.nbCabines)}</Text></View>
          {commentaire ? (
            <View style={{ paddingVertical: 4 }}>
              <Text style={{ color: "#666", fontSize: 9, marginBottom: 2 }}>Commentaire livraison</Text>
              <Text style={{ fontSize: 9, color: "#1a1a1a" }}>{commentaire}</Text>
            </View>
          ) : null}
        </View>

        {bonLivraison.length > 0 ? (
          <View style={styles.section}>
            <PhotoGrid photos={bonLivraison} label="Bon de livraison" />
          </View>
        ) : null}

        {cartonsRecus.length > 0 ? (
          <View style={styles.section}>
            <PhotoGrid photos={cartonsRecus} label="Photos des cartons réceptionnés" />
          </View>
        ) : null}

        {cartonsEtat.length > 0 ? (
          <View style={styles.section}>
            <PhotoGrid photos={cartonsEtat} label="État des cartons réceptionnés (dégâts)" />
          </View>
        ) : null}

        {/* Contact */}
        <View style={{ marginTop: 14 }} wrap={false}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <ContactCell label="GROSSISTE" company={joinNames(project.grossistesNames)} contacts={project.contactsGrossisteDetails} />
            <ContactCell label="INSTALLATEUR" company={joinNames(project.sanitaireNames)} contacts={project.contactsSanitaireDetails} />
            <ContactCell label="ARCHITECTE" company={joinNames(project.architecteNames)} contacts={project.contactsArchitecteDetails} />
            <ContactCell label="DT" company={joinNames(project.dtNames)} contacts={project.contactsDTDetails} />
            <ContactCell label="CLIENT FINAL" contacts={project.contactsClientsFinauxDetails} />
            <ContactCell label="LOCATAIRES" contacts={project.contactsLocatairesDetails} />
          </View>
        </View>

        <Text style={styles.footer} fixed>
          TM Douche Montage | Champs-Lovat 13 Box n°2 & 3, 1400 Yverdon-les-Bains | Tél : +41 79 555 24 74 | www.douche-montage.ch | info@douche-montage.ch
        </Text>
      </Page>
    </Document>
  );
}

function asciiFilename(s: string): string {
  return (s || "").normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[–—]/g, "-")
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
    const a = Buffer.from(s); const b = Buffer.from(signArrivage(id));
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  const authed = await isAuthed(req);

  if (wantLink) {
    if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!secret) return NextResponse.json({ error: "SHARE_LINK_KEY non configuré" }, { status: 503 });
    return NextResponse.json({ url: `${req.nextUrl.origin}/api/arrivage/${encodeURIComponent(id)}?s=${signArrivage(id)}` });
  }
  if (!sigValid && !authed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  try {
    const project = await getProject(id);
    const stream = await ReactPDF.renderToStream(<ArrivagePDF project={project} />);
    const chunks: Buffer[] = [];
    // @ts-ignore
    for await (const c of stream) chunks.push(Buffer.from(c));
    const buffer = Buffer.concat(chunks);
    const ofr = asciiFilename((project.ofrTM || "").replace(/-/g, " "));
    const filename = asciiFilename(`Rapport arrivage - ${ofr} - ${project.projet || ""}`) + ".pdf";
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
