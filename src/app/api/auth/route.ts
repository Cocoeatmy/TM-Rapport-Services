import { NextRequest, NextResponse } from "next/server";
import { authenticate, createToken, verifyTokenWithExpiry } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 an en secondes

function setAuthCookie(response: NextResponse, token: string) {
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  response.cookies.set("auth-token", token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const { allowed, remaining } = checkRateLimit(`auth:${ip}`, 5, 60000);
    if (!allowed) {
      return NextResponse.json(
        { error: "Trop de tentatives. Veuillez réessayer dans une minute." },
        { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Remaining": "0" } }
      );
    }

    const { email, password } = await request.json();
    console.log("Auth attempt:", email);
    const user = authenticate(email, password);
    console.log("Auth result:", user ? "success" : "failed");
    if (!user) {
      return NextResponse.json({ error: "Email ou mot de passe incorrect" }, { status: 401 });
    }
    const token = await createToken(user);
    const response = NextResponse.json({ user });
    setAuthCookie(response, token);
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

  const { user, exp } = await verifyTokenWithExpiry(token);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const response = NextResponse.json({ user });

  // Renouvellement silencieux : si le token expire dans moins de 30 jours,
  // on émet un nouveau token + cookie 1 an sans que l'utilisateur s'en aperçoive.
  // Résultat : tant que le monteur ouvre l'app au moins 1×/mois, il ne se
  // reconnecte jamais.
  if (exp) {
    const remainingSec = exp - Math.floor(Date.now() / 1000);
    const THIRTY_DAYS_SEC = 30 * 24 * 60 * 60;
    if (remainingSec < THIRTY_DAYS_SEC) {
      try {
        const newToken = await createToken(user);
        setAuthCookie(response, newToken);
      } catch {
        // Échec silencieux : le token actuel reste valide
      }
    }
  }

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.set("auth-token", "", { maxAge: 0, path: "/" });
  return response;
}
