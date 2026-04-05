import { NextRequest, NextResponse } from "next/server";
import { authenticate, createToken, verifyToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    console.log("Auth attempt:", email);
    const user = authenticate(email, password);
    console.log("Auth result:", user ? "success" : "failed");
    if (!user) {
      return NextResponse.json({ error: "Email ou mot de passe incorrect" }, { status: 401 });
    }
    const token = await createToken(user);
    const response = NextResponse.json({ user });
    const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
    response.cookies.set("auth-token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get("auth-token")?.value;
  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const user = await verifyToken(token);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  return NextResponse.json({ user });
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("auth-token", "", { maxAge: 0, path: "/" });
  return response;
}
