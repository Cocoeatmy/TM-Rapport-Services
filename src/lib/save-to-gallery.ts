/**
 * Sauvegarde des fichiers image dans la pellicule / galerie photos de l'OS.
 *
 * Contrainte technique
 * --------------------
 * Il n'existe PAS d'API web qui écrit directement dans l'album Photos
 * de l'OS sans action utilisateur, surtout sur iOS. Apple sandboxe
 * Safari et les PWA — pas d'équivalent à l'autorisation native d'une
 * vraie app installée. Le mieux qu'on peut faire c'est ouvrir la
 * feuille de partage native (Web Share API), où l'utilisateur tape
 * « Enregistrer l'image ».
 *
 * Préférence utilisateur
 * ----------------------
 * La fonction est OPT-IN : par défaut elle ne fait rien, pour ne pas
 * surprendre l'utilisateur avec un sheet à chaque photo. Le user peut
 * activer le toggle "Sauvegarder photos sur l'appareil" dans son menu.
 * Tant que la clé `tm-save-to-photos` n'est pas à "true", la fonction
 * sort tout de suite — c'est le comportement réclamé après le retour
 * UX (la pop-up "Ouvrir dans Aperçu" était jugée trop intrusive).
 *
 * Stratégie quand activée
 * -----------------------
 *   1. navigator.share avec `files` si supporté → un tap dans
 *      « Enregistrer l'image » du sheet et c'est plié
 *   2. sinon, déclenche un téléchargement via <a download> (Android,
 *      desktop)
 *   3. sinon, no-op silencieux
 *
 * Doit être appelé dans le même tick qu'un user gesture (click, tap)
 * pour éviter les blocages des navigateurs.
 */

const PREF_KEY = "tm-save-to-photos";

export function isSaveToGalleryEnabled(): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(PREF_KEY) === "true";
  } catch {
    return false;
  }
}

export function setSaveToGalleryEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(PREF_KEY, enabled ? "true" : "false");
  } catch {
    /* silent */
  }
}

export async function saveFilesToDeviceGallery(files: File[]): Promise<"shared" | "downloaded" | "disabled" | "unsupported"> {
  // Sortie immédiate si la préférence n'est pas activée — pas de
  // sheet, pas de download, rien. L'utilisateur conserve le contrôle.
  if (!isSaveToGalleryEnabled()) return "disabled";
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
    // Annulation utilisateur ou échec du partage → fallback.
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
