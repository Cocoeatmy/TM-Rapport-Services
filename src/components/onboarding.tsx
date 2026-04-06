"use client";

import { useEffect, useState } from "react";
import {
  X,
  ChevronRight,
  ChevronLeft,
  LayoutDashboard,
  Columns3,
  Timer,
  Camera,
  RefreshCw,
  Sparkles,
} from "lucide-react";

const STORAGE_KEY = "tm-onboarding-done";

interface OnboardingStep {
  title: string;
  description: string;
  icon: React.ReactNode;
}

const STEPS: OnboardingStep[] = [
  {
    title: "Bienvenue sur TM Rapport Services",
    description:
      "Votre application de gestion de chantiers, mesures et montages. Découvrez les fonctionnalités principales en quelques étapes.",
    icon: <Sparkles className="w-10 h-10 text-amber-500" />,
  },
  {
    title: "Dashboard",
    description:
      "Votre vue d'ensemble quotidienne : retrouvez vos projets en cours, les RDV du jour et les statistiques clés en un coup d'œil.",
    icon: <LayoutDashboard className="w-10 h-10 text-blue-500" />,
  },
  {
    title: "Onglets",
    description:
      "Basculez facilement entre Mesures, Montages, Services et SAV grâce aux onglets en haut de l'écran. Chaque vue affiche les projets correspondants.",
    icon: <Columns3 className="w-10 h-10 text-purple-500" />,
  },
  {
    title: "Minuteur",
    description:
      "Démarrez le chrono en arrivant sur le chantier pour suivre le temps passé. Le minuteur se synchronise automatiquement avec votre rapport.",
    icon: <Timer className="w-10 h-10 text-green-500" />,
  },
  {
    title: "Photos & Checklist",
    description:
      "Documentez votre travail avec des photos avant/après et validez chaque étape grâce à la checklist intégrée dans chaque projet.",
    icon: <Camera className="w-10 h-10 text-rose-500" />,
  },
  {
    title: "Synchronisation",
    description:
      "Gardez vos données à jour en synchronisant régulièrement. Les modifications sont sauvegardées localement et envoyées au serveur dès que possible.",
    icon: <RefreshCw className="w-10 h-10 text-teal-500" />,
  },
];

export function Onboarding() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);

  // Auto-show on first visit
  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY);
    if (!done) {
      setVisible(true);
    }
  }, []);

  // Listen for re-trigger from user menu
  useEffect(() => {
    const handler = () => {
      setStep(0);
      setDontShowAgain(false);
      setIsManualOpen(true);
      setVisible(true);
    };
    window.addEventListener("tm-open-onboarding", handler);
    return () => window.removeEventListener("tm-open-onboarding", handler);
  }, []);

  const close = () => {
    setVisible(false);
    setStep(0);
    if (dontShowAgain || !isManualOpen) {
      localStorage.setItem(STORAGE_KEY, "true");
    }
    setIsManualOpen(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    } else {
      close();
    }
  };

  const prev = () => {
    if (step > 0) setStep(step - 1);
  };

  if (!visible) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
      />

      {/* Card */}
      <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Close button */}
        <button
          onClick={close}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-700">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="px-8 pt-10 pb-6 text-center">
          {/* Icon */}
          <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center">
            {current.icon}
          </div>

          {/* Step indicator */}
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wider">
            Étape {step + 1} / {STEPS.length}
          </p>

          {/* Title */}
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-3">
            {current.title}
          </h2>

          {/* Description */}
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
            {current.description}
          </p>
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-1.5 pb-4">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                i === step
                  ? "w-6 bg-blue-500"
                  : i < step
                  ? "bg-blue-300"
                  : "bg-gray-200 dark:bg-gray-600"
              }`}
            />
          ))}
        </div>

        {/* "Ne plus afficher" on last step */}
        {isLast && (
          <div className="flex items-center justify-center gap-2 pb-3">
            <input
              type="checkbox"
              id="onboarding-no-show"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <label
              htmlFor="onboarding-no-show"
              className="text-xs text-gray-500 dark:text-gray-400 select-none cursor-pointer"
            >
              Ne plus afficher
            </label>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center gap-3 px-8 pb-8">
          {!isFirst ? (
            <button
              onClick={prev}
              className="flex items-center gap-1 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors px-3 py-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Précédent
            </button>
          ) : (
            <div />
          )}

          <button
            onClick={next}
            className="ml-auto flex items-center gap-1.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl transition-colors"
          >
            {isLast ? "Terminer" : "Suivant"}
            {!isLast && <ChevronRight className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
