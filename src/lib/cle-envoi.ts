/**
 * La clé d'un envoi de photos qui peut passer d'un mécanisme à l'autre.
 *
 * Le formulaire de défaut et les photos de cartons essaient d'abord l'envoi
 * en ligne (/api/upload), puis, si le réseau lâche, confient les photos à la
 * file de l'appareil. Quand la réponse se perd alors que le serveur avait
 * reçu la photo, chaque chemin la renvoyait sous un identifiant Cloudinary
 * différent : deux copies. Avec la même clé, les deux chemins écrivent sous
 * le MÊME identifiant (« <clé>-<rang> ») : le second remplace le premier.
 */
const FORME = /^[A-Za-z0-9_-]{8,80}$/;

/** Une clé nouvelle, à fabriquer une fois par envoi (avant le premier essai). */
export function nouvelleCleEnvoi(): string {
  const brut = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `env-${brut}`.replace(/[^A-Za-z0-9_-]/g, "");
}

/** L'identifiant Cloudinary de la photo de rang `rang` — ou rien si la clé est invalide. */
export function identifiantCloudinary(cle: unknown, rang: number): string | undefined {
  if (typeof cle !== "string" || !FORME.test(cle) || !Number.isInteger(rang) || rang < 0) return undefined;
  return `${cle}-${rang}`;
}

/** Un identifiant reçu d'un client : accepté seulement s'il a la forme attendue. */
export function identifiantValide(id: unknown): id is string {
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,80}-\d{1,3}$/.test(id);
}
