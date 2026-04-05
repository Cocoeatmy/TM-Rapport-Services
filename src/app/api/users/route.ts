import { NextRequest, NextResponse } from "next/server";
import { verifyToken, getAllUsers, updateUserPassword, updateUserRole, addUser, deleteUser } from "@/lib/auth";

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
  return NextResponse.json(getAllUsers());
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
  const { email, password, role } = await request.json();
  if (!email) {
    return NextResponse.json({ error: "Email requis" }, { status: 400 });
  }
  if (password) {
    const success = updateUserPassword(email, password);
    if (!success) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
  }
  if (role) {
    const success = updateUserRole(email, role);
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
  return NextResponse.json({ success: true });
}
