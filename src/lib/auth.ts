import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export interface User {
  email: string;
  name: string;
  role: "admin" | "monteur";
}

export interface UserRecord {
  name: string;
  password: string;
  role: "admin" | "monteur";
}

const USERS: Record<string, UserRecord> = {
  "tm.douche.montage.1@gmail.com": { name: "Claudio Zanutto", password: "1468", role: "monteur" },
  "tm.douche.montage.2@gmail.com": { name: "Jean-Marc Nelzi", password: "1468", role: "monteur" },
  "tm.douche.montage.3@gmail.com": { name: "Jacobo Fontan Cassas", password: "1468", role: "monteur" },
  "tm.douche.montage.4@gmail.com": { name: "Miguel Roberto", password: "1468", role: "monteur" },
  "tm.douche.montage.5@gmail.com": { name: "Loïc Schiro", password: "1468", role: "monteur" },
  "ferreira.micael@gmail.com": { name: "Micael Ferreira", password: "Cocoeatmy5151", role: "admin" },
};

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret");

export function authenticate(email: string, password: string): User | null {
  const key = email.toLowerCase().trim();
  const user = USERS[key];
  if (!user || user.password !== password) return null;
  return { email: key, name: user.name, role: user.role };
}

export function getAllUsers(): { email: string; name: string; role: string }[] {
  return Object.entries(USERS).map(([email, u]) => ({
    email, name: u.name, role: u.role,
  }));
}

export function updateUserPassword(email: string, newPassword: string): boolean {
  if (!USERS[email]) return false;
  USERS[email].password = newPassword;
  return true;
}

export function updateUserRole(email: string, role: "admin" | "monteur"): boolean {
  if (!USERS[email]) return false;
  USERS[email].role = role;
  return true;
}

export function addUser(email: string, name: string, password: string, role: "admin" | "monteur"): boolean {
  if (USERS[email.toLowerCase()]) return false;
  USERS[email.toLowerCase()] = { name, password, role };
  return true;
}

export function deleteUser(email: string): boolean {
  if (!USERS[email] || USERS[email].role === "admin") return false;
  delete USERS[email];
  return true;
}

export async function createToken(user: User): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
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

export async function getUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("auth-token")?.value;
  if (!token) return null;
  return verifyToken(token);
}
