import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

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
  const filename = `rapport-${ofrTM || projectName}.pdf`.replace(/[^a-zA-Z0-9.-]/g, "_");

  try {
    await resend.emails.send({
      from: "TM Rapport Services <onboarding@resend.dev>",
      to: "ferreira.micael@gmail.com",
      subject: `Rapport de montage - ${projectName} (${ofrTM})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <h2 style="color: #1e3a5f;">Nouveau rapport de montage</h2>
          <p>Un rapport a été généré par <strong>${collaborateur}</strong>.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Projet</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${projectName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">N° OFR TM</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${ofrTM}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee; color: #666;">Collaborateur</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">${collaborateur}</td>
            </tr>
          </table>
          <p style="color: #666; font-size: 14px;">Le rapport PDF est en pièce jointe.</p>${clientPortalUrl ? `
          <div style="margin: 16px 0; padding: 12px; background-color: #f0f4f8; border-radius: 8px; border-left: 4px solid #1e3a5f;">
            <p style="margin: 0 0 8px 0; font-weight: bold; color: #1e3a5f;">Lien portail client</p>
            <a href="${clientPortalUrl}" style="color: #1e3a5f; word-break: break-all;">${clientPortalUrl}</a>
          </div>` : ""}
          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
          <p style="color: #999; font-size: 12px;">TM Douche Montage | Champs-Lovat 13 Box n°16, 1400 Yverdon<br />
          +41 79 555 24 74 | www.douche-montage.ch</p>
        </div>
      `,
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
    });
    return { success: true };
  } catch (error: any) {
    console.error("Email send error:", error);
    return { success: false, error: error.message };
  }
}
