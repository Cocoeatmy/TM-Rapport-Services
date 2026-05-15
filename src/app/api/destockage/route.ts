import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

export interface StockCabine {
  id: string;
  serie: string;               // ex: "Multi-S 4000"
  fournisseur: string;         // ex: "Duka", "Duscholux"
  quantity: number;            // nb cabines pour cette entrée
  emplacement: string;         // ex: "Dépôt TM Yverdon", "Atelier"
  dateArrivee: string;         // YYYY-MM-DD — date de réception en stock
  commentaires: string;
  status: "stock" | "destocke";
  destockedAt: string;         // YYYY-MM-DD — vide tant que le statut est "stock"
  destockedBy: string;         // nom du monteur qui a déstocké
  destockedProjectRef: string; // référence libre vers le projet (ex: OFR, nom)
  createdAt: number;           // timestamp ms
  createdBy: string;           // email de l'utilisateur qui a créé l'entrée
  // ── Métadonnées cabine ──
  photoCabine?: string;        // URL Cloudinary — photo représentative
  mesuresCabinePdf?: string;   // URL Cloudinary — fiche de mesures PDF
  mesuresCabinePdfName?: string; // Nom du fichier PDF original
  configuration?: string[];    // Niche | Angle | Quart de cercle | …
  version?: string[];          // Avec profiles | Sans profiles | Profils UP
  typeVerre?: string[];        // Transparent | Satiné | Discret | …
  traitementVerre?: string[];  // Sans traitement | Traitement de surface | …
  couleur?: string[];          // Argent mat | Argent brillant | Noir mat | …
  prixAchat?: number;          // CHF
  prixVente?: number;          // CHF
  mesuresApprox?: string;      // ex: "90×90 cm, H=200 cm"
  numeroArticle?: string;      // ex: "12345-A"
}

const KEY = "destockage";

function parseArr(v: unknown): string[] {
  return Array.isArray(v) ? v : [];
}
function parsePrix(v: unknown): number | undefined {
  if (v === "" || v === null || v === undefined) return undefined;
  const n = parseFloat(String(v));
  return isNaN(n) ? undefined : n;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const data = await getData<StockCabine>(KEY);
  data.sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  if (!body.serie || typeof body.serie !== "string") {
    return NextResponse.json({ error: "Série requise" }, { status: 400 });
  }

  const all = await getData<StockCabine>(KEY);
  const entry: StockCabine = {
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    serie: body.serie.trim(),
    fournisseur: (body.fournisseur || "").trim(),
    quantity: Number.isFinite(body.quantity) ? Number(body.quantity) : 1,
    emplacement: (body.emplacement || "").trim(),
    dateArrivee: body.dateArrivee || "",
    commentaires: (body.commentaires || "").trim(),
    status: "stock",
    destockedAt: "",
    destockedBy: "",
    destockedProjectRef: "",
    createdAt: Date.now(),
    createdBy: user.email,
    photoCabine: body.photoCabine || "",
    mesuresCabinePdf: body.mesuresCabinePdf || "",
    mesuresCabinePdfName: body.mesuresCabinePdfName || "",
    configuration: parseArr(body.configuration),
    version: parseArr(body.version),
    typeVerre: parseArr(body.typeVerre),
    traitementVerre: parseArr(body.traitementVerre),
    couleur: parseArr(body.couleur),
    prixAchat: parsePrix(body.prixAchat),
    prixVente: parsePrix(body.prixVente),
    mesuresApprox: (body.mesuresApprox || "").trim(),
    numeroArticle: (body.numeroArticle || "").trim(),
  };
  all.unshift(entry);
  await setData(KEY, all);
  return NextResponse.json(entry, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const all = await getData<StockCabine>(KEY);
  const idx = all.findIndex((e) => e.id === body.id);
  if (idx === -1) return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });

  const cur = all[idx];
  const updated: StockCabine = {
    ...cur,
    serie:               body.serie !== undefined ? String(body.serie).trim() : cur.serie,
    fournisseur:         body.fournisseur !== undefined ? String(body.fournisseur).trim() : cur.fournisseur,
    quantity:            body.quantity !== undefined ? Number(body.quantity) : cur.quantity,
    emplacement:         body.emplacement !== undefined ? String(body.emplacement).trim() : cur.emplacement,
    dateArrivee:         body.dateArrivee !== undefined ? String(body.dateArrivee) : cur.dateArrivee,
    commentaires:        body.commentaires !== undefined ? String(body.commentaires).trim() : cur.commentaires,
    destockedProjectRef: body.destockedProjectRef !== undefined ? String(body.destockedProjectRef).trim() : cur.destockedProjectRef,
    photoCabine:         body.photoCabine !== undefined ? body.photoCabine : cur.photoCabine,
    mesuresCabinePdf:    body.mesuresCabinePdf !== undefined ? body.mesuresCabinePdf : cur.mesuresCabinePdf,
    mesuresCabinePdfName:body.mesuresCabinePdfName !== undefined ? body.mesuresCabinePdfName : cur.mesuresCabinePdfName,
    configuration:       body.configuration !== undefined ? parseArr(body.configuration) : cur.configuration,
    version:             body.version !== undefined ? parseArr(body.version) : cur.version,
    typeVerre:           body.typeVerre !== undefined ? parseArr(body.typeVerre) : cur.typeVerre,
    traitementVerre:     body.traitementVerre !== undefined ? parseArr(body.traitementVerre) : cur.traitementVerre,
    couleur:             body.couleur !== undefined ? parseArr(body.couleur) : cur.couleur,
    prixAchat:           body.prixAchat !== undefined ? parsePrix(body.prixAchat) : cur.prixAchat,
    prixVente:           body.prixVente !== undefined ? parsePrix(body.prixVente) : cur.prixVente,
    mesuresApprox:       body.mesuresApprox !== undefined ? String(body.mesuresApprox).trim() : cur.mesuresApprox,
    numeroArticle:       body.numeroArticle !== undefined ? String(body.numeroArticle).trim() : cur.numeroArticle,
  };

  if (body.status === "destocke" && cur.status !== "destocke") {
    updated.status = "destocke";
    updated.destockedAt = new Date().toISOString().slice(0, 10);
    updated.destockedBy = user.name || user.email;
  } else if (body.status === "stock" && cur.status !== "stock") {
    updated.status = "stock";
    updated.destockedAt = "";
    updated.destockedBy = "";
  }

  all[idx] = updated;
  await setData(KEY, all);
  return NextResponse.json(updated);
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: "id requis" }, { status: 400 });

  const all = await getData<StockCabine>(KEY);
  const next = all.filter((e) => e.id !== body.id);
  if (next.length === all.length) return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
  await setData(KEY, next);
  return NextResponse.json({ success: true });
}
