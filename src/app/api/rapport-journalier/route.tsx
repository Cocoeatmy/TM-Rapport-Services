/**
 * /api/rapport-journalier?date=YYYY-MM-DD&cible=…&type=monteur|equipe
 *
 * Feuille de route du jour pour un monteur, un binôme ou l'équipe entière :
 * un condensé de la fiche de travail, ramené à ce qu'il faut pour PRÉPARER —
 * où prendre la marchandise, combien de cartons charger, quelles séries, et
 * ce qui attend sur place.
 *
 * Ce n'est pas un rapport d'activité : les champs qui ne servent qu'après
 * l'intervention n'y figurent pas. À l'inverse, deux informations absentes de
 * la fiche s'y trouvent — le total de cartons à charger, et les pièces
 * manquantes déjà signalées, qu'on veut connaître AVANT de partir.
 *
 * La route rend le PDF ; elle n'envoie aucun courriel.
 */
import { NextRequest, NextResponse } from "next/server";
import { getProjectsMontageJour, type Project } from "@/lib/notion";
import { LOGO_BASE64 } from "@/lib/logo";
import { verifyToken } from "@/lib/auth";
import { isMontageOnDay, collaboratorOnProject, isoDay } from "@/lib/daily-report";
import { getData } from "@/lib/kv-store";
import ReactPDF, {
  Document, Page, Text, View, Image, StyleSheet,
} from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* ── Styles — ceux des autres rapports, resserrés ────────────────────────── */
const C = { navy: "#1e3a5f", gris: "#666", clair: "#f1f5f9", trait: "#e2e8f0", texte: "#1a1a1a" };
const s = StyleSheet.create({
  page: { padding: 34, fontFamily: "Helvetica", fontSize: 9.5, color: C.texte },
  header: { marginBottom: 14, paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: C.navy },
  title: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.navy, marginTop: 10 },
  sub: { fontSize: 11, color: C.gris, marginTop: 3 },

  bilan: { flexDirection: "row", gap: 8, marginBottom: 14 },
  bilanCase: {
    flex: 1, borderRadius: 8, borderWidth: 1, borderColor: C.trait,
    paddingVertical: 8, paddingHorizontal: 10,
  },
  bilanVal: { fontSize: 17, fontFamily: "Helvetica-Bold", color: C.navy },
  bilanLab: { fontSize: 7.5, color: C.gris, marginTop: 1 },

  chantier: { borderWidth: 1, borderColor: C.trait, borderRadius: 8, marginBottom: 10, overflow: "hidden" },
  chTete: { backgroundColor: C.navy, paddingVertical: 7, paddingHorizontal: 11 },
  chTm: { color: "#fff", fontSize: 12, fontFamily: "Helvetica-Bold" },
  chNom: { color: "rgba(255,255,255,.85)", fontSize: 9.5, marginTop: 2 },
  chCorps: { padding: 11 },

  ligne: { flexDirection: "row", marginBottom: 5 },
  case: { flex: 1, paddingRight: 10 },
  lab: { fontSize: 7.5, color: C.gris, marginBottom: 1 },
  val: { fontSize: 10, fontFamily: "Helvetica-Bold", color: C.texte },
  valLarge: { fontSize: 10, color: C.texte, lineHeight: 1.4 },

  bandeau: {
    marginTop: 6, padding: 8, borderRadius: 6,
    backgroundColor: "#fff8ec", borderWidth: 1, borderColor: "#f2d9a6",
  },
  bandeauTxt: { fontSize: 9, color: "#92500e", lineHeight: 1.45 },

  note: { fontSize: 9, color: C.gris, marginTop: 4, lineHeight: 1.45 },
  vide: { fontSize: 11, color: C.gris, textAlign: "center", marginTop: 40 },
  pied: {
    position: "absolute", bottom: 18, left: 34, right: 34,
    flexDirection: "row", justifyContent: "space-between",
  },
  piedTxt: { fontSize: 7.5, color: "#94a3b8" },
});

function nfc(v: unknown): string {
  return String(v ?? "").normalize("NFC");
}
function ouTiret(v: unknown): string {
  const t = nfc(v).trim();
  return t || "—";
}
/** « Cab1:App. 12 | Cab2:… » → ["App. 12", "…"]. */
function lots(raw: string): string[] {
  return [...String(raw || "").matchAll(/Cab(\d+)\s*:\s*([^|]*)/g)]
    .map((m) => m[2].trim())
    .filter((v) => v && !/^cabine\s*\d*$/i.test(v));
}
function heureRdv(p: Project): string {
  return (p.dateMontage || "").match(/T(\d{2}:\d{2})/)?.[1] || "";
}
function dateLisible(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString("fr-CH", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

type Signalement = { projectId: string; status?: string; resolved?: boolean; description?: string; reference?: string; cabineLabel?: string };

function Chantier({ p, pieces }: { p: Project; pieces: Signalement[] }) {
  const cabines = Number(p.nbCabines) || 0;
  const noms = lots(p.nomsCabines || "");
  const heure = heureRdv(p);
  return (
    <View style={s.chantier} wrap={false}>
      <View style={s.chTete}>
        <Text style={s.chTm}>
          {ouTiret(p.ofrTM)}{heure ? `   ·   ${heure}` : ""}
        </Text>
        <Text style={s.chNom}>{ouTiret(p.nomChantier || p.projet)}</Text>
      </View>
      <View style={s.chCorps}>
        <View style={s.ligne}>
          <View style={s.case}>
            <Text style={s.lab}>Adresse</Text>
            <Text style={s.valLarge}>{ouTiret(p.adresseChantier)}</Text>
          </View>
        </View>

        {/* Ce qu'il faut charger et où le prendre : la raison d'être du document. */}
        <View style={s.ligne}>
          <View style={s.case}>
            <Text style={s.lab}>Marchandise à prendre</Text>
            <Text style={s.val}>{ouTiret(p.emplacementCabine)}</Text>
          </View>
          <View style={s.case}>
            <Text style={s.lab}>Cartons</Text>
            <Text style={s.val}>{p.nbCartons != null ? String(p.nbCartons) : "—"}</Text>
          </View>
          <View style={s.case}>
            <Text style={s.lab}>Cabines</Text>
            <Text style={s.val}>{cabines || "—"}</Text>
          </View>
        </View>

        <View style={s.ligne}>
          <View style={s.case}>
            <Text style={s.lab}>Fournisseur</Text>
            <Text style={s.val}>{ouTiret((p.fournisseurs || []).join(", "))}</Text>
          </View>
          <View style={s.case}>
            <Text style={s.lab}>Série</Text>
            <Text style={s.val}>{ouTiret((p.seriesCabines || []).join(", "))}</Text>
          </View>
          <View style={s.case}>
            <Text style={s.lab}>N° commande fournisseur</Text>
            <Text style={s.val}>{ouTiret(p.cmdFournisseurs || p.cmdTMUsine || p.cmdTM)}</Text>
          </View>
        </View>

        {noms.length > 0 ? (
          <View style={s.ligne}>
            <View style={s.case}>
              <Text style={s.lab}>Lots</Text>
              <Text style={s.valLarge}>{nfc(noms.join(" · "))}</Text>
            </View>
          </View>
        ) : null}

        <View style={s.ligne}>
          <View style={s.case}>
            <Text style={s.lab}>Contact du rendez-vous</Text>
            <Text style={s.valLarge}>{ouTiret(p.contactsRDV)}</Text>
          </View>
          <View style={s.case}>
            <Text style={s.lab}>Monteurs</Text>
            <Text style={s.valLarge}>{ouTiret(p.collaborateurs)}</Text>
          </View>
        </View>

        {p.commentairesMontages ? (
          <Text style={s.note}>Commentaire montage : {nfc(p.commentairesMontages)}</Text>
        ) : null}
        {p.diversInfosChantier ? (
          <Text style={s.note}>Infos chantier : {nfc(p.diversInfosChantier)}</Text>
        ) : null}

        {/* Pièces manquantes déjà signalées : à savoir AVANT de charger. */}
        {pieces.length > 0 ? (
          <View style={s.bandeau}>
            <Text style={s.bandeauTxt}>
              Pièces manquantes signalées, non reçues :{"\n"}
              {pieces.map((x) => `• ${nfc(x.cabineLabel ? `${x.cabineLabel} — ` : "")}${nfc(x.description || x.reference || "pièce")}`).join("\n")}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function RapportJournalier({ cible, jour, projets, piecesParProjet }: {
  cible: string; jour: string; projets: Project[];
  piecesParProjet: Record<string, Signalement[]>;
}) {
  const cabines = projets.reduce((n, p) => n + (Number(p.nbCabines) || 0), 0);
  const cartons = projets.reduce((n, p) => n + (Number(p.nbCartons) || 0), 0);
  const depots = [...new Set(projets.map((p) => nfc(p.emplacementCabine).trim()).filter(Boolean))];
  const edite = new Date().toLocaleDateString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric" });

  return (
    <Document title={`Journée ${cible} — ${jour}`} author="TM Douche Montage">
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
          <Text style={s.title}>Journée de {nfc(cible)}</Text>
          <Text style={s.sub}>{dateLisible(jour)}</Text>
        </View>

        {projets.length === 0 ? (
          <Text style={s.vide}>Aucun montage prévu ce jour-là.</Text>
        ) : (
          <>
            <View style={s.bilan}>
              <View style={s.bilanCase}>
                <Text style={s.bilanVal}>{projets.length}</Text>
                <Text style={s.bilanLab}>chantier{projets.length > 1 ? "s" : ""}</Text>
              </View>
              <View style={s.bilanCase}>
                <Text style={s.bilanVal}>{cabines}</Text>
                <Text style={s.bilanLab}>cabine{cabines > 1 ? "s" : ""} à poser</Text>
              </View>
              <View style={s.bilanCase}>
                <Text style={s.bilanVal}>{cartons || "—"}</Text>
                <Text style={s.bilanLab}>cartons à charger</Text>
              </View>
              <View style={s.bilanCase}>
                <Text style={{ ...s.bilanVal, fontSize: 11 }}>{depots.length ? nfc(depots.join(" · ")) : "—"}</Text>
                <Text style={s.bilanLab}>où prendre la marchandise</Text>
              </View>
            </View>

            {projets.map((p) => (
              <Chantier key={p.id} p={p} pieces={piecesParProjet[p.id] || []} />
            ))}
          </>
        )}

        <View style={s.pied} fixed>
          <Text style={s.piedTxt}>TM Douche Montage · feuille de route du {dateLisible(jour)}</Text>
          <Text style={s.piedTxt} render={({ pageNumber, totalPages }) => `Éditée le ${edite} · page ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user || (user as { role?: string }).role !== "admin") {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const jour = sp.get("date") || isoDay(new Date());
  const cible = (sp.get("cible") || "").trim();
  const type = sp.get("type") === "equipe" ? "equipe" : "monteur";
  if (!cible) return NextResponse.json({ error: "cible manquante" }, { status: 400 });

  try {
    const duJour = (await getProjectsMontageJour(jour))
      .filter((p) => isMontageOnDay(p, jour));
    const projets = duJour
      .filter((p) => type === "equipe"
        ? nfc(p.collaborateurs).trim().toLowerCase() === cible.toLowerCase()
        : collaboratorOnProject(p, cible))
      // Ordre de la journée : l'heure du rendez-vous quand elle existe.
      .sort((a, b) => (heureRdv(a) || "99:99").localeCompare(heureRdv(b) || "99:99"));

    /* Pièces manquantes encore ouvertes, par projet : elles vivent hors Notion
       et ne figurent donc pas sur la fiche. */
    const piecesParProjet: Record<string, Signalement[]> = {};
    try {
      const toutes = await getData<Signalement>("pieces");
      const ids = new Set(projets.map((p) => p.id));
      toutes.forEach((x) => {
        if (!ids.has(x.projectId)) return;
        if (x.status === "recu" || x.resolved === true) return;
        (piecesParProjet[x.projectId] ||= []).push(x);
      });
    } catch { /* stockage indisponible : le reste du rapport tient debout */ }

    const flux = await ReactPDF.renderToStream(
      <RapportJournalier cible={cible} jour={jour} projets={projets} piecesParProjet={piecesParProjet} />,
    );
    const morceaux: Buffer[] = [];
    for await (const c of flux) morceaux.push(Buffer.from(c));
    const pdf = Buffer.concat(morceaux);

    const nom = `Journee ${cible} ${jour}`.replace(/[^\w\s-]/g, "").trim();
    return new NextResponse(pdf, {
      headers: {
        "Content-Type": "application/pdf",
        /* Téléchargement, pas ouverture : la feuille se prépare la veille au
           soir et se relit le matin, souvent hors réseau. */
        "Content-Disposition": `attachment; filename="${nom}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String((e as Error)?.message || e) }, { status: 500 });
  }
}
