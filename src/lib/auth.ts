import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "crypto";
import { getData, getDataFresh, setData } from "./kv-store";
import { CLE_DESACTIVES, oublierComptesDesactives } from "./revocation";
import { idSession, sessionsRevoquees } from "@/lib/revocation";

export interface User {
  email: string;
  name: string;
  role: "admin" | "monteur";
}

export interface UserRecord {
  name: string;
  /** Stored as "salt:hash" (PBKDF2-SHA512, 100 000 iterations, 64-byte key) */
  password: string;
  role: "admin" | "monteur";
  /**
   * Compte désactivé : plus de connexion, et toute session ouverte est
   * refusée. Rien d'autre ne change — le compte, son historique, ses heures
   * et ses rapports restent. Réversible.
   */
  desactive?: boolean;
  /** Quand et par qui (adresse), pour l'historique. */
  desactiveLe?: string;
  desactivePar?: string;
}

// ---------------------------------------------------------------------------
// Password hashing helpers (edge / serverless compatible via Node crypto)
// ---------------------------------------------------------------------------

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LENGTH = 64;
const PBKDF2_DIGEST = "sha512";

/** Hash a plain-text password and return "salt:hash". */
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .pbkdf2Sync(plain, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST)
    .toString("hex");
  return `${salt}:${hash}`;
}

/** Verify a plain-text password against a "salt:hash" string. */
export function verifyPassword(plain: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(":");
  if (!salt || !storedHash) return false;
  const hash = crypto
    .pbkdf2Sync(plain, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, PBKDF2_DIGEST)
    .toString("hex");
  // Constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(storedHash, "hex"));
}

// ---------------------------------------------------------------------------
// User store  (passwords are pre-hashed)
// ---------------------------------------------------------------------------

const USERS: Record<string, UserRecord> = {
  "tm.douche.montage.1@gmail.com": { name: "Claudio Zanutto", password: "cbe3cdfc39c5ec15a2d5bb97c3424c94:665317043ddd7423a2c1d6b4e3bfc4b1b298eeafaa6439bd24c072e84e93857b98e9e78088c5e48b701c4dcd597d7e4986ab1508352c1fb5d441a8c10a3aac32", role: "monteur" },
  "tm.douche.montage.2@gmail.com": { name: "Jean-Marc Nelzi", password: "cbe3cdfc39c5ec15a2d5bb97c3424c94:665317043ddd7423a2c1d6b4e3bfc4b1b298eeafaa6439bd24c072e84e93857b98e9e78088c5e48b701c4dcd597d7e4986ab1508352c1fb5d441a8c10a3aac32", role: "monteur" },
  "tm.douche.montage.3@gmail.com": { name: "Jacobo Fontan Cassas", password: "cbe3cdfc39c5ec15a2d5bb97c3424c94:665317043ddd7423a2c1d6b4e3bfc4b1b298eeafaa6439bd24c072e84e93857b98e9e78088c5e48b701c4dcd597d7e4986ab1508352c1fb5d441a8c10a3aac32", role: "monteur" },
  "tm.douche.montage.4@gmail.com": { name: "Miguel Roberto", password: "cbe3cdfc39c5ec15a2d5bb97c3424c94:665317043ddd7423a2c1d6b4e3bfc4b1b298eeafaa6439bd24c072e84e93857b98e9e78088c5e48b701c4dcd597d7e4986ab1508352c1fb5d441a8c10a3aac32", role: "monteur" },
  "tm.douche.montage.5@gmail.com": { name: "Loic Schiro", password: "cbe3cdfc39c5ec15a2d5bb97c3424c94:665317043ddd7423a2c1d6b4e3bfc4b1b298eeafaa6439bd24c072e84e93857b98e9e78088c5e48b701c4dcd597d7e4986ab1508352c1fb5d441a8c10a3aac32", role: "monteur" },
  "tm.douche.montage.6@gmail.com": { name: "Javier Martinez", password: "cbe3cdfc39c5ec15a2d5bb97c3424c94:665317043ddd7423a2c1d6b4e3bfc4b1b298eeafaa6439bd24c072e84e93857b98e9e78088c5e48b701c4dcd597d7e4986ab1508352c1fb5d441a8c10a3aac32", role: "monteur" },
  "ferreira.micael@gmail.com": { name: "Micael Ferreira", password: "014ff6f9808dfb4c850085fd6be3a679:9fb23213d90227ca51a12c7b4a09ad18a3f4584f165b648621569ee48c718ace9c5bf68c66552563295f6a88319a4539336197f8157b3585238f81f1f7c41cfd", role: "admin" },
};

/* ───────────────────────────────────────────────────────────────────────────
   Les comptes vivent dans le magasin de données, pas en mémoire.

   Jusqu'ici, la liste ci-dessus était la seule qui existait, et changer un mot
   de passe, un rôle, ajouter ou supprimer quelqu'un ne modifiait qu'une copie
   en mémoire du serveur. Au redémarrage suivant — plusieurs fois par jour —
   tout revenait en arrière, et deux serveurs n'étaient jamais d'accord. L'écran
   annonçait pourtant que c'était fait.

   La liste écrite dans le code reste la graine : au tout premier démarrage,
   ou si le magasin devient illisible, c'est elle qui sert. Dès qu'une
   modification est enregistrée, c'est le magasin qui fait foi.
   ─────────────────────────────────────────────────────────────────────────── */

const CLE_COMPTES = "app-users";
/** Un compte tel qu'il est rangé dans le magasin. */
interface CompteRange extends UserRecord { email: string }

let comptesMemoire: Record<string, UserRecord> | null = null;
let comptesExpirent = 0;
const DUREE_MEMOIRE_MS = 60_000;

function versTableau(comptes: Record<string, UserRecord>): CompteRange[] {
  return Object.entries(comptes).map(([email, u]) => ({ email, ...u }));
}

function versObjet(lignes: CompteRange[]): Record<string, UserRecord> {
  const out: Record<string, UserRecord> = {};
  for (const l of lignes) {
    if (!l?.email || !l?.password) continue;
    out[l.email.toLowerCase()] = {
      name: l.name, password: l.password, role: l.role,
      ...(l.desactive ? { desactive: true, desactiveLe: l.desactiveLe, desactivePar: l.desactivePar } : {}),
    };
  }
  return out;
}

/** Les comptes, depuis le magasin (ou la graine s'il est vide). */
async function chargerComptes(frais = false): Promise<Record<string, UserRecord>> {
  if (!frais && comptesMemoire && Date.now() < comptesExpirent) return comptesMemoire;
  try {
    const lignes = frais
      ? await getDataFresh<CompteRange>(CLE_COMPTES)
      : await getData<CompteRange>(CLE_COMPTES);
    const comptes = versObjet(lignes);
    /* Magasin vide = première fois. On ne sème pas tout de suite : la graine
       suffit à travailler, et on évite d'écrire au milieu d'une connexion. */
    comptesMemoire = Object.keys(comptes).length > 0 ? comptes : { ...USERS };
  } catch {
    /* Magasin injoignable : on NE bloque PERSONNE. La graine permet de se
       connecter, quitte à ignorer un changement récent. */
    comptesMemoire = { ...USERS };
    comptesExpirent = Date.now() + 5_000; // on retente vite
    return comptesMemoire;
  }
  comptesExpirent = Date.now() + DUREE_MEMOIRE_MS;
  return comptesMemoire;
}

/**
 * Applique une modification aux comptes, de façon sûre.
 *
 * On relit le magasin SANS passer par le cache (deux administrateurs peuvent
 * agir en même temps depuis deux serveurs différents), on applique, on écrit.
 * Si l'écriture échoue, on le dit — l'appelant doit pouvoir prévenir, plutôt
 * que d'annoncer un succès qui n'existe pas.
 */
async function modifierComptes(
  action: (comptes: Record<string, UserRecord>) => boolean,
): Promise<boolean> {
  let comptes: Record<string, UserRecord>;
  try {
    const lignes = await getDataFresh<CompteRange>(CLE_COMPTES);
    const lus = versObjet(lignes);
    comptes = Object.keys(lus).length > 0 ? lus : { ...USERS };
  } catch {
    return false; // lecture impossible → surtout ne pas écraser le magasin
  }
  if (!action(comptes)) return false;
  try {
    await setData(CLE_COMPTES, versTableau(comptes));
  } catch {
    return false;
  }
  comptesMemoire = comptes;
  comptesExpirent = Date.now() + DUREE_MEMOIRE_MS;
  return true;
}

/* Pas de valeur de repli : un secret connu permettrait de fabriquer une
   session d'administrateur. Lu à l'usage (et non au chargement du module) pour
   ne pas faire échouer la compilation. */
function cleDeSignature(): Uint8Array {
  const cle = process.env.JWT_SECRET;
  if (!cle) throw new Error("JWT_SECRET manquant : signature de session impossible");
  return new TextEncoder().encode(cle);
}

export async function authenticate(email: string, password: string): Promise<User | null> {
  const key = email.toLowerCase().trim();
  const comptes = await chargerComptes();
  const user = comptes[key];
  if (!user) return null;
  if (!verifyPassword(password, user.password)) return null;
  if (user.desactive) return null; // compte désactivé : plus de connexion
  return { email: key, name: user.name, role: user.role };
}

export async function getAllUsers(): Promise<{ email: string; name: string; role: string; desactive?: boolean; desactiveLe?: string }[]> {
  const comptes = await chargerComptes();
  return Object.entries(comptes).map(([email, u]) => ({
    email, name: u.name, role: u.role,
    ...(u.desactive ? { desactive: true, desactiveLe: u.desactiveLe } : {}),
  }));
}

/** Le compte est-il désactivé ? Une adresse inconnue ne l'est pas. */
export async function compteDesactive(email: string): Promise<boolean> {
  if (!email) return false;
  const comptes = await chargerComptes();
  return !!comptes[email.toLowerCase()]?.desactive;
}

/**
 * Désactive ou réactive un compte — sans rien effacer.
 *
 * Un administrateur ne peut pas être désactivé (on ne s'enferme pas dehors) ;
 * il faut d'abord lui retirer ce rôle. Le miroir rapide lu par le middleware
 * est mis à jour ensuite : s'il échoue, la fiche du compte fait quand même
 * foi pour toutes les routes qui vérifient la session, et l'appelant le sait.
 */
export async function definirCompteActif(
  email: string,
  actif: boolean,
  par: string,
): Promise<{ ok: boolean; miroir: boolean }> {
  const cle = email.toLowerCase();
  const ok = await modifierComptes((c) => {
    const compte = c[cle];
    if (!compte) return false;
    if (!actif && compte.role === "admin") return false;
    if (actif) {
      delete compte.desactive;
      delete compte.desactiveLe;
      delete compte.desactivePar;
    } else {
      compte.desactive = true;
      compte.desactiveLe = new Date().toISOString();
      compte.desactivePar = par;
    }
    return true;
  });
  if (!ok) return { ok: false, miroir: false };
  let miroir = false;
  try {
    const { redisHSet, redisHDel } = await import("./redis-cache");
    if (actif) await redisHDel(CLE_DESACTIVES, cle);
    else await redisHSet(CLE_DESACTIVES, cle, new Date().toISOString());
    miroir = true;
  } catch { /* Redis indisponible : la fiche du compte fait foi */ }
  oublierComptesDesactives();
  return { ok: true, miroir };
}

export async function updateUserPassword(email: string, newPassword: string): Promise<boolean> {
  const cle = email.toLowerCase();
  return modifierComptes((c) => {
    if (!c[cle]) return false;
    c[cle].password = hashPassword(newPassword);
    return true;
  });
}

export async function updateUserRole(email: string, role: "admin" | "monteur"): Promise<boolean> {
  const cle = email.toLowerCase();
  return modifierComptes((c) => {
    if (!c[cle]) return false;
    c[cle].role = role;
    return true;
  });
}

/**
 * Ajoute un compte.
 *
 * `copierDe` : l'adresse d'un compte existant dont on reprend le mot de passe
 * TEL QU'IL EST RANGÉ, c'est-à-dire son empreinte. L'équipe de pose partage
 * un même mot de passe ; sans cette option, ajouter un monteur obligeait à le
 * connaître en clair — or il n'est stocké nulle part en clair, et c'est très
 * bien ainsi. On recopie donc l'empreinte : le nouveau venu a le même mot de
 * passe que ses collègues, et personne n'a eu à le lire au passage.
 */
export async function addUser(
  email: string,
  name: string,
  password: string,
  role: "admin" | "monteur",
  copierDe?: string,
): Promise<boolean> {
  const cle = email.toLowerCase();
  return modifierComptes((c) => {
    if (c[cle]) return false;
    let empreinte: string;
    if (copierDe) {
      const source = c[copierDe.toLowerCase()];
      if (!source) return false;
      empreinte = source.password;
    } else {
      if (!password) return false;
      empreinte = hashPassword(password);
    }
    c[cle] = { name, password: empreinte, role };
    return true;
  });
}

export async function deleteUser(email: string): Promise<boolean> {
  const cle = email.toLowerCase();
  return modifierComptes((c) => {
    if (!c[cle] || c[cle].role === "admin") return false;
    delete c[cle];
    return true;
  });
}

/** Met à jour le nom et/ou l'adresse email d'un utilisateur.
 *  Si newEmail est fourni et différent de currentEmail, la clé du store change.
 *  Retourne false si l'utilisateur n'existe pas ou si newEmail est déjà pris. */
export async function updateUserInfo(currentEmail: string, newName?: string, newEmail?: string): Promise<boolean> {
  const key = currentEmail.toLowerCase();
  return modifierComptes((c) => {
    if (!c[key]) return false;
    if (newName) c[key].name = newName;
    if (newEmail) {
      const newKey = newEmail.toLowerCase();
      if (newKey !== key) {
        if (c[newKey]) return false; // email déjà utilisé
        c[newKey] = { ...c[key] };
        delete c[key];
      }
    }
    return true;
  });
}

/** `sid` : l'identifiant de la session (voir revocation) — gardé tel quel
    au renouvellement, pour qu'une révocation suive l'appareil. */
export async function createToken(user: User, sid?: string): Promise<string> {
  const id = sid || (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);
  return new SignJWT({ email: user.email, name: user.name, role: user.role, sid: id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d") // 1 an — session persistante sur mobile
    .sign(cleDeSignature());
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, cleDeSignature());
    // Une session signée ne suffit plus : le compte ne doit pas être désactivé.
    if (await compteDesactive(payload.email as string)) return null;
    // … ni la session de CET appareil, révoquée.
    if ((await sessionsRevoquees())?.has(idSession(payload))) return null;
    return {
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as "admin" | "monteur",
    };
  } catch {
    return null;
  }
}

/**
 * Vérifie le token ET retourne la date d'expiration (timestamp Unix en secondes).
 * Utilisé par la route GET /api/auth pour le renouvellement automatique.
 */
export async function verifyTokenWithExpiry(
  token: string
): Promise<{ user: User | null; exp?: number }> {
  try {
    const { payload } = await jwtVerify(token, cleDeSignature());
    if (await compteDesactive(payload.email as string)) return { user: null };
    if ((await sessionsRevoquees())?.has(idSession(payload))) return { user: null };
    return {
      user: {
        email: payload.email as string,
        name: payload.name as string,
        role: payload.role as "admin" | "monteur",
      },
      exp: payload.exp as number,
    };
  } catch {
    return { user: null };
  }
}

export async function getUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** L'identifiant de session d'un jeton valide, sinon null. */
export async function sessionDuJeton(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, cleDeSignature());
    return idSession(payload);
  } catch {
    return null;
  }
}

