import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAllUsers, updateUserPassword, updateUserRole, addUser, deleteUser, updateUserInfo } from "@/lib/auth";
import { getUserPhones, setUserPhone, renameUserPhone, deleteUserPhone } from "@/lib/user-phones";
import { getUserChatIds, deleteUserChatId } from "@/lib/user-chatids";

async function checkAdmin(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) return false;
  const user = await verifyToken(token);
  return user?.role === "admin";
}

export async function GET(request: NextRequest) {
  if (!(await checkAdmin(request))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const users = getAllUsers();
  // Fusionne téléphones + statut d'inscription Telegram (chat_id présent).
  let phones: Record<string, string> = {};
  let chatIds: Record<string, string> = {};
  try { phones = await getUserPhones(); } catch { /* indispo → sans téléphone */ }
  try { chatIds = await getUserChatIds(); } catch { /* indispo → non inscrit */ }
  return NextResponse.json(
    users.map((u) => ({
      ...u,
      phone: phones[u.email.toLowerCase()] || "",
      telegramRegistered: !!chatIds[u.email.toLowerCase()],
    })),
  );
}

export async function POST(request: NextRequest) {
  if (!(await checkAdmin(request))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const { email, name, password, role } = await request.json();
  if (!email || !name || !password) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  const success = addUser(email, name, password, role || "monteur");
  if (!success) {
    return NextResponse.json({ error: "Cet email existe déjà" }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  if (!(await checkAdmin(request))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const { email, password, role, name, newEmail, phone } = await request.json();
  if (!email) {
    return NextResponse.json({ error: "Email requis" }, { status: 400 });
  }
  if (name || newEmail) {
    const success = updateUserInfo(email, name, newEmail);
    if (!success) return NextResponse.json({ error: "Email déjà utilisé ou utilisateur introuvable" }, { status: 400 });
    // Si l'e-mail change, on migre le téléphone associé.
    if (newEmail && newEmail !== email) {
      try { await renameUserPhone(email, newEmail); } catch {}
    }
  }
  // Téléphone (persisté dans le KV). Chaîne vide autorisée = effacer.
  if (phone !== undefined) {
    const targetEmail = newEmail || email;
    try { await setUserPhone(targetEmail, String(phone).trim()); }
    catch { return NextResponse.json({ error: "Enregistrement du téléphone impossible" }, { status: 503 }); }
  }
  if (password) {
    // Si l'email a changé, on utilise le nouvel email pour la mise à jour du mot de passe
    const targetEmail = newEmail || email;
    const success = updateUserPassword(targetEmail, password);
    if (!success) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }
  if (role) {
    const targetEmail = newEmail || email;
    const success = updateUserRole(targetEmail, role);
    if (!success) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAdmin(request))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const { email } = await request.json();
  const success = deleteUser(email);
  if (!success) {
    return NextResponse.json({ error: "Impossible de supprimer cet utilisateur" }, { status: 400 });
  }
  try { await deleteUserPhone(email); } catch {}
  try { await deleteUserChatId(email); } catch {}
  return NextResponse.json({ success: true });
}
