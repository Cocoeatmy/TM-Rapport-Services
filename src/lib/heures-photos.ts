/**
 * L'heure que disent les photos, à côté de celle que dit le monteur.
 *
 * Les heures d'arrivée et de départ sont saisies à la main, et elles le
 * restent : personne ne demande au monteur de pointer autrement. Mais
 * elles se saisissent souvent de mémoire, le soir, et le rapport les
 * donne pour exactes. La première et la dernière photo de la journée, à
 * côté, disent sans juger ce que les heures ont oublié.
 *
 * ── CE QUE CETTE HEURE EST, ET CE QU'ELLE N'EST PAS ─────────────────────
 *
 * Ce n'est PAS l'EXIF de la photo. Vérifié chez Cloudinary le 16 octobre
 * 2026 : nos images n'en ont plus. La compression côté téléphone — celle
 * qui rend les envois fiables en 5G — ré-encode le fichier et détruit la
 * date de prise de vue au passage. Il ne reste que `ColorSpace`,
 * `PixelXDimension` et consorts.
 *
 * C'est l'horodatage que l'application inscrit dans le NOM du fichier au
 * moment où la photo entre dans la file d'envoi :
 *
 *     « Montage gauche.1.1792134182687.jpg »
 *
 * Pour une photo prise avec l'appareil de l'app — le cas courant sur un
 * chantier — c'est l'instant de la prise de vue à la seconde près. Pour
 * une photo choisie dans la galerie, c'est l'instant du choix, pas celui
 * du cliché. L'écran doit donc dire « photos », jamais « métadonnées ».
 *
 * Deux avantages sur l'EXIF, au passage : l'horodatage existe pour toutes
 * les photos sans exception, et il ne coûte aucun appel réseau.
 */

export interface FichierHorodate {
  name?: string;
}

export interface HeuresPhotos {
  /** « HH:MM » de la première photo du jour. */
  premiere: string;
  /** « HH:MM » de la dernière. */
  derniere: string;
  /** Combien de photos ont servi au calcul. */
  nombre: number;
}

/**
 * Colonnes photo qui ne témoignent PAS de la présence sur le chantier.
 *
 * Les cartons se photographient au dépôt, parfois le matin même : les
 * compter avancerait l'heure d'arrivée d'une heure sans que personne ne
 * comprenne pourquoi. Les mesures et la localité datent d'une visite
 * antérieure.
 */
const HORS_CHANTIER = new Set([
  "photosCartons",
  "photosCartonsRecus",
  "photosEtiquetteCarton",
  "photosBonLivraison",
  "photosEclateProduit",
  "photosMesures",
  "photosLocalite",
  "photosSituations",
]);

/** L'horodatage inscrit dans le nom du fichier, s'il y en a un. */
export function horodatageDuNom(nom?: string | null): number | null {
  /* Treize chiffres entre deux points : « …1.1792134182687.jpg ». On
     borne l'année pour ne pas confondre avec un numéro de commande. */
  const m = String(nom || "").match(/\.(\d{13})\./);
  if (!m) return null;
  const ms = parseInt(m[1], 10);
  const annee = new Date(ms).getFullYear();
  if (annee < 2020 || annee > 2100) return null;
  return ms;
}

/** Le lot d'une photo, quand son nom le porte (« …Cab3… »). */
export function lotDuNom(nom?: string | null): number | null {
  const m = String(nom || "").match(/\.Cab(\d+)\./);
  return m ? parseInt(m[1], 10) : null;
}

function hhmm(ms: number, fuseau: string): string {
  return new Intl.DateTimeFormat("fr-CH", {
    timeZone: fuseau, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(ms));
}

function jourDe(ms: number, fuseau: string): string {
  return new Intl.DateTimeFormat("fr-CA", {
    timeZone: fuseau, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(ms));
}

/**
 * Première et dernière photo prises sur le chantier, un jour donné.
 *
 * Le filtre par JOUR est ce qui rend le chiffre lisible : sans lui, une
 * photo de carton ajoutée la semaine précédente ferait commencer la
 * journée le lundi d'avant. Sans date, on ne devine pas — on ne rend
 * rien.
 */
export function heuresPhotosDuJour(
  buckets: Record<string, unknown>,
  jourISO: string,
  options: { lot?: number; fuseau?: string } = {},
): HeuresPhotos | null {
  const jour = String(jourISO || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;
  const fuseau = options.fuseau || "Europe/Zurich";

  const instants: number[] = [];
  for (const [champ, valeur] of Object.entries(buckets || {})) {
    if (!champ.startsWith("photos") || HORS_CHANTIER.has(champ)) continue;
    if (!Array.isArray(valeur)) continue;
    for (const f of valeur as FichierHorodate[]) {
      const ms = horodatageDuNom(f?.name);
      if (ms === null) continue;
      if (jourDe(ms, fuseau) !== jour) continue;
      /* Sur un chantier multi-cabines, chaque lot a ses propres heures :
         mélanger les photos de la douche 1 et de la douche 7 donnerait
         une amplitude qui n'appartient à personne. */
      if (options.lot !== undefined) {
        const lot = lotDuNom(f?.name);
        if (lot !== null && lot !== options.lot) continue;
      }
      instants.push(ms);
    }
  }

  if (instants.length === 0) return null;
  instants.sort((a, b) => a - b);
  return {
    premiere: hhmm(instants[0], fuseau),
    derniere: hhmm(instants[instants.length - 1], fuseau),
    nombre: instants.length,
  };
}
