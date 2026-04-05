"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Shield, User, Users, Moon, Sun } from "lucide-react";

interface UserData {
  email: string;
  name: string;
  role: "admin" | "monteur";
}

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const toggleDark = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.classList.toggle("dark", newMode);
    localStorage.setItem("tm-dark-mode", newMode ? "true" : "false");
  };

  useEffect(() => {
    const saved = localStorage.getItem("tm-dark-mode");
    if (saved === "true") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  };

  if (!user) {
    return (
      <div className="w-9 h-9 rounded-full bg-white/15 border border-white/20 flex items-center justify-center">
        <User className="w-4 h-4 text-white/50" />
      </div>
    );
  }

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-xs font-bold text-white hover:bg-white/25 transition-colors"
      >
        {initials}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-56 glass-card rounded-xl p-2 shadow-xl">
            <div className="px-3 py-2 border-b border-gray-100 mb-1">
              <p className="text-sm font-medium text-gray-900">{user.name}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
              {user.role === "admin" && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded mt-1">
                  <Shield className="w-3 h-3" />
                  Admin
                </span>
              )}
            </div>
            {user.role === "admin" && (
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/admin");
                }}
                className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-100 flex items-center gap-2 text-gray-700"
              >
                <Shield className="w-4 h-4" />
                Tableau de bord
              </button>
            )}
            {user.role === "admin" && (
              <button
                onClick={() => {
                  setOpen(false);
                  router.push("/admin/utilisateurs");
                }}
                className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-100 flex items-center gap-2 text-gray-700"
              >
                <Users className="w-4 h-4" />
                Gestion utilisateurs
              </button>
            )}
            <button
              onClick={toggleDark}
              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {darkMode ? "Mode clair" : "Mode sombre"}
            </button>
            <button
              onClick={handleLogout}
              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-red-50 flex items-center gap-2 text-red-600"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </>
      )}
    </div>
  );
}
