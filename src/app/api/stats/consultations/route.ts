import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { getData } from "@/lib/kv-store";
import { getAllProjectsRaw } from "@/lib/notion";

export const dynamic = "force-dynamic";
// getAllProjectsRaw() est lourd : marge large pour éviter le timeout.
export const maxDuration = 120;

interface Consultation {
  projectId: string;
  token: string;
  action: "view" | "pdf";
  timestamp: string;
  userAgent: string;
  ip: string;
}

interface ProjectConsultationSummary {
  projectId: string;
  projet: string;
  typeClient: string;
  dateMontage: string | null;
  etatCMD: string;
  viewCount: number;
  pdfCount: number;
  total: number;
  firstView: string | null;
  lastView: string | null;
  consulted: boolean;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user || user.role !== "admin") return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const [consultations, projects] = await Promise.all([
      getData<Consultation>("rapport-consultations"),
      getAllProjectsRaw(),
    ]);

    const byProject = new Map<string, Consultation[]>();
    for (const c of consultations) {
      if (!c?.projectId) continue;
      const list = byProject.get(c.projectId) || [];
      list.push(c);
      byProject.set(c.projectId, list);
    }

    const sentProjects = projects.filter((p) => {
      const etat = (p.etatCMD || "").toLowerCase();
      return etat === "terminé" || etat === "termine";
    });

    const perProject: ProjectConsultationSummary[] = sentProjects.map((p) => {
      const list = (byProject.get(p.id) || []).slice().sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      const viewCount = list.filter((c) => c.action === "view").length;
      const pdfCount = list.filter((c) => c.action === "pdf").length;
      return {
        projectId: p.id,
        projet: p.projet,
        typeClient: p.typeClient,
        dateMontage: p.dateMontage,
        etatCMD: p.etatCMD,
        viewCount,
        pdfCount,
        total: list.length,
        firstView: list[0]?.timestamp || null,
        lastView: list[list.length - 1]?.timestamp || null,
        consulted: list.length > 0,
      };
    });

    const totalRapports = perProject.length;
    const consulted = perProject.filter((p) => p.consulted).length;
    const percentage = totalRapports > 0 ? Math.round((consulted / totalRapports) * 100) : 0;
    const totalViews = perProject.reduce((s, p) => s + p.viewCount, 0);
    const totalPdfOpens = perProject.reduce((s, p) => s + p.pdfCount, 0);

    return NextResponse.json({
      summary: {
        totalRapports,
        consulted,
        notConsulted: totalRapports - consulted,
        percentage,
        totalViews,
        totalPdfOpens,
      },
      projects: perProject,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
