import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import { join } from "path";

const DATA_DIR = join(process.cwd(), "data");
const BACKUP_DIR = join(process.cwd(), "data", "backups");

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const backupPath = join(BACKUP_DIR, timestamp);
    mkdirSync(backupPath, { recursive: true });

    // Backup users.json
    const usersFile = join(DATA_DIR, "users.json");
    if (existsSync(usersFile)) copyFileSync(usersFile, join(backupPath, "users.json"));

    // Backup pieces.json
    const piecesFile = join(DATA_DIR, "pieces.json");
    if (existsSync(piecesFile)) copyFileSync(piecesFile, join(backupPath, "pieces.json"));

    // Backup chats
    const chatsDir = join(DATA_DIR, "chats");
    if (existsSync(chatsDir)) {
      const chatBackup = join(backupPath, "chats");
      mkdirSync(chatBackup, { recursive: true });
      readdirSync(chatsDir).forEach((f) => {
        copyFileSync(join(chatsDir, f), join(chatBackup, f));
      });
    }

    // Nettoyer les vieux backups (garder les 30 derniers)
    const backups = readdirSync(BACKUP_DIR)
      .filter((f) => f !== ".gitkeep")
      .sort()
      .reverse();
    backups.slice(30).forEach((old) => {
      const oldPath = join(BACKUP_DIR, old);
      try {
        readdirSync(oldPath).forEach((f) => {
          try { require("fs").unlinkSync(join(oldPath, f)); } catch {}
        });
        require("fs").rmdirSync(oldPath);
      } catch {}
    });

    return NextResponse.json({
      success: true,
      backup: timestamp,
      files: readdirSync(backupPath).length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  try {
    if (!existsSync(BACKUP_DIR)) return NextResponse.json([]);
    const backups = readdirSync(BACKUP_DIR)
      .filter((f) => f !== ".gitkeep")
      .sort()
      .reverse()
      .map((name) => ({
        name,
        date: name.replace(/-/g, (m, i) => i <= 9 ? "-" : i === 10 ? "T" : ":").slice(0, 19),
      }));
    return NextResponse.json(backups);
  } catch {
    return NextResponse.json([]);
  }
}
