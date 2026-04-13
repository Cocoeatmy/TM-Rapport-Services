import { NextRequest, NextResponse } from "next/server";
import { getData, setData } from "@/lib/kv-store";
import { getProject } from "@/lib/notion";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body.action || "view"; // "view" | "pdf"

    // Decode token to get project ID
    let projectId: string;
    try {
      projectId = Buffer.from(token, "base64url").toString("utf-8");
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    // Get existing consultations
    const consultations = await getData<any>("rapport-consultations") || [];

    // Add new consultation
    consultations.push({
      projectId,
      token,
      action,
      timestamp: new Date().toISOString(),
      userAgent: request.headers.get("user-agent") || "unknown",
      ip: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown",
    });

    // Keep last 1000 consultations
    const trimmed = consultations.slice(-1000);
    await setData("rapport-consultations", trimmed);

    // Notify admin on first view or PDF open
    try {
      const project = await getProject(projectId);
      const actionLabel = action === "pdf" ? "a ouvert le rapport PDF" : "a consulté le portail";
      // Send notification email to admin
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
      await resend.emails.send({
        from: "TM Rapport Services <onboarding@resend.dev>",
        to: "ferreira.micael@gmail.com",
        subject: `📬 Rapport consulté - ${project.projet}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto;">
            <div style="background: #059669; padding: 16px 20px; border-radius: 10px 10px 0 0;">
              <h3 style="color: white; margin: 0; font-size: 16px;">✅ Rapport consulté</h3>
            </div>
            <div style="background: #f0fdf4; padding: 20px; border: 1px solid #bbf7d0; border-top: none; border-radius: 0 0 10px 10px;">
              <p style="margin: 0 0 8px 0; color: #166534; font-size: 14px;">Le client <strong>${actionLabel}</strong> pour :</p>
              <p style="margin: 0; font-size: 18px; font-weight: 700; color: #14532d;">${project.projet}</p>
              <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">${new Date().toLocaleString("fr-CH", { dateStyle: "full", timeStyle: "short" })}</p>
            </div>
          </div>
        `,
      });
    } catch (notifyError) {
      console.error("Track notification error:", notifyError);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Track error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: admin reads consultations for a project
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    let projectId: string;
    try {
      projectId = Buffer.from(token, "base64url").toString("utf-8");
    } catch {
      return NextResponse.json({ error: "Invalid token" }, { status: 400 });
    }

    const consultations = await getData<any>("rapport-consultations") || [];
    const projectConsultations = consultations.filter((c: any) => c.projectId === projectId);

    return NextResponse.json(projectConsultations);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
