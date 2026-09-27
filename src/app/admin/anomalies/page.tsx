"use client";

/**
 * Page « Anomalie Notion » — la qualité des fiches, vue de l'application.
 *
 * Une adresse vide ou un lot non nommé ne gêne personne le jour même, mais
 * casse en silence la tournée, les chantiers PPE, la carte et les statistiques.
 * Cette page rend visible ce que l'app n'arrive pas à lire, avec la raison,
 * pour que ce soit corrigé à la source.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { ControlesVue, type GroupeControle } from "@/components/controles-vue";

export default function AnomaliesPage() {
  const router = useRouter();
  /* Page réservée aux administrateurs : le menu ne suffit pas, un
     collaborateur qui taperait l'adresse serait renvoyé à l'accueil. */
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

  const [groupes, setGroupes] = useState<GroupeControle[]>([]);
  const [fiches, setFiches] = useState(0);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(() => {
    setChargement(true);
    setErreur(null);
    fetch("/api/controles?jeu=anomalies")
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((d) => { setGroupes(d.groupes || []); setFiches(d.fiches || 0); })
      .catch((e) => setErreur(String(e.message || e)))
      .finally(() => setChargement(false));
  }, []);

  useEffect(() => { if (autorise) charger(); }, [autorise, charger]);

  if (autorise === false) return null;

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-5xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>

      <div className="sgch-entete mb-4">
        <h2 className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5" /> Anomalie Notion
        </h2>
        <p>
          Ce que l&apos;application n&apos;arrive pas à lire dans les fiches Notion, et ce que
          cela empêche. {fiches > 0 ? `${fiches} fiche${fiches > 1 ? "s" : ""} concernée${fiches > 1 ? "s" : ""}.` : ""}
          {" "}Les projets annulés sont écartés.
        </p>
      </div>

      <ControlesVue
        groupes={groupes}
        chargement={chargement}
        erreur={erreur}
        onRecharger={charger}
        vide="Aucune anomalie : toutes les fiches sont exploitables."
      />
    </div>
  );
}
