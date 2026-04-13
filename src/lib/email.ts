import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");

export async function sendPdfByEmail({
  projectName,
  ofrTM,
  collaborateur,
  collaborateurEmail,
  pdfBuffer,
  clientPortalUrl,
}: {
  projectName: string;
  ofrTM: string;
  collaborateur: string;
  collaborateurEmail: string;
  pdfBuffer: Buffer;
  clientPortalUrl?: string;
}) {
  try {
    // Email admin avec lien portail (pas de PDF en pièce jointe)
    await resend.emails.send({
      from: "TM Rapport Services <onboarding@resend.dev>",
      to: "ferreira.micael@gmail.com",
      subject: `Rapport de montage - ${projectName} (${ofrTM})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #1e3a5f; padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 20px;">Nouveau rapport de montage</h2>
            <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0 0; font-size: 14px;">Généré par ${collaborateur}</p>
          </div>
          <div style="background: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">Projet</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b; text-align: right;">${projectName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 13px;">N° OFR TM</td>
                <td style="padding: 10px 0; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1e293b; text-align: right;">${ofrTM}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-size: 13px;">Collaborateur</td>
                <td style="padding: 10px 0; font-weight: 600; color: #1e293b; text-align: right;">${collaborateur}</td>
              </tr>
            </table>
          </div>
          ${clientPortalUrl ? `
          <div style="padding: 24px; border: 1px solid #e2e8f0; border-top: none; text-align: center;">
            <p style="color: #64748b; font-size: 14px; margin: 0 0 16px 0;">Le client peut consulter son rapport via le lien ci-dessous.<br/>Vous serez notifié dès qu'il l'ouvre.</p>
            <a href="${clientPortalUrl}" style="display: inline-block; background: #1e3a5f; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
              Voir le portail client
            </a>
            <p style="margin: 16px 0 0 0; font-size: 12px; color: #94a3b8;">Lien à transmettre au client : <a href="${clientPortalUrl}" style="color: #1e3a5f; word-break: break-all;">${clientPortalUrl}</a></p>
          </div>` : ""}
          <div style="padding: 20px 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px; background: white;">
            <p style="color: #94a3b8; font-size: 11px; margin: 0; text-align: center;">
              TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon<br />
              +41 79 555 24 74 | www.douche-montage.ch
            </p>
          </div>
        </div>
      `,
    });
    return { success: true };
  } catch (error: any) {
    console.error("Email send error:", error);
    return { success: false, error: error.message };
  }
}
