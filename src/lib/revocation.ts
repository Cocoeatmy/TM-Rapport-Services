/**
 * Les comptes désactivés, lus assez vite pour être vérifiés à CHAQUE requête.
 *
 * Une session dure un an (cookie signé). Jusqu'ici, rien ne permettait de la
 * couper : un collaborateur parti gardait l'accès tant que son téléphone
 * gardait le cookie. Désactiver un compte le range désormais ici, et le
 * middleware refuse la session au plus tard une minute après.
 *
 * Désactiver n'efface rien : ni le compte, ni ses heures, ni ses rapports, ni
 * son nom dans l'historique. Le compte se réactive d'un geste.
 *
 * Ce module n'importe rien de Node : le middleware peut le charger quel que
 * soit son environnement d'exécution. La source de vérité reste la fiche du
 * compte (champ `desactive`) ; ceci n'en est que le miroir rapide.
 */

export const CLE_DESACTIVES = "comptes-desactives";

const URL_REDIS = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const JETON_REDIS = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

let memoire: { emails: Set<string>; expire: number } | null = null;

/**
 * Les adresses désactivées, en minuscules. `null` = impossible de savoir
 * (Redis absent ou injoignable) : l'appelant laisse passer — une panne ne
 * doit jamais enfermer toute l'équipe dehors.
 */
export async function comptesDesactives(): Promise<Set<string> | null> {
  if (memoire && Date.now() < memoire.expire) return memoire.emails;
  if (!URL_REDIS || !JETON_REDIS) return null;
  try {
    const r = await fetch(URL_REDIS, {
      method: "POST",
      headers: { Authorization: `Bearer ${JETON_REDIS}`, "Content-Type": "application/json" },
      body: JSON.stringify(["HKEYS", CLE_DESACTIVES]),
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });
    if (!r.ok) throw new Error(`redis ${r.status}`);
    const j = (await r.json()) as { result?: unknown };
    const liste = Array.isArray(j.result) ? j.result : [];
    memoire = { emails: new Set(liste.map((e) => String(e).toLowerCase())), expire: Date.now() + 60_000 };
    return memoire.emails;
  } catch {
    // On garde la dernière liste connue un peu plus longtemps, plutôt que rien.
    if (memoire) {
      memoire = { ...memoire, expire: Date.now() + 10_000 };
      return memoire.emails;
    }
    return null;
  }
}

/** Après une désactivation ou une réactivation : relire tout de suite. */
export function oublierComptesDesactives(): void {
  memoire = null;
}

/** Pour les tests. */
export function _definirComptesDesactives(emails: string[] | null): void {
  memoire = emails ? { emails: new Set(emails.map((e) => e.toLowerCase())), expire: Date.now() + 60_000 } : null;
}
