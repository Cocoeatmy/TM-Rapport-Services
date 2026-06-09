import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import crypto from "crypto";

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
  "ferreira.micael@gmail.com": { name: "Micael Ferreira", password: "014ff6f9808dfb4c850085fd6be3a679:9fb23213d90227ca51a12c7b4a09ad18a3f4584f165b648621569ee48c718ace9c5bf68c66552563295f6a88319a4539336197f8157b3585238f81f1f7c41cfd", role: "admin" },
};

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret");

export function authenticate(email: string, password: string): User | null {
  const key = email.toLowerCase().trim();
  const user = USERS[key];
  if (!user) return null;
  if (!verifyPassword(password, user.password)) return null;
  return { email: key, name: user.name, role: user.role };
}

export function getAllUsers(): { email: string; name: string; role: string }[] {
  return Object.entries(USERS).map(([email, u]) => ({
    email, name: u.name, role: u.role,
  }));
}

export function updateUserPassword(email: string, newPassword: string): boolean {
  if (!USERS[email]) return false;
  USERS[email].password = hashPassword(newPassword);
  return true;
}

export function updateUserRole(email: string, role: "admin" | "monteur"): boolean {
  if (!USERS[email]) return false;
  USERS[email].role = role;
  return true;
}

export function addUser(email: string, name: string, password: string, role: "admin" | "monteur"): boolean {
  if (USERS[email.toLowerCase()]) return false;
  USERS[email.toLowerCase()] = { name, password: hashPassword(password), role };
  return true;
}

export function deleteUser(email: string): boolean {
  if (!USERS[email] || USERS[email].role === "admin") return false;
  delete USERS[email];
  return true;
}

/** Met à jour le nom et/ou l'adresse email d'un utilisateur.
 *  Si newEmail est fourni et différent de currentEmail, la clé du store change.
 *  Retourne false si l'utilisateur n'existe pas ou si newEmail est déjà pris. */
export function updateUserInfo(currentEmail: string, newName?: string, newEmail?: string): boolean {
  const key = currentEmail.toLowerCase();
  if (!USERS[key]) return false;
  if (newName) USERS[key].name = newName;
  if (newEmail) {
    const newKey = newEmail.toLowerCase();
    if (newKey !== key) {
      if (USERS[newKey]) return false; // email déjà utilisé
      USERS[newKey] = { ...USERS[key] };
      delete USERS[key];
    }
  }
  return true;
}

export async function createToken(user: User): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("365d") // 1 an — session persistante sur mobile
    .sign(secret);
}

export async function verifyToken(token: string): Promise<User | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
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
    const { payload } = await jwtVerify(token, secret);
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
