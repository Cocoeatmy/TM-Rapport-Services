const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

/** chat_id Telegram par défaut (admin / test). Exporté pour le rapport quotidien. */
export const DEFAULT_TELEGRAM_CHAT_ID = CHAT_ID;
export const telegramConfigured = !!BOT_TOKEN;

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

/** Échappe le texte pour le mode HTML de Telegram. */
export function escapeHtml(text: string): string {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Envoie un message texte (HTML) à un chat Telegram donné.
 * Le mode HTML est plus simple que MarkdownV2 (peu de caractères à échapper).
 */
export async function sendTelegramText(chatId: string, html: string): Promise<{ success: boolean; error?: string }> {
  if (!BOT_TOKEN) return { success: false, error: "TELEGRAM_BOT_TOKEN manquant" };
  if (!chatId) return { success: false, error: "chat_id manquant" };
  try {
    const form = new FormData();
    form.append("chat_id", chatId);
    form.append("text", html);
    form.append("parse_mode", "HTML");
    form.append("disable_web_page_preview", "true");
    await telegramApi("sendMessage", form);
    return { success: true };
  } catch (error: any) {
    console.error("Telegram sendMessage error:", error?.message || error);
    return { success: false, error: error?.message || "Erreur Telegram" };
  }
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
    pdfForm.append("document", new Blob([pdfBuffer.buffer as ArrayBuffer], { type: "application/pdf" }), pdfFilename);
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
