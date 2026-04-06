import { NextRequest, NextResponse } from "next/server";
import { getData, setData } from "@/lib/kv-store";

// Vercel Cron: this endpoint is called automatically every night
// Configure in vercel.json: { "crons": [{ "path": "/api/cron/backup", "schedule": "0 2 * * *" }] }

const DATA_KEYS = ["pieces", "defauts", "logs", "stocks", "notifications"];

export async function GET(request: NextRequest) {
  // Verify cron secret or allow in development
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, { count: number; synced: boolean }> = {};

  for (const key of DATA_KEYS) {
    try {
      // getData reads from local file, setData writes to local + Notion backup
      const data = await getData(key);
      await setData(key, data);
      results[key] = { count: Array.isArray(data) ? data.length : 0, synced: true };
    } catch (error: any) {
      results[key] = { count: 0, synced: false };
    }
  }

  const timestamp = new Date().toISOString();
  console.log(`[CRON BACKUP] ${timestamp}`, results);

  return NextResponse.json({
    success: true,
    timestamp,
    results,
  });
}
