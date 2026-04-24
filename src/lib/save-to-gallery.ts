/**
 * Sauvegarde des fichiers image dans la pellicule / galerie photos de l'OS.
 *
 * Contrainte : il n'existe PAS d'API web qui écrit directement dans
 * l'album Photos de l'OS sans action utilisateur, surtout sur iOS.
 * Le mieux qu'on puisse faire depuis une PWA c'est d'ouvrir la
 * feuille de partage native via la Web Share API, qui propose
 * « Enregistrer l'image » (iOS) ou « Enregistrer dans Photos »
 * (Android) en un tap.
 *
 * Stratégie de fallback :
 *   1. navigator.share avec `files` si supporté → un tap = sauvegarde
 *   2. sinon, déclenche un téléchargement via <a download> → le
 *      fichier atterrit dans Downloads (mobile Android, desktop)
 *      et l'utilisateur peut le glisser dans Photos manuellement
 *   3. sinon, no-op silencieux
 *
 * Doit être appelé dans le même tick qu'un user gesture (click, tap)
 * pour éviter les blocages des navigateurs.
 */
export async function saveFilesToDeviceGallery(files: File[]): Promise<"shared" | "downloaded" | "unsupported"> {
  if (typeof navigator === "undefined" || !files.length) return "unsupported";

  // 1. Web Share API (iOS 15+, Android Chrome).
  try {
    const nav = navigator as Navigator & {
      canShare?: (data?: ShareData) => boolean;
    };
    if (typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files })) {
      await nav.share({ files, title: "Photos rapport TM" });
      return "shared";
    }
  } catch {
    // L'utilisateur a annulé ou le partage a échoué → on tombe dans le fallback.
  }

  // 2. Fallback : télécharger chaque fichier. Sur desktop et Android
  //    Chrome ça va dans Downloads. Sur iOS Safari standalone le
  //    `download` est ignoré — on ne fera rien de visible mais ça
  //    ne plante pas.
  try {
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Révoque un peu plus tard pour laisser le navigateur démarrer
      // le téléchargement avant de libérer la ressource.
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
    return "downloaded";
  } catch {
    return "unsupported";
  }
}

/** True si la feuille de partage native avec fichiers est dispo. */
export function canShareFilesNatively(files: File[]): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  return typeof nav.share === "function" && typeof nav.canShare === "function" && nav.canShare({ files });
}
