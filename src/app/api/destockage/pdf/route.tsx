import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData } from "@/lib/kv-store";
import { LOGO_BASE64 } from "@/lib/logo";
import { formatSwissDateTime } from "@/lib/time-utils";
import ReactPDF, {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";

interface StockCabine {
  id: string;
  serie: string;
  fournisseur: string;
  quantity: number;
  emplacement: string;
  dateArrivee: string;
  commentaires: string;
  status: "stock" | "destocke";
  destockedAt: string;
  destockedBy: string;
  destockedProjectRef: string;
  createdAt: number;
  createdBy: string;
  photoCabine?: string;
  mesuresCabinePdf?: string;
  mesuresCabinePdfName?: string;
  configuration?: string[];
  version?: string[];
  typeVerre?: string[];
  traitementVerre?: string[];
  couleur?: string[];
  prixAchat?: number;
  prixVente?: number;
  mesuresApprox?: string;
  numeroArticle?: string;
  typeMontage?: string[];
}

// ── Couleurs ─────────────────────────────────────────────────────────────────
const NAVY   = "#1e3a5f";
const ACCENT = "#2563eb";
const LIGHT  = "#f0f4f8";
const BORDER = "#e2e8f0";
const GRAY   = "#64748b";
const DARK   = "#1a1a2e";

// ── Styles ────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    padding: 36,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: DARK,
    backgroundColor: "#ffffff",
  },
  // Header
  logoWrap: { alignItems: "center", marginBottom: 14 },
  logo: { width: 160, height: 24 },
  headerBar: {
    backgroundColor: NAVY,
    borderRadius: 6,
    padding: "10 16",
    marginBottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  headerSub:   { fontSize: 8,  color: "#93c5fd" },
  headerDate:  { fontSize: 7,  color: "#bfdbfe", textAlign: "right" },
  // Two-column body
  body: { flexDirection: "row", gap: 16, marginBottom: 12 },
  colPhoto: { width: "38%", flexShrink: 0 },
  colInfo:  { flex: 1 },
  photo: {
    width: "100%",
    height: 200,
    objectFit: "cover",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 8,
  },
  photoPlaceholder: {
    width: "100%",
    height: 200,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  photoPlaceholderText: { fontSize: 8, color: GRAY },
  statusBadge: {
    borderRadius: 4,
    padding: "3 8",
    alignSelf: "flex-start",
  },
  // Info rows
  infoBlock: {
    backgroundColor: LIGHT,
    borderRadius: 6,
    padding: "10 12",
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: "row",
    paddingVertical: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  infoRowLast: { flexDirection: "row", paddingTop: 3 },
  infoLabel: { width: 100, fontSize: 8, color: GRAY },
  infoValue: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold", color: DARK },
  // Prix highlight
  prixBox: {
    backgroundColor: NAVY,
    borderRadius: 6,
    padding: "10 12",
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  prixLabel: { fontSize: 8, color: "#93c5fd" },
  prixValue: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#ffffff" },
  // Characteristics
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: NAVY,
    marginBottom: 6,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  charGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 10 },
  charGroup: { marginBottom: 8 },
  charGroupLabel: { fontSize: 7, color: GRAY, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.3 },
  chip: {
    borderRadius: 12,
    padding: "3 8",
    fontSize: 8,
    marginRight: 3,
    marginBottom: 3,
  },
  // Commentaires
  commentBox: {
    backgroundColor: "#fffbeb",
    borderRadius: 6,
    padding: "8 10",
    borderWidth: 1,
    borderColor: "#fde68a",
    marginBottom: 10,
  },
  commentLabel: { fontSize: 7, color: "#92400e", fontFamily: "Helvetica-Bold", marginBottom: 3 },
  commentText:  { fontSize: 8, color: "#78350f", lineHeight: 1.5 },
  // Footer
  footer: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerLeft:  { fontSize: 7, color: GRAY },
  footerRight: { fontSize: 7, color: GRAY },
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(d: string) {
  if (!d) return "—";
  const [y, m, dd] = d.split("T")[0].split("-");
  return `${dd}.${m}.${y}`;
}
function fmtPrix(n?: number) {
  if (n == null) return null;
  return `CHF ${n.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function optimizeUrl(url: string) {
  if (!url) return url;
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/w_500,q_70,f_jpg/");
  }
  return url;
}

type ChipDef = { label: string; bg: string; color: string };

function ChipRow({ items, bg, color }: { items: string[]; bg: string; color: string }) {
  if (!items?.length) return null;
  return (
    <>
      {items.map((t, i) => (
        <Text key={i} style={{ ...S.chip, backgroundColor: bg, color }}>{t}</Text>
      ))}
    </>
  );
}

// ── PDF Component ─────────────────────────────────────────────────────────────
function FicheCabinePDF({ entry, now }: { entry: StockCabine; now: string }) {
  const hasPhoto = !!entry.photoCabine;
  const prixVente = fmtPrix(entry.prixVente);

  const charSections: Array<{ label: string; items: string[]; bg: string; color: string }> = [
    { label: "Configuration",     items: entry.configuration  || [], bg: "#ede9fe", color: "#5b21b6" },
    { label: "Type de montage",   items: entry.typeMontage    || [], bg: "#dbeafe", color: "#1e40af" },
    { label: "Version",           items: entry.version        || [], bg: "#e0f2fe", color: "#0369a1" },
    { label: "Type de verre",     items: entry.typeVerre      || [], bg: "#cffafe", color: "#0e7490" },
    { label: "Traitement verre",  items: entry.traitementVerre|| [], bg: "#dcfce7", color: "#166534" },
    { label: "Couleur / Finition",items: entry.couleur        || [], bg: "#fef3c7", color: "#92400e" },
  ].filter(s => s.items.length > 0);

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Logo */}
        <View style={S.logoWrap}>
          <Image src={LOGO_BASE64} style={S.logo} />
        </View>

        {/* Header bar */}
        <View style={S.headerBar}>
          <View>
            <Text style={S.headerTitle}>Fiche Cabine</Text>
            <Text style={S.headerSub}>{entry.serie}{entry.fournisseur ? ` · ${entry.fournisseur}` : ""}</Text>
          </View>
          <View>
            <Text style={S.headerDate}>Généré le {now}</Text>
            <Text style={{ ...S.headerDate, color: "#ffffff", fontFamily: "Helvetica-Bold", fontSize: 8 }}>
              {entry.status === "stock" ? "🟢 En stock" : "⚫ Déstocké"}
            </Text>
          </View>
        </View>

        {/* Corps : photo + infos */}
        <View style={S.body}>
          {/* Colonne gauche : photo */}
          <View style={S.colPhoto}>
            {hasPhoto ? (
              <Image src={optimizeUrl(entry.photoCabine!)} style={S.photo} />
            ) : (
              <View style={S.photoPlaceholder}>
                <Text style={S.photoPlaceholderText}>Aucune photo</Text>
              </View>
            )}
            {entry.quantity > 1 && (
              <View style={{ backgroundColor: ACCENT, borderRadius: 4, padding: "4 8", alignSelf: "flex-start" }}>
                <Text style={{ fontSize: 9, color: "#fff", fontFamily: "Helvetica-Bold" }}>× {entry.quantity} unités</Text>
              </View>
            )}
          </View>

          {/* Colonne droite : informations */}
          <View style={S.colInfo}>
            {/* Prix de vente en premier — mis en valeur */}
            {prixVente && (
              <View style={S.prixBox}>
                <View>
                  <Text style={S.prixLabel}>Prix de vente</Text>
                  <Text style={S.prixValue}>{prixVente}</Text>
                </View>
                {entry.prixAchat != null && (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ fontSize: 7, color: "#93c5fd" }}>Prix d&apos;achat</Text>
                    <Text style={{ fontSize: 10, color: "#bfdbfe", fontFamily: "Helvetica-Bold" }}>{fmtPrix(entry.prixAchat)}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Données techniques */}
            <View style={S.infoBlock}>
              {entry.serie && (
                <View style={S.infoRow}>
                  <Text style={S.infoLabel}>Série</Text>
                  <Text style={S.infoValue}>{entry.serie}</Text>
                </View>
              )}
              {entry.fournisseur && (
                <View style={S.infoRow}>
                  <Text style={S.infoLabel}>Fournisseur</Text>
                  <Text style={S.infoValue}>{entry.fournisseur}</Text>
                </View>
              )}
              {entry.numeroArticle && (
                <View style={S.infoRow}>
                  <Text style={S.infoLabel}>N° article</Text>
                  <Text style={S.infoValue}>{entry.numeroArticle}</Text>
                </View>
              )}
              {entry.mesuresApprox && (
                <View style={S.infoRow}>
                  <Text style={S.infoLabel}>Mesures</Text>
                  <Text style={S.infoValue}>{entry.mesuresApprox}</Text>
                </View>
              )}
              {entry.emplacement && (
                <View style={S.infoRow}>
                  <Text style={S.infoLabel}>Emplacement</Text>
                  <Text style={S.infoValue}>{entry.emplacement}</Text>
                </View>
              )}
              {entry.dateArrivee && (
                <View style={S.infoRowLast}>
                  <Text style={S.infoLabel}>Date d&apos;arrivée</Text>
                  <Text style={S.infoValue}>{fmt(entry.dateArrivee)}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Caractéristiques */}
        {charSections.length > 0 && (
          <View style={{ marginBottom: 10 }}>
            <Text style={S.sectionTitle}>Caractéristiques</Text>
            {charSections.map((s, si) => (
              <View key={si} style={S.charGroup} wrap={false}>
                <Text style={S.charGroupLabel}>{s.label}</Text>
                <View style={S.charGrid}>
                  {s.items.map((t, ti) => (
                    <Text key={ti} style={{ ...S.chip, backgroundColor: s.bg, color: s.color }}>{t}</Text>
                  ))}
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Commentaires */}
        {entry.commentaires && (
          <View style={S.commentBox} wrap={false}>
            <Text style={S.commentLabel}>Commentaires</Text>
            <Text style={S.commentText}>{entry.commentaires}</Text>
          </View>
        )}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerLeft}>
            TM Douche Montage · Champs-Lovat 13 Box n°16, 1400 Yverdon · +41 79 555 24 74 · info@douche-montage.ch
          </Text>
          <Text style={S.footerRight}>
            {entry.serie} · {fmt(entry.dateArrivee)}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const entryId = request.nextUrl.searchParams.get("id");
  if (!entryId) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const all = await getData<StockCabine>("destockage");
  const entry = all.find((e) => e.id === entryId);
  if (!entry) return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });

  const now = formatSwissDateTime(Date.now());

  try {
    const pdfStream = await ReactPDF.renderToStream(
      <FicheCabinePDF entry={entry} now={now} />
    );

    const chunks: Buffer[] = [];
    for await (const chunk of pdfStream as AsyncIterable<Uint8Array>) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const filename = `Fiche-Cabine_${entry.serie}_${entry.fournisseur || "Stock"}.pdf`
      .normalize("NFC")
      .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ &+.,'-]/g, "_")
      .replace(/__+/g, "_");

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erreur PDF";
    console.error("Destockage PDF error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
