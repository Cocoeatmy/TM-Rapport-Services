"use client";

/**
 * Combien de temps dure cette vidéo, avant de l'envoyer.
 *
 * Le navigateur sait le dire sans décoder le film : on lui demande les seules
 * métadonnées. Si le format lui échappe (certains .mov iPhone selon la
 * version d'iOS), on renvoie null — et l'envoi passe quand même. Une durée
 * qu'on n'a pas su lire ne doit jamais empêcher un monteur d'envoyer sa
 * vidéo ; la limite de taille, elle, reste là pour protéger.
 */
export function dureeVideo(fichier: Blob, timeoutMs = 4000): Promise<number | null> {
  if (typeof document === "undefined") return Promise.resolve(null);

  return new Promise((resolve) => {
    let url: string;
    try {
      url = URL.createObjectURL(fichier);
    } catch {
      resolve(null);
      return;
    }

    const video = document.createElement("video");
    let fini = false;
    const terminer = (duree: number | null) => {
      if (fini) return;
      fini = true;
      clearTimeout(minuteur);
      video.removeAttribute("src");
      try { video.load(); } catch {}
      try { URL.revokeObjectURL(url); } catch {}
      resolve(duree);
    };

    const minuteur = setTimeout(() => terminer(null), timeoutMs);

    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () => {
      const d = video.duration;
      terminer(Number.isFinite(d) && d > 0 ? d : null);
    };
    video.onerror = () => terminer(null);
    video.src = url;
  });
}
