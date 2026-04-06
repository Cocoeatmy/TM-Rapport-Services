import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

interface StockItem {
  id: string;
  name: string;
  category: "consommable" | "piece" | "outil";
  quantity: number;
  minQuantity: number;
  unit: "pièces" | "tubes" | "boîtes" | "rouleaux";
  lastUpdated: number;
  updatedBy: string;
}

const DATA_DIR = join(process.cwd(), "data");
const STOCKS_FILE = join(DATA_DIR, "stocks.json");

function loadStocks(): StockItem[] {
  if (!existsSync(STOCKS_FILE)) return [];
  try { return JSON.parse(readFileSync(STOCKS_FILE, "utf-8")); } catch { return []; }
}

function saveStocks(stocks: StockItem[]) {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(STOCKS_FILE, JSON.stringify(stocks, null, 2));
  } catch {
    console.warn("Cannot write stocks file (serverless)");
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const stocks = loadStocks();
  return NextResponse.json(stocks);
}

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin uniquement" }, { status: 403 });

  const body = await request.json();
  const stocks = loadStocks();
  const newItem: StockItem = {
    id: Math.random().toString(36).slice(2),
    name: body.name,
    category: body.category,
    quantity: body.quantity || 0,
    minQuantity: body.minQuantity || 0,
    unit: body.unit || "pièces",
    lastUpdated: Date.now(),
    updatedBy: user.name,
  };
  stocks.push(newItem);
  saveStocks(stocks);
  return NextResponse.json({ success: true, item: newItem });
}

export async function PATCH(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json();
  const { id, quantity, adjustment } = body;
  const stocks = loadStocks();
  const idx = stocks.findIndex((s) => s.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  if (typeof adjustment === "number") {
    stocks[idx].quantity = Math.max(0, stocks[idx].quantity + adjustment);
  } else if (typeof quantity === "number") {
    stocks[idx].quantity = Math.max(0, quantity);
  }

  stocks[idx].lastUpdated = Date.now();
  stocks[idx].updatedBy = user.name;
  saveStocks(stocks);
  return NextResponse.json({ success: true, item: stocks[idx] });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Admin uniquement" }, { status: 403 });

  const { id } = await request.json();
  const stocks = loadStocks();
  const idx = stocks.findIndex((s) => s.id === id);
  if (idx === -1) return NextResponse.json({ error: "Non trouvé" }, { status: 404 });

  stocks.splice(idx, 1);
  saveStocks(stocks);
  return NextResponse.json({ success: true });
}
