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
import { getProject, fournisseursForDisplay, type Project, type ContactDetail } from "@/lib/notion";
import { LOGO_BASE64 } from "@/lib/logo";
import { verifyToken } from "@/lib/auth";
import { signFiche, signPhotosZip, signSav, signSynthese, signSignalements, signMesure } from "@/lib/doc-link";
import { formatSwissDate } from "@/lib/time-utils";
import { isMultiDayHours, parsePointages } from "@/lib/pointages";
import { isNewProjectForMesures } from "@/lib/mesures-duka";
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
  Circle,
  StyleSheet,
} from "@react-pdf/renderer";
import React from "react";
import { GMAPS_ICON, APPLE_MAPS_ICON, WAZE_ICON } from "@/lib/map-icons";
import { getData, getDataFresh } from "@/lib/kv-store";

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
  /* Boutons de rapport — dimensionnés pour le POUCE, pas pour la page.
     Une fiche A4 affichée sur un téléphone est réduite d'environ un tiers :
     un bouton de 7 mm y devient une cible de 4 mm, que les monteurs ne
     pouvaient atteindre qu'en zoomant. À 70 points de haut sur toute la
     largeur, la cible reste au-dessus du minimum tactile même page entière
     à l'écran. */
  reportBtns: { flexDirection: "row", gap: 10, marginTop: 12 },
  reportBtn: {
    width: "100%",
    backgroundColor: "#1e3a5f",
    borderRadius: 10,
    paddingVertical: 20,
    paddingHorizontal: 8,
    textDecoration: "none",
    justifyContent: "center",
    minHeight: 70,
  },
  reportBtnText: { color: "#ffffff", fontSize: 13, fontFamily: "Helvetica-Bold", textAlign: "center" },
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
  // Horodatage « Fiche générée le … » : sous le pied de page, aligné à droite.
  genStamp: {
    position: "absolute",
    bottom: 12,
    right: 40,
    fontSize: 6,
    color: "#bbb",
  },
  // Bandeau d'alerte des signalements (juste sous l'en-tête).
  sigBanner: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  sigBannerTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#9a3412", marginRight: 4 },
  sigChip: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  sigChipText: { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#ffffff" },
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
// ── Jours de montage réels (par cabine) ────────────────────────────────────
// Les dates/heures de montage sont encodées PAR CABINE dans « Heure arrivée » /
// « Heure départ » au format « CabN:AAAA-MM-JJ:HH:MM | ... » (même source que
// « Suivi des heures → PAR JOURNÉE » de l'app). Un projet peut donc avoir
// plusieurs journées non contiguës (ex. TM-2600516 : 30.07 puis 04.09).
type MontageDay = { date: string; arr: string; dep: string; min: number; who: string };
// « Cab1:Miguel | Cab2:... » → { 0: "Miguel", 1: "..." }
function parseCabNames(raw?: string | null): Record<number, string> {
  const map: Record<number, string> = {};
  if (!raw) return map;
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) map[parseInt(m[1], 10) - 1] = m[2].trim();
  return map;
}
function parseCabTimes(raw?: string | null): Record<number, string> {
  const map: Record<number, string> = {};
  if (!raw) return map;
  const re = /Cab(\d+)\s*:(?:\d{4}-\d{2}-\d{2}:)?(\d{1,2}:\d{2})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) map[parseInt(m[1], 10) - 1] = m[2];
  return map;
}
function parseCabDates(raw?: string | null): Record<number, string> {
  const map: Record<number, string> = {};
  if (!raw) return map;
  const re = /Cab(\d+)\s*:(\d{4}-\d{2}-\d{2}):/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) map[parseInt(m[1], 10) - 1] = m[2];
  return map;
}
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const minToHhmm = (n: number) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
const durStr = (n: number) => (n > 0 ? `${Math.floor(n / 60)}h${String(n % 60).padStart(2, "0")}` : "");
// « 2026-07-30 » → « 30.07 »
/**
 * « 2026-09-28 » → « 28.09.26 ».
 *
 * L'année était omise : sur une fiche consultée des mois plus tard, ou sur un
 * chantier repris d'une année sur l'autre, « 28.09 » ne suffit pas à situer
 * l'intervention.
 */
function ddmm(d: string): string {
  const [an, mo, da] = d.split("-");
  if (!da || !mo) return d;
  return an ? `${da}.${mo}.${an.slice(2)}` : `${da}.${mo}`;
}

/**
 * Plage horaire lisible : « 09h16 à 14h19 ».
 *
 * Le tiret entre deux heures au format « 09:16–14:19 » se confond avec un
 * séparateur de liste sur une ligne dense ; écrite comme on la dit, la plage
 * ne demande aucun effort de lecture.
 */
function plageHoraire(arr?: string, dep?: string): string {
  const h = (t?: string) => (t || "").replace(":", "h");
  if (arr && dep) return `${h(arr)} à ${h(dep)}`;
  return h(arr) || h(dep) || "";
}
// Regroupe les timestamps par jour : plage (1ʳᵉ arrivée → dernier départ) +
// durée cumulée des cabines de la journée.
function montageDays(ha?: string | null, hd?: string | null, attr?: string | null): MontageDay[] {
  const arrMap = parseCabTimes(ha), depMap = parseCabTimes(hd);
  const dateMap = parseCabDates(ha), dateMap2 = parseCabDates(hd);
  const nameMap = parseCabNames(attr);
  const byDate = new Map<string, { arrMin: number; depMin: number; min: number; who: Set<string> }>();
  const idxs = new Set<number>([...Object.keys(arrMap), ...Object.keys(depMap)].map(Number));
  for (const i of idxs) {
    const d = dateMap[i] || dateMap2[i] || "";
    if (!d) continue;
    const aMin = arrMap[i] ? toMin(arrMap[i]) : null;
    const dMin = depMap[i] ? toMin(depMap[i]) : null;
    let cur = byDate.get(d);
    if (!cur) { cur = { arrMin: Infinity, depMin: -Infinity, min: 0, who: new Set<string>() }; byDate.set(d, cur); }
    if (aMin != null) cur.arrMin = Math.min(cur.arrMin, aMin);
    if (dMin != null) cur.depMin = Math.max(cur.depMin, dMin);
    if (aMin != null && dMin != null && dMin > aMin) cur.min += dMin - aMin;
    (nameMap[i] || "").split(/\s*&\s*/).map((s) => s.trim()).filter(Boolean).forEach((n) => cur!.who.add(n));
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      arr: Number.isFinite(v.arrMin) ? minToHhmm(v.arrMin) : "",
      dep: v.depMin > -Infinity ? minToHhmm(v.depMin) : "",
      min: v.min,
      who: [...v.who].join(" & "),
    }));
}
// Ligne « JJ.MM.AA : 08h39 à 10h12 (1h33) — Miguel » pour une journée.
// withWho=false quand le monteur est déjà affiché ailleurs sur la ligne.
function montageDayLabel(d: MontageDay, withWho = true): string {
  const span = plageHoraire(d.arr, d.dep);
  const dur = durStr(d.min);
  const base = `${ddmm(d.date)}${span ? ` : ${span}` : ""}${dur ? ` (${dur})` : ""}`;
  return withWho && d.who ? `${base} — ${d.who}` : base;
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

// Plage horaire de montage « 08h00 à 12h30 (4h30) » à partir de « Heure arrivée »
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
    return `${plageHoraire(arr, dep)}${dur}`;
  }
  return arr || dep || "";
}

/** Vrai quand `joinVal` n'a rien eu à mettre — le champ Notion est vide. */
function vide(valeur: string): boolean {
  return !valeur || valeur.trim() === "" || valeur.trim() === "—";
}

/**
 * Cellule « libellé au-dessus, valeur en gras » (grilles Général & Contact).
 *
 * Une case dont le champ Notion est vide disparaît : un tiret en face d'un
 * libellé fait croire qu'on attend une information, alors qu'elle n'a pas
 * lieu d'être sur ce chantier. Une case qui porte un lien reste, même sans
 * valeur : c'est le lien qui est l'information.
 */
function Cell({ label, value, width, docUrl }: { label: string; value: string; width: string; docUrl?: string }) {
  if (vide(value) && !docUrl) return null;
  return (
    <View style={{ width, paddingRight: 10, marginBottom: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 2 }}>
        <Text style={{ fontSize: 8, color: "#888" }}>{label}</Text>
        {docUrl ? (
          <Link src={docUrl} style={{ marginLeft: 5, textDecoration: "none" }}>
            <DownloadArrow />
          </Link>
        ) : null}
      </View>
      <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>{value}</Text>
    </View>
  );
}
/**
 * Rend lisible l'état des mesures sur la fiche.
 *
 * Notion propose « Projet sans de mesures » — faute de frappe comprise, les
 * monteurs y lisaient « aucune mesure » et passaient à côté de la flèche de
 * téléchargement voisine. Or lorsque des documents de montage sont joints, les
 * mesures EXISTENT : elles ont simplement été relevées par un tiers. Deux
 * phrases distinctes valent mieux qu'une icône qu'on n'a pas vue.
 */
function etatMesuresLisible(etat: string, aDesDocuments: boolean): string {
  if (!/projet sans de? mesures/i.test(etat || "")) return etat;
  return aDesDocuments ? "Mesures non relevées par TM Douche Montage" : "Projet sans mesures";
}

/**
 * Une case de contact du pied de rapport.
 *
 * `parEtiquette` change la règle du titre : au lieu d'un intitulé fixe pour
 * toute la case, CHAQUE contact porte le sien, repris de sa colonne
 * « Étiquettes » dans Notion — « Concierge », « Régie »… C'est ce que demande
 * la case « Contacts Autres », dont la nature varie d'un chantier à l'autre :
 * un intitulé commun n'y apprendrait rien.
 */
function ContactCell({ label, company, contacts, width, parEtiquette = false }: { label: string; company?: string; contacts?: ContactDetail[]; width: string; parEtiquette?: boolean }) {
  const list = (contacts || []).filter((c) => c && (c.name || c.email || c.phone));
  const hasCompany = !!company && company !== "—" && company.trim() !== "";
  // Rôle non renseigné → masqué.
  if (!hasCompany && list.length === 0) return null;
  return (
    <View style={{ width, paddingRight: 10, marginBottom: 8 }}>
      {parEtiquette ? null : <Text style={{ fontSize: 8, color: "#888", marginBottom: 2 }}>{label}</Text>}
      {hasCompany ? (
        <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>{nfc(company!)}</Text>
      ) : null}
      {list.map((c, i) => (
        <View key={i} style={{ marginTop: 3 }}>
          {parEtiquette && c.tag ? <Text style={{ fontSize: 8, color: "#888", marginBottom: 1 }}>{nfc(c.tag)}</Text> : null}
          {c.name ? <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1a1a1a" }}>{nfc(c.name)}</Text> : null}
          {c.email ? <Link src={`mailto:${c.email.trim()}`} style={{ fontSize: 8, color: "#1e3a5f", textDecoration: "none" }}>{c.email}</Link> : null}
          {c.phone ? <Link src={`tel:${c.phone.replace(/[^\d+]/g, "")}`} style={{ fontSize: 8, color: "#1e3a5f", textDecoration: "none" }}>{c.phone}</Link> : null}
          {c.address ? <Text style={{ fontSize: 8, color: "#555" }}>{nfc(c.address)}</Text> : null}
        </View>
      ))}
    </View>
  );
}
// Données par cabine encodées « CabN:valeur | CabM:valeur » → { N: valeur }.
function parseCabMulti(raw: string | undefined | null): Record<number, string> {
  const map: Record<number, string> = {};
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw || ""))) { const v = m[2].trim(); if (v) map[parseInt(m[1], 10)] = v; }
  return map;
}
// Bouton « téléchargement » : cercle bleu navy plein + flèche blanche vers un
// bac (style bouton de téléchargement), assorti à la couleur des titres.
function DownloadArrow() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={12} fill="#1e3a5f" />
      <Path d="M12 6 V13.5 M8.5 10.5 L12 14 L15.5 10.5" stroke="#ffffff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7.5 15.5 V17.5 H16.5 V15.5" stroke="#ffffff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
// Ligne « libellé à gauche, valeur à droite » (sections Lieu / Commande / RDV).
// docUrl : si fourni, ajoute une flèche cliquable à côté du libellé.
// Icône « commentaire » (bulle) — assortie à la couleur des titres.
function CommentIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" style={{ marginLeft: 5 }}>
      <Path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.7A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z" stroke="#1e3a5f" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
// Valeur d'une ligne RDV + (facultatif) le commentaire Notion en dessous.
function RowValue({ value, comment }: { value: string; comment?: string }) {
  const c = (comment || "").trim();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 9, color: "#1a1a1a" }}>{value}</Text>
      {c ? <Text style={{ fontSize: 8, color: "#555", marginTop: 2, lineHeight: 1.3 }}>{c}</Text> : null}
    </View>
  );
}
function LineRow({ label, value, docUrl, comment }: { label: string; value: string; docUrl?: string; comment?: string }) {
  const hasComment = !!(comment || "").trim();
  return (
    <View style={styles.row}>
      <View style={{ width: 170, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ color: "#666", fontSize: 9 }}>{label}</Text>
        {docUrl ? (
          <Link src={docUrl} style={{ marginLeft: 5, textDecoration: "none" }}>
            <DownloadArrow />
          </Link>
        ) : null}
        {hasComment ? <CommentIcon /> : null}
      </View>
      <RowValue value={value} comment={comment} />
    </View>
  );
}
// Ligne avec barre de progression entre le libellé et la valeur.
function ProgressRow({ label, pct, caption, color, value, docUrl, comment }: {
  label: string; pct: number; caption: string; color: string; value: string; docUrl?: string; comment?: string;
}) {
  const w = Math.max(0, Math.min(100, pct));
  const hasComment = !!(comment || "").trim();
  return (
    <View style={styles.row}>
      <View style={{ width: 170, flexDirection: "row", alignItems: "center" }}>
        <Text style={{ color: "#666", fontSize: 9 }}>{label}</Text>
        {docUrl ? (
          <Link src={docUrl} style={{ marginLeft: 5, textDecoration: "none" }}>
            <DownloadArrow />
          </Link>
        ) : null}
        {hasComment ? <CommentIcon /> : null}
      </View>
      <View style={{ width: 105, marginRight: 10, justifyContent: "center" }}>
        <View style={{ height: 7, borderRadius: 4, backgroundColor: "#e5e7eb" }}>
          <View style={{ width: `${w}%`, height: 7, borderRadius: 4, backgroundColor: color }} />
        </View>
        <Text style={{ fontSize: 7, color: "#666", marginTop: 2 }}>{caption}</Text>
      </View>
      <RowValue value={value} comment={comment} />
    </View>
  );
}

// Petite épingle de localisation (icône vectorielle).
function MapPinIcon() {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24" style={{ marginRight: 3 }}>
      <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" stroke="#1e3a5f" strokeWidth={2} fill="none" />
      <Path d="M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" stroke="#1e3a5f" strokeWidth={2} fill="none" />
    </Svg>
  );
}
// Taille commune des icônes d'apps de navigation (logos officiels embarqués).
const MAP_ICON = 18; // px
// Ligne « Adresse chantier » + liens GPS (Google Maps / Apple Plan / Waze).
// Chaque lien lance directement l'itinéraire dans l'app correspondante.
function AddressRow({ address }: { address: string }) {
  const addr = (address || "").trim();
  const has = !!addr && addr !== "—";
  const q = encodeURIComponent(addr);
  const links = has ? [
    { label: "Google Maps", url: `https://www.google.com/maps/dir/?api=1&destination=${q}`, icon: GMAPS_ICON },
    { label: "Apple Plan", url: `https://maps.apple.com/?daddr=${q}&dirflg=d`, icon: APPLE_MAPS_ICON },
    { label: "Waze", url: `https://waze.com/ul?q=${q}&navigate=yes`, icon: WAZE_ICON },
  ] : [];
  return (
    <>
      {/* Ligne adresse (sans bordure basse : la ligne « Itinéraire » ferme le bloc). */}
      <View style={{ ...styles.row, borderBottomWidth: has ? 0 : 0.5, paddingBottom: has ? 1 : 4 }}>
        <Text style={styles.label}>Adresse chantier</Text>
        <Text style={styles.value}>{has ? addr : "—"}</Text>
      </View>
      {/* Ligne dédiée « Itinéraire » sous l'adresse (alignée sous la valeur). */}
      {has ? (
        <View style={{ ...styles.row, paddingTop: 0 }}>
          <View style={{ width: 170 }} />
          <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
            <MapPinIcon />
            <Text style={{ fontSize: 8, color: "#888", marginRight: 6 }}>Itinéraire :</Text>
            {links.map((l) => (
              <Link key={l.label} src={l.url} style={{ marginRight: 8, textDecoration: "none" }}>
                <Image src={l.icon} style={{ width: MAP_ICON, height: MAP_ICON, borderRadius: 4 }} />
              </Link>
            ))}
          </View>
        </View>
      ) : null}
    </>
  );
}

function FichePDF({ project, mesuresDocUrl, montagePhotosUrl, cartonsDocUrl, cartonsRecusUrl, savReportUrl, reportUrl, syntheseUrl, signalementsUrl, notionComments = [], sig = { pieces: 0, defauts: 0, avant: 0, done: 0 }, mesures = [] }: { project: Project; mesuresDocUrl?: string; montagePhotosUrl?: string; cartonsDocUrl?: string; cartonsRecusUrl?: string; savReportUrl?: string; reportUrl?: string; syntheseUrl?: string; signalementsUrl?: string; notionComments?: { text: string; author?: string; date?: string }[]; sig?: { pieces: number; defauts: number; avant: number; done?: number }; mesures?: { cab: number; nom: string; serie: string; url: string }[] }) {
  const genDate = new Date().toLocaleString("fr-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
  /* Le fournisseur est-il LE client de ce chantier ? « Type de client » le
     dit, et c'est la seule raison de le faire figurer dans les contacts. */
  const estClientFournisseur = String(project.typeClient || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .startsWith("fournisseur");
  const sigTotal = (sig?.pieces || 0) + (sig?.defauts || 0) + (sig?.avant || 0);
  const sigDone = sig?.done || 0;
  // Le projet a-t-il au moins un SAV (par cabine) ? → affiche le bouton SAV.
  const savMaps = [project.commentairesSav, project.causeSavCabines, project.datesRdvSavCabines, project.collaborateursSavCabines, project.savRetouchesCabines, project.dateSAVRecu].map(parseCabMulti);
  const savKeys = new Set<number>();
  savMaps.forEach((m) => Object.keys(m).forEach((k) => savKeys.add(parseInt(k, 10))));
  const hasSav = [...savKeys].some((n) => savMaps.some((m) => m[n]));
  /* Un rapport par bouton, dans l'ordre où le monteur s'en sert. */
  const boutons = [
    reportUrl ? { url: reportUrl, couleur: "#059669", texte: "Rapport de montage" } : null,
    syntheseUrl ? { url: syntheseUrl, couleur: "#1e3a5f", texte: "Rapport de suivi" } : null,
    hasSav && savReportUrl ? { url: savReportUrl, couleur: "#ea580c", texte: "Rapport SAV" } : null,
  ].filter((b): b is { url: string; couleur: string; texte: string } => b !== null);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* En-tête : logo + titre + n° projet (gros/gras) + nom du chantier.
            À droite : bouton vers le rapport de montage (upload photos + horaires). */}
        <View style={styles.header}>
          <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
          {/* Boutons rapports, sur toute la largeur et sous le logo plutôt que
              serrés dans un coin : couleurs par type, assorties à l'app —
              montage = vert, suivi = navy, SAV = orange. */}
          {boutons.length > 0 ? (
            <View style={styles.reportBtns}>
              {/* Le « flex » vit sur la View : un Link ne se partage pas
                  toujours l'espace de façon fiable dans le moteur PDF. */}
              {boutons.map((b) => (
                <View key={b.texte} style={{ flex: 1 }}>
                  <Link src={b.url} style={{ ...styles.reportBtn, backgroundColor: b.couleur }}>
                    <Text style={styles.reportBtnText}>{b.texte}</Text>
                  </Link>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.title}>Fiche de travail</Text>
          <Text style={styles.tm}>{project.ofrTM || "TM-—"}</Text>
          {project.projet ? <Text style={styles.subtitle}>{nfc(project.projet)}</Text> : null}
        </View>

        {/* Bandeau signalements. Seuls les signalements OUVERTS sont détaillés
            (puces colorées « à traiter ») ; les réglés sont juste résumés
            « x réglé ». Si tout est réglé → bandeau vert. Cliquable → rapport. */}
        {sigTotal > 0 ? (
          <Link src={signalementsUrl || "#"} style={{ ...styles.sigBanner, textDecoration: "none" }} wrap={false}>
            <Text style={styles.sigBannerTitle}>Signalements à traiter :</Text>
            {sig.pieces > 0 ? (
              <View style={{ ...styles.sigChip, backgroundColor: "#ea580c" }}>
                <Text style={styles.sigChipText}>Pièces manquantes {sig.pieces}</Text>
              </View>
            ) : null}
            {sig.defauts > 0 ? (
              <View style={{ ...styles.sigChip, backgroundColor: "#dc2626" }}>
                <Text style={styles.sigChipText}>Défauts {sig.defauts}</Text>
              </View>
            ) : null}
            {sig.avant > 0 ? (
              <View style={{ ...styles.sigChip, backgroundColor: "#4f46e5" }}>
                <Text style={styles.sigChipText}>Constats avant intervention {sig.avant}</Text>
              </View>
            ) : null}
            {sigDone > 0 ? (
              <Text style={{ fontSize: 8, color: "#15803d", marginLeft: 2 }}>
                · {sigDone} réglé{sigDone > 1 ? "s" : ""}
              </Text>
            ) : null}
            {signalementsUrl ? (
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#9a3412", marginLeft: 2 }}>
                Voir le rapport →
              </Text>
            ) : null}
          </Link>
        ) : sigDone > 0 ? (
          <Link src={signalementsUrl || "#"} style={{ ...styles.sigBanner, backgroundColor: "#f0fdf4", borderColor: "#bbf7d0", textDecoration: "none" }} wrap={false}>
            <Text style={{ ...styles.sigBannerTitle, color: "#15803d" }}>Signalements :</Text>
            <View style={{ ...styles.sigChip, backgroundColor: "#16a34a" }}>
              <Text style={styles.sigChipText}>{sigDone} réglé{sigDone > 1 ? "s" : ""} ✓</Text>
            </View>
            {signalementsUrl ? (
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#15803d", marginLeft: 2 }}>
                Voir le rapport →
              </Text>
            ) : null}
          </Link>
        ) : null}

        {/* Lieu du rendez-vous (+ « Divers infos chantier » si renseigné) */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Lieu du rendez-vous</Text>
          <AddressRow address={joinVal(project.adresseChantier)} />
        </View>

        {/* Général — grille : (Nb cabines | Fournisseurs | Séries) puis
            (Emplacement | Nb cartons) alignés sous les colonnes du dessus. */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Général</Text>
          <View style={{ flexDirection: "row" }}>
            <Cell label="Nb. cabines" value={joinVal(project.nbCabines)} width="33%" />
            <Cell label="Fournisseurs" value={joinVal(fournisseursForDisplay(project.fournisseurs))} width="34%" />
            <Cell label="Séries cabines" value={joinVal(project.seriesCabines)} width="33%" />
          </View>
          <View style={{ flexDirection: "row" }}>
            <Cell label="Emplacement de cabine" value={joinVal(project.emplacementCabine)} width="33%" />
            <Cell label="Nb. de cartons" value={joinVal(project.nbCartons)} width="34%" />
            {cartonsDocUrl ? (
              <Cell label="État cartons réceptionnés" value="Voir les documents" width="33%" docUrl={cartonsDocUrl} />
            ) : null}
          </View>
          {/* Chaque case disparaît si son champ Notion est vide : une ligne
              « Voir les documents » sans document ferait perdre un clic. */}
          {cartonsRecusUrl ? (
            <View style={{ flexDirection: "row" }}>
              {/* Deux espaceurs : la case se place sous « État cartons », dans
                  la même colonne, sans dupliquer de libellé. */}
              <View style={{ width: "33%" }} />
              <View style={{ width: "34%" }} />
              <Cell label="Photos des cartons réceptionnés" value="Voir les documents" width="33%" docUrl={cartonsRecusUrl} />
            </View>
          ) : null}
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
            {/* Un en-tête de colonne seul, au-dessus de deux tirets, annonce
                une commande qui n'existe pas : la colonne entière disparaît
                tant qu'aucun de ses numéros n'est renseigné. */}
            {[joinVal(project.ofrGrossiste), joinVal(project.cmdGrossiste)].some((v) => !vide(v)) ? (
              <View style={{ width: "33.33%", paddingRight: 12 }}>
                <Text style={styles.colHeader}>Grossiste</Text>
                <Cell label="N° OFR Grossiste" value={joinVal(project.ofrGrossiste)} width="100%" />
                <Cell label="N° CMD Grossiste" value={joinVal(project.cmdGrossiste)} width="100%" />
              </View>
            ) : null}
            {[joinVal(project.cmdFournisseurs), joinVal(project.servMesuresFournisseurs), joinVal(project.servCmdFournisseurs)].some((v) => !vide(v)) ? (
              <View style={{ width: "33.34%" }}>
                <Text style={styles.colHeader}>Fournisseur</Text>
                <Cell label="N° CMD Fournisseur" value={joinVal(project.cmdFournisseurs)} width="100%" />
                <Cell label="N° Mesures Fournisseurs" value={joinVal(project.servMesuresFournisseurs)} width="100%" />
                <Cell label="N° Montage Fournisseurs" value={joinVal(project.servCmdFournisseurs)} width="100%" />
              </View>
            ) : null}
          </View>
        </View>

        {/* Rendez-vous */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Rendez-vous</Text>
          {/* Mesures : barre 100% dès qu'une date existe ; sinon l'état, sans barre.
              Flèche → galerie des documents montage. */}
          {/* « Projet sans de mesures » se lit comme « il n'y a pas de mesures »,
              et les monteurs ignoraient alors la flèche de téléchargement juste
              à côté. Quand des documents de montage existent, les mesures ont
              bien été relevées — par quelqu'un d'autre : on le dit. */}
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
              value={dateAndWho(joinVal(etatMesuresLisible(project.etatMesures, !!mesuresDocUrl)), project.mesuresTraiteePar)}
              /* Mesures relevées par quelqu'un d'autre : la flèche proposait de
                 télécharger un relevé qui n'est pas le nôtre. Les documents de
                 montage restent accessibles par leur propre section. */
              docUrl={/projet sans de? mesures/i.test(project.etatMesures || "") ? undefined : mesuresDocUrl}
            />
          )}
          {/* Démontage : seulement quand une dépose est prévue. La ligne vide
              aurait laissé croire qu'on en attend une sur chaque chantier. */}
          {project.dateDemontage ? (
            <LineRow
              label="Démontage"
              value={dateAndWho(fmtDate(project.dateDemontage), project.collaborateursDemontage)}
            />
          ) : null}
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
            // Jours de montage RÉELS reconstitués depuis les horaires par cabine.
            const days = montageDays(project.heureArrivee, project.heureDepart, project.attributionCabines);
            const totalMin = days.reduce((s, d) => s + d.min, 0);
            // Monteur(s) : champ « Collaborateurs montages », sinon union des
            // monteurs responsables par cabine (« Monteur responsable »).
            const montageWho = (project.collaborateurs || "").trim()
              || [...new Set(days.flatMap((d) => d.who.split(" & ").filter(Boolean)))].join(" & ");
            // Partie « date » de la ligne Montage :
            //  - aucune donnée horaire → repli sur la date Notion (dateMontage) ;
            //  - 1 journée → « JJ.MM.AA : 08h39 à 10h12 (1h33) » ;
            //  - N journées → « N jours · 3h10 » (détail dans « Jours de montage »).
            let datePart: string;
            if (days.length === 0) {
              const hours = montageHoursStr(project.heureArrivee, project.heureDepart);
              datePart = fmtDateRange(project.dateMontage, project.dateMontageEnd) + (hours ? `  ·  ${hours}` : "");
            } else if (days.length === 1) {
              datePart = montageDayLabel(days[0], false);
            } else {
              datePart = `${days.length} jours${durStr(totalMin) ? `  ·  ${durStr(totalMin)}` : ""}`;
            }
            const value = dateAndWho(datePart, montageWho);
            const montageRow = total <= 0
              ? <LineRow label="Montage" value={value} docUrl={montagePhotosUrl} />
              : (
                <ProgressRow
                  label="Montage"
                  pct={pct}
                  caption={`${installed}/${total} · ${pct}%`}
                  color={pct >= 100 ? "#15803d" : "#2563eb"}
                  value={value}
                  docUrl={montagePhotosUrl}
                />
              );
            return (
              <React.Fragment>
                {montageRow}
                {days.length > 1
                  ? (() => {
                      // Monteur affiché par jour seulement s'il varie d'un jour à
                      // l'autre (sinon déjà indiqué sur la ligne Montage).
                      const distinctWho = new Set(days.map((d) => d.who).filter(Boolean));
                      const perDayWho = distinctWho.size > 1;
                      return days.map((d, i) => (
                        <LineRow key={i} label={i === 0 ? "Jours de montage" : ""} value={montageDayLabel(d, perDayWho)} />
                      ));
                    })()
                  : null}
              </React.Fragment>
            );
          })()}
          {/* SAV : progression cabines clôturées / total SAV (comme Montage).
              Flèche → rapport SAV signé. Sans SAV, ligne simple sans barre. */}
          {(() => {
            const reclam = parseCabMulti(project.commentairesSav);
            const cause = parseCabMulti(project.causeSavCabines);
            const rdv = parseCabMulti(project.datesRdvSavCabines);
            const collab = parseCabMulti(project.collaborateursSavCabines);
            const fait = parseCabMulti(project.savRetouchesCabines);
            const recu = parseCabMulti(project.dateSAVRecu);
            const cloture = parseCabMulti(project.datesSavClotureCabines);
            const cabHasSav = (n: number) => !!(reclam[n] || cause[n] || rdv[n] || collab[n] || fait[n] || recu[n]);
            const keys = new Set<number>();
            [reclam, cause, rdv, collab, fait, recu].forEach((mp) => Object.keys(mp).forEach((k) => keys.add(parseInt(k, 10))));
            const savCabs = [...keys].filter(cabHasSav);
            const totalSav = savCabs.length;
            // Date / heures / collaborateurs du SAV. La date est stockée PAR CABINE
            // (datesRdvSavCabines), les heures dans « Heure arrivée/départ SAV »
            // (simples, ou multi-jours au format daté). On construit la même valeur
            // que la ligne Montage : « date · arr–dep (durée) — collaborateur(s) ».
            const firstCab = savCabs[0];
            const ha = project.heureArriveeSav || "", hd = project.heureDepartSav || "";
            const savMulti = isMultiDayHours(ha, hd);
            const pts = savMulti ? parsePointages(ha, hd) : [];
            const ptMin = (p: { arrivee: string; depart: string }) => {
              if (!/^\d{1,2}:\d{2}$/.test(p.arrivee) || !/^\d{1,2}:\d{2}$/.test(p.depart)) return 0;
              const [ah, am] = p.arrivee.split(":").map(Number); const [dh, dm] = p.depart.split(":").map(Number);
              const d = dh * 60 + dm - (ah * 60 + am); return d > 0 ? d : 0;
            };
            let savDatePart: string;
            if (savMulti && pts.length) {
              const totalMin = pts.reduce((s, p) => s + ptMin(p), 0);
              savDatePart = pts.length === 1
                ? [fmtDate(pts[0].date), (pts[0].arrivee && pts[0].depart) ? `${plageHoraire(pts[0].arrivee, pts[0].depart)}${durStr(ptMin(pts[0])) ? ` (${durStr(ptMin(pts[0]))})` : ""}` : ""].filter(Boolean).join("  ·  ")
                : `${pts.length} jours${durStr(totalMin) ? `  ·  ${durStr(totalMin)}` : ""}`;
            } else {
              const savDateRaw = ((firstCab && rdv[firstCab]) || project.dateRDVSAV || "").slice(0, 10);
              const hours = montageHoursStr(ha, hd);
              savDatePart = [savDateRaw ? fmtDate(savDateRaw) : "", hours].filter(Boolean).join("  ·  ");
            }
            const savWho = (firstCab && collab[firstCab]) || project.collaborateursSAV
              || (pts.length ? [...new Set(pts.flatMap((p) => (p.collaborateur || "").split(" & ").filter(Boolean)))].join(" & ") : "");
            const value = dateAndWho(savDatePart, savWho);
            /* Aucun SAV, et rien à en dire : la ligne disparaît. Un tiret en
               face de « SAV » laissait croire qu'on attendait une information
               qui n'est simplement pas de ce chantier. */
            if (totalSav <= 0 && value === "—") return null;
            // Pas de SAV par cabine → ligne simple, SANS flèche de téléchargement.
            if (totalSav <= 0) return <LineRow label="SAV" value={value} />;
            const clos = savCabs.filter((n) => cloture[n]).length;
            const pct = Math.round((clos / totalSav) * 100);
            return (
              <React.Fragment>
                <ProgressRow
                  label="SAV"
                  pct={pct}
                  caption={`${clos}/${totalSav} · ${pct}%`}
                  color={pct >= 100 ? "#15803d" : "#d97706"}
                  value={value}
                  docUrl={savReportUrl}
                />
                {/* SAV multi-jours : détail par intervention (comme « Jours de montage »). */}
                {savMulti && pts.length > 1
                  ? pts.map((p, i) => (
                      <LineRow
                        key={i}
                        label={i === 0 ? "Jours de SAV" : ""}
                        value={`${ddmm(p.date)}${(p.arrivee && p.depart) ? ` : ${plageHoraire(p.arrivee, p.depart)}${durStr(ptMin(p)) ? ` (${durStr(ptMin(p))})` : ""}` : ""}${p.collaborateur ? ` — ${p.collaborateur}` : ""}`}
                      />
                    ))
                  : null}
              </React.Fragment>
            );
          })()}
          {/* La garantie ne concerne pas tous les chantiers : on ne la porte que
              lorsque Notion a de quoi la remplir. */}
          {(() => {
            const garantie = dateAndWho(fmtDate(project.dateRDVGarantie), project.collaborateurGarantie);
            return garantie === "—" ? null : <LineRow label="Garantie" value={garantie} />;
          })()}
          {/* Ligne « Services » retirée : aucune colonne Notion ne la nourrit
              encore. Elle reviendra quand l'onglet existera. */}
        </View>

        {/* Mesures par lot — téléchargement de la mesure de chaque cabine
            (Duka : pages du lot ; sinon fichier entier). Affiché si mappé. */}
        {mesures.length > 0 ? (
          <View style={styles.section} wrap={false}>
            <Text style={styles.sectionTitle}>Mesures par lot</Text>
            {mesures.map((m) => (
              <View key={m.cab} style={styles.row}>
                <Text style={styles.label}>{nfc(m.nom)}{m.serie ? ` · ${nfc(m.serie)}` : ""}</Text>
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
                  <Link src={m.url} style={{ fontSize: 9, color: "#1e3a5f", textDecoration: "none", fontFamily: "Helvetica-Bold" }}>Télécharger la mesure</Link>
                  <Link src={m.url} style={{ marginLeft: 5, textDecoration: "none" }}><DownloadArrow /></Link>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Contact — colonnes (comme la fiche fournisseur) */}
        <View style={styles.section} wrap={false}>
          <Text style={styles.sectionTitle}>Contact</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            {/* Fournisseur en tête, et seulement quand c'est LUI le client : sur
                un chantier facturé au grossiste, le fournisseur n'est qu'un
                fabricant et n'a rien à faire dans les contacts du chantier.

                Son contact ne vient pas du projet mais de la FICHE du
                fournisseur, qui tient la relation « Contacts » vers ses
                interlocuteurs — chez Nelo GmbH, Stéphan Brem et son numéro. */}
            {estClientFournisseur ? (
              <ContactCell
                label="FOURNISSEUR"
                company={joinVal(project.fournisseursNames)}
                contacts={project.fournisseursContacts}
                width="33.33%"
              />
            ) : null}
            <ContactCell label="GROSSISTE" company={joinVal(project.grossistesNames)} contacts={project.contactsGrossisteDetails} width="33.33%" />
            <ContactCell label="INSTALLATEUR" company={joinVal(project.sanitaireNames)} contacts={project.contactsSanitaireDetails} width="33.33%" />
            <ContactCell label="ARCHITECTE" company={joinVal(project.architecteNames)} contacts={project.contactsArchitecteDetails} width="33.33%" />
            <ContactCell label="DT" company={joinVal(project.dtNames)} contacts={project.contactsDTDetails} width="33.33%" />
            <ContactCell label="CLIENT FINAL" contacts={project.contactsClientsFinauxDetails} width="33.33%" />
            <ContactCell label="LOCATAIRES" contacts={project.contactsLocatairesDetails} width="33.33%" />
            <ContactCell label="AUTRES" parEtiquette contacts={project.contactsAutresDetails} width="33.33%" />
          </View>
        </View>

        <Text style={styles.footer} fixed>
          TM Douche Montage | Champs-Lovat 13 Box n°2 & 3, 1400 Yverdon-les-Bains | Tél : +41 79 555 24 74 | www.douche-montage.ch | info@douche-montage.ch
        </Text>
        <Text style={styles.genStamp} fixed>Fiche générée le {genDate}</Text>
      </Page>

      {/* PAGE 2 — Commentaires + infos chantier + journal des échanges.
          Rendue seulement si au moins une section est renseignée. */}
      {(() => {
        const savReclam = Object.values(parseCabMulti(project.commentairesSav)).map((s) => nfc(s).trim()).filter(Boolean).join("\n");
        // Commentaires natifs Notion (discussions de la page) → un bloc par commentaire.
        const notionCommentsText = (notionComments || [])
          .map((c) => {
            const meta = [c.author, c.date].filter(Boolean).join(" · ");
            return (meta ? meta + " : " : "") + nfc(c.text).trim();
          })
          .filter(Boolean)
          .join("\n\n");
        const sections = [
          { title: "Commentaires Mesures", text: nfc(project.commentairesMesures || "").trim() },
          { title: "Commentaires Montage", text: nfc(project.commentairesMontages || "").trim() },
          { title: "Commentaires SAV", text: savReclam },
          { title: "Divers infos chantier", text: nfc(project.diversInfosChantier || "").trim() },
          { title: "Journal des échanges", text: nfc(project.journalEchanges || "").trim() },
          { title: "Commentaires (Notion)", text: notionCommentsText },
        ].filter((s) => s.text);
        if (sections.length === 0) return null;
        return (
          <Page size="A4" style={styles.page}>
            <View style={styles.header}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                <Image src={LOGO_BASE64} style={{ width: 180, height: 27 }} />
              </View>
              <Text style={styles.title}>Compléments</Text>
              <Text style={styles.tm}>{project.ofrTM || "TM-—"}</Text>
              {project.projet ? <Text style={styles.subtitle}>{nfc(project.projet)}</Text> : null}
            </View>
            {sections.map((s) => (
              <View key={s.title} style={styles.section} wrap={false}>
                <Text style={styles.sectionTitle}>{s.title}</Text>
                <Text style={{ fontSize: 9.5, color: "#1a1a1a", lineHeight: 1.4 }}>{s.text}</Text>
              </View>
            ))}
            <Text style={styles.footer} fixed>
              TM Douche Montage | Champs-Lovat 13 Box n°2 & 3, 1400 Yverdon-les-Bains | Tél : +41 79 555 24 74 | www.douche-montage.ch | info@douche-montage.ch
            </Text>
            <Text style={styles.genStamp} fixed>Fiche générée le {genDate}</Text>
          </Page>
        );
      })()}
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

// Commentaires NATIFS Notion (discussions de la page) → texte pour la page 2.
type FicheComment = { text: string; author?: string; date?: string };
async function fetchNotionComments(pageId: string): Promise<FicheComment[]> {
  const token = process.env.NOTION_TOKEN;
  if (!token) return [];
  const out: FicheComment[] = [];
  let cursor: string | undefined;
  try {
    do {
      const url = new URL("https://api.notion.com/v1/comments");
      url.searchParams.set("block_id", pageId);
      url.searchParams.set("page_size", "100");
      if (cursor) url.searchParams.set("start_cursor", cursor);
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}`, "Notion-Version": "2022-06-28" },
        cache: "no-store",
      });
      if (!res.ok) break;
      const data: any = await res.json();
      for (const c of (data.results || [])) {
        const text = (c.rich_text || []).map((t: any) => t.plain_text || "").join("").trim();
        if (!text) continue;
        out.push({ text, author: c.created_by?.name || undefined, date: c.created_time ? c.created_time.slice(0, 10) : undefined });
      }
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);
  } catch { /* commentaires indisponibles → on ignore */ }
  return out;
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
    const cartonsDocUrl = (project.photosCartons || []).length > 0 ? zipUrl("photosCartons") : undefined;
    // « Photos des cartons réceptionnés » : tous les cartons reçus, à distinguer
    // de « État des cartons » qui ne montre que les dégâts constatés.
    const cartonsRecusUrl = (project.photosCartonsRecus || []).length > 0 ? zipUrl("photosCartonsRecus") : undefined;
    const signalementsUrl = `${req.nextUrl.origin}/api/rapport-signalements/${encodeURIComponent(id)}?s=${signSignalements(id)}`;
    // Flèche SAV → rapport SAV signé (toutes cabines), ouvrable sans login.
    const savReportUrl = `${req.nextUrl.origin}/api/sav/${encodeURIComponent(id)}?s=${signSav(id)}`;
    // Lien vers la page du rapport de montage (upload photos + horaires).
    const reportUrl = `${req.nextUrl.origin}/projet/${encodeURIComponent(id)}`;
    // Lien vers le PDF « Suivi du chantier » (signé → ouvrable sans login).
    const syntheseUrl = `${req.nextUrl.origin}/api/synthese/${encodeURIComponent(id)}?s=${signSynthese(id)}`;
    const notionComments = await fetchNotionComments(id).catch(() => [] as FicheComment[]);
    // Signalements OUVERTS (KV) pour le bandeau d'alerte en haut de fiche.
    type SigPiece = { projectId: string; status?: string };
    type SigDefaut = { projectId: string; phase?: string; resolved?: boolean };
    const [allPieces, allDefauts] = await Promise.all([
      getDataFresh<SigPiece>("pieces").catch(() => getData<SigPiece>("pieces").catch(() => [] as SigPiece[])),
      getDataFresh<SigDefaut>("defauts").catch(() => getData<SigDefaut>("defauts").catch(() => [] as SigDefaut[])),
    ]);
    const myPieces = allPieces.filter((p) => p.projectId === id);
    const myDefauts = allDefauts.filter((d) => d.projectId === id);
    const sig = {
      // OUVERTS (à traiter) — affichés en puces colorées.
      pieces: myPieces.filter((p) => p.status !== "recu").length,
      defauts: myDefauts.filter((d) => d.phase !== "avant-intervention" && !d.resolved).length,
      avant: myDefauts.filter((d) => d.phase === "avant-intervention" && !d.resolved).length,
      // RÉGLÉS — résumé compact « x réglé » (pièces reçues + défauts/constats cochés réglés).
      done: myPieces.filter((p) => p.status === "recu").length
        + myDefauts.filter((d) => d.resolved).length,
    };
    // Mesures par cabine (mappage analysé, stocké en KV) → lien signé par lot.
    type MesureLot = { projectId: string; cab: number; serie?: string; ref?: string; fileName: string; pageStart: number | null; pageEnd: number | null };
    const mesuresMap = (isNewProjectForMesures(project.createdTime)
      ? (await getDataFresh<MesureLot>("mesures-map").catch(() => getData<MesureLot>("mesures-map").catch(() => [] as MesureLot[])))
      : [])
      .filter((e) => e.projectId === id)
      .sort((a, b) => a.cab - b.cab);
    const cabNoms = parseCabMulti(project.nomsCabines);
    const mesures = mesuresMap.map((e) => ({
      cab: e.cab,
      nom: cabNoms[e.cab] || e.ref || `Cabine ${e.cab}`,
      serie: e.serie || "",
      url: `${req.nextUrl.origin}/api/mesures/${encodeURIComponent(id)}/download?cab=${e.cab}&s=${signMesure(id, e.cab)}`,
    }));
    const pdfStream = await ReactPDF.renderToStream(<FichePDF project={project} mesuresDocUrl={mesuresDocUrl} montagePhotosUrl={montagePhotosUrl} cartonsDocUrl={cartonsDocUrl} cartonsRecusUrl={cartonsRecusUrl} savReportUrl={savReportUrl} reportUrl={reportUrl} syntheseUrl={syntheseUrl} signalementsUrl={signalementsUrl} notionComments={notionComments} sig={sig} mesures={mesures} />);
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
