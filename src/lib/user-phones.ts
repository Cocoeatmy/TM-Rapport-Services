// Numéros de téléphone des collaborateurs.
//
// Les comptes utilisateurs (auth.ts) vivent EN MÉMOIRE (objet USERS codé en
// dur) → une donnée écrite à l'exécution ne survit pas à un redéploiement.
//
// STOCKAGE : HASH Redis persistant (clé `user-phones`), champ = e-mail.
//   • HSET est ATOMIQUE par champ → aucune collision entre enregistrements
//     successifs (le bug précédent : le KV Notion, non paginé, recréait la page
//     et perdait les données).
//   • Aucune expiration (contrairement à redisSetJSON qui expire en 1 h).
//   • Les écritures PROPAGENT les erreurs → l'API renvoie une vraie erreur si
//     l'enregistrement échoue (au lieu de faire croire à un succès).
// Repli : si Redis n'est pas configuré (dev local), on utilise le KV Notion.

import { getData, setData } from "@/lib/kv-store";
import { redisEnabled, redisHSet, redisHGetAll, redisHDel } from "@/lib/redis-cache";

const KEY = "user-phones";

interface PhoneRow {
  email: string;
  phone: string;
}

/** Map e-mail (minuscule) → téléphone. */
export async function getUserPhones(): Promise<Record<string, string>> {
  if (redisEnabled) {
    const all = await redisHGetAll(KEY); // {email: phone}
    const map: Record<string, string> = {};
    for (const [e, p] of Object.entries(all)) map[e.toLowerCase()] = p;
    return map;
  }
  // Repli KV Notion (dev local)
  const rows = await getData<PhoneRow>(KEY);
  const map: Record<string, string> = {};
  for (const r of rows) if (r?.email) map[r.email.toLowerCase()] = r.phone || "";
  return map;
}

/** Définit / met à jour le téléphone d'un utilisateur (atomique, persistant). */
export async function setUserPhone(email: string, phone: string): Promise<void> {
  const e = email.toLowerCase();
  if (redisEnabled) {
    await redisHSet(KEY, e, phone); // écriture atomique d'un seul champ
    return;
  }
  const rows = await getData<PhoneRow>(KEY);
  const idx = rows.findIndex((r) => r.email?.toLowerCase() === e);
  if (idx >= 0) rows[idx].phone = phone;
  else rows.push({ email: e, phone });
  await setData(KEY, rows);
}

/** Migre le téléphone quand l'e-mail d'un utilisateur change. */
export async function renameUserPhone(oldEmail: string, newEmail: string): Promise<void> {
  const oldE = oldEmail.toLowerCase();
  const newE = newEmail.toLowerCase();
  if (redisEnabled) {
    const all = await redisHGetAll(KEY);
    const phone = all[oldE];
    if (phone !== undefined) {
      await redisHSet(KEY, newE, phone);
      await redisHDel(KEY, oldE);
    }
    return;
  }
  const rows = await getData<PhoneRow>(KEY);
  const idx = rows.findIndex((r) => r.email?.toLowerCase() === oldE);
  if (idx >= 0) { rows[idx].email = newE; await setData(KEY, rows); }
}

/** Supprime le téléphone d'un utilisateur supprimé. */
export async function deleteUserPhone(email: string): Promise<void> {
  const e = email.toLowerCase();
  if (redisEnabled) {
    await redisHDel(KEY, e);
    return;
  }
  const rows = await getData<PhoneRow>(KEY);
  const filtered = rows.filter((r) => r.email?.toLowerCase() !== e);
  if (filtered.length !== rows.length) await setData(KEY, filtered);
}
