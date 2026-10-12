"use client";

/**
 * Les liens courts vers un PDF (/f, /s, /sav, /sig) — et le piège de l'app
 * installée.
 *
 * Ces adresses redirigeaient droit sur le PDF. Dans un navigateur, c'est
 * parfait et rien ne change. Mais l'app ajoutée à l'écran d'accueil s'ouvre
 * en mode « autonome » : pas de barre d'adresse, pas de flèche retour, pas
 * d'onglets. Et comme le manifeste ne déclare aucune portée, elle capture
 * TOUS les liens du domaine — y compris celui du rendez-vous dans le
 * calendrier. Le PDF s'affichait donc DANS la fenêtre de l'app, qui n'avait
 * plus aucun moyen d'en sortir : tout semblait figé, et il fallait relancer
 * l'app pour s'en défaire.
 *
 * On ne redirige donc tout droit que lorsqu'il y a un chemin de retour. En
 * mode autonome, on montre une page minuscule : le document s'ouvre à côté —
 * dans le navigateur, qui lui a une flèche retour — et le chantier reste à
 * portée d'un geste.
 */

import { useEffect, useState } from "react";

/** L'app tourne-t-elle en fenêtre autonome, sans retour possible ? */
function enModeAutonome(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if ((window.navigator as unknown as { standalone?: boolean }).standalone) return true;
    return window.matchMedia("(display-mode: standalone)").matches
      || window.matchMedia("(display-mode: window-controls-overlay)").matches
      || window.matchMedia("(display-mode: minimal-ui)").matches;
  } catch {
    return false;
  }
}

export function LienDocument({
  url,
  titre,
  projetId,
}: {
  /** Adresse signée du PDF. */
  url: string;
  /** Ce qu'on va ouvrir, en toutes lettres. */
  titre: string;
  /** Pour revenir au chantier sans repasser par la liste. */
  projetId: string;
}) {
  /* `null` = on ne sait pas encore : le serveur ne peut pas deviner le mode
     d'affichage, et afficher le mauvais écran une fraction de seconde serait
     un clignotement de plus. */
  const [autonome, setAutonome] = useState<boolean | null>(null);

  useEffect(() => {
    const seul = enModeAutonome();
    setAutonome(seul);
    if (!seul) window.location.replace(url);
  }, [url]);

  if (autonome !== true) {
    return (
      <main style={{ padding: 24, fontFamily: "system-ui, sans-serif", color: "#475569" }}>
        <p>Ouverture du document…</p>
        <noscript>
          <a href={url}>Ouvrir : {titre}</a>
        </noscript>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100dvh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 18,
        padding: 28, fontFamily: "system-ui, sans-serif", textAlign: "center",
      }}
    >
      <h1 style={{ fontSize: 17, fontWeight: 600, color: "#0f172a", margin: 0, lineHeight: 1.4 }}>
        {titre}
      </h1>
      {/* `target` + `rel` : le PDF s'ouvre dans le navigateur, qui a une flèche
          retour. La fenêtre de l'app, elle, ne bouge pas. */}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "block", width: "100%", maxWidth: 360, padding: "14px 20px",
          borderRadius: 12, background: "#2563eb", color: "#fff",
          fontSize: 15, fontWeight: 600, textDecoration: "none",
        }}
      >
        Ouvrir le document (PDF)
      </a>
      <a
        href={`/projet/${projetId}?mode=dashboard`}
        style={{
          display: "block", width: "100%", maxWidth: 360, padding: "14px 20px",
          borderRadius: 12, border: "1px solid #cbd5e1", color: "#334155",
          fontSize: 15, fontWeight: 600, textDecoration: "none",
        }}
      >
        Ouvrir le chantier dans l&apos;app
      </a>
    </main>
  );
}
