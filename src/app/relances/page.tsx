"use client";

/**
 * Page « Relances » — ce qui traîne.
 *
 * Rien n'est faux ici : ce sont des dossiers corrects que personne n'a relancés.
 * Des cabines livrées depuis trois semaines sans rendez-vous, une offre sans
 * commande depuis deux mois, un SAV ouvert depuis un mois. L'application sait
 * tout cela depuis toujours ; elle attendait qu'on aille le chercher.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BellRing } from "lucide-react";
import { ControlesVue, type GroupeControle } from "@/components/controles-vue";

export default function RelancesPage() {
  const [groupes, setGroupes] = useState<GroupeControle[]>([]);
  const [fiches, setFiches] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setChargement(true);
    setErreur(null);
    fetch("/api/controles?jeu=relances")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setGroupes(d.groupes || []); setFiches(d.fiches || 0); })
      .catch((e) => setErreur(String(e.message || e)))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => { charger(); }, [charger]);

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-5xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="sgch-entete mb-4">
        <h2 className="flex items-center gap-2">
          <BellRing className="w-5 h-5" /> Relances
        </h2>
        <p>
          Les dossiers qui attendent une action de notre côté, du plus urgent au
          moins pressant. {fiches > 0 ? `${fiches} projet${fiches > 1 ? "s" : ""} à relancer.` : ""}
          {" "}Les délais sont comptés depuis la dernière étape franchie.
        </p>
      </div>

      <ControlesVue
        groupes={groupes}
        chargement={chargement}
        erreur={erreur}
        onRecharger={charger}
        vide="Rien ne traîne : tous les dossiers ont avancé récemment."
      />
    </div>
  );
}
