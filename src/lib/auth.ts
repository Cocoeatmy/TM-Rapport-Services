import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

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

const USERS_FILE = join(process.cwd(), "data", "users.json");

const DEFAULT_USERS: Record<string, UserRecord> = {
  "tm.douche.montage.1@gmail.com": { name: "Claudio Zanutto", password: "1468", role: "monteur" },
  "tm.douche.montage.2@gmail.com": { name: "Jean-Marc Nelzi", password: "1468", role: "monteur" },
  "tm.douche.montage.3@gmail.com": { name: "Jacobo Fontan Cassas", password: "1468", role: "monteur" },
  "tm.douche.montage.4@gmail.com": { name: "Miguel Roberto", password: "1468", role: "monteur" },
  "tm.douche.montage.5@gmail.com": { name: "Loïc Schiro", password: "1468", role: "monteur" },
  "ferreira.micael@gmail.com": { name: "Micael Ferreira", password: "Cocoeatmy5151", role: "admin" },
};

function loadUsers(): Record<string, UserRecord> {
  try {
    const data = readFileSync(USERS_FILE, "utf-8");
    const users = JSON.parse(data);
    return Object.keys(users).length > 0 ? users : DEFAULT_USERS;
  } catch {
    return DEFAULT_USERS;
  }
}

function saveUsers(users: Record<string, UserRecord>) {
  try {
    writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch {
    // Serverless: écriture impossible, ignorer silencieusement
    console.warn("Cannot write users file (serverless environment)");
  }
}

const secret = new TextEncoder().encode(process.env.JWT_SECRET || "fallback-secret");

export function authenticate(email: string, password: string): User | null {
  let users: Record<string, UserRecord>;
  try {
    users = loadUsers();
  } catch {
    users = DEFAULT_USERS;
  }
  // Fallback: si loadUsers retourne vide, utiliser DEFAULT_USERS
  if (!users || Object.keys(users).length === 0) {
    users = DEFAULT_USERS;
  }
  const key = email.toLowerCase().trim();
  const user = users[key];
  if (!user) return null;
  if (user.password !== password) return null;
  return { email: key, name: user.name, role: user.role };
}

export function getAllUsers(): { email: string; name: string; role: string }[] {
  const users = loadUsers();
  return Object.entries(users).map(([email, u]) => ({
    email,
    name: u.name,
    role: u.role,
  }));
}

export function updateUserPassword(email: string, newPassword: string): boolean {
  const users = loadUsers();
  if (!users[email]) return false;
  users[email].password = newPassword;
  saveUsers(users);
  return true;
}

export function addUser(email: string, name: string, password: string, role: "admin" | "monteur"): boolean {
  const users = loadUsers();
  if (users[email.toLowerCase()]) return false;
  users[email.toLowerCase()] = { name, password, role };
  saveUsers(users);
  return true;
}

export function updateUserRole(email: string, role: "admin" | "monteur"): boolean {
  const users = loadUsers();
  if (!users[email]) return false;
  users[email].role = role;
  saveUsers(users);
  return true;
}

export function deleteUser(email: string): boolean {
  const users = loadUsers();
  if (!users[email] || users[email].role === "admin") return false;
  delete users[email];
  saveUsers(users);
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
