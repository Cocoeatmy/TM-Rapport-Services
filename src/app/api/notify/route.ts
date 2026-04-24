import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { Resend } from "resend";
import { createNotification } from "@/app/api/notifications/route";

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
const ADMIN_EMAIL = "ferreira.micael@gmail.com";

export async function POST(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  const user = await verifyToken(token);
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  // Ne pas notifier l'admin de ses propres modifications
  if (user.email === ADMIN_EMAIL) {
    return NextResponse.json({ success: true, skipped: true });
  }

  const { projectName, action, details, projectId } = await request.json();

  try {
    // Create in-app notification for admin
    await createNotification(
      ADMIN_EMAIL,
      "piece",
      `${action} - ${projectName}`,
      `${details} (par ${user.name})`,
      projectId,
    );

    await resend.emails.send({
      from: "TM Rapport Services <onboarding@resend.dev>",
      to: ADMIN_EMAIL,
      subject: `[TM App] ${action} - ${projectName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1e3a5f;">Modification sur l'app</h2>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Projet</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${projectName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Action</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${action}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Détails</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${details}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Par</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${user.name}</td>
            </tr>
            <tr>
              <td style="padding: 8px; color: #666;">Date</td>
              <td style="padding: 8px;">${new Date().toLocaleString("fr-CH", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Zurich" })}</td>
            </tr>
          </table>
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">TM Rapport Services - Notification automatique</p>
        </div>
      `,
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Notification email error:", error);
    return NextResponse.json({ success: true, emailError: true });
  }
}
