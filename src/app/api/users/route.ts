import { NextRequest, NextResponse } from "next/server";
import { getAllUsers, updateUserPassword, updateUserRole, addUser, deleteUser, updateUserInfo, definirCompteActif, getUser } from "@/lib/auth";
import { getUserPhones, setUserPhone, renameUserPhone, deleteUserPhone } from "@/lib/user-phones";
import { getUserChatIds, deleteUserChatId } from "@/lib/user-chatids";
import { aLeDroit } from "@/lib/droits-serveur";

/* Gérer les comptes est devenu une autorisation nommée, pilotée depuis
   l'écran « Droits d'accès ». Un administrateur l'a toujours ; un autre profil
   ne l'a que si on la lui a donnée. La requête n'est plus lue ici : le droit
   se lit sur la session, par le cookie. */
async function checkAdmin() {
  return aLeDroit("administration.comptes");
}

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const users = await getAllUsers();
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
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const { email, name, password, role, memeMotDePasseQue } = await request.json();
  if (!email || !name || !(password || memeMotDePasseQue)) {
    return NextResponse.json({ error: "Champs requis manquants" }, { status: 400 });
  }
  const success = await addUser(email, name, password || "", role || "monteur", memeMotDePasseQue);
  if (!success) {
    return NextResponse.json(
      { error: memeMotDePasseQue ? "Cet email existe déjà, ou le compte source est introuvable" : "Cet email existe déjà" },
      { status: 400 },
    );
  }
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const { email, password, role, name, newEmail, phone, desactive } = await request.json();
  if (!email) {
    return NextResponse.json({ error: "Email requis" }, { status: 400 });
  }
  /* Désactiver / réactiver : l'accès est coupé ou rendu, rien n'est effacé. */
  if (typeof desactive === "boolean") {
    const moi = await getUser();
    if (desactive && moi?.email?.toLowerCase() === String(email).toLowerCase()) {
      return NextResponse.json({ error: "Vous ne pouvez pas désactiver votre propre compte" }, { status: 400 });
    }
    const r = await definirCompteActif(email, !desactive, moi?.email || "");
    if (!r.ok) {
      return NextResponse.json(
        { error: desactive ? "Compte introuvable, ou administrateur (retirez d'abord ce rôle)" : "Compte introuvable" },
        { status: 400 },
      );
    }
    return NextResponse.json({ success: true, miroir: r.miroir });
  }
  if (name || newEmail) {
    const success = await updateUserInfo(email, name, newEmail);
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
    const success = await updateUserPassword(targetEmail, password);
    if (!success) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }
  if (role) {
    const targetEmail = newEmail || email;
    const success = await updateUserRole(targetEmail, role);
    if (!success) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  const { email } = await request.json();
  const success = await deleteUser(email);
  if (!success) {
    return NextResponse.json({ error: "Impossible de supprimer cet utilisateur" }, { status: 400 });
  }
  try { await deleteUserPhone(email); } catch {}
  try { await deleteUserChatId(email); } catch {}
  return NextResponse.json({ success: true });
}
