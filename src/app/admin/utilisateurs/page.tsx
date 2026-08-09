"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Users,
  Shield,
  Loader2,
  Eye,
  EyeOff,
  Save,
  UserPlus,
  Trash2,
  Mail,
  Phone,
  Send,
  Lock,
  Box,
  ChevronDown,
  ChevronUp,
  Pencil,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCollaboratorColor } from "@/lib/collaborators";
import { toast } from "sonner";
import type { Project } from "@/lib/notion";

interface UserData {
  email: string;
  name: string;
  role: string;
  phone?: string;
  telegramRegistered?: boolean;
}

export default function UtilisateursPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserData[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsMesures, setProjectsMesures] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addPassword, setAddPassword] = useState("");

  // Édition nom/email collaborateur
  const [editingUserEmail, setEditingUserEmail] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");

  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role !== "admin") {
          router.push("/");
          return;
        }
        setIsAdmin(true);
      });

    Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/projects/mesures").then((r) => r.json()),
    ]).then(([usersData, projData, mesData]) => {
      if (Array.isArray(usersData)) setUsers(usersData);
      if (Array.isArray(projData)) setProjects(projData);
      if (Array.isArray(mesData)) setProjectsMesures(mesData);
    }).finally(() => setLoading(false));
  }, [router]);

  const loadUsers = () => {
    fetch("/api/users").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setUsers(data);
    });
  };

  const handleUpdatePassword = async (email: string) => {
    if (!newPassword.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: newPassword }),
      });
      if (res.ok) {
        toast.success("Mot de passe modifié");
        setEditingEmail(null);
        setNewPassword("");
      } else {
        toast.error("Erreur lors de la modification");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAdmin = async (email: string, currentRole: string) => {
    const newRole = currentRole === "admin" ? "monteur" : "admin";
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role: newRole }),
      });
      if (res.ok) {
        toast.success(`Rôle modifié : ${newRole}`);
        loadUsers();
      }
    } catch {
      toast.error("Erreur réseau");
    }
  };

  const handleAddUser = async () => {
    if (!addEmail || !addName || !addPassword) return;
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addEmail, name: addName, password: addPassword, role: "monteur" }),
      });
      if (res.ok) {
        toast.success("Utilisateur ajouté");
        setShowAdd(false);
        setAddEmail("");
        setAddName("");
        setAddPassword("");
        loadUsers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Erreur");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUserInfo = async (currentEmail: string) => {
    setSaving(true);
    try {
      const body: Record<string, string> = { email: currentEmail };
      if (editName.trim()) body.name = editName.trim();
      if (editEmail.trim() && editEmail.trim() !== currentEmail) body.newEmail = editEmail.trim();
      body.phone = editPhone.trim(); // toujours envoyé (chaîne vide = effacer)
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("Collaborateur modifié");
        setEditingUserEmail(null);
        loadUsers();
      } else {
        const data = await res.json();
        toast.error(data.error || "Erreur");
      }
    } catch {
      toast.error("Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (email: string, name: string) => {
    if (!confirm(`Supprimer l'utilisateur ${name} ?`)) return;
    try {
      const res = await fetch("/api/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        toast.success("Utilisateur supprimé");
        loadUsers();
      } else {
        toast.error("Impossible de supprimer cet utilisateur");
      }
    } catch {
      toast.error("Erreur réseau");
    }
  };

  // Calculer les stats pour un collaborateur
  const getUserStats = (userName: string) => {
    const firstName = userName.split(" ")[0];

    // Cabines installées (montages)
    const montageProjects = projects.filter((p) =>
      p.collaborateurs.toLowerCase().includes(firstName.toLowerCase())
    );
    const cabinesInstallees = montageProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);

    // Cabines mesurées
    const mesureProjects = projectsMesures.filter((p) =>
      p.mesuresTraiteePar?.toLowerCase().includes(firstName.toLowerCase())
    );
    const cabinesMesurees = mesureProjects.reduce((sum, p) => sum + (p.nbCabines || 0), 0);

    // Par série de cabine (montages)
    const seriesMap: Record<string, number> = {};
    montageProjects.forEach((p) => {
      p.seriesCabines.forEach((s) => {
        seriesMap[s] = (seriesMap[s] || 0) + (p.nbCabines || 1);
      });
    });
    const seriesStats = Object.entries(seriesMap).sort(([, a], [, b]) => b - a);

    return {
      cabinesInstallees,
      projetsInstallation: montageProjects.length,
      cabinesMesurees,
      projetsMesures: mesureProjects.length,
      seriesStats,
    };
  };

  if (!isAdmin || loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-6 py-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/admin")}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 active:bg-gray-200"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            Gestion des utilisateurs
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{users.length} utilisateurs enregistrés</p>
        </div>
      </div>

      {/* Liste des utilisateurs */}
      <div className="space-y-3">
        {users.map((u) => {
          const firstName = u.name.split(" ")[0];
          const colors = getCollaboratorColor(firstName);
          const isEditing = editingEmail === u.email;
          const isEditingInfo = editingUserEmail === u.email;
          const isExpanded = expandedUser === u.email;
          const initials = u.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
          const stats = isExpanded ? getUserStats(u.name) : null;

          return (
            <Card key={u.email} className="glass-card overflow-hidden">
              <CardContent className="pt-4">
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                    style={{ backgroundColor: colors.bg, color: colors.text }}
                  >
                    {initials}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{u.name}</p>
                      {/* Toggle Admin */}
                      <button
                        onClick={() => handleToggleAdmin(u.email, u.role)}
                        className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded transition-colors ${
                          u.role === "admin"
                            ? "text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-900/60"
                            : "text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600"
                        }`}
                      >
                        <Shield className="w-3 h-3" />
                        {u.role === "admin" ? "Admin" : "Monteur"}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3" />
                      {u.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3 h-3" />
                      {u.phone ? u.phone : <span className="italic text-gray-400">Aucun téléphone</span>}
                    </p>
                    <p className="text-xs flex items-center gap-1 mt-0.5">
                      <Send className="w-3 h-3 text-sky-500" />
                      {u.telegramRegistered ? (
                        <span className="text-emerald-600 dark:text-emerald-400 font-medium">Inscrit au bot Telegram ✓</span>
                      ) : (
                        <span className="italic text-gray-400">Non inscrit au bot Telegram</span>
                      )}
                    </p>

                    {/* Actions */}
                    {isEditingInfo ? (
                      <div className="mt-3 space-y-2">
                        <div>
                          <Label className="text-xs text-gray-500">Nom complet</Label>
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={u.name}
                            className="h-9 text-sm mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Adresse email</Label>
                          <Input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder={u.email}
                            className="h-9 text-sm mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-gray-500">Téléphone (pour le rapport quotidien)</Label>
                          <Input
                            type="tel"
                            value={editPhone}
                            onChange={(e) => setEditPhone(e.target.value)}
                            placeholder="+41 79 000 00 00"
                            className="h-9 text-sm mt-1"
                          />
                        </div>
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => handleUpdateUserInfo(u.email)}
                            disabled={saving}
                            className="h-9 px-4 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Enregistrer
                          </button>
                          <button
                            onClick={() => { setEditingUserEmail(null); setEditName(""); setEditEmail(""); setEditPhone(""); }}
                            className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-600"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : isEditing ? (
                      <div className="mt-3 space-y-2">
                        <Label className="text-xs">Nouveau mot de passe</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={showPassword ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Nouveau mot de passe"
                              className="h-9 pr-9 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400"
                            >
                              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <button
                            onClick={() => handleUpdatePassword(u.email)}
                            disabled={saving || !newPassword.trim()}
                            className="h-9 px-3 rounded-lg bg-[#1e3a5f] text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1"
                          >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => { setEditingEmail(null); setNewPassword(""); }}
                            className="h-9 px-3 rounded-lg border border-gray-200 text-sm text-gray-600"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 mt-2">
                        <button
                          onClick={() => { setEditingUserEmail(u.email); setEditName(u.name); setEditEmail(u.email); setEditPhone(u.phone || ""); setEditingEmail(null); setExpandedUser(null); }}
                          className="text-xs text-emerald-600 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-200 flex items-center gap-1"
                        >
                          <Pencil className="w-3 h-3" />
                          Modifier
                        </button>
                        <button
                          onClick={() => { setEditingEmail(u.email); setNewPassword(""); setEditingUserEmail(null); }}
                          className="text-xs text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 flex items-center gap-1"
                        >
                          <Lock className="w-3 h-3" />
                          Mot de passe
                        </button>
                        <button
                          onClick={() => setExpandedUser(isExpanded ? null : u.email)}
                          className="text-xs text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100 flex items-center gap-1"
                        >
                          <Box className="w-3 h-3" />
                          Statistiques
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {u.role !== "admin" && (
                          <button
                            onClick={() => handleDeleteUser(u.email, u.name)}
                            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 ml-auto"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats dépliables */}
                {isExpanded && stats && (
                  <div className="mt-4 pt-3 border-t border-gray-100 space-y-3">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-blue-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-blue-700">{stats.cabinesInstallees}</p>
                        <p className="text-[10px] text-blue-600">Cabines installées</p>
                        <p className="text-[10px] text-blue-400">{stats.projetsInstallation} projets</p>
                      </div>
                      <div className="bg-green-50 rounded-xl p-3 text-center">
                        <p className="text-2xl font-bold text-green-700">{stats.cabinesMesurees}</p>
                        <p className="text-[10px] text-green-600">Cabines mesurées</p>
                        <p className="text-[10px] text-green-400">{stats.projetsMesures} projets</p>
                      </div>
                    </div>

                    {/* Par série */}
                    {stats.seriesStats.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Cabines par série</p>
                        <div className="space-y-1.5">
                          {stats.seriesStats.map(([serie, count]) => {
                            const max = Math.max(...stats.seriesStats.map(([, c]) => c), 1);
                            return (
                              <div key={serie} className="space-y-0.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-700 dark:text-gray-200">{serie}</span>
                                  <span className="font-semibold dark:text-gray-100">{count}</span>
                                </div>
                                <div className="h-1.5 bg-gray-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${(count / max) * 100}%`,
                                      backgroundColor: colors.dot,
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {stats.cabinesInstallees === 0 && stats.cabinesMesurees === 0 && (
                      <p className="text-xs text-gray-400 text-center py-2">Aucune donnée pour ce collaborateur</p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Ajouter un utilisateur */}
      <div className="mt-6">
        {showAdd ? (
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Nouvel utilisateur
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label className="text-xs">Nom complet</Label>
                <Input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Prénom Nom"
                  className="mt-1 h-10"
                />
              </div>
              <div>
                <Label className="text-xs">Adresse e-mail</Label>
                <Input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="mt-1 h-10"
                />
              </div>
              <div>
                <Label className="text-xs">Mot de passe</Label>
                <Input
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="Mot de passe"
                  className="mt-1 h-10"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddUser}
                  disabled={saving || !addEmail || !addName || !addPassword}
                  className="flex-1 h-10 rounded-lg glass-btn text-white text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Ajouter
                </button>
                <button
                  onClick={() => { setShowAdd(false); setAddEmail(""); setAddName(""); setAddPassword(""); }}
                  className="h-10 px-4 rounded-lg border border-gray-200 text-sm text-gray-600"
                >
                  Annuler
                </button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-slate-600 text-sm text-gray-500 dark:text-gray-300 hover:border-blue-400 hover:text-blue-500 active:bg-blue-50 dark:active:bg-blue-900/30 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Ajouter un utilisateur
          </button>
        )}
      </div>
    </div>
  );
}
