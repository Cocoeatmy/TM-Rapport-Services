"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { LogOut, Shield, User, Users, Moon, Sun, HelpCircle, Sparkles, Waves, Palette, Image as ImageIcon, Monitor, Mail, Loader2, Check } from "lucide-react";
import { getCollaboratorInitials } from "@/lib/collaborators";
import { isSaveToGalleryEnabled, setSaveToGalleryEnabled } from "@/lib/save-to-gallery";
import { toast } from "sonner";

interface UserData {
  email: string;
  name: string;
  role: "admin" | "monteur";
}

type UiMode = "classic" | "aurora" | "ocean" | "cleanmymac";

export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<UserData | null>(null);
  const [open, setOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [uiMode, setUiMode] = useState<UiMode>("classic");
  const [saveToPhotos, setSaveToPhotos] = useState(false);
  // Préférences e-mails (admin) : modal + données API.
  const [showEmailPrefs, setShowEmailPrefs] = useState(false);
  const [emailCats, setEmailCats] = useState<{ id: string; label: string; desc: string; defaultOn?: boolean }[]>([]);
  const [emailPrefs, setEmailPrefs] = useState<Record<string, boolean>>({});
  const [emailPrefsLoading, setEmailPrefsLoading] = useState(false);
  const [emailPrefsSaving, setEmailPrefsSaving] = useState(false);
  const openEmailPrefs = () => {
    setShowEmailPrefs(true);
    setEmailPrefsLoading(true);
    fetch("/api/email-prefs")
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => {
        const cats = d.categories || [];
        const saved = d.prefs || {};
        // État initial des cases : valeur enregistrée sinon défaut de la catégorie.
        const init: Record<string, boolean> = {};
        for (const c of cats) init[c.id] = typeof saved[c.id] === "boolean" ? saved[c.id] : !!c.defaultOn;
        setEmailCats(cats);
        setEmailPrefs(init);
      })
      .catch(() => toast.error("Impossible de charger les préférences."))
      .finally(() => setEmailPrefsLoading(false));
  };
  const saveEmailPrefs = () => {
    setEmailPrefsSaving(true);
    fetch("/api/email-prefs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cats: emailPrefs }) })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(() => { toast.success("Préférences e-mails enregistrées"); setShowEmailPrefs(false); })
      .catch(() => toast.error("Échec de l'enregistrement."))
      .finally(() => setEmailPrefsSaving(false));
  };
  const menuRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number }>({ top: 56, right: 8 });

  // Position du menu (rendu via portail dans <body> pour échapper à l'overflow
  // de la barre d'en-tête qui le rognait). Recalculée à l'ouverture + au resize.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // Fermeture au clic/tap en dehors du menu (iOS-compatible via pointerdown).
  // Le menu étant portalisé, on teste aussi popRef (sinon clic interne = fermeture).
  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !popRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

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
    if (savedUi === "aurora" || savedUi === "ocean" || savedUi === "cleanmymac") {
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
    <div className="relative" ref={menuRef}>
      <button
        ref={btnRef}
        onClick={() => setOpen(!open)}
        aria-label="Mon compte"
        title="Mon compte"
        className="w-9 h-9 shrink-0 rounded-full bg-white/15 border border-white/20 flex items-center justify-center text-xs font-bold text-white hover:bg-white/25 transition-colors"
      >
        {initials}
      </button>

      {open && typeof document !== "undefined" && createPortal(
          <div
            ref={popRef}
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-[100] w-56 max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-xl p-2 shadow-xl border border-gray-200 dark:border-gray-700">
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
            {user.role === "admin" && (
              <button
                onClick={() => { setOpen(false); openEmailPrefs(); }}
                className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 text-gray-700 dark:text-gray-300"
              >
                <Mail className="w-4 h-4" />
                Préférences e-mails
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
            <button
              onClick={() => selectUiMode("cleanmymac")}
              className={`w-full text-left text-sm px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                uiMode === "cleanmymac"
                  ? "bg-gradient-to-r from-violet-900/40 to-teal-900/30 text-gray-100 font-medium ring-1 ring-violet-500/30"
                  : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
              }`}
            >
              <Monitor className={`w-4 h-4 ${uiMode === "cleanmymac" ? "text-violet-400" : ""}`} />
              <span className="flex-1">CleanMyMac</span>
              {uiMode === "cleanmymac" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-gradient-to-r from-violet-600 to-teal-500 text-white">
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
          </div>,
          document.body
      )}

      {/* Modal « Préférences e-mails » (admin) */}
      {showEmailPrefs && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", inset: 0, zIndex: 120 }}
          className="flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowEmailPrefs(false)}
        >
          <div
            className="w-full max-w-md max-h-[85vh] flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-slate-700">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Mail className="w-5 h-5 text-[#1e3a5f] dark:text-blue-300" /> Préférences e-mails
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Cochez les e-mails que vous souhaitez recevoir. Tout est désactivé par défaut.
              </p>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {emailPrefsLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-400"><Loader2 className="w-5 h-5 animate-spin" /></div>
              ) : emailCats.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Aucune catégorie.</p>
              ) : (
                <div className="space-y-1">
                  {emailCats.map((c) => {
                    const on = emailPrefs[c.id] === true;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setEmailPrefs((p) => ({ ...p, [c.id]: !on }))}
                        className="w-full text-left flex items-start gap-3 px-2.5 py-2.5 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
                      >
                        <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center shrink-0 border-2 transition-colors ${on ? "bg-[#1e3a5f] border-[#1e3a5f] dark:bg-blue-500 dark:border-blue-500" : "border-gray-300 dark:border-slate-500"}`}>
                          {on && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{c.label}</span>
                          <span className="block text-xs text-gray-500 dark:text-gray-400 leading-snug">{c.desc}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-100 dark:border-slate-700 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowEmailPrefs(false)}
                className="h-10 px-4 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors">
                Annuler
              </button>
              <button
                disabled={emailPrefsSaving || emailPrefsLoading}
                onClick={saveEmailPrefs}
                className="h-10 px-4 rounded-xl text-sm font-semibold bg-[#1e3a5f] hover:bg-[#274b78] text-white transition-colors disabled:opacity-50 flex items-center gap-2">
                {emailPrefsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
