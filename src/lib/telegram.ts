const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

async function telegramApi(method: string, formData: FormData) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram ${method} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export async function sendReportToTelegram({
  projectName,
  ofrTM,
  collaborateur,
  pdfBuffer,
  pdfFilename,
  photoUrls,
}: {
  projectName: string;
  ofrTM: string;
  collaborateur: string;
  pdfBuffer: Buffer;
  pdfFilename: string;
  photoUrls: string[];
}) {
  if (!BOT_TOKEN || !CHAT_ID) {
    console.warn("Telegram not configured (missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID)");
    return { success: false, error: "Telegram not configured" };
  }

  try {
    const caption = `📋 *Rapport de montage*\n\n*Projet:* ${escapeMarkdown(projectName)}\n*N° OFR:* ${escapeMarkdown(ofrTM)}\n*Par:* ${escapeMarkdown(collaborateur)}`;

    // Send PDF
    const pdfForm = new FormData();
    pdfForm.append("chat_id", CHAT_ID);
    pdfForm.append("document", new Blob([pdfBuffer], { type: "application/pdf" }), pdfFilename);
    pdfForm.append("caption", caption);
    pdfForm.append("parse_mode", "MarkdownV2");
    await telegramApi("sendDocument", pdfForm);

    // Send photos as JPEG (in batches of 10 — Telegram media group limit)
    if (photoUrls.length > 0) {
      const batches: string[][] = [];
      for (let i = 0; i < photoUrls.length; i += 10) {
        batches.push(photoUrls.slice(i, i + 10));
      }

      for (const batch of batches) {
        if (batch.length === 1) {
          const photoForm = new FormData();
          photoForm.append("chat_id", CHAT_ID);
          photoForm.append("photo", jpegUrl(batch[0]));
          await telegramApi("sendPhoto", photoForm);
        } else {
          const media = batch.map((url, i) => ({
            type: "photo" as const,
            media: jpegUrl(url),
            ...(i === 0 ? { caption: `📷 Photos — ${escapeMarkdown(projectName)} (${escapeMarkdown(ofrTM)})`, parse_mode: "MarkdownV2" } : {}),
          }));
          const groupForm = new FormData();
          groupForm.append("chat_id", CHAT_ID);
          groupForm.append("media", JSON.stringify(media));
          await telegramApi("sendMediaGroup", groupForm);
        }
      }
    }

    console.log(`Telegram: rapport envoyé pour ${ofrTM} (${photoUrls.length} photos)`);
    return { success: true };
  } catch (error: any) {
    console.error("Telegram send error:", error);
    return { success: false, error: error.message };
  }
}

function jpegUrl(url: string): string {
  if (url.includes("res.cloudinary.com") && url.includes("/upload/")) {
    return url.replace("/upload/", "/upload/f_jpg,q_80/");
  }
  return url;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&");
}
