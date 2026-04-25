import { NextRequest, NextResponse } from "next/server";
import { getProject, type Project } from "@/lib/notion";
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
import { getData } from "@/lib/kv-store";
import { formatSwissDate, formatSwissDateTime } from "@/lib/time-utils";
import {
  type PhotoBucketKey,
  BUCKET_LABEL,
  BUCKET_ORDER,
  defaultBucketForField,
  detectBucket,
  extractCabine,
} from "@/lib/photo-buckets";

interface PieceRequest {
  id: string;
  projectId: string;
  projectName: string;
  user: string;
  description: string;
  reference: string;
  photoUrl?: string;
  photoUrls?: string[];
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
  displayInRapport?: boolean;
}

function parsePiecesFromNotion(text: string): PieceRequest[] {
  if (!text.trim()) return [];
  return text.split("\n").filter(Boolean).map((line, i) => {
    const desc = line.match(/Description:\s*([^|]*)/)?.[1]?.trim() || "";
    const ref = line.match(/Référence:\s*([^|]*)/)?.[1]?.trim() || "";
    const status = (line.match(/Statut:\s*([^|]*)/)?.[1]?.trim() || "demande") as PieceRequest["status"];
    const user = line.match(/Par:\s*([^|]*)/)?.[1]?.trim() || "";
    return {
      id: `notion-piece-${i}`,
      projectId: "",
      projectName: "",
      user,
      description: desc,
      reference: ref,
      photoUrl: "",
      status,
      timestamp: 0,
    };
  });
}

function parseDefautsFromNotion(text: string): DefautRequest[] {
  if (!text.trim()) return [];
  return text.split("\n").filter(Boolean).map((line, i) => {
    const typesStr = line.match(/Types:\s*([^|]*)/)?.[1]?.trim() || "";
    const types = typesStr.split(",").map(t => t.trim()).filter(Boolean);
    const desc = line.match(/Description:\s*([^|]*)/)?.[1]?.trim() || "";
    const user = line.match(/Par:\s*([^|]*)/)?.[1]?.trim() || "";
    return {
      id: `notion-defaut-${i}`,
      projectId: "",
      projectName: "",
      user,
      types,
      typesLabel: typesStr,
      description: desc,
      photoUrls: [],
      status: "signale" as DefautRequest["status"],
      timestamp: 0,
    };
  });
}

async function loadPiecesForProject(projectId: string, project?: Project): Promise<PieceRequest[]> {
  // Try Notion fields first
  if (project?.infoPiecesManquantes) {
    const parsed = parsePiecesFromNotion(project.infoPiecesManquantes);
    // Distribute all Notion photos evenly across pieces
    if (project.photosPiecesManquantes.length > 0 && parsed.length > 0) {
      const allPhotoUrls = project.photosPiecesManquantes.map((f) => f.url);
      if (parsed.length === 1) {
        // All photos belong to the single piece
        parsed[0].photoUrls = allPhotoUrls;
      } else {
        // Distribute photos across pieces (round-robin by index)
        parsed.forEach((p, i) => {
          const piecePhotos = allPhotoUrls.filter((_, pi) => pi % parsed.length === i);
          if (piecePhotos.length > 0) p.photoUrls = piecePhotos;
        });
      }
    }
    if (parsed.length > 0) return parsed;
  }
  // Fallback to kv-store
  const all = await getData<PieceRequest>("pieces");
  return all.filter((p) => p.projectId === projectId);
}

async function loadDefautsForProject(projectId: string, project?: Project): Promise<DefautRequest[]> {
  // KV-store en priorité : c'est la seule source qui contient les
  // métadonnées per-défaut (status, displayInRapport, comments). On
  // filtre côté serveur les défauts marqués "ne pas afficher" pour
  // qu'ils n'apparaissent jamais dans le rapport client.
  const kv = await getData<DefautRequest>("defauts");
  const fromKv = kv.filter((d) => d.projectId === projectId && d.displayInRapport !== false);
  if (fromKv.length > 0) return fromKv;
  // Fallback : si rien en KV (p.ex. défauts saisis directement dans
  // Notion), on parse le texte concaténé de la colonne "Infos -
  // Défauts signalé". Ces entrées-là sont toujours affichées (pas de
  // métadonnée displayInRapport disponible).
  if (project?.infoDefautsSignale) {
    const parsed = parseDefautsFromNotion(project.infoDefautsSignale);
    if (project.photosDefautsSignale.length > 0 && parsed.length > 0) {
      const photosPerDefaut = Math.ceil(project.photosDefautsSignale.length / Math.max(parsed.length, 1));
      parsed.forEach((d, i) => {
        const start = i * photosPerDefaut;
        const end = Math.min(start + photosPerDefaut, project.photosDefautsSignale.length);
        d.photoUrls = project.photosDefautsSignale.slice(start, end).map((f) => f.url);
      });
    }
    return parsed;
  }
  return [];
}

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
    height: 240,
    objectFit: "contain",
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
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1e3a5f",
    paddingVertical: 6,
    paddingHorizontal: 4,
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
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tableRowAlt: {
    flexDirection: "row",
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    backgroundColor: "#f9f9f9",
  },
  tableCell: {
    fontSize: 8,
    color: "#333",
  },
  statusBadge: {
    fontSize: 7,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
    textAlign: "center",
  },
  statusDemande: {
    backgroundColor: "#fff3cd",
    color: "#856404",
  },
  statusCommande: {
    backgroundColor: "#cce5ff",
    color: "#004085",
  },
  statusRecu: {
    backgroundColor: "#d4edda",
    color: "#155724",
  },
  statusSignale: {
    backgroundColor: "#f8d7da",
    color: "#721c24",
  },
  statusEnCours: {
    backgroundColor: "#fff3cd",
    color: "#856404",
  },
  statusResolu: {
    backgroundColor: "#d4edda",
    color: "#155724",
  },
  defautCard: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    borderRadius: 4,
    padding: 8,
  },
  defautHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  defautTypes: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  defautTypeBadge: {
    backgroundColor: "#fce4ec",
    color: "#c62828",
    fontSize: 7,
    paddingVertical: 2,
    paddingHorizontal: 5,
    borderRadius: 3,
  },
  defautDescription: {
    fontSize: 9,
    color: "#333",
    marginBottom: 6,
    lineHeight: 1.4,
  },
  defautPhotosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  defautPhoto: {
    width: 120,
    height: 90,
    objectFit: "contain",
    borderRadius: 3,
  },
  piecePhoto: {
    width: 160,
    height: 120,
    objectFit: "contain",
    borderRadius: 3,
    marginRight: 6,
    marginBottom: 6,
  },
  emptyMessage: {
    fontSize: 9,
    color: "#999",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 20,
  },
});

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Non défini";
  // Force Europe/Zurich pour éviter les off-by-one au voisinage de
  // minuit UTC (un montage stocké "2026-04-28T00:30:00+02:00" =
  // "2026-04-27T22:30:00Z" s'afficherait "27 avril" sans timezone).
  return formatSwissDate(dateStr);
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

function pieceStatusLabel(status: string): string {
  switch (status) {
    case "demande": return "Demandé";
    case "commande": return "Commandé";
    case "recu": return "Reçu";
    default: return status;
  }
}

function defautStatusLabel(status: string): string {
  switch (status) {
    case "signale": return "Signalé";
    case "en-cours": return "En cours";
    case "resolu": return "Résolu";
    default: return status;
  }
}

function getPieceStatusStyle(status: string) {
  switch (status) {
    case "demande": return styles.statusDemande;
    case "commande": return styles.statusCommande;
    case "recu": return styles.statusRecu;
    default: return {};
  }
}

function getDefautStatusStyle(status: string) {
  switch (status) {
    case "signale": return styles.statusSignale;
    case "en-cours": return styles.statusEnCours;
    case "resolu": return styles.statusResolu;
    default: return {};
  }
}

function RapportPDF({ project, pieces, defauts }: { project: any; pieces: PieceRequest[]; defauts: DefautRequest[] }) {
  // "Généré le" = instant de génération du PDF (et PAS la date de
  // montage qui serait trompeuse — le label dit bien "Généré"). Le
  // serveur Vercel tourne en UTC, il faut forcer Europe/Zurich pour
  // que l'heure affichée corresponde à l'heure locale en Suisse.
  const now = formatSwissDateTime(Date.now());

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
          {/* N° CMD Services — uniquement pour les clients Grossistes
              et Fournisseurs (ils nous envoient leur propre numéro de
              commande qui doit apparaître sur le rapport de montage).
              Le champ s'appelle "N° Serv. CMD Fournisseurs" dans Notion
              mais on le présente comme "N° CMD Services" ici. */}
          {(project.typeClient === "Grossistes" || project.typeClient === "Grossiste"
            || project.typeClient === "Fournisseurs" || project.typeClient === "Fournisseur") && (
            <View style={styles.row}>
              <Text style={styles.label}>N° CMD Services</Text>
              <Text style={styles.value}>{project.servCmdFournisseurs || "---"}</Text>
            </View>
          )}
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
          {(() => {
            // Détection du format multi-cabine "Cab1:08:00 | Cab2:09:30 | ..."
            // Si trouvé, on affiche une ligne par cabine au lieu d'une paire
            // globale — demande utilisateur pour les chantiers multi-cabine.
            const parseCab = (raw: string): Record<number, string> => {
              const map: Record<number, string> = {};
              if (!raw) return map;
              const re = /Cab(\d+)\s*:\s*(\d{1,2}:\d{2})/g;
              let m: RegExpExecArray | null;
              while ((m = re.exec(raw))) map[parseInt(m[1], 10) - 1] = m[2];
              return map;
            };
            const arriveeMap = parseCab(project.heureArrivee || "");
            const departMap = parseCab(project.heureDepart || "");
            const nb = project.nbCabines || 0;
            const isMultiCabineTimes = nb > 1 && (Object.keys(arriveeMap).length > 0 || Object.keys(departMap).length > 0);

            if (isMultiCabineTimes) {
              return (
                <View>
                  {Array.from({ length: nb }, (_, i) => (
                    <View key={i} style={{ flexDirection: "row", gap: 8, marginBottom: 6 }}>
                      <Text style={{ width: 70, fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1e3a5f" }}>
                        Cabine {i + 1}
                      </Text>
                      <View style={{ ...styles.timeBox, flex: 1, marginRight: 4 }}>
                        <Text style={styles.timeLabel}>Arrivée</Text>
                        <Text style={styles.timeValue}>{arriveeMap[i] || "--:--"}</Text>
                      </View>
                      <View style={{ ...styles.timeBox, flex: 1 }}>
                        <Text style={styles.timeLabel}>Départ</Text>
                        <Text style={styles.timeValue}>{departMap[i] || "--:--"}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              );
            }

            return (
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
            );
          })()}
        </View>

        {/* Rapport */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Commentaires & Rapport</Text>
          {/* Commentaires montages exclus du PDF - informations internes */}
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

        {/* Alertes défauts / pièces manquantes */}
        {(pieces.length > 0 || defauts.length > 0) && (
          <View style={{ marginTop: 12, padding: 10, backgroundColor: "#fef2f2", borderRadius: 6, borderWidth: 1, borderColor: "#fecaca" }}>
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#991b1b", marginBottom: 6 }}>
              ⚠ Signalements sur ce projet
            </Text>
            {pieces.length > 0 && (
              <View style={{ flexDirection: "row", marginBottom: 3 }}>
                <Text style={{ fontSize: 9, color: "#dc2626", fontFamily: "Helvetica-Bold", width: 130 }}>
                  Pièces manquantes : {pieces.length}
                </Text>
                <Text style={{ fontSize: 9, color: "#7f1d1d", flex: 1 }}>
                  {pieces.map((p) => p.description || p.reference || "Sans description").join(", ")}
                </Text>
              </View>
            )}
            {defauts.length > 0 && (
              <View style={{ flexDirection: "row", marginBottom: 3 }}>
                <Text style={{ fontSize: 9, color: "#dc2626", fontFamily: "Helvetica-Bold", width: 130 }}>
                  Défauts signalés : {defauts.length}
                </Text>
                <Text style={{ fontSize: 9, color: "#7f1d1d", flex: 1 }}>
                  {defauts.map((d) => (d.types || []).join(", ") || d.description || "Sans description").join(" | ")}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 8, color: "#991b1b", marginTop: 4 }}>
              Voir les pages détaillées en annexe du rapport.
            </Text>
          </View>
        )}

        {/* Signature client */}
        {project.signatureUrl && (
          <View style={{ marginTop: 16, padding: 10, borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 6 }} wrap={false}>
            <Text style={{ fontSize: 9, color: "#6b7280", marginBottom: 6 }}>Signature du client</Text>
            <Image src={optimizeImageUrl(project.signatureUrl)} style={{ width: 220, height: 90, objectFit: "contain" }} />
          </View>
        )}

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
        project.photosGaranties?.length > 0) && (() => {
        // Sous-bucket de chaque photo basé sur le préfixe du fichier,
        // puis groupement par cabine. Ordre d'affichage des sous-buckets
        // imposé par la spec client (avant intervention → avant montage →
        // montage gauche/centre/droite → après intervention → QR Code →
        // Garantie).
        const nbCab = project.nbCabines || 0;
        const isMultiCabine = nbCab > 1;

        type Photo = { name: string; url: string };

        // groups[cabine][bucket] = liste de photos
        const groups: Record<number, Partial<Record<PhotoBucketKey, Photo[]>>> = {};
        const dispatchList = (list: Photo[], notionFieldKey: "photosAvant" | "photosMontage" | "photosQRCode" | "photosGaranties") => {
          const fallback = defaultBucketForField(notionFieldKey);
          for (const p of list) {
            const bucket = detectBucket(p.name, fallback);
            const cab = extractCabine(p.name) ?? 0;
            if (!groups[cab]) groups[cab] = {};
            if (!groups[cab][bucket]) groups[cab][bucket] = [];
            groups[cab][bucket]!.push(p);
          }
        };
        dispatchList(project.photosAvant || [], "photosAvant");
        dispatchList(project.photosMontage || [], "photosMontage");
        dispatchList(project.photosQRCode || [], "photosQRCode");
        dispatchList(project.photosGaranties || [], "photosGaranties");

        // Ordre des cabines : 1..N, puis Général (clé 0), puis orphelines.
        const orderedCabKeys: number[] = [];
        for (let i = 1; i <= nbCab; i++) {
          if (groups[i]) orderedCabKeys.push(i);
        }
        if (groups[0]) orderedCabKeys.push(0);
        Object.keys(groups)
          .map(Number)
          .filter((k) => k !== 0 && k > nbCab)
          .sort((a, b) => a - b)
          .forEach((k) => orderedCabKeys.push(k));

        const renderBucketGrid = (label: string, photos: Photo[], keyPrefix: string) => (
          <View key={keyPrefix} style={styles.section} wrap={false}>
            <Text style={{ ...styles.label, marginBottom: 6 }}>{label}</Text>
            <View style={styles.photosGrid}>
              {photos.map((p, i) => (
                <View key={i} style={styles.photoContainer}>
                  <Image src={optimizeImageUrl(p.url)} style={styles.photo} />
                </View>
              ))}
            </View>
          </View>
        );

        const renderCabine = (cabKey: number) => {
          const buckets = groups[cabKey] || {};
          const cabineLabel = cabKey === 0 ? "Général" : `Cabine ${cabKey}`;
          const renderedSections = BUCKET_ORDER
            .map((b) => ({ b, photos: buckets[b] || [] }))
            .filter((x) => x.photos.length > 0);
          if (renderedSections.length === 0) return null;
          return (
            <View key={`cab-${cabKey}`}>
              {isMultiCabine && (
                <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: "#1e3a5f", marginTop: 8, marginBottom: 6, borderBottom: "1px solid #e5e7eb", paddingBottom: 3 }}>
                  {cabineLabel}
                </Text>
              )}
              {renderedSections.map(({ b, photos }) =>
                renderBucketGrid(BUCKET_LABEL[b], photos, `cab-${cabKey}-${b}`),
              )}
            </View>
          );
        };

        return (
          <Page size="A4" style={{ ...styles.page, paddingBottom: 50 }} wrap>
            <Text style={styles.sectionTitle} fixed>Photos du chantier</Text>
            {orderedCabKeys.map(renderCabine)}
            <View style={styles.footer} fixed>
              <Text>TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon | Tél : +41 79 555 24 74 | www.douche-montage.ch | info@douche-montage.ch</Text>
              <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
            </View>
          </Page>
        );
      })()}

      {/* Pièces manquantes */}
      {pieces.length > 0 && (
        <Page size="A4" style={{ ...styles.page, paddingBottom: 50 }} wrap>
          <Text style={styles.sectionTitle} fixed>Pièces manquantes</Text>

          {pieces.map((piece, i) => (
            <View key={piece.id} style={styles.defautCard} wrap={false}>
              <View style={styles.defautHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1e3a5f" }}>
                    {piece.description || "Pièce manquante"}
                  </Text>
                  {piece.reference && piece.reference !== "---" && (
                    <Text style={{ fontSize: 8, color: "#555", marginTop: 2 }}>Réf. : {piece.reference}</Text>
                  )}
                </View>
                <Text style={{ ...styles.statusBadge, ...getPieceStatusStyle(piece.status) }}>
                  {pieceStatusLabel(piece.status)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", marginBottom: 6 }}>
                <Text style={{ fontSize: 7, color: "#888" }}>Demandé par : {piece.user || "---"}</Text>
              </View>
              {/* Photos */}
              {piece.photoUrls && piece.photoUrls.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                  {piece.photoUrls.map((url: string, pi: number) => (
                    <Image key={pi} src={optimizeImageUrl(url)} style={styles.piecePhoto} />
                  ))}
                </View>
              ) : piece.photoUrl ? (
                <Image src={optimizeImageUrl(piece.photoUrl)} style={styles.piecePhoto} />
              ) : null}
            </View>
          ))}

          <View style={styles.footer} fixed>
            <Text>TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon | Tél : +41 79 555 24 74 | www.douche-montage.ch | info@douche-montage.ch</Text>
            <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
          </View>
        </Page>
      )}

      {/* Défauts signalés */}
      {defauts.length > 0 && (
        <Page size="A4" style={{ ...styles.page, paddingBottom: 50 }} wrap>
          <Text style={styles.sectionTitle} fixed>Défauts signalés</Text>

          {defauts.map((defaut) => (
            <View key={defaut.id} style={styles.defautCard} wrap={false}>
              <View style={styles.defautHeader}>
                <View style={styles.defautTypes}>
                  {defaut.types?.map((type, i) => (
                    <Text key={i} style={styles.defautTypeBadge}>{type}</Text>
                  ))}
                </View>
                <Text style={{ ...styles.statusBadge, ...getDefautStatusStyle(defaut.status) }}>
                  {defautStatusLabel(defaut.status)}
                </Text>
              </View>

              <Text style={styles.defautDescription}>{defaut.description || "Aucune description"}</Text>

              <View style={{ flexDirection: "row", marginBottom: 4 }}>
                <Text style={{ fontSize: 7, color: "#888" }}>Signalé par : {defaut.user || "---"}</Text>
              </View>

              {defaut.photoUrls?.length > 0 && (
                <View style={styles.defautPhotosGrid}>
                  {defaut.photoUrls.map((url, i) => (
                    <Image key={i} src={optimizeImageUrl(url)} style={styles.defautPhoto} />
                  ))}
                </View>
              )}
            </View>
          ))}

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

    // Override heures from query params if provided (avoids Notion propagation delay)
    const arriveeOverride = request.nextUrl.searchParams.get("arrivee");
    const departOverride = request.nextUrl.searchParams.get("depart");
    if (arriveeOverride) project.heureArrivee = arriveeOverride;
    if (departOverride) project.heureDepart = departOverride;

    const pieces = await loadPiecesForProject(id, project);
    const defauts = await loadDefautsForProject(id, project);

    const pdfStream = await ReactPDF.renderToStream(
      <RapportPDF project={project} pieces={pieces} defauts={defauts} />
    );

    const chunks: Buffer[] = [];
    // @ts-ignore - ReadableStream from react-pdf
    for await (const chunk of pdfStream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    const dateMontageStr = project.dateMontage
      ? new Date(project.dateMontage.split("T")[0] + "T12:00:00").toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, ".")
      : new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "2-digit" }).replace(/\//g, ".");
    const filename = `Rapport de montage - ${project.ofrTM || ""} - ${project.projet || ""} - ${dateMontageStr}.pdf`
      .replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ &+.,'-]/g, "_")
      .replace(/__+/g, "_");

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

    // Generate client portal link
    const clientToken = Buffer.from(id).toString("base64url");
    const origin = request.headers.get("origin") || request.headers.get("x-forwarded-host") || "https://tm-rapport.vercel.app";
    const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`;
    const clientPortalUrl = `${baseUrl}/client/${clientToken}`;

    // Envoi email en arrière-plan (ne bloque pas le téléchargement)
    sendPdfByEmail({
      projectName: project.projet,
      ofrTM: project.ofrTM,
      collaborateur,
      collaborateurEmail,
      pdfBuffer: buffer,
      clientPortalUrl,
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
