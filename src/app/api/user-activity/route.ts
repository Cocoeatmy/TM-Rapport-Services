import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

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

    // Load existing from Notion
    const activities = await getData<UserActivity>("user-activity") || [];

    // Update or add entry
    const entry: UserActivity = {
      email: user.email,
      name: user.name,
      lastSeen: new Date().toISOString(),
    };

    const idx = activities.findIndex((a) => a.email === user.email);
    if (idx >= 0) {
      activities[idx] = entry;
    } else {
      activities.push(entry);
    }

    // Save to Notion (await to ensure it's persisted)
    await setData("user-activity", activities as any);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("User activity POST error:", error);
    return NextResponse.json({ success: true }); // Don't fail the app open
  }
}

// GET: get all user activities (admin only)
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("auth-token")?.value;
    if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const user = await verifyToken(token);
    if (!user || user.role !== "admin") return NextResponse.json({ error: "Non autorisé" }, { status: 403 });

    // Always load fresh from Notion
    const activities = await getData<UserActivity>("user-activity") || [];
    return NextResponse.json(activities);
  } catch (error: any) {
    console.error("User activity GET error:", error);
    return NextResponse.json([]);
  }
}
