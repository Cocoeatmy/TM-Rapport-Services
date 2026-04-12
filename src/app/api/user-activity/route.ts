import { NextRequest, NextResponse } from "next/server";
import { getData, setData } from "@/lib/kv-store";
import { verifyToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

interface UserActivity {
  email: string;
  name: string;
  lastSeen: string;
}

// POST: record user activity (called on app open)
export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const user = await verifyToken(token);
    if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const activities = await getData<UserActivity>("user-activity") || [];
    const existing = activities.findIndex((a) => a.email === user.email);
    const entry: UserActivity = {
      email: user.email,
      name: user.name,
      lastSeen: new Date().toISOString(),
    };

    if (existing >= 0) {
      activities[existing] = entry;
    } else {
      activities.push(entry);
    }

    await setData("user-activity", activities as any);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: get all user activities (admin only)
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const user = await verifyToken(token);
    if (!user || user.role !== "admin") return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

    const activities = await getData<UserActivity>("user-activity") || [];
    return NextResponse.json(activities);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
