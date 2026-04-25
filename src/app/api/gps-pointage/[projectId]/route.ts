import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";

/**
 * Pointage GPS automatique : enregistre une arrivée ou un départ
 * détecté par le BackgroundGpsTracker côté monteur. Côté admin,
 * lecture des événements pour afficher un chrono "temps sur site"
 * de contrôle (séparé du rapport — il NE va PAS dans heureArrivee
 * / heureDepart de Notion).
 */

export interface GpsEvent {
  id: string;
  projectId: string;
  userEmail: string;
  userName: string;
  type: "arrival" | "departure";
  /** Heure HH:MM en local Suisse au moment de la détection. */
  time: string;
  /** Timestamp ms côté serveur (vérité unique pour calculer la durée). */
  timestamp: number;
  /** YYYY-MM-DD pour grouper par jour. */
  date: string;
  /** Distance en mètres au site lors de l'événement (debug). */
  distance?: number;
}

const KEY = "gps-pointages";
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 min

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const type = body.type;
  if (type !== "arrival" && type !== "departure") {
    return NextResponse.json({ error: "Type invalide (arrival|departure)" }, { status: 400 });
  }

  const all = await getData<GpsEvent>(KEY);
  const now = Date.now();

  // Dédup : si le même user a posté le même type pour ce projet
  // dans les 5 dernières minutes, on ignore (évite les flips rapides
  // sur le bord du geofence).
  const recent = all.find(
    (e) =>
      e.projectId === projectId &&
      e.userEmail === user.email &&
      e.type === type &&
      now - e.timestamp < DEDUP_WINDOW_MS,
  );
  if (recent) {
    return NextResponse.json({ success: true, deduped: true, event: recent });
  }

  const time =
    body.time && /^\d{2}:\d{2}$/.test(body.time)
      ? body.time
      : new Date(now).toLocaleTimeString("fr-CH", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "Europe/Zurich",
        });

  const event: GpsEvent = {
    id: Math.random().toString(36).slice(2) + now.toString(36),
    projectId,
    userEmail: user.email,
    userName: user.name,
    type,
    time,
    timestamp: now,
    date: new Date(now).toLocaleDateString("fr-CA", { timeZone: "Europe/Zurich" }),
    ...(typeof body.distance === "number" ? { distance: body.distance } : {}),
  };

  // Garde les 5000 derniers événements toutes confondus (largement
  // assez pour quelques mois d'historique multi-monteurs multi-projets).
  const next = [...all, event].slice(-5000);
  await setData(KEY, next);

  return NextResponse.json({ success: true, event });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const all = await getData<GpsEvent>(KEY);
  return NextResponse.json(all.filter((e) => e.projectId === projectId));
}
