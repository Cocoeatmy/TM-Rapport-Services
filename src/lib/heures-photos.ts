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

/* ────────────────────────────────────────────────────────────────────────
   LA DATE DE PRISE DE VUE, QUAND LA PHOTO LA PORTE

   Deux heures cohabitent désormais dans le nom d'un fichier :

       Montage gauche.1.1792134182687.p1792107600000.jpg
                        └ ajout         └ prise de vue (EXIF)

   La première a toujours existé : c'est l'instant où la photo entre dans
   la file d'envoi. La seconde est lue dans le fichier AVANT compression
   (voir lib/exif-photo) et n'existe que depuis le 16 octobre 2026.

   Elles ne disent pas la même chose et l'écran ne doit jamais les
   confondre : « 9 h 02 pour une photo d'avant montage » était l'heure
   d'ajout, et elle ne voulait rien dire sur le chantier.
   ──────────────────────────────────────────────────────────────────────── */

/** Le morceau à coller dans le nom du fichier, vide si l'EXIF est muet. */
export function suffixePriseDeVue(ms: number | null | undefined): string {
  return typeof ms === "number" && Number.isFinite(ms) ? `.p${ms}` : "";
}

/** La date de prise de vue inscrite dans le nom, si elle y est. */
export function priseDeVueDuNom(nom?: string | null): number | null {
  const m = String(nom || "").match(/\.p(\d{13})\./);
  if (!m) return null;
  const ms = parseInt(m[1], 10);
  const annee = new Date(ms).getFullYear();
  if (annee < 2000 || annee > 2100) return null;
  return ms;
}

export interface HeuresPhotosSourcees extends HeuresPhotos {
  /**
   * « prise »      la photo porte sa date, et ce jour-là ;
   * « prise-autre » elle porte sa date, mais d'un AUTRE jour ;
   * « ajout »      elle n'a pas d'EXIF : on n'a que l'heure d'ajout.
   */
  source: "prise" | "prise-autre" | "ajout";
  /** Le jour des photos, quand il diffère de celui qu'on a déclaré. */
  jourReel?: string;
}

/** Le jour (AAAA-MM-JJ) d'une liste d'instants, s'ils tombent tous le même. */
function jourCommun(instants: number[], fuseau: string): string {
  const jours = new Set(instants.map((ms) => jourDe(ms, fuseau)));
  return jours.size === 1 ? [...jours][0] : "";
}

/**
 * Première et dernière photo, en préférant TOUJOURS la prise de vue.
 *
 * L'ordre de préférence tient en trois lignes, et chacune répond à un cas
 * réel :
 *
 *   1. les photos du lot datées, prises LE JOUR DÉCLARÉ — le cas normal,
 *      et la seule heure qui vaille ;
 *   2. les photos du lot datées, prises UN AUTRE JOUR — on l'affiche avec
 *      sa date. C'est justement ce qu'on veut voir : des photos d'un
 *      autre jour sur un montage, cela se remarque ;
 *   3. à défaut, l'heure d'ajout — en le disant.
 *
 * On ne mélange jamais deux horloges dans un même calcul : une amplitude
 * faite d'une prise de vue et d'un ajout n'appartiendrait à personne.
 */
export function heuresPhotosSourcees(
  buckets: Record<string, unknown>,
  jourISO: string,
  options: { lot?: number; fuseau?: string } = {},
): HeuresPhotosSourcees | null {
  const fuseau = options.fuseau || "Europe/Zurich";

  /* Les photos du lot qui portent leur date de prise de vue. On réécrit
     leur horodatage d'ajout par celui de la prise, pour que le reste du
     calcul n'ait pas à connaître la distinction. */
  const datees: Record<string, { name: string }[]> = {};
  const instantsPris: number[] = [];
  for (const [champ, valeur] of Object.entries(buckets || {})) {
    if (!champ.startsWith("photos") || HORS_CHANTIER.has(champ) || !Array.isArray(valeur)) continue;
    const gardees: { name: string }[] = [];
    for (const f of valeur as FichierHorodate[]) {
      const prise = priseDeVueDuNom(f?.name);
      if (prise === null) continue;
      if (options.lot !== undefined) {
        const lot = lotDuNom(f?.name);
        if (lot !== null && lot !== options.lot) continue;
      }
      gardees.push({ name: String(f.name).replace(/\.(\d{13})\./, `.${prise}.`) });
      instantsPris.push(prise);
    }
    if (gardees.length) datees[champ] = gardees;
  }

  if (instantsPris.length > 0) {
    /* 1. Le jour déclaré. */
    const leJour = heuresPhotosDuJour(datees, jourISO, options);
    if (leJour) return { ...leJour, source: "prise" };

    /* 2. Un autre jour — on le montre, c'est une information. */
    const autre = jourCommun(instantsPris, fuseau);
    if (autre) {
      const h = heuresPhotosDuJour(datees, autre, options);
      if (h) return { ...h, source: "prise-autre", jourReel: autre };
    }
  }

  /* 3. Aucune photo datée : l'heure d'ajout, nommée pour ce qu'elle est. */
  const h = heuresPhotosDuJour(buckets, jourISO, options);
  return h ? { ...h, source: "ajout" } : null;
}
