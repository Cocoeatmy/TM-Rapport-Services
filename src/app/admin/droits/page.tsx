"use client";

/**
 * Page « Droits d'accès » — qui peut voir quoi, d'après le code lui-même.
 *
 * L'inventaire n'est pas tenu à la main : un script le régénère à chaque
 * construction en lisant le middleware et chaque fichier de route. Une liste
 * écrite à la main se périme au premier ajout et ment ensuite en silence, ce
 * qui est pire que pas de liste.
 *
 * Elle ne CHANGE aucun droit : elle les montre, pour que les décisions se
 * prennent en connaissance de cause.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Search, X, AlertTriangle } from "lucide-react";
import inventaire from "@/lib/droits-generes.json";

type Entree = {
  url: string; type: string; fichier: string; niveau: string;
  gardePage: boolean; methodes: string[];
};

/** Ce que chaque niveau signifie, en clair. L'ordre est celui de l'exposition. */
const NIVEAUX: { id: string; titre: string; sens: string; ton: string }[] = [
  { id: "ouvert", titre: "Ouvert", sens: "Accessible sans rien : page de connexion, webhooks, service worker.", ton: "rouge" },
  { id: "signe", titre: "Lien signé", sens: "Accessible à qui détient le lien, qui porte une signature HMAC. Pas de connexion requise.", ton: "orange" },
  { id: "signe-ou-connecte", titre: "Lien signé ou connexion", sens: "Un lien signé, ou un utilisateur connecté de l'application.", ton: "orange" },
  { id: "cle-secrete", titre: "Clé secrète", sens: "Protégé par une clé partagée (SHARE_LINK_KEY), pour les automatisations.", ton: "orange" },
  { id: "cron", titre: "Tâche planifiée", sens: "Déclenché par Vercel Cron, protégé par son propre secret.", ton: "neutre" },
  { id: "connecte-middleware", titre: "Connexion (middleware seul)", sens: "Aucun contrôle dans le fichier : c'est le middleware qui exige la connexion. Tout collaborateur y accède.", ton: "jaune" },
  { id: "connecte", titre: "Connexion vérifiée", sens: "Le fichier vérifie lui-même le jeton. Tout collaborateur connecté y accède.", ton: "jaune" },
  { id: "admin-ecran", titre: "Admin — écran seulement", sens: "La page renvoie un non-admin à l'accueil, mais ce sont les API qu'elle appelle qui décident réellement.", ton: "jaune" },
  { id: "admin", titre: "Administrateur", sens: "Le rôle est vérifié côté serveur. Un collaborateur reçoit une erreur.", ton: "vert" },
  { id: "proprietaire", titre: "Propriétaire seul", sens: "Verrouillé sur une adresse précise, pas sur le rôle : même un administrateur n'y accède pas.", ton: "vert" },
];

export default function DroitsPage() {
  const router = useRouter();
  const [autorise, setAutorise] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/auth")
      .then((r) => r.json())
      .then((d) => {
        if (d?.user?.role !== "admin") { router.replace("/"); setAutorise(false); }
        else setAutorise(true);
      })
      .catch(() => { router.replace("/"); setAutorise(false); });
  }, [router]);

  const [utilisateurs, setUtilisateurs] = useState<any[]>([]);
  useEffect(() => {
    if (!autorise) return;
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setUtilisateurs(Array.isArray(d) ? d : (d?.users || [])))
      .catch(() => {});
  }, [autorise]);

  const [recherche, setRecherche] = useState("");
  const entrees = inventaire.entrees as Entree[];

  const groupes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const filtrees = q ? entrees.filter((e) => e.url.toLowerCase().includes(q)) : entrees;
    return NIVEAUX.map((n) => ({ ...n, lignes: filtrees.filter((e) => e.niveau === n.id) }))
      .filter((g) => g.lignes.length > 0);
  }, [entrees, recherche]);

  const admins = utilisateurs.filter((u) => u.role === "admin");
  const collaborateurs = utilisateurs.filter((u) => u.role !== "admin");
  const large = entrees.filter((e) => e.niveau === "connecte" || e.niveau === "connecte-middleware").length;

  if (autorise === false) return null;

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-5xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="sgch-entete mb-4">
        <h2 className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Droits d&apos;accès</h2>
        <p>
          {entrees.length} pages et routes, classées d&apos;après le code lui-même — le
          middleware et les contrôles écrits dans chaque fichier. Cet inventaire est
          régénéré à chaque construction de l&apos;application : il ne peut pas se périmer
          en silence. Aucun droit n&apos;est modifié ici.
        </p>
      </div>

      <div className="sgq-ok mb-4" style={{ color: "inherit", display: "block" }}>
        <p className="m-0 text-[12.5px] leading-relaxed">
          <b>{admins.length} administrateur{admins.length > 1 ? "s" : ""}</b>
          {admins.length > 0 ? ` — ${admins.map((u) => u.name || u.username).join(", ")}. ` : ". "}
          <b>{collaborateurs.length} collaborateur{collaborateurs.length > 1 ? "s" : ""}</b>
          {" "}avec un compte. <b>{large} routes</b> sont accessibles à tout compte connecté,
          administrateur ou non : c&apos;est le périmètre à décider.
        </p>
      </div>

      <div className="sgq-barre mb-3">
        <span className="sgch-recherche">
          <Search className="w-3.5 h-3.5" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher une page ou une route…" />
          {recherche && (
            <button type="button" onClick={() => setRecherche("")} aria-label="Effacer">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </div>

      <div className="sgq-groupes">
        {groupes.map((g) => (
          <div key={g.id} className={`sgd-bloc is-${g.ton}`}>
            <div className="sgd-tete">
              <b>{g.titre}</b>
              <span>{g.sens}</span>
              <em>{g.lignes.length}</em>
            </div>
            <div className="sgd-liste">
              {g.lignes.map((e) => (
                <div key={e.fichier} className="sgd-ligne">
                  <code>{e.url}</code>
                  <span className="sgd-meta">
                    {e.type === "api" ? (e.methodes.join(" · ") || "—") : "page"}
                  </span>
                  <span className="sgd-fichier">{e.fichier}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <p className="sgch-vide-msg mt-4" style={{ textAlign: "left" }}>
        <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 align-[-2px]" />
        Le classement est une lecture du code : il reconnaît les contrôles écrits
        de la façon habituelle dans ce dépôt. Chaque ligne renvoie à son fichier
        pour vérification. Une route « connexion » n&apos;est pas une faille — c&apos;est
        une décision, qui mérite d&apos;être prise sciemment.
      </p>
    </div>
  );
}
