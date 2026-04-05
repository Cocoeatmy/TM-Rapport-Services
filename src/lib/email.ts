import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendPdfByEmail({
  projectName,
  ofrTM,
  collaborateur,
  collaborateurEmail,
  pdfBuffer,
}: {
  projectName: string;
  ofrTM: string;
  collaborateur: string;
  collaborateurEmail: string;
  pdfBuffer: Buffer;
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
          <p style="color: #666; font-size: 14px;">Le rapport PDF est en pièce jointe.</p>
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
