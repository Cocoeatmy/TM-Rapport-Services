"use client";

/**
 * Les ronds d'initiales d'une équipe (23.10.2026) : « JMN » « MR », dans la
 * couleur du calendrier de chacun — on reconnaît qui travaille sur quoi sans
 * lire. Le nom complet s'affiche au survol.
 */

import { getCollaboratorColor, getCollaboratorInitials } from "@/lib/collaborators";

export function RondsEquipe({ noms, taille = 22, max = 4, className = "" }: {
  noms: string[]; taille?: number; max?: number; className?: string;
}) {
  const liste = noms.filter(Boolean);
  if (liste.length === 0) return null;
  const vus = liste.slice(0, max);
  const reste = liste.length - vus.length;
  const police = Math.max(8, Math.round(taille * 0.4));
  return (
    <span className={`inline-flex items-center ${className}`} title={liste.join(" & ")} aria-label={liste.join(" & ")}>
      {vus.map((n, i) => {
        const c = getCollaboratorColor(n);
        return (
          <span key={n + i}
            className="inline-flex items-center justify-center rounded-full font-bold ring-2 ring-white dark:ring-slate-900 shrink-0"
            style={{ width: taille, height: taille, fontSize: police, background: c.dot, color: "#fff", marginLeft: i ? -Math.round(taille * 0.28) : 0, letterSpacing: "-0.02em" }}>
            {getCollaboratorInitials(n)}
          </span>
        );
      })}
      {reste > 0 && (
        <span className="inline-flex items-center justify-center rounded-full font-bold bg-gray-200 text-gray-700 ring-2 ring-white dark:ring-slate-900"
          style={{ width: taille, height: taille, fontSize: police, marginLeft: -Math.round(taille * 0.28) }}>+{reste}</span>
      )}
    </span>
  );
}
