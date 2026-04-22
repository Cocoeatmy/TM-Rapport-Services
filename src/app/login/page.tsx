"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Mail } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        // Préchauffe le cache API pendant que Next.js hydrate la home :
        // ces fetchs partent en parallèle du render, donc quand le composant
        // dashboard monte, les données sont déjà dans le cache navigateur / SW.
        const prefetchUrls = [
          "/api/projects",
          "/api/projects/mesures",
          "/api/projects/services",
          "/api/projects/sav",
          "/api/projects/all-active",
        ];
        prefetchUrls.forEach((url) => {
          fetch(url, { credentials: "include" }).catch(() => {
            /* silencieux : le dashboard retentera */
          });
        });
        router.push("/");
        router.refresh();
      } else {
        setError(data.error || "Erreur de connexion");
      }
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen lg-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/icons/logo-app.png?v=3" alt="TM Rapport Services" className="w-20 h-20 rounded-2xl mx-auto mb-4 shadow-xl" />
          <h1 className="text-2xl font-bold text-gray-900">TM Rapport Services</h1>
          <p className="text-sm text-gray-500 mt-1">Connectez-vous pour accéder à l'application</p>
        </div>

        {/* Formulaire */}
        <form onSubmit={handleLogin} className="glass-card rounded-2xl p-6 space-y-4">
          <div>
            <Label htmlFor="email">Adresse e-mail</Label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9 h-12 rounded-xl glass-input"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="password">Mot de passe</Label>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9 h-12 rounded-xl glass-input"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl text-base font-medium glass-btn text-white flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Se connecter"
            )}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          TM Douche Montage Sàrl
        </p>
      </div>
    </div>
  );
}
