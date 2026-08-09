// Numéros de téléphone des collaborateurs.
//
// Les comptes utilisateurs (auth.ts) vivent EN MÉMOIRE (objet USERS codé en
// dur) → une donnée écrite à l'exécution ne survit pas à un redéploiement.
// On stocke donc les téléphones dans le KV persistant (Notion [DATA]), indexés
// par e-mail. Servira au rapport quotidien Telegram (envoi ciblé par monteur).

import { getData, setData } from "@/lib/kv-store";

const KEY = "user-phones";

interface PhoneRow {
  email: string;
  phone: string;
}

/** Map e-mail (minuscule) → téléphone. */
export async function getUserPhones(): Promise<Record<string, string>> {
  const rows = await getData<PhoneRow>(KEY);
  const map: Record<string, string> = {};
  for (const r of rows) {
    if (r?.email) map[r.email.toLowerCase()] = r.phone || "";
  }
  return map;
}

/** Définit / met à jour le téléphone d'un utilisateur. */
export async function setUserPhone(email: string, phone: string): Promise<void> {
  const rows = await getData<PhoneRow>(KEY);
  const e = email.toLowerCase();
  const idx = rows.findIndex((r) => r.email?.toLowerCase() === e);
  if (idx >= 0) rows[idx].phone = phone;
  else rows.push({ email: e, phone });
  await setData(KEY, rows);
}

/** Migre le téléphone quand l'e-mail d'un utilisateur change. */
export async function renameUserPhone(oldEmail: string, newEmail: string): Promise<void> {
  const rows = await getData<PhoneRow>(KEY);
  const idx = rows.findIndex((r) => r.email?.toLowerCase() === oldEmail.toLowerCase());
  if (idx >= 0) {
    rows[idx].email = newEmail.toLowerCase();
    await setData(KEY, rows);
  }
}

/** Supprime le téléphone d'un utilisateur supprimé. */
export async function deleteUserPhone(email: string): Promise<void> {
  const rows = await getData<PhoneRow>(KEY);
  const filtered = rows.filter((r) => r.email?.toLowerCase() !== email.toLowerCase());
  if (filtered.length !== rows.length) await setData(KEY, filtered);
}
