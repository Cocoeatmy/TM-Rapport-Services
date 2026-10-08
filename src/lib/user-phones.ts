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
import { redisHSet, redisHGetAll, redisHDel, siRedis } from "@/lib/redis-cache";

const KEY = "user-phones";

interface PhoneRow {
  email: string;
  phone: string;
}

/** Map e-mail (minuscule) → téléphone. */
export async function getUserPhones(): Promise<Record<string, string>> {
  /* Les deux magasins sont lus et fusionnés (Redis prioritaire) : une panne de
     Redis ne doit pas faire disparaître les numéros, et un numéro enregistré
     PENDANT la panne — donc écrit dans Notion seul — ne doit pas se perdre au
     retour de Redis. */
  const map: Record<string, string> = {};
  try {
    for (const r of await getData<PhoneRow>(KEY)) {
      if (r?.email) map[r.email.toLowerCase()] = r.phone || "";
    }
  } catch { /* magasin Notion indisponible : Redis suffira */ }
  const red = await siRedis(() => redisHGetAll(KEY)); // {email: phone}
  if (red) for (const [e, p] of Object.entries(red.valeur)) map[e.toLowerCase()] = p;
  return map;
}

/** Écrit la liste complète dans le magasin Notion (repli durable). */
async function ecrireKvPhones(maj: (rows: PhoneRow[]) => PhoneRow[]): Promise<void> {
  try {
    const rows = await getData<PhoneRow>(KEY);
    await setData(KEY, maj(rows));
  } catch { /* best-effort */ }
}

/** Définit / met à jour le téléphone d'un utilisateur (atomique, persistant). */
export async function setUserPhone(email: string, phone: string): Promise<void> {
  const e = email.toLowerCase();
  await siRedis(() => redisHSet(KEY, e, phone)); // écriture atomique d'un seul champ
  // Toujours doublé dans Notion : le numéro survit à une panne du cache.
  await ecrireKvPhones((rows) => {
    const idx = rows.findIndex((r) => r.email?.toLowerCase() === e);
    if (idx >= 0) rows[idx].phone = phone; else rows.push({ email: e, phone });
    return rows;
  });
}

/** Migre le téléphone quand l'e-mail d'un utilisateur change. */
export async function renameUserPhone(oldEmail: string, newEmail: string): Promise<void> {
  const oldE = oldEmail.toLowerCase();
  const newE = newEmail.toLowerCase();
  const red = await siRedis(() => redisHGetAll(KEY));
  if (red) {
    const phone = red.valeur[oldE];
    if (phone !== undefined) {
      await siRedis(() => redisHSet(KEY, newE, phone));
      await siRedis(() => redisHDel(KEY, oldE));
    }
  }
  await ecrireKvPhones((rows) => {
    const idx = rows.findIndex((r) => r.email?.toLowerCase() === oldE);
    if (idx >= 0) rows[idx].email = newE;
    return rows;
  });
}

/** Supprime le téléphone d'un utilisateur supprimé. */
export async function deleteUserPhone(email: string): Promise<void> {
  const e = email.toLowerCase();
  await siRedis(() => redisHDel(KEY, e));
  await ecrireKvPhones((rows) => rows.filter((r) => r.email?.toLowerCase() !== e));
}
