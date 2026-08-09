// chat_id Telegram des collaborateurs (pour l'envoi ciblé du rapport quotidien).
//
// Un bot Telegram ne peut écrire à quelqu'un QUE s'il a un `chat_id` (obtenu
// quand la personne démarre le bot). On associe ce chat_id à l'e-mail du
// collaborateur — obtenu en faisant correspondre le NUMÉRO partagé avec le bot
// aux numéros déjà enregistrés (user-phones).
//
// STOCKAGE : HASH Redis persistant `user-chatids` (champ = e-mail). Atomique,
// sans expiration (même robustesse que user-phones). Repli KV Notion en local.

import { getData, setData } from "@/lib/kv-store";
import { redisEnabled, redisHSet, redisHGetAll, redisHDel } from "@/lib/redis-cache";
import { getUserPhones } from "@/lib/user-phones";

const KEY = "user-chatids";

interface ChatRow {
  email: string;
  chatId: string;
}

/** Ne garde que les chiffres significatifs d'un numéro (pour comparer +41 / 0…). */
export function normalizePhone(phone: string): string {
  const digits = (phone || "").replace(/\D/g, "");
  // On compare les 9 derniers chiffres (numéro national sans indicatif/0).
  return digits.slice(-9);
}

/** Map e-mail (minuscule) → chat_id. */
export async function getUserChatIds(): Promise<Record<string, string>> {
  if (redisEnabled) {
    const all = await redisHGetAll(KEY);
    const map: Record<string, string> = {};
    for (const [e, c] of Object.entries(all)) map[e.toLowerCase()] = c;
    return map;
  }
  const rows = await getData<ChatRow>(KEY);
  const map: Record<string, string> = {};
  for (const r of rows) if (r?.email) map[r.email.toLowerCase()] = r.chatId || "";
  return map;
}

/** Enregistre / met à jour le chat_id d'un collaborateur (atomique, persistant). */
export async function setUserChatId(email: string, chatId: string): Promise<void> {
  const e = email.toLowerCase();
  if (redisEnabled) {
    await redisHSet(KEY, e, chatId);
    return;
  }
  const rows = await getData<ChatRow>(KEY);
  const idx = rows.findIndex((r) => r.email?.toLowerCase() === e);
  if (idx >= 0) rows[idx].chatId = chatId;
  else rows.push({ email: e, chatId });
  await setData(KEY, rows);
}

/** Supprime le chat_id d'un collaborateur. */
export async function deleteUserChatId(email: string): Promise<void> {
  const e = email.toLowerCase();
  if (redisEnabled) { await redisHDel(KEY, e); return; }
  const rows = await getData<ChatRow>(KEY);
  const filtered = rows.filter((r) => r.email?.toLowerCase() !== e);
  if (filtered.length !== rows.length) await setData(KEY, filtered);
}

/** Trouve l'e-mail du collaborateur dont le numéro correspond à `phone`. */
export async function findEmailByPhone(phone: string): Promise<string | null> {
  const target = normalizePhone(phone);
  if (!target) return null;
  const phones = await getUserPhones(); // email → phone
  for (const [email, p] of Object.entries(phones)) {
    if (p && normalizePhone(p) === target) return email;
  }
  return null;
}
