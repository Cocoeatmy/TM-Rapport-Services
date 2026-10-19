"use client";

/**
 * « Informations sur l'application » — ce que CET appareil exécute, et où
 * en sont ses mises à jour et ses envois.
 *
 * Tout ce qui s'affiche ici est mesuré sur l'appareil ou renvoyé par le
 * serveur ; ce qu'on ne sait pas s'écrit « Non disponible ». Rien n'est
 * déduit pour faire joli. Trois versions à ne jamais confondre :
 *  - EXÉCUTÉE : celle de cette page (sa balise `tm-version`) ;
 *  - DISPONIBLE : celle que le serveur annonce (dernière vérification) ;
 *  - PRÊTE : téléchargée et vérifiée, appliquée au prochain rechargement.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Info, RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  appliquer, ecouterMiseAJour, etatMiseAJour, lireObservation, verifier, type EtatMiseAJour,
} from "@/lib/etat-mise-a-jour";
import { libelleVersion, sha7, versionDuDocument, type VersionWeb } from "@/lib/version-web";
import { infosNatives, plateformeLocale, systemeNavigateur } from "@/lib/appareil-local";
import { getQueue, compterEchecs, isOnline } from "@/lib/offline";
import { countPendingUploads, countPermanentlyFailed } from "@/lib/idb-uploads";
import { lireHistorique } from "@/lib/libelles-synchro";
import type { SuiviNatif } from "@/lib/appareils";

const ND = "Non disponible";

const ETATS: Record<EtatMiseAJour["etat"], string> = {
  "a-jour": "À jour",
  "disponible": "Mise à jour disponible",
  "preparation": "Mise à jour en préparation",
  "prete": "Mise à jour prête à être appliquée",
  "en-attente-synchro": "Synchronisation en attente avant la mise à jour",
  "hors-ligne": "Vérification impossible hors ligne",
  "inconnu": "Vérification impossible pour l'instant",
};

function date(t: number | string | null | undefined): string {
  if (!t) return ND;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? ND : d.toLocaleString("fr-CH", { dateStyle: "medium", timeStyle: "short" });
}

function Ligne({ titre, valeur, testId }: { titre: string; valeur: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 py-1.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <dt className="text-gray-500 dark:text-gray-400">{titre}</dt>
      <dd className="font-medium text-right break-all" data-testid={testId}>{valeur ?? ND}</dd>
    </div>
  );
}

function Version({ v }: { v: VersionWeb | null }) {
  if (!v) return <>{ND}</>;
  return (
    <span>
      {libelleVersion(v) || ND}
      <span className="block text-xs font-normal text-gray-500">
        commit {sha7(v.sha) || ND} · déploiement {v.deploiement || ND}
      </span>
    </span>
  );
}

interface Synchro { saisies: number; photos: number; echecs: number; derniere: number | null }

export default function InformationsPage() {
  /* Tout ce qui se lit sur l'appareil attend le montage : le rendu serveur ne le connaît pas. */
  const [monte, setMonte] = useState(false);
  const [executee, setExecutee] = useState<VersionWeb | null>(null);
  const [maj, setMaj] = useState<EtatMiseAJour>(() => etatMiseAJour());
  const [natif, setNatif] = useState<SuiviNatif | null | undefined>(undefined);
  const [synchro, setSynchro] = useState<Synchro | null>(null);
  const [verification, setVerification] = useState(false);
  const [application, setApplication] = useState(false);

  const lireSynchro = useCallback(async () => {
    let photos = 0, echecsPhotos = 0;
    try { photos = await countPendingUploads(); } catch { /* stockage indisponible */ }
    try { echecsPhotos = await countPermanentlyFailed(); } catch { /* idem */ }
    const histo = lireHistorique();
    setSynchro({
      saisies: getQueue().length,
      photos,
      echecs: compterEchecs() + echecsPhotos,
      derniere: histo.length ? Math.max(...histo.map((h) => h.quand || 0)) || null : null,
    });
  }, []);

  const lancerVerification = useCallback(async () => {
    setVerification(true);
    try { setMaj(await verifier()); } finally { setVerification(false); }
  }, []);

  useEffect(() => {
    setMonte(true);
    setExecutee(versionDuDocument());
    setMaj(etatMiseAJour());
    const fin = ecouterMiseAJour(setMaj);
    infosNatives().then(setNatif).catch(() => setNatif(null));
    lireSynchro();
    lancerVerification();
    const t = setInterval(lireSynchro, 5000);
    const aLaFile = () => lireSynchro();
    window.addEventListener("tm-file-modifiee", aLaFile);
    window.addEventListener("tm-pending-upload-added", aLaFile);
    window.addEventListener("tm-pending-upload-removed", aLaFile);
    return () => {
      fin();
      clearInterval(t);
      window.removeEventListener("tm-file-modifiee", aLaFile);
      window.removeEventListener("tm-pending-upload-added", aLaFile);
      window.removeEventListener("tm-pending-upload-removed", aLaFile);
    };
  }, [lireSynchro, lancerVerification]);

  const appliquerMaintenant = async () => {
    setApplication(true);
    try {
      const refus = await appliquer("manuel");
      if (refus) toast.error(`Mise à jour impossible pour l'instant : ${refus}.`);
    } finally {
      setApplication(false);
    }
  };

  /* Hors ligne : la dernière valeur connue, avec sa date. */
  const observation = monte ? lireObservation() : null;
  const disponible = maj.disponible ?? observation?.version ?? null;
  const verifieLe = maj.derniereVerification ?? observation?.verifieLe ?? null;
  const enLigne = monte ? isOnline() : true;
  const nouvelle = maj.etat === "disponible" || maj.etat === "preparation" || maj.etat === "prete" || maj.etat === "en-attente-synchro";
  const enAttente = synchro ? synchro.saisies + synchro.photos : 0;
  const plateforme = monte ? plateformeLocale() : null;
  const systeme = natif?.systeme ? [natif.systeme, natif.versionSysteme].filter(Boolean).join(" ") : (monte ? systemeNavigateur() : null);

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-2xl mx-auto">
      <Link href="/" className="sgch-retour inline-flex mb-4">
        <ArrowLeft className="w-4 h-4" /> Accueil
      </Link>
      <div className="sgch-entete mb-4">
        <h2 className="flex items-center gap-2"><Info className="w-5 h-5" /> Informations sur l&apos;application</h2>
      </div>

      <section className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-2">TM Rapport Services — version Web</h3>
        <dl className="text-sm">
          <Ligne titre="Version chargée sur cet appareil" valeur={<Version v={executee} />} testId="info-executee" />
          <Ligne titre="Compilée le" valeur={date(executee?.compile)} />
          <Ligne titre="Dernière version en production" valeur={<Version v={disponible} />} testId="info-disponible" />
          <Ligne titre="Mise en ligne (compilation)" valeur={date(disponible?.compile)} />
          <Ligne titre="État" valeur={ETATS[maj.etat]} testId="info-etat" />
          {maj.retenuePar.length > 0 && <Ligne titre="Mise à jour retenue par" valeur={maj.retenuePar.join(", ")} />}
          <Ligne titre="Dernière vérification réussie" valeur={date(verifieLe)} testId="info-verification" />
          <Ligne titre="Dernière tentative" valeur={date(maj.derniereTentative)} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={lancerVerification}
            disabled={verification}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            {verification ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Vérifier maintenant
          </button>
          {nouvelle && (
            <button
              type="button"
              onClick={appliquerMaintenant}
              disabled={application || !enLigne}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1e3a5f] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              data-testid="info-appliquer"
            >
              {application && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Appliquer la mise à jour maintenant
            </button>
          )}
        </div>
        {nouvelle && enAttente > 0 && (
          <p className="mt-2 text-xs text-gray-500">
            {enAttente} opération{enAttente > 1 ? "s" : ""} en attente : elle{enAttente > 1 ? "s sont conservées et reprendront" : " est conservée et reprendra"} leur envoi après la mise à jour.
          </p>
        )}
      </section>

      <section className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-2">Application native</h3>
        <dl className="text-sm">
          <Ligne titre="Appareil" valeur={plateforme && plateforme !== "autre" ? plateforme : ND} />
          <Ligne titre="Système" valeur={systeme || ND} />
          {natif === undefined ? (
            <Ligne titre="Application" valeur="…" />
          ) : natif === null ? (
            <Ligne titre="Application" valeur="Navigateur — pas d'application native" testId="info-natif" />
          ) : (
            <>
              <Ligne titre="Version de l'application" valeur={natif.coque || ND} testId="info-natif" />
              <Ligne titre="Build" valeur={natif.build || ND} />
              <Ligne
                titre="Compatibilité"
                valeur={maj.natifObsolete === true
                  ? `Version native obsolète — installez la ${maj.coqueAppleMinimum}`
                  : maj.natifObsolete === false ? "Compatible" : ND}
              />
            </>
          )}
          <Ligne titre="Date de publication native" valeur={ND} />
        </dl>
      </section>

      <section className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold mb-2">Synchronisation</h3>
        <dl className="text-sm">
          <Ligne titre="État" valeur={!enLigne ? "Hors ligne — les envois reprendront au retour du réseau" : enAttente > 0 ? "Synchronisation en attente" : "Tout est envoyé"} />
          <Ligne titre="Saisies en attente" valeur={synchro ? synchro.saisies : "…"} testId="info-saisies" />
          <Ligne titre="Photos en attente" valeur={synchro ? synchro.photos : "…"} testId="info-photos" />
          <Ligne titre="Échecs à relancer" valeur={synchro ? synchro.echecs : "…"} />
          <Ligne titre="Dernière synchronisation réussie" valeur={synchro ? date(synchro.derniere) : "…"} />
        </dl>
      </section>
    </div>
  );
}
