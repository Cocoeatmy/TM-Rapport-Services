/**
 * /api/fiche/[id]            → PDF « Fiche de travail »
 * /api/fiche/[id]?s=<sig>    → PDF public (lien calendrier), protégé par HMAC
 * /api/fiche/[id]?link=1     → JSON { url } : lien public signé (cookie admin requis)
 *
 * Même esthétique que le rapport de montage (@react-pdf/renderer, logo TM).
 * Route publique (middleware) mais protégée : signature HMAC (SHARE_LINK_KEY)
 * OU cookie d'authentification valide. Le lien signé sert aux calendriers.
 */
import { NextRequest, NextResponse } from "next/server";
import { getProject, type Project, type ContactDetail } from "@/lib/notion";
import { LOGO_BASE64 } from "@/lib/logo";
import { verifyToken } from "@/lib/auth";
import { signFiche, signPhotosZip } from "@/lib/doc-link";
import { formatSwissDate } from "@/lib/time-utils";
import { timingSafeEqual } from "crypto";
import ReactPDF, {
  Document,
  Page,
  Text,
  View,
  Image,
  Link,
  Svg,
  Path,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a" },
  header: {
    flexDirection: "column",
    marginBottom: 18,
    paddingBottom: 6,
    borderBottomWidth: 2,
    borderBottomColor: "#1e3a5f",
  },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 10 },
  reportBtn: {
    backgroundColor: "#1e3a5f",
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    textDecoration: "none",
    maxWidth: 175,
  },
  reportBtnText: { color: "#ffffff", fontSize: 9.5, fontFamily: "Helvetica-Bold", textAlign: "center" },
  tm: { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 6 },
  subtitle: { fontSize: 10, color: "#666", marginTop: 2 },
  section: { marginBottom: 14 },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: "#eee",
  },
  colHeader: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
    marginBottom: 4,
    paddingBottom: 2,
    borderBottomWidth: 0.5,
    borderBottomColor: "#ccc",
  },
  label: { width: 170, color: "#666", fontSize: 9 },
  value: { flex: 1, fontFamily: "Helvetica-Bold", fontSize: 9, color: "#1a1a1a" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 7,
    color: "#999",
    borderTopWidth: 0.5,
    borderTopColor: "#ddd",
    paddingTop: 6,
  },
});

function fmtDate(d?: string | null): string {
  if (!d) return "—";
  try { return formatSwissDate(d); } catch { return "—"; }
}
// Plage de dates : « 25 août 2026 → 26 août 2026 » si fin ≠ début, sinon 1 date.
function fmtDateRange(start?: string | null, end?: string | null): string {
  if (!start) return "—";
  const s = fmtDate(start);
  if (end && end.slice(0, 10) !== start.slice(0, 10)) return `${s} → ${fmtDate(end)}`;
  return s;
}
// NFC : recompose les accents décomposés (ex. o + ̂ → ô). Les titres Notion
// arrivent parfois en NFD, que la police Helvetica du PDF n'assemble pas
// (« Ilôt » s'affichait « Ilo t »).
function nfc(s: string): string {
  return (s || "").normalize("NFC");
}
function joinVal(v: unknown): string {
  if (Array.isArray(v)) return nfc(v.filter(Boolean).join(", ")) || "—";
  if (v === null || v === undefined || v === "") return "—";
  return nfc(String(v));
}
// "date — personne(s)" ; masque le séparateur si l'un manque.
function dateAndWho(date: string, who?: string): string {
  const parts = [date && date !== "—" ? date : "", (who || "").trim()].filter(Boolean);
  return parts.length ? nfc(parts.join(" — ")) : "—";
}

// Plage horaire de montage « 08:00–12:30 (4h30) » à partir de « Heure arrivée »
// et « Heure départ ». Tolère les préfixes par cabine (« CabN: », date).
function montageHoursStr(ha?: string | null, hd?: string | null): string {
  const timeOf = (raw?: string | null) => {
    const cleaned = (raw || "").replace(/Cab\d+\s*:/g, "").replace(/\d{4}-\d{2}-\d{2}:/g, "");
    const m = /(\d{1,2}):(\d{2})/.exec(cleaned);
    return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
  };
  const arr = timeOf(ha), dep = timeOf(hd);
  if (arr && dep) {
    const toMin = (t: string) => { const [a, b] = t.split(":").map(Number); return a * 60 + b; };
    const diff = toMin(dep) - toMin(arr);
    const dur = diff > 0 ? ` (${Math.floor(diff / 60)}h${String(diff % 60).padStart(2, "0")})` : "";
    return `${arr}–${dep}${dur}`;
  }
  return arr || dep || "";
}

// Cellule « libellé au-dessus, valeur en gras » (grilles Général & Contact).
function Cell({ label, value, width }: { label: string; value: string; width: string }) {
  return (
    <View style={{ width, paddingRight: 10, marginBottom: 6 }}>
      <Text style={{ fontSize: 8, color: "#888", marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>{value}</Text>
    </View>
  );
}
// Cellule Contact : entreprise (gras) + contacts (Nom Prénom / email / téléphone).
function ContactCell({ label, company, contacts, width }: { label: string; company?: string; contacts?: ContactDetail[]; width: string }) {
  const list = (contacts || []).filter((c) => c && (c.name || c.email || c.phone));
  const hasCompany = !!company && company !== "—" && company.trim() !== "";
  return (
    <View style={{ width, paddingRight: 10, marginBottom: 8 }}>
      <Text style={{ fontSize: 8, color: "#888", marginBottom: 2 }}>{label}</Text>
      {hasCompany ? (
        <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>{nfc(company!)}</Text>
      ) : null}
      {list.map((c, i) => (
        <View key={i} style={{ marginTop: 3 }}>
          {c.name ? <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>{nfc(c.name)}</Text> : null}
          {c.email ? <Text style={{ fontSize: 8, color: "#555" }}>{c.email}</Text> : null}
          {c.phone ? <Text style={{ fontSize: 8, color: "#555" }}>{c.phone}</Text> : null}
        </View>
      ))}
      {!hasCompany && list.length === 0 ? (
        <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>—</Text>
      ) : null}
    </View>
  );
}
// Petite flèche « téléchargement » (icône vectorielle).
function DownloadArrow() {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24">
      <Path d="M12 3 L12 15 M7 10 L12 15 L17 10 M5 20 L19 20" stroke="#1e3a5f" strokeWidth={2} fill="none" />
    </Svg>
  );
}
// Ligne « libellé à gauche, valeur à droite » (sections Lieu / Commande / RDV).
// docUrl : si fourni, ajoute une flèche cliquable à côté du libellé.
function LineRow({ label, value, docUrl }: { label: string; value: string; docUrl?: string }) {
  return (
    <View style={styles.row}>
      <View style={{ width: 170, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ color: "#666", fontSize: 9 }}>{label}</Text>
        {docUrl ? (
          <Link src={docUrl} style={{ marginLeft: 5, textDecoration: "none" }}>
            <DownloadArrow />
          </Link>
        ) : null}
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}
// Ligne avec barre de progression entre le libellé et la valeur.
function ProgressRow({ label, pct, caption, color, value, docUrl }: {
  label: string; pct: number; caption: string; color: string; value: string; docUrl?: string;
}) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.row}>
      <View style={{ width: 170, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ color: "#666", fontSize: 9 }}>{label}</Text>
        {docUrl ? (
          <Link src={docUrl} style={{ marginLeft: 5, textDecoration: "none" }}>
            <DownloadArrow />
          </Link>
        ) : null}
      </View>
      <View style={{ width: 105, marginRight: 10, justifyContent: "center" }}>
        <View style={{ height: 7, borderRadius: 4, backgroundColor: "#e5e7eb" }}>
          <View style={{ width: `${w}%`, height: 7, borderRadius: 4, backgroundColor: color }} />
        </View>
        <Text style={{ fontSize: 7, color: "#666", marginTop: 2 }}>{caption}</Text>
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function FichePDF({ project, mesuresDocUrl, montagePhotosUrl, savPhotosUrl, reportUrl }: { project: Project; mesuresDocUrl?: string; montagePhotosUrl?: string; savPhotosUrl?: string; reportUrl?: string }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête : logo + titre + n° projet (gros/gras) + nom du chantier.
            À droite : bouton vers le rapport de montage (upload photos + horaires). */}
        <View style={styles.header}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
            <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
            {reportUrl ? (
              <Link src={reportUrl} style={styles.reportBtn}>
                <Text style={styles.reportBtnText}>Ouvrir le rapport de montage</Text>
              </Link>
            ) : null}
          </View>
          <Text style={styles.title}>Fiche de travail</Text>
          <Text style={styles.tm}>{project.ofrTM || "TM-—"}</Text>
          {project.projet ? <Text style={styles.subtitle}>{nfc(project.projet)}</Text> : null}
        </View>

        {/* Lieu du rendez-vous */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Lieu du rendez-vous</Text>
          <LineRow label="Adresse chantier" value={joinVal(project.adresseChantier)} />
        </View>

        {/* Général — grille : (Nb cabines | Fournisseurs | Séries) puis
            (Emplacement | Nb cartons) alignés sous les colonnes du dessus. */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Général</Text>
          <View style={{ flexDirection: "row" }}>
            <Cell label="Nb. cabines" value={joinVal(project.nbCabines)} width="33%" />
            <Cell label="Fournisseurs" value={joinVal(project.fournisseurs)} width="34%" />
            <Cell label="Séries cabines" value={joinVal(project.seriesCabines)} width="33%" />
          </View>
          <View style={{ flexDirection: "row" }}>
            <Cell label="Emplacement de cabine" value={joinVal(project.emplacementCabine)} width="33%" />
            <Cell label="Nb. de cartons" value={joinVal(project.nbCartons)} width="34%" />
          </View>
        </View>

        {/* Numéro de commande — 3 colonnes : TM | Grossiste | Fournisseur */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Numéro de commande</Text>
          <View style={{ flexDirection: "row" }}>
            <View style={{ width: "33.33%", paddingRight: 12 }}>
              <Text style={styles.colHeader}>TM</Text>
              <Cell label="N° OFR TM" value={joinVal(project.ofrTM)} width="100%" />
              <Cell label="N° CMD TM" value={joinVal(project.cmdTM)} width="100%" />
              <Cell label="N° CMD TM - Usine" value={joinVal(project.cmdTMUsine)} width="100%" />
            </View>
            <View style={{ width: "33.33%", paddingRight: 12 }}>
              <Text style={styles.colHeader}>Grossiste</Text>
              <Cell label="N° OFR Grossiste" value={joinVal(project.ofrGrossiste)} width="100%" />
              <Cell label="N° CMD Grossiste" value={joinVal(project.cmdGrossiste)} width="100%" />
            </View>
            <View style={{ width: "33.34%" }}>
              <Text style={styles.colHeader}>Fournisseur</Text>
              <Cell label="N° CMD Fournisseur" value={joinVal(project.cmdFournisseurs)} width="100%" />
              <Cell label="N° Mesures Fournisseurs" value={joinVal(project.servMesuresFournisseurs)} width="100%" />
              <Cell label="N° Montage Fournisseurs" value={joinVal(project.servCmdFournisseurs)} width="100%" />
            </View>
          </View>
        </View>

        {/* Rendez-vous */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Rendez-vous</Text>
          {/* Mesures : barre 100% dès qu'une date existe ; sinon l'état, sans barre.
              Flèche → galerie des documents montage. */}
          {project.dateMesures ? (
            <ProgressRow
              label="Mesures"
              pct={100}
              caption="100%"
              color="#15803d"
              value={dateAndWho(fmtDate(project.dateMesures), project.mesuresTraiteePar)}
              docUrl={mesuresDocUrl}
            />
          ) : (
            <LineRow
              label="Mesures"
              value={dateAndWho(joinVal(project.etatMesures), project.mesuresTraiteePar)}
              docUrl={mesuresDocUrl}
            />
          )}
          {/* Montage : progression cabines installées / total. Comme l'app, on
              compte les cabines ayant au moins une photo « montage » (nom de
              fichier encodant .Cab{N}.), pas le champ Notion (souvent vide). */}
          {(() => {
            const total = project.nbCabines || 0;
            const montagePhotos = project.photosMontage || [];
            const installedIdx = new Set(
              montagePhotos
                .map((f: { name?: string }) => {
                  const m = (f.name || "").match(/\.Cab(\d+)\./);
                  return m ? parseInt(m[1], 10) : null;
                })
                .filter((n): n is number => n !== null),
            );
            let installed = installedIdx.size;
            // Repli : les projets mono-cabine (et anciens) stockent les photos
            // montage SANS préfixe .CabN. → le comptage par index donne 0.
            // On se rabat sur le compteur Notion, sinon sur « mono avec photos ».
            if (installed === 0) {
              if (project.nbCabinesInstallees && project.nbCabinesInstallees > 0) {
                installed = Math.min(project.nbCabinesInstallees, total || project.nbCabinesInstallees);
              } else if (total === 1 && montagePhotos.length > 0) {
                installed = 1;
              }
            }
            const pct = total > 0 ? Math.round((installed / total) * 100) : 0;
            const hours = montageHoursStr(project.heureArrivee, project.heureDepart);
            const value = dateAndWho(fmtDateRange(project.dateMontage, project.dateMontageEnd), project.collaborateurs)
              + (hours ? `  ·  ${hours}` : "");
            if (total <= 0) return <LineRow label="Montage" value={value} docUrl={montagePhotosUrl} />;
            return (
              <ProgressRow
                label="Montage"
                pct={pct}
                caption={`${installed}/${total} · ${pct}%`}
                color={pct >= 100 ? "#15803d" : "#2563eb"}
                value={value}
                docUrl={montagePhotosUrl}
              />
            );
          })()}
          <LineRow label="SAV" value={dateAndWho(fmtDate(project.dateRDVSAV), project.collaborateursSAV)} docUrl={savPhotosUrl} />
          <LineRow label="Garantie" value={dateAndWho(fmtDate(project.dateRDVGarantie), project.collaborateurGarantie)} />
          <LineRow label="Services" value="à venir" />
        </View>

        {/* Contact — colonnes (comme la fiche fournisseur) */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <ContactCell label="GROSSISTE" company={joinVal(project.grossistesNames)} contacts={project.contactsGrossisteDetails} width="33.33%" />
            <ContactCell label="INSTALLATEUR" company={joinVal(project.sanitaireNames)} contacts={project.contactsSanitaireDetails} width="33.33%" />
            <ContactCell label="ARCHITECTE" company={joinVal(project.architecteNames)} contacts={project.contactsArchitecteDetails} width="33.33%" />
            <ContactCell label="DT" company={joinVal(project.dtNames)} contacts={project.contactsDTDetails} width="33.33%" />
            <ContactCell label="CLIENT FINAL" contacts={project.contactsClientsFinauxDetails} width="33.33%" />
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
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function isAuthed(req: NextRequest): Promise<boolean> {
  const token = req.cookies.get("auth-token")?.value;
  if (!token) return false;
  try { return !!(await verifyToken(token)); } catch { return false; }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;
  const s = sp.get("s") || "";
  const wantLink = sp.get("link") === "1";

  const secret = process.env.SHARE_LINK_KEY || "";
  const sigValid = (() => {
    if (!secret || !s) return false;
    const expected = signFiche(id);
    const a = Buffer.from(s);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  })();
  const authed = await isAuthed(req);

  // Mode « donne-moi le lien signé » (bouton Copier le lien) — réservé aux connectés.
  if (wantLink) {
    if (!authed) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!secret) return NextResponse.json({ error: "SHARE_LINK_KEY non configuré" }, { status: 503 });
    const origin = req.nextUrl.origin;
    return NextResponse.json({ url: `${origin}/api/fiche/${encodeURIComponent(id)}?s=${signFiche(id)}` });
  }

  // Accès PDF : signature valide (lien calendrier) OU cookie admin.
  if (!sigValid && !authed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    const project = await getProject(id);
    // Flèche du PDF → page-galerie listant TOUS les documents « Documents pour
    // Montage » (signée, ouvrable sans login). Affichée seulement s'il y en a.
    const mesuresDocUrl =
      (project.documentsMontagee || []).length > 0
        ? `${req.nextUrl.origin}/api/fiche/${encodeURIComponent(id)}/docs?s=${signFiche(id)}`
        : undefined;
    // Flèches de téléchargement du ZIP des photos (liens signés, publics).
    const zipUrl = (field: string) =>
      `${req.nextUrl.origin}/api/photos/${encodeURIComponent(id)}/download?field=${field}&s=${signPhotosZip(id, field)}`;
    const montagePhotosUrl = (project.photosMontage || []).length > 0 ? zipUrl("photosMontage") : undefined;
    const savPhotosUrl = (project.photosSavRetouches || []).length > 0 ? zipUrl("photosSavRetouches") : undefined;
    // Lien vers la page du rapport de montage (upload photos + horaires).
    const reportUrl = `${req.nextUrl.origin}/projet/${encodeURIComponent(id)}`;
    const pdfStream = await ReactPDF.renderToStream(<FichePDF project={project} mesuresDocUrl={mesuresDocUrl} montagePhotosUrl={montagePhotosUrl} savPhotosUrl={savPhotosUrl} reportUrl={reportUrl} />);
    const chunks: Buffer[] = [];
    // @ts-ignore - ReadableStream from react-pdf
    for await (const chunk of pdfStream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);

    const ofr = asciiFilename((project.ofrTM || "").replace(/-/g, " "));
    const filename = asciiFilename(`Fiche de travail - ${ofr} - ${project.projet || ""}`) + ".pdf";

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        // inline → le lien calendrier ouvre le PDF dans le navigateur.
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "server_error", message: String(err?.message || err) },
      { status: 500 },
    );
  }
}
