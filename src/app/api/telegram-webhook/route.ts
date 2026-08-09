import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/auth";
import { sendTelegramText, telegramApiJson, telegramConfigured } from "@/lib/telegram";
import { findEmailByPhone, setUserChatId } from "@/lib/user-chatids";
import { getAllUsers } from "@/lib/auth";

export const dynamic = "force-dynamic";

const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || "";

// ── POST : Telegram envoie ici les mises à jour (messages reçus par le bot) ──
// Flux d'inscription d'un collaborateur :
//   1. Il ouvre le bot et tape /start → on lui affiche un bouton « Partager mon
//      numéro » (request_contact).
//   2. Il partage son contact → Telegram nous transmet son numéro + son chat_id.
//   3. On fait correspondre le numéro à un collaborateur (user-phones) et on
//      enregistre son chat_id → il recevra désormais le rapport quotidien.
export async function POST(request: NextRequest) {
  // Sécurité : Telegram renvoie le secret défini à setWebhook dans ce header.
  if (WEBHOOK_SECRET) {
    const got = request.headers.get("x-telegram-bot-api-secret-token");
    if (got !== WEBHOOK_SECRET) {
      return NextResponse.json({ ok: true }); // on ignore silencieusement
    }
  }

  try {
    const update = await request.json().catch(() => ({}));
    const message = update?.message || update?.edited_message;
    const chat = message?.chat;
    if (!chat?.id) return NextResponse.json({ ok: true });
    const chatId = String(chat.id);

    // 1) Contact partagé → inscription
    if (message.contact?.phone_number) {
      const phone = message.contact.phone_number as string;
      const email = await findEmailByPhone(phone);
      if (email) {
        await setUserChatId(email, chatId);
        const prenom = (getAllUsers().find((u) => u.email.toLowerCase() === email)?.name || "").split(" ")[0];
        await sendTelegramText(
          chatId,
          `✅ <b>Inscription réussie${prenom ? `, ${prenom}` : ""} !</b>\nTu recevras ici le rapport quotidien de tes montages. 🚿`,
          { remove_keyboard: true },
        );
      } else {
        await sendTelegramText(
          chatId,
          "⚠️ Ce numéro n'est pas reconnu. Vérifie auprès de l'administrateur que ton numéro est bien enregistré dans l'application, puis réessaie.",
          { remove_keyboard: true },
        );
      }
      return NextResponse.json({ ok: true });
    }

    // 2) /start (ou tout autre message) → proposer de partager le numéro
    await sendTelegramText(
      chatId,
      "👋 <b>Bienvenue !</b>\nPour recevoir le rapport quotidien de tes montages, partage ton numéro de téléphone avec le bouton ci-dessous.",
      {
        keyboard: [[{ text: "📱 Partager mon numéro", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[telegram-webhook] error:", e?.message || e);
    return NextResponse.json({ ok: true }); // toujours 200 pour Telegram
  }
}

// ── GET : outils ADMIN (statut / activation du webhook) ──
//   ?action=set    → enregistre ce endpoint comme webhook du bot
//   ?action=info   → affiche l'état actuel du webhook
//   ?action=delete → supprime le webhook
export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) {
    return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  }
  if (!telegramConfigured) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN manquant" }, { status: 500 });
  }

  const action = request.nextUrl.searchParams.get("action") || "info";

  // `me` : lien du bot (username public) — accessible à tout utilisateur connecté
  // (pratique pour partager le lien depuis le téléphone d'un collaborateur).
  if (action === "me") {
    try {
      const res = await telegramApiJson("getMe", {});
      const username = res?.result?.username;
      return NextResponse.json({
        ok: true,
        username,
        link: username ? `https://t.me/${username}` : null,
        name: res?.result?.first_name,
      });
    } catch (e: any) {
      return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
    }
  }

  // Les autres actions (set/info/delete du webhook) restent réservées à l'admin.
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Admin requis" }, { status: 403 });
  }
  try {
    if (action === "set") {
      const origin =
        request.headers.get("origin") ||
        (request.headers.get("x-forwarded-host") ? `https://${request.headers.get("x-forwarded-host")}` : "") ||
        request.nextUrl.origin;
      const url = `${origin.replace(/\/$/, "")}/api/telegram-webhook`;
      const res = await telegramApiJson("setWebhook", {
        url,
        ...(WEBHOOK_SECRET ? { secret_token: WEBHOOK_SECRET } : {}),
        allowed_updates: ["message"],
      });
      return NextResponse.json({ ok: true, url, result: res });
    }
    if (action === "delete") {
      const res = await telegramApiJson("deleteWebhook", {});
      return NextResponse.json({ ok: true, result: res });
    }
    const res = await telegramApiJson("getWebhookInfo", {});
    return NextResponse.json({ ok: true, result: res });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Erreur" }, { status: 500 });
  }
}
