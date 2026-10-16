"use client";

/**
 * Page « Droits d'accès ».
 *
 * En haut, ce qu'un administrateur vient y faire : choisir une personne et
 * décider ce qu'elle a le droit de faire, en français, sans une seule adresse
 * technique.
 *
 * En bas, replié, l'inventaire des pages et des routes tel que le code le
 * déclare. Il reste indispensable au diagnostic — c'est lui qui dit si un
 * contrôle existe vraiment — mais il ne répond pas à la question qu'on se
 * pose chaque jour, et il n'a donc plus à occuper l'écran. Il continue d'être
 * régénéré à chaque construction : une liste tenue à la main se périme au
 * premier ajout et ment ensuite en silence.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck, Search, X, AlertTriangle, Wrench, ChevronDown } from "lucide-react";
import inventaire from "@/lib/droits-generes.json";
import { DroitsView } from "@/components/droits-view";

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
  { id: "droit", titre: "Autorisation vérifiée", sens: "Le fichier exige une autorisation nommée, celle de l'écran ci-dessus.", ton: "vert" },
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

  const [recherche, setRecherche] = useState("");
  const [technique, setTechnique] = useState(false);
  const entrees = inventaire.entrees as Entree[];

  const groupes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const filtrees = q ? entrees.filter((e) => e.url.toLowerCase().includes(q)) : entrees;
    return NIVEAUX.map((n) => ({ ...n, lignes: filtrees.filter((e) => e.niveau === n.id) }))
      .filter((g) => g.lignes.length > 0);
  }, [entrees, recherche]);

  if (autorise === false || autorise === null) return null;

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-4xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="sgch-entete mb-4">
        <h2 className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" /> Droits d&apos;accès</h2>
        <p>
          Choisissez un collaborateur, puis décidez de ce qu&apos;il a le droit de
          faire. Les autorisations s&apos;appliquent aussi bien à l&apos;écran qu&apos;aux
          données : une fonctionnalité interdite le reste, même en passant à côté
          de l&apos;application.
        </p>
      </div>

      <DroitsView />

      {/* ── Diagnostic technique ──────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4 mt-6">
        <button onClick={() => setTechnique((v) => !v)}
          className="w-full flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
          <Wrench className="w-4 h-4 text-gray-400" />
          Diagnostic des accès (technique)
          <span className="text-xs font-normal text-gray-400">({entrees.length} pages et routes)</span>
          <ChevronDown className={`w-4 h-4 ml-auto text-gray-400 transition-transform ${technique ? "rotate-180" : ""}`} />
        </button>

        {technique && (
          <div className="mt-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 leading-relaxed">
              L&apos;inventaire brut, classé d&apos;après le code lui-même — le middleware et
              les contrôles écrits dans chaque fichier. Il est régénéré à chaque
              construction de l&apos;application. Rien ne se modifie ici : cette section
              sert à vérifier qu&apos;un contrôle existe bien là où on le croit.
            </p>

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
              pour vérification.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
