"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Shield, User, Users, Moon, Sun, HelpCircle, Sparkles, Waves, Palette, Image as ImageIcon } from "lucide-react";
import { getCollaboratorInitials } from "@/lib/collaborators";
import { isSaveToGalleryEnabled, setSaveToGalleryEnabled } from "@/lib/save-to-gallery";
import { toast } from "sonner";

interface UserData {
  email: string;
  name: string;
  role: "admin" | "monteur";
}

type UiMode = "classic" | "aurora" | "ocean";

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [uiMode, setUiMode] = useState<UiMode>("classic");
  const [saveToPhotos, setSaveToPhotos] = useState(false);

  const toggleDark = () => {
    const newMode = !darkMode;
    setDarkMode(newMode);
    document.documentElement.classList.toggle("dark", newMode);
    localStorage.setItem("tm-dark-mode", newMode ? "true" : "false");
    // Comme tous les autres items du menu, on ferme après l'action :
    // l'utilisateur n'a plus à cliquer une deuxième fois sur l'avatar.
    setOpen(false);
  };

  // Sélectionne l'un des 3 thèmes. La classe data-ui sur <html> est lue par
  // globals.css (règles `html[data-ui="..."]`). Aucun JSX n'est modifié —
  // toute la refonte esthétique passe par ce seul attribut.
  const selectUiMode = (mode: UiMode) => {
    setUiMode(mode);
    if (mode === "classic") {
      document.documentElement.removeAttribute("data-ui");
    } else {
      document.documentElement.setAttribute("data-ui", mode);
    }
    localStorage.setItem("tm-ui-mode", mode);
    setOpen(false);
  };

  useEffect(() => {
    const savedDark = localStorage.getItem("tm-dark-mode");
    if (savedDark === "true") {
      setDarkMode(true);
      document.documentElement.classList.add("dark");
    }
    // Le script pré-hydration (dans layout) a déjà posé l'attribut si besoin.
    // On synchronise juste le state React avec ce qui est déjà sur le DOM.
    const savedUi = localStorage.getItem("tm-ui-mode");
    if (savedUi === "aurora" || savedUi === "ocean") {
      setUiMode(savedUi);
    }
    setSaveToPhotos(isSaveToGalleryEnabled());
  }, []);

  const toggleSaveToPhotos = () => {
    const next = !saveToPhotos;
    setSaveToPhotos(next);
    setSaveToGalleryEnabled(next);
    if (next) {
      // À l'activation, on explique le compromis : iOS web ne permet
      // pas un enregistrement totalement automatique, on tape une
      // fois sur "Enregistrer l'image" depuis le sheet natif.
      toast.info(
        "Activé. À chaque photo, le menu de partage iOS proposera « Enregistrer l'image ».",
        { duration: 5000 },
      );
    } else {
      toast.success("Sauvegarde dans Photos désactivée.", { duration: 2500 });
    }
    setOpen(false);
  };

  const loadUser = () => {
    return fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data && data.user) {
          setUser(data.user);
          return true;
        }
        return false;
      })
      .catch(() => false);
  };

  useEffect(() => {
    loadUser();
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  };

  // État chargement / session invalide : on garde un VRAI bouton cliquable.
  // Un tap retente l'auth ; si l'échec persiste, on redirige vers /login
  // (sinon l'icône « fantôme » donnait l'impression que le bouton était mort).
  if (!user) {
    const handleFallbackClick = async () => {
      const ok = await loadUser();
      if (!ok) {
        router.push("/login");
        router.refresh();
      }
    };
    return (
      <button
        type="button"
        onClick={handleFallbackClick}
        aria-label="Se reconnecter"
        className="w-9 h-9 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center hover:bg-white/25 transition-colors"
      >
        <User className="w-4 h-4 text-white/60" />
      </button>
    );
  }

  const initials = getCollaboratorInitials(user.name);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-9 h-9 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-xs font-bold text-white hover:bg-white/25 transition-colors"
      >
        {initials}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-50 w-56 bg-white dark:bg-slate-800 rounded-xl p-2 shadow-xl border border-gray-200 dark:border-gray-700">
            <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700 mb-1">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{user.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
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
                className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
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
                className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
              >
                <Users className="w-4 h-4" />
                Gestion utilisateurs
              </button>
            )}
            <button
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent("tm-open-onboarding"));
              }}
              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
            >
              <HelpCircle className="w-4 h-4" />
              Guide d&apos;utilisation
            </button>
            <button
              onClick={toggleDark}
              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {darkMode ? "Mode clair" : "Mode sombre"}
            </button>
            <button
              onClick={toggleSaveToPhotos}
              className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
              title="Permet d'envoyer chaque photo prise dans la pellicule du téléphone"
            >
              <ImageIcon className="w-4 h-4" />
              <span className="flex-1">Sauver photos sur l&apos;appareil</span>
              <span
                className={`relative inline-flex w-8 h-4 rounded-full transition-colors ${
                  saveToPhotos ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                    saveToPhotos ? "left-4" : "left-0.5"
                  }`}
                />
              </span>
            </button>
            {/* Sélecteur de thème : 3 options exclusives.
                Même état = état actif (coché + surlignage gradient). */}
            <div className="px-3 pt-2 pb-1">
              <p className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                <Palette className="w-3 h-3" />
                Thème
              </p>
            </div>
            <button
              onClick={() => selectUiMode("classic")}
              className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                uiMode === "classic"
                  ? "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-medium"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <span className="w-4 h-4 rounded-full bg-gradient-to-br from-slate-200 to-slate-400 border border-slate-300" />
              <span className="flex-1">Classique</span>
              {uiMode === "classic" && <span className="text-xs text-gray-500">●</span>}
            </button>
            <button
              onClick={() => selectUiMode("aurora")}
              className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                uiMode === "aurora"
                  ? "bg-gradient-to-r from-indigo-50 to-fuchsia-50 dark:from-indigo-900/30 dark:to-fuchsia-900/30 text-gray-900 dark:text-gray-100 font-medium"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <Sparkles className={`w-4 h-4 ${uiMode === "aurora" ? "text-violet-500" : ""}`} />
              <span className="flex-1">Aurora</span>
              {uiMode === "aurora" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white">
                  ON
                </span>
              )}
            </button>
            <button
              onClick={() => selectUiMode("ocean")}
              className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                uiMode === "ocean"
                  ? "bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-900/30 dark:to-cyan-900/30 text-gray-900 dark:text-gray-100 font-medium"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <Waves className={`w-4 h-4 ${uiMode === "ocean" ? "text-cyan-500" : ""}`} />
              <span className="flex-1">Océan</span>
              {uiMode === "ocean" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-blue-500 to-cyan-400 text-white">
                  ON
                </span>
              )}
            </button>
            <div className="h-px bg-gray-100 dark:bg-gray-700 my-1" />
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
