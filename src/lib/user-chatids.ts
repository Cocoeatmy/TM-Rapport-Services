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
import { redisHSet, redisHGetAll, redisHDel, siRedis } from "@/lib/redis-cache";
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
  /* Fusion des deux magasins (Redis prioritaire) : sans chat_id, le bot ne
     peut écrire à personne — une panne du cache couperait les notifications. */
  const map: Record<string, string> = {};
  try {
    for (const r of await getData<ChatRow>(KEY)) {
      if (r?.email) map[r.email.toLowerCase()] = r.chatId || "";
    }
  } catch { /* magasin Notion indisponible : Redis suffira */ }
  const red = await siRedis(() => redisHGetAll(KEY));
  if (red) for (const [e, c] of Object.entries(red.valeur)) map[e.toLowerCase()] = c;
  return map;
}

/** Écrit la liste complète dans le magasin Notion (repli durable). */
async function ecrireKvChats(maj: (rows: ChatRow[]) => ChatRow[]): Promise<void> {
  try {
    const rows = await getData<ChatRow>(KEY);
    await setData(KEY, maj(rows));
  } catch { /* best-effort */ }
}

/** Enregistre / met à jour le chat_id d'un collaborateur (atomique, persistant). */
export async function setUserChatId(email: string, chatId: string): Promise<void> {
  const e = email.toLowerCase();
  await siRedis(() => redisHSet(KEY, e, chatId));
  await ecrireKvChats((rows) => {
    const idx = rows.findIndex((r) => r.email?.toLowerCase() === e);
    if (idx >= 0) rows[idx].chatId = chatId; else rows.push({ email: e, chatId });
    return rows;
  });
}

/** Supprime le chat_id d'un collaborateur. */
export async function deleteUserChatId(email: string): Promise<void> {
  const e = email.toLowerCase();
  await siRedis(() => redisHDel(KEY, e));
  await ecrireKvChats((rows) => rows.filter((r) => r.email?.toLowerCase() !== e));
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
