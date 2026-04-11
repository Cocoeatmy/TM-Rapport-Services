import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData, setData } from "@/lib/kv-store";

/**
 * Backup route – creates a timestamped snapshot of all kv-store data keys
 * and stores the snapshot itself in the kv-store (Notion-backed).
 *
 * This replaces the previous filesystem-based backup which was ephemeral on
 * Vercel serverless.
 */

interface BackupRecord {
  name: string;      // timestamp identifier
  date: string;      // ISO date string
  keys: string[];    // which data keys were backed up
}

const BACKUP_INDEX_KEY = "backup-index";
const DATA_KEYS = ["pieces", "defauts", "logs", "stocks", "notifications"];

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backedUpKeys: string[] = [];

    for (const key of DATA_KEYS) {
      try {
        const data = await getData(key);
        // Store a snapshot under a timestamped key
        await setData(`backup-${timestamp}-${key}`, data);
        backedUpKeys.push(key);
      } catch {
        // Skip keys that fail to read
      }
    }

    // Update the backup index
    const index = await getData<BackupRecord>(BACKUP_INDEX_KEY);
    index.unshift({
      name: timestamp,
      date: new Date().toISOString(),
      keys: backedUpKeys,
    });

    // Keep the last 10 backups in the index
    await setData(BACKUP_INDEX_KEY, index.slice(0, 10));

    return NextResponse.json({
      success: true,
      backup: timestamp,
      keys: backedUpKeys.length,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Backup failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  try {
    const index = await getData<BackupRecord>(BACKUP_INDEX_KEY);
    return NextResponse.json(index);
  } catch {
    return NextResponse.json([]);
  }
}
