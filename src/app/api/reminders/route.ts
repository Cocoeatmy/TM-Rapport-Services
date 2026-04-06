import { NextRequest, NextResponse } from "next/server";
import { notion, databaseId, mapPageToProject } from "@/lib/notion";
import { createNotification } from "@/app/api/notifications/route";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

// Map collaborator first names to their email addresses
const COLLABORATOR_EMAILS: Record<string, string> = {
  "Claudio": "tm.douche.montage.1@gmail.com",
  "Jean-Marc": "tm.douche.montage.2@gmail.com",
  "Jacobo": "tm.douche.montage.3@gmail.com",
  "Miguel": "tm.douche.montage.4@gmail.com",
  "Loïc": "tm.douche.montage.5@gmail.com",
  "Micael": "ferreira.micael@gmail.com",
};

function getTomorrowDateString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow.toISOString().split("T")[0];
}

export async function POST(_request: NextRequest) {
  try {
    const tomorrowStr = getTomorrowDateString();

    // Fetch all projects with dateMontage = tomorrow
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        property: "Date Montage",
        date: {
          equals: tomorrowStr,
        },
      },
    });

    const projects = response.results.map(mapPageToProject);

    if (projects.length === 0) {
      return NextResponse.json({ sent: 0, message: "Aucun RDV demain" });
    }

    let notificationCount = 0;
    let emailCount = 0;
    const errors: string[] = [];

    // Optionally set up Resend for email
    const resendKey = process.env.RESEND_API_KEY;
    const resend = resendKey ? new Resend(resendKey) : null;

    for (const project of projects) {
      // Parse collaborator(s) - may be "Claudio" or "Claudio & Jean-Marc"
      const collabNames = project.collaborateurs
        ? project.collaborateurs.split("&").map((n) => n.trim()).filter(Boolean)
        : [];

      if (collabNames.length === 0) continue;

      const message = `${project.projet}${project.adresseChantier ? ` - ${project.adresseChantier}` : ""}`;

      for (const name of collabNames) {
        const email = COLLABORATOR_EMAILS[name];
        if (!email) continue;

        // Create in-app notification
        try {
          await createNotification(email, "rdv", "RDV demain", message);
          notificationCount++;
        } catch (err: any) {
          errors.push(`Notification error for ${name}: ${err.message}`);
        }

        // Send email reminder (optional)
        if (resend && email) {
          try {
            await resend.emails.send({
              from: "TM Rapport Services <onboarding@resend.dev>",
              to: email,
              subject: `Rappel RDV demain - ${project.projet}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px;">
                  <h2 style="color: #1e3a5f;">Rappel : RDV demain</h2>
                  <p>Bonjour ${name},</p>
                  <p>Vous avez un rendez-vous prevu demain :</p>
                  <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Projet</td>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${project.projet}</td>
                    </tr>
                    ${project.adresseChantier ? `
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Adresse</td>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${project.adresseChantier}</td>
                    </tr>
                    ` : ""}
                    <tr>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Date</td>
                      <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${tomorrowStr}</td>
                    </tr>
                  </table>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                  <p style="color: #999; font-size: 12px;">TM Douche Montage | Champs-Lovat 13 Box n.16, 1400 Yverdon<br />
                  +41 79 555 24 74 | www.douche-montage.ch</p>
                </div>
              `,
            });
            emailCount++;
          } catch (err: any) {
            errors.push(`Email error for ${name}: ${err.message}`);
          }
        }
      }
    }

    return NextResponse.json({
      sent: notificationCount,
      emails: emailCount,
      projects: projects.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("Reminders error:", error);
    return NextResponse.json(
      { error: error.message || "Erreur lors de l'envoi des rappels" },
      { status: 500 }
    );
  }
}
