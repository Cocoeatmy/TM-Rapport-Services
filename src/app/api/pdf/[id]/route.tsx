import { NextRequest, NextResponse } from "next/server";
import { getProject } from "@/lib/notion";
import { LOGO_BASE64 } from "@/lib/logo";
import { sendPdfByEmail } from "@/lib/email";
import { verifyToken } from "@/lib/auth";
import ReactPDF, {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";

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
  row: {
    flexDirection: "row",
    paddingVertical: 3,
  },
  label: {
    width: 140,
    color: "#666",
    fontSize: 9,
  },
  value: {
    flex: 1,
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
  },
  timeRow: {
    flexDirection: "row",
    gap: 20,
  },
  timeBox: {
    flex: 1,
    backgroundColor: "#f0f4f8",
    padding: 10,
    borderRadius: 4,
    alignItems: "center",
  },
  timeLabel: {
    fontSize: 8,
    color: "#666",
    marginBottom: 2,
  },
  timeValue: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: "#1e3a5f",
  },
  textBlock: {
    backgroundColor: "#fafafa",
    padding: 10,
    borderRadius: 4,
    lineHeight: 1.5,
  },
  photosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  photoContainer: {
    width: "48%",
    marginBottom: 8,
  },
  photo: {
    width: "100%",
    height: 150,
    objectFit: "cover",
    borderRadius: 4,
  },
  photoLabel: {
    fontSize: 7,
    color: "#999",
    marginTop: 2,
    textAlign: "center",
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
  footerRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 4,
  },
  badge: {
    backgroundColor: "#e8f0fe",
    color: "#1e3a5f",
    padding: "2 6",
    borderRadius: 3,
    fontSize: 8,
    marginRight: 4,
    marginBottom: 4,
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Non défini";
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function optimizeImageUrl(url: string): string {
  if (!url) return url;
  // Cloudinary: insérer transformation pour compresser
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/w_600,q_60,f_jpg/");
  }
  // Notion S3: ajouter rien (pas modifiable)
  return url;
}

function RapportPDF({ project }: { project: any }) {
  const now = new Date().toLocaleDateString("fr-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Logo centré */}
        <View style={{ alignItems: "center", marginBottom: 15 }}>
          <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{project.projet}</Text>
            <Text style={styles.subtitle}>Rapport de montage</Text>
          </View>
          <View style={styles.dateBox}>
            <Text style={{ fontSize: 8, color: "#666" }}>Généré le</Text>
            <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold" }}>{now}</Text>
          </View>
        </View>

        {/* Informations projet */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Informations projet</Text>
          <View style={styles.row}>
            <Text style={styles.label}>N° OFR TM</Text>
            <Text style={styles.value}>{project.ofrTM || "---"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Chantier</Text>
            <Text style={styles.value}>{project.nomChantier || "---"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Adresse chantier</Text>
            <Text style={styles.value}>{project.adresseChantier || "---"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Nb. Cabines</Text>
            <Text style={styles.value}>{project.nbCabines ?? "---"}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date de montage</Text>
            <Text style={styles.value}>{formatDate(project.dateMontage)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Collaborateurs</Text>
            <Text style={styles.value}>{project.collaborateurs || "---"}</Text>
          </View>
          {(project.fournisseurs?.length > 0 || project.seriesCabines?.length > 0) && (
            <View style={{ paddingVertical: 3 }}>
              {project.fournisseurs?.length > 0 && (
                <View>
                  <Text style={styles.label}>Fournisseurs</Text>
                  <View style={styles.badgesRow}>
                    {project.fournisseurs.map((f: string) => (
                      <Text key={f} style={styles.badge}>{f}</Text>
                    ))}
                  </View>
                </View>
              )}
              {project.seriesCabines?.length > 0 && (
                <View>
                  <Text style={styles.label}>Séries Cabines</Text>
                  <View style={styles.badgesRow}>
                    {project.seriesCabines.map((s: string) => (
                      <Text key={s} style={styles.badge}>{s}</Text>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Horaires */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Horaires</Text>
          <View style={styles.timeRow}>
            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>Arrivée</Text>
              <Text style={styles.timeValue}>{project.heureArrivee || "--:--"}</Text>
            </View>
            <View style={styles.timeBox}>
              <Text style={styles.timeLabel}>Départ</Text>
              <Text style={styles.timeValue}>{project.heureDepart || "--:--"}</Text>
            </View>
          </View>
        </View>

        {/* Rapport */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Commentaires & Rapport</Text>
          {project.commentairesMontages && (
            <View style={{ marginBottom: 8 }}>
              <Text style={{ fontSize: 8, color: "#666", marginBottom: 3 }}>
                Commentaires montage
              </Text>
              <View style={styles.textBlock}>
                <Text>{project.commentairesMontages}</Text>
              </View>
            </View>
          )}
          {project.rapportMonteur && (
            <View>
              <Text style={{ fontSize: 8, color: "#666", marginBottom: 3 }}>
                Rapport du monteur
              </Text>
              <View style={styles.textBlock}>
                <Text>{project.rapportMonteur}</Text>
              </View>
            </View>
          )}
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon | Tél : +41 79 555 24 74 | www.douche-montage.ch | info@douche-montage.ch</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>

      {/* Photos pages */}
      {(project.photosAvant?.length > 0 ||
        project.photosMontage?.length > 0 ||
        project.photosQRCode?.length > 0 ||
        project.photosGaranties?.length > 0) && (
        <Page size="A4" style={{ ...styles.page, paddingBottom: 50 }} wrap>
          <Text style={styles.sectionTitle} fixed>Photos du chantier</Text>

          {project.photosAvant?.length > 0 && (
            <View style={styles.section} wrap={false}>
              <Text style={{ ...styles.label, marginBottom: 6 }}>Avant montage</Text>
              <View style={styles.photosGrid}>
                {project.photosAvant.map((p: any, i: number) => (
                  <View key={i} style={styles.photoContainer}>
                    <Image src={optimizeImageUrl(p.url)} style={styles.photo} />
                    <Text style={styles.photoLabel}>{p.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {project.photosMontage?.length > 0 && (
            <View style={styles.section} wrap={false}>
              <Text style={{ ...styles.label, marginBottom: 6 }}>Montage terminé</Text>
              <View style={styles.photosGrid}>
                {project.photosMontage.map((p: any, i: number) => (
                  <View key={i} style={styles.photoContainer}>
                    <Image src={optimizeImageUrl(p.url)} style={styles.photo} />
                    <Text style={styles.photoLabel}>{p.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {project.photosQRCode?.length > 0 && (
            <View style={styles.section} wrap={false}>
              <Text style={{ ...styles.label, marginBottom: 6 }}>QR Code</Text>
              <View style={styles.photosGrid}>
                {project.photosQRCode.map((p: any, i: number) => (
                  <View key={i} style={styles.photoContainer}>
                    <Image src={optimizeImageUrl(p.url)} style={styles.photo} />
                  </View>
                ))}
              </View>
            </View>
          )}

          {project.photosGaranties?.length > 0 && (
            <View style={styles.section} wrap={false}>
              <Text style={{ ...styles.label, marginBottom: 6 }}>Garanties</Text>
              <View style={styles.photosGrid}>
                {project.photosGaranties.map((p: any, i: number) => (
                  <View key={i} style={styles.photoContainer}>
                    <Image src={optimizeImageUrl(p.url)} style={styles.photo} />
                  </View>
                ))}
              </View>
            </View>
          )}

          <View style={styles.footer} fixed>
            <Text>TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon | Tél : +41 79 555 24 74 | www.douche-montage.ch | info@douche-montage.ch</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}
    </Document>
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await getProject(id);

    const pdfStream = await ReactPDF.renderToStream(
      <RapportPDF project={project} />
    );

    const chunks: Buffer[] = [];
    // @ts-ignore - ReadableStream from react-pdf
    for await (const chunk of pdfStream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const filename = `rapport-${project.ofrTM || project.projet || "montage"}.pdf`
      .replace(/[^a-zA-Z0-9.-]/g, "_");

    // Envoyer le PDF par email automatiquement
    const token = request.cookies.get("auth-token")?.value;
    let collaborateur = "Inconnu";
    let collaborateurEmail = "";
    if (token) {
      const user = await verifyToken(token);
      if (user) {
        collaborateur = user.name;
        collaborateurEmail = user.email;
      }
    }

    // Envoi email en arrière-plan (ne bloque pas le téléchargement)
    sendPdfByEmail({
      projectName: project.projet,
      ofrTM: project.ofrTM,
      collaborateur,
      collaborateurEmail,
      pdfBuffer: buffer,
    }).then((result) => {
      if (result.success) {
        console.log(`Email envoyé pour ${project.ofrTM}`);
      } else {
        console.error(`Erreur email: ${result.error}`);
      }
    });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("PDF generation error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur PDF" },
      { status: 500 }
    );
  }
}
