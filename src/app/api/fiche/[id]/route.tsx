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
import { getProject, type Project } from "@/lib/notion";
import { LOGO_BASE64 } from "@/lib/logo";
import { verifyToken } from "@/lib/auth";
import { signFiche } from "@/lib/doc-link";
import { formatSwissDate } from "@/lib/time-utils";
import { timingSafeEqual } from "crypto";
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
  subtitle: { fontSize: 10, color: "#666", marginTop: 4 },
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
function joinVal(v: unknown): string {
  if (Array.isArray(v)) return v.filter(Boolean).join(", ") || "—";
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
}
// "date — personne(s)" ; masque le séparateur si l'un manque.
function dateAndWho(date: string, who?: string): string {
  const parts = [date && date !== "—" ? date : "", (who || "").trim()].filter(Boolean);
  return parts.length ? parts.join(" — ") : "—";
}

function FichePDF({ project }: { project: Project }) {
  const sections: { title: string; rows: [string, string][] }[] = [
    {
      title: "Général",
      rows: [
        ["Nb. cabines", joinVal(project.nbCabines)],
        ["Fournisseurs", joinVal(project.fournisseurs)],
        ["Séries cabines", joinVal(project.seriesCabines)],
        ["Nb. de cartons", joinVal(project.nbCartons)],
        ["Emplacement de cabine", joinVal(project.emplacementCabine)],
      ],
    },
    {
      title: "Rendez-vous",
      rows: [
        ["Mesures", dateAndWho(fmtDate(project.dateMesures), project.mesuresTraiteePar)],
        ["Montage", dateAndWho(fmtDate(project.dateMontage), project.collaborateurs)],
        ["SAV", dateAndWho(fmtDate(project.dateRDVSAV), project.collaborateursSAV)],
        ["Garantie", dateAndWho(fmtDate(project.dateRDVGarantie), project.collaborateurGarantie)],
        ["Services", "à venir"],
      ],
    },
    {
      title: "Lieu du rendez-vous",
      rows: [["Adresse chantier", joinVal(project.adresseChantier)]],
    },
    {
      title: "Numéro de commande",
      rows: [
        ["Mesures fournisseur", joinVal(project.servMesuresFournisseurs)],
        ["Montage fournisseur", joinVal(project.servCmdFournisseurs)],
      ],
    },
    {
      title: "Contact",
      rows: [
        ["Grossiste", joinVal(project.grossistesNames)],
        ["Installateur", "—"],
        ["Architecte", "—"],
        ["DT", "—"],
        ["Client final", "—"],
      ],
    },
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
          <Text style={styles.title}>Fiche de travail</Text>
          <Text style={styles.subtitle}>
            {project.ofrTM || "TM-—"}{project.projet ? `  ·  ${project.projet}` : ""}
          </Text>
        </View>

        {sections.map((s) => (
          <View key={s.title} style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            {s.rows.map(([label, value]) => (
              <View key={label} style={styles.row}>
                <Text style={styles.label}>{label}</Text>
                <Text style={styles.value}>{value}</Text>
              </View>
            ))}
          </View>
        ))}

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
    const pdfStream = await ReactPDF.renderToStream(<FichePDF project={project} />);
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
