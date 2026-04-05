import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getProjects } from "@/lib/notion";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Admin requis" }, { status: 403 });

  try {
    const projects = await getProjects();
    const now = new Date();
    const monthName = now.toLocaleDateString("fr-CH", { month: "long", year: "numeric" });

    // Stats
    const totalProjets = projects.length;
    const totalCabines = projects.reduce((s, p) => s + (p.nbCabines || 0), 0);

    // Par collaborateur
    const collabMap: Record<string, number> = {};
    projects.forEach((p) => {
      const c = p.collaborateurs || "Non assigné";
      collabMap[c] = (collabMap[c] || 0) + (p.nbCabines || 0);
    });

    // Par série
    const seriesMap: Record<string, number> = {};
    projects.forEach((p) => {
      p.seriesCabines.forEach((s) => {
        seriesMap[s] = (seriesMap[s] || 0) + (p.nbCabines || 1);
      });
    });

    // Par fournisseur
    const fournisseurMap: Record<string, number> = {};
    projects.forEach((p) => {
      p.fournisseurs.forEach((f) => {
        fournisseurMap[f] = (fournisseurMap[f] || 0) + (p.nbCabines || 1);
      });
    });

    const collabHtml = Object.entries(collabMap)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `<tr><td style="padding:6px;border-bottom:1px solid #eee">${name}</td><td style="padding:6px;border-bottom:1px solid #eee;font-weight:bold;text-align:right">${count}</td></tr>`)
      .join("");

    const seriesHtml = Object.entries(seriesMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, count]) => `<tr><td style="padding:6px;border-bottom:1px solid #eee">${name}</td><td style="padding:6px;border-bottom:1px solid #eee;font-weight:bold;text-align:right">${count}</td></tr>`)
      .join("");

    const fournisseurHtml = Object.entries(fournisseurMap)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `<tr><td style="padding:6px;border-bottom:1px solid #eee">${name}</td><td style="padding:6px;border-bottom:1px solid #eee;font-weight:bold;text-align:right">${count}</td></tr>`)
      .join("");

    await resend.emails.send({
      from: "TM Rapport Services <onboarding@resend.dev>",
      to: "ferreira.micael@gmail.com",
      subject: `Rapport mensuel TM - ${monthName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h1 style="color:#1e3a5f">Rapport mensuel</h1>
          <p style="color:#666">${monthName}</p>

          <div style="display:flex;gap:16px;margin:20px 0">
            <div style="flex:1;background:#f0f4f8;padding:16px;border-radius:8px;text-align:center">
              <p style="font-size:28px;font-weight:bold;color:#1e3a5f;margin:0">${totalProjets}</p>
              <p style="font-size:12px;color:#666;margin:4px 0 0">Projets en cours</p>
            </div>
            <div style="flex:1;background:#f0f4f8;padding:16px;border-radius:8px;text-align:center">
              <p style="font-size:28px;font-weight:bold;color:#1e3a5f;margin:0">${totalCabines}</p>
              <p style="font-size:12px;color:#666;margin:4px 0 0">Cabines</p>
            </div>
          </div>

          <h2 style="color:#1e3a5f;font-size:16px;margin-top:24px">Cabines par équipe</h2>
          <table style="width:100%;border-collapse:collapse">${collabHtml}</table>

          <h2 style="color:#1e3a5f;font-size:16px;margin-top:24px">Top séries de cabines</h2>
          <table style="width:100%;border-collapse:collapse">${seriesHtml}</table>

          <h2 style="color:#1e3a5f;font-size:16px;margin-top:24px">Cabines par fournisseur</h2>
          <table style="width:100%;border-collapse:collapse">${fournisseurHtml}</table>

          <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
          <p style="color:#999;font-size:11px">TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon<br />
          +41 79 555 24 74 | www.douche-montage.ch</p>
        </div>
      `,
    });

    return NextResponse.json({ success: true, message: "Rapport envoyé" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
