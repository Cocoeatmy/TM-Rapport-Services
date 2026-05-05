import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

export const dynamic = "force-dynamic";

export interface StoredSubscription {
  userId: string; // email
  subscription: PushSubscriptionJSON;
  deviceId: string;
  updatedAt: number;
}

const KEY = "push-subscriptions";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { subscription, deviceId } = await request.json();
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: "Subscription invalide" }, { status: 400 });
  }

  const all = await getData<StoredSubscription>(KEY);
  // Déduplique par endpoint (un même appareil peut se ré-inscrire)
  const filtered = all.filter(
    (s) => s.subscription.endpoint !== subscription.endpoint
  );
  filtered.push({
    userId: user.email,
    subscription,
    deviceId: deviceId || subscription.endpoint.slice(-12),
    updatedAt: Date.now(),
  });

  await setData(KEY, filtered);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { endpoint } = await request.json().catch(() => ({}));
  const all = await getData<StoredSubscription>(KEY);
  const filtered = endpoint
    ? all.filter((s) => s.subscription.endpoint !== endpoint)
    : all.filter((s) => s.userId !== user.email);
  await setData(KEY, filtered);
  return NextResponse.json({ ok: true });
}
