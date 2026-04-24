import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getProjects } from "@/lib/notion";
import { formatSwissDate } from "@/lib/time-utils";
import { Resend } from "resend";
import ReactPDF, {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";
import { LOGO_BASE64 } from "@/lib/logo";
import { getData } from "@/lib/kv-store";

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

export const dynamic = "force-dynamic";

interface PieceRequest {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  description: string;
  reference: string;
  photoUrl: string;
  status: "demande" | "commande" | "recu";
  timestamp: number;
}

interface DefautRequest {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  types: string[];
  typesLabel: string;
  description: string;
  photoUrls: string[];
  status: "signale" | "en-cours" | "resolu";
  timestamp: number;
}

async function loadAllPieces(): Promise<PieceRequest[]> {
  return getData<PieceRequest>("pieces");
}

async function loadAllDefauts(): Promise<DefautRequest[]> {
  return getData<DefautRequest>("defauts");
}

function computeHours(heureArrivee: string, heureDepart: string): number {
  if (!heureArrivee || !heureDepart) return 0;
  // Handle multi-day format: "2024-01-15 Micael 08:00 | 2024-01-16 Claudio 09:00"
  if (heureArrivee.includes("|") || heureDepart.includes("|")) {
    const arrivals = heureArrivee.split("|").map((s) => s.trim());
    const departures = heureDepart.split("|").map((s) => s.trim());
    let totalMin = 0;
    for (let i = 0; i < Math.min(arrivals.length, departures.length); i++) {
      const aMatch = arrivals[i].match(/(\d{1,2}):(\d{2})/);
      const dMatch = departures[i].match(/(\d{1,2}):(\d{2})/);
      if (aMatch && dMatch) {
        const diff =
          (parseInt(dMatch[1]) * 60 + parseInt(dMatch[2])) -
          (parseInt(aMatch[1]) * 60 + parseInt(aMatch[2]));
        if (diff > 0) totalMin += diff;
      }
    }
    return totalMin / 60;
  }
  // Simple format: "08:00"
  const aMatch = heureArrivee.match(/(\d{1,2}):(\d{2})/);
  const dMatch = heureDepart.match(/(\d{1,2}):(\d{2})/);
  if (!aMatch || !dMatch) return 0;
  const diff =
    (parseInt(dMatch[1]) * 60 + parseInt(dMatch[2])) -
    (parseInt(aMatch[1]) * 60 + parseInt(aMatch[2]));
  return diff > 0 ? diff / 60 : 0;
}

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1a1a1a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: 2,
    borderBottomColor: "#1e3a5f",
  },
  title: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
  },
  subtitle: {
    fontSize: 10,
    color: "#666",
    marginTop: 2,
  },
  dateBox: {
    backgroundColor: "#f0f4f8",
    padding: 8,
    borderRadius: 4,
  },
  section: {
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#e0e0e0",
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 15,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#f0f4f8",
    padding: 12,
    borderRadius: 6,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
  },
  statLabel: {
    fontSize: 8,
    color: "#666",
    marginTop: 2,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1e3a5f",
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 2,
    marginBottom: 2,
  },
  tableHeaderText: {
    color: "#ffffff",
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tableRowAlt: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "#f9f9f9",
  },
  tableCell: {
    fontSize: 9,
    color: "#333",
  },
  alertBox: {
    backgroundColor: "#fff3cd",
    padding: 10,
    borderRadius: 4,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#ffc107",
  },
  alertText: {
    fontSize: 9,
    color: "#856404",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    fontSize: 7,
    color: "#888",
    borderTopWidth: 1,
    borderTopColor: "#ddd",
    paddingTop: 6,
    textAlign: "center",
  },
});

function RapportMensuelPDF({
  monthName,
  totalProjets,
  totalCabines,
  collabData,
  fournisseurData,
  tauxSoucis,
  nbSoucis,
  nbPieces,
  nbDefauts,
}: {
  monthName: string;
  totalProjets: number;
  totalCabines: number;
  collabData: { name: string; projets: number; cabines: number; heures: number }[];
  fournisseurData: { name: string; cabines: number }[];
  tauxSoucis: number;
  nbSoucis: number;
  nbPieces: number;
  nbDefauts: number;
}) {
  const now = formatSwissDate(Date.now());

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Logo */}
        <View style={{ alignItems: "center", marginBottom: 15 }}>
          <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Rapport mensuel</Text>
            <Text style={styles.subtitle}>{monthName}</Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={{ fontSize: 8, color: "#666" }}>Généré le</Text>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{now}</Text>
          </View>
        </View>

        {/* Stats principales */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalProjets}</Text>
            <Text style={styles.statLabel}>Projets en cours</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{totalCabines}</Text>
            <Text style={styles.statLabel}>Cabines installées</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{(tauxSoucis * 100).toFixed(0)}%</Text>
            <Text style={styles.statLabel}>Taux soucis montage</Text>
          </View>
        </View>

        {/* Alertes */}
        {(nbSoucis > 0 || nbPieces > 0 || nbDefauts > 0) && (
          <View style={styles.section}>
            <View style={styles.statsRow}>
              {nbSoucis > 0 && (
                <View style={styles.alertBox}>
                  <Text style={{ ...styles.alertText, fontFamily: "Helvetica-Bold" }}>
                    {nbSoucis} soucis montage
                  </Text>
                  <Text style={styles.alertText}>
                    sur {totalProjets} projets
                  </Text>
                </View>
              )}
              {nbPieces > 0 && (
                <View style={styles.alertBox}>
                  <Text style={{ ...styles.alertText, fontFamily: "Helvetica-Bold" }}>
                    {nbPieces} pièces manquantes
                  </Text>
                  <Text style={styles.alertText}>demandes en cours</Text>
                </View>
              )}
              {nbDefauts > 0 && (
                <View style={styles.alertBox}>
                  <Text style={{ ...styles.alertText, fontFamily: "Helvetica-Bold" }}>
                    {nbDefauts} défauts signalés
                  </Text>
                  <Text style={styles.alertText}>signalements actifs</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Par collaborateur */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détail par collaborateur</Text>
          <View style={styles.tableHeader}>
            <Text style={{ ...styles.tableHeaderText, width: "30%" }}>Collaborateur</Text>
            <Text style={{ ...styles.tableHeaderText, width: "20%", textAlign: "center" }}>Projets</Text>
            <Text style={{ ...styles.tableHeaderText, width: "25%", textAlign: "center" }}>Cabines</Text>
            <Text style={{ ...styles.tableHeaderText, width: "25%", textAlign: "center" }}>Heures</Text>
          </View>
          {collabData.map((c, i) => (
            <View key={c.name} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={{ ...styles.tableCell, width: "30%", fontFamily: "Helvetica-Bold" }}>
                {c.name}
              </Text>
              <Text style={{ ...styles.tableCell, width: "20%", textAlign: "center" }}>
                {c.projets}
              </Text>
              <Text style={{ ...styles.tableCell, width: "25%", textAlign: "center" }}>
                {c.cabines}
              </Text>
              <Text style={{ ...styles.tableCell, width: "25%", textAlign: "center" }}>
                {c.heures.toFixed(1)}h
              </Text>
            </View>
          ))}
          {/* Total row */}
          <View style={{ ...styles.tableRow, backgroundColor: "#f0f4f8", borderTopWidth: 2, borderTopColor: "#1e3a5f" }}>
            <Text style={{ ...styles.tableCell, width: "30%", fontFamily: "Helvetica-Bold", color: "#1e3a5f" }}>
              TOTAL
            </Text>
            <Text style={{ ...styles.tableCell, width: "20%", textAlign: "center", fontFamily: "Helvetica-Bold", color: "#1e3a5f" }}>
              {collabData.reduce((s, c) => s + c.projets, 0)}
            </Text>
            <Text style={{ ...styles.tableCell, width: "25%", textAlign: "center", fontFamily: "Helvetica-Bold", color: "#1e3a5f" }}>
              {collabData.reduce((s, c) => s + c.cabines, 0)}
            </Text>
            <Text style={{ ...styles.tableCell, width: "25%", textAlign: "center", fontFamily: "Helvetica-Bold", color: "#1e3a5f" }}>
              {collabData.reduce((s, c) => s + c.heures, 0).toFixed(1)}h
            </Text>
          </View>
        </View>

        {/* Par fournisseur */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cabines par fournisseur</Text>
          <View style={styles.tableHeader}>
            <Text style={{ ...styles.tableHeaderText, width: "60%" }}>Fournisseur</Text>
            <Text style={{ ...styles.tableHeaderText, width: "40%", textAlign: "center" }}>Cabines</Text>
          </View>
          {fournisseurData.map((f, i) => (
            <View key={f.name} style={i % 2 === 0 ? styles.tableRow : styles.tableRowAlt}>
              <Text style={{ ...styles.tableCell, width: "60%" }}>{f.name}</Text>
              <Text style={{ ...styles.tableCell, width: "40%", textAlign: "center", fontFamily: "Helvetica-Bold" }}>
                {f.cabines}
              </Text>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon | Tél : +41 79 555 24 74 | www.douche-montage.ch | info@douche-montage.ch
          </Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  try {
    const projects = await getProjects();
    const now = new Date();
    const monthName = formatSwissDate(now, { month: "long", year: "numeric" });

    // Stats
    const totalProjets = projects.length;
    const totalCabines = projects.reduce((s, p) => s + (p.nbCabines || 0), 0);

    // Soucis montage
    const nbSoucis = projects.filter((p) => p.soucisMontage).length;
    const tauxSoucis = totalProjets > 0 ? nbSoucis / totalProjets : 0;

    // Pièces manquantes & défauts
    const allPieces = await loadAllPieces();
    const allDefauts = await loadAllDefauts();
    const nbPieces = allPieces.length;
    const nbDefauts = allDefauts.length;

    // Par collaborateur
    const collabMap: Record<string, { projets: number; cabines: number; heures: number }> = {};
    projects.forEach((p) => {
      const c = p.collaborateurs || "Non assigné";
      if (!collabMap[c]) collabMap[c] = { projets: 0, cabines: 0, heures: 0 };
      collabMap[c].projets += 1;
      collabMap[c].cabines += p.nbCabines || 0;
      collabMap[c].heures += computeHours(p.heureArrivee, p.heureDepart);
    });
    const collabData = Object.entries(collabMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.cabines - a.cabines);

    // Par fournisseur
    const fournisseurMap: Record<string, number> = {};
    projects.forEach((p) => {
      p.fournisseurs.forEach((f) => {
        fournisseurMap[f] = (fournisseurMap[f] || 0) + (p.nbCabines || 1);
      });
    });
    const fournisseurData = Object.entries(fournisseurMap)
      .map(([name, cabines]) => ({ name, cabines }))
      .sort((a, b) => b.cabines - a.cabines);

    // Generate PDF
    const pdfStream = await ReactPDF.renderToStream(
      <RapportMensuelPDF
        monthName={monthName}
        totalProjets={totalProjets}
        totalCabines={totalCabines}
        collabData={collabData}
        fournisseurData={fournisseurData}
        tauxSoucis={tauxSoucis}
        nbSoucis={nbSoucis}
        nbPieces={nbPieces}
        nbDefauts={nbDefauts}
      />
    );

    const chunks: Buffer[] = [];
    // @ts-ignore - ReadableStream from react-pdf
    for await (const chunk of pdfStream) {
      chunks.push(Buffer.from(chunk));
    }
    const pdfBuffer = Buffer.concat(chunks);

    const filename = `rapport-mensuel-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}.pdf`;

    // Send email with PDF attachment
    await resend.emails.send({
      from: "TM Rapport Services <onboarding@resend.dev>",
      to: "ferreira.micael@gmail.com",
      subject: `Rapport mensuel TM - ${monthName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h1 style="color:#1e3a5f">Rapport mensuel</h1>
          <p style="color:#666">${monthName}</p>
          <p>Veuillez trouver ci-joint le rapport mensuel en PDF.</p>

          <div style="display:flex;gap:16px;margin:20px 0">
            <div style="flex:1;background:#f0f4f8;padding:16px;border-radius:8px;text-align:center">
              <p style="font-size:28px;font-weight:bold;color:#1e3a5f;margin:0">${totalProjets}</p>
              <p style="font-size:12px;color:#666;margin:4px 0 0">Projets en cours</p>
            </div>
            <div style="flex:1;background:#f0f4f8;padding:16px;border-radius:8px;text-align:center">
              <p style="font-size:28px;font-weight:bold;color:#1e3a5f;margin:0">${totalCabines}</p>
              <p style="font-size:12px;color:#666;margin:4px 0 0">Cabines</p>
            </div>
            <div style="flex:1;background:#f0f4f8;padding:16px;border-radius:8px;text-align:center">
              <p style="font-size:28px;font-weight:bold;color:#1e3a5f;margin:0">${(tauxSoucis * 100).toFixed(0)}%</p>
              <p style="font-size:12px;color:#666;margin:4px 0 0">Taux soucis</p>
            </div>
          </div>

          <p style="color:#666;font-size:13px">
            <strong>${nbPieces}</strong> pièces manquantes |
            <strong>${nbDefauts}</strong> défauts signalés |
            <strong>${nbSoucis}</strong> soucis montage
          </p>

          <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
          <p style="color:#999;font-size:11px">TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon<br />
          +41 79 555 24 74 | www.douche-montage.ch</p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: pdfBuffer.toString("base64"),
        },
      ],
    });

    return NextResponse.json({ success: true, message: "Rapport mensuel PDF envoyé" });
  } catch (error: any) {
    console.error("Rapport mensuel error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
