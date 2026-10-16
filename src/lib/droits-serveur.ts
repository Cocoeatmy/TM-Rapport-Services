/**
 * Les autorisations, côté serveur : lecture, écriture, et le verrou qu'on pose
 * devant une opération sensible.
 *
 * Masquer un bouton ne protège rien : l'adresse reste joignable à la main, et
 * l'application elle-même l'appelle en clair. Les contrôles qui comptent sont
 * donc ici, entre la requête et le travail. L'écran des autorisations ne fait
 * que montrer et modifier ce que ce fichier applique.
 *
 * Les réglages vivent dans le magasin de données, pas dans le jeton de
 * session : un jeton dure un an, et une autorisation retirée ce matin doit
 * valoir ce matin, sans demander à personne de se reconnecter. On les relit
 * donc à chaque requête, avec un cache d'une minute pour ne pas facturer une
 * lecture Notion à chaque photo envoyée.
 */
import { NextResponse } from "next/server";
import { getUser, type User } from "./auth";
import { getData, getDataFresh, setData } from "./kv-store";
import { redisGetJSON, redisSetJSON } from "./redis-cache";
import {
  droitsEffectifs,
  peut,
  REGLAGES_VIDES,
  MAX_HISTORIQUE,
  type DroitsEffectifs,
  type Reglages,
} from "./droits";

const CLE = "app-droits";
const DUREE_CACHE_MS = 60_000;
/* Le cache partagé, devant le magasin.
   Sans lui, chaque instance froide paierait une requête Notion pour lire les
   autorisations — y compris devant « /api/upload », qui reçoit UNE photo par
   requête. Vingt photos d'affilée réveillent plusieurs instances, et autant
   de lectures Notion : de quoi frôler la limite de trois requêtes par seconde
   pour une liste qui ne change presque jamais. Redis répond en ~100 ms et se
   met à jour dès qu'on enregistre, donc rien ne traîne. */
const CLE_REDIS = "droits:reglages";
const TTL_REDIS_SEC = 300;

/** Le magasin range des listes : les réglages tiennent dans une seule ligne. */
interface LigneReglages extends Reglages {
  id: string;
}

let memoire: Reglages | null = null;
let expire = 0;

function normaliser(lignes: LigneReglages[]): Reglages {
  const l = lignes?.[0];
  if (!l) return REGLAGES_VIDES;
  return {
    version: l.version ?? 1,
    profils: l.profils ?? {},
    comptes: l.comptes ?? {},
    historique: Array.isArray(l.historique) ? l.historique : [],
  };
}

/**
 * Les réglages enregistrés.
 *
 * Si le magasin est injoignable, on ne bloque personne : on rend les réglages
 * vides, donc les profils d'origine. Une panne de lecture qui interdirait tout
 * arrêterait l'équipe sur le chantier, ce qui serait un remède pire que le mal.
 */
export async function lireReglages(frais = false): Promise<Reglages> {
  if (!frais && memoire && Date.now() < expire) return memoire;
  if (!frais) {
    try {
      const partage = await redisGetJSON<Reglages>(CLE_REDIS);
      if (partage) {
        memoire = normaliser([{ id: "reglages", ...partage }]);
        expire = Date.now() + DUREE_CACHE_MS;
        return memoire;
      }
    } catch { /* Redis muet : on continue vers le magasin */ }
  }
  try {
    const lignes = frais
      ? await getDataFresh<LigneReglages>(CLE)
      : await getData<LigneReglages>(CLE);
    memoire = normaliser(lignes);
    try { await redisSetJSON(CLE_REDIS, memoire, TTL_REDIS_SEC); } catch { /* sans gravité */ }
  } catch {
    memoire = REGLAGES_VIDES;
    expire = Date.now() + 5_000; // on retente vite
    return memoire;
  }
  expire = Date.now() + DUREE_CACHE_MS;
  return memoire;
}

/**
 * Enregistre les réglages.
 *
 * Relecture SANS cache avant d'écrire : deux administrateurs peuvent agir
 * depuis deux serveurs, et le cache est propre à chaque instance — une
 * écriture bâtie sur une lecture mise en cache efface le travail de l'autre.
 */
export async function ecrireReglages(
  transformer: (actuels: Reglages) => Reglages | null,
): Promise<boolean> {
  let actuels: Reglages;
  try {
    actuels = normaliser(await getDataFresh<LigneReglages>(CLE));
  } catch {
    return false; // lecture impossible → surtout ne rien écraser
  }
  const suivants = transformer(actuels);
  if (!suivants) return false;
  suivants.historique = (suivants.historique || []).slice(-MAX_HISTORIQUE);
  try {
    await setData<LigneReglages>(CLE, [{ id: "reglages", ...suivants }]);
  } catch {
    return false;
  }
  /* Le cache partagé est mis à jour tout de suite : les autres instances
     voient le changement sans attendre l'expiration. */
  try { await redisSetJSON(CLE_REDIS, suivants, TTL_REDIS_SEC); } catch { /* sans gravité */ }
  memoire = suivants;
  expire = Date.now() + DUREE_CACHE_MS;
  return true;
}

/** Vide le cache local : utilisé juste après une écriture, et par les tests. */
export function oublierCache(): void {
  memoire = null;
  expire = 0;
}

/** Ce que ce compte a le droit de faire, maintenant. */
export async function droitsDe(user: User): Promise<DroitsEffectifs> {
  return droitsEffectifs(user.email, user.role, await lireReglages());
}

export interface Autorise {
  user: User;
  droits: DroitsEffectifs;
}

/**
 * Le verrou à poser en tête d'une route.
 *
 * Rend `{ user, droits }` quand c'est permis, ou une réponse toute faite —
 * 401 sans session, 403 sans le droit — que la route n'a qu'à retourner.
 *
 *     const v = await exigerDroit("projets.modifier");
 *     if ("refus" in v) return v.refus;
 */
export async function exigerDroit(
  id: string,
  mini: "lecture" | "oui" = "oui",
): Promise<Autorise | { refus: NextResponse }> {
  const user = await getUser();
  if (!user) {
    return { refus: NextResponse.json({ error: "Connexion requise" }, { status: 401 }) };
  }
  const droits = await droitsDe(user);
  if (!peut(droits, id, mini)) {
    return {
      refus: NextResponse.json(
        { error: "Vous n'avez pas l'autorisation d'effectuer cette action." },
        { status: 403 },
      ),
    };
  }
  return { user, droits };
}

/** La même chose, quand on veut seulement savoir. */
export async function aLeDroit(id: string, mini: "lecture" | "oui" = "oui"): Promise<boolean> {
  const user = await getUser();
  if (!user) return false;
  return peut(await droitsDe(user), id, mini);
}
