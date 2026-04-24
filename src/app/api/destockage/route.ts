import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

export interface StockCabine {
  id: string;
  serie: string;            // ex: "Multi-S 4000"
  fournisseur: string;      // ex: "Duka", "Duscholux"
  quantity: number;         // nb cabines pour cette entrée
  emplacement: string;      // ex: "Dépôt TM Yverdon", "Atelier"
  dateArrivee: string;      // YYYY-MM-DD — date de réception en stock
  commentaires: string;
  status: "stock" | "destocke";
  destockedAt: string;      // YYYY-MM-DD — vide tant que le statut est "stock"
  destockedBy: string;      // nom du monteur qui a déstocké
  destockedProjectRef: string; // référence libre vers le projet (ex: OFR, nom)
  createdAt: number;        // timestamp ms
  createdBy: string;        // email de l'utilisateur qui a créé l'entrée
}

const KEY = "destockage";

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const data = await getData<StockCabine>(KEY);
  // Plus récentes d'abord (par date de création).
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

  const current = all[idx];
  const updated: StockCabine = {
    ...current,
    serie: body.serie !== undefined ? String(body.serie).trim() : current.serie,
    fournisseur: body.fournisseur !== undefined ? String(body.fournisseur).trim() : current.fournisseur,
    quantity: body.quantity !== undefined ? Number(body.quantity) : current.quantity,
    emplacement: body.emplacement !== undefined ? String(body.emplacement).trim() : current.emplacement,
    dateArrivee: body.dateArrivee !== undefined ? String(body.dateArrivee) : current.dateArrivee,
    commentaires: body.commentaires !== undefined ? String(body.commentaires).trim() : current.commentaires,
    destockedProjectRef: body.destockedProjectRef !== undefined ? String(body.destockedProjectRef).trim() : current.destockedProjectRef,
  };

  // Transition de statut : si la requête passe status=destocke, on horodate
  // et on mémorise qui a déstocké. Permet aussi de revenir "stock" si erreur.
  if (body.status === "destocke" && current.status !== "destocke") {
    updated.status = "destocke";
    updated.destockedAt = new Date().toISOString().slice(0, 10);
    updated.destockedBy = user.name || user.email;
  } else if (body.status === "stock" && current.status !== "stock") {
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
