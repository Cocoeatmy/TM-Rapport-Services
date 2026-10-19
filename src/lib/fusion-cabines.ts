/**
 * La fusion des colonnes « par lot » (« Cab1:… | Cab2:… »).
 *
 * UNE seule définition, partagée par le serveur (PATCH /api/projects/[id]) et
 * par la fiche, qui l'applique aux écritures encore en file pour afficher ce
 * que le serveur aura une fois la file passée (`avecSaisiesEnAttente`). Deux
 * copies finiraient par diverger, et la fiche montrerait autre chose que ce
 * qui sera écrit. Déplacé tel quel depuis la route le 19.10.2026.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Merge multi-cabin time fields ─────────────────────────────────────────────
// Format Notion: "Cab1:2026-05-20:08:30 | Cab2:2026-05-21:09:15"
// Quand un collaborateur PATCH depuis un état cache incomplet (il manque les
// cabines des autres jours), on préserve les données Notion déjà présentes
// pour les cabines absentes du payload client.

export function parseCabineMap(raw: string): Map<number, string> {
  const map = new Map<number, string>();
  if (!raw || !raw.includes("Cab")) return map;
  const re = /Cab(\d+)\s*:([^|]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const val = m[2].trim();
    if (val) map.set(parseInt(m[1], 10), val);
  }
  return map;
}

/**
 * Merge noms de cabines : la valeur personnalisée gagne toujours sur le défaut.
 * Si incoming = "Cabine N" (défaut) et existing a une valeur → on garde existing.
 * Si incoming est custom (≠ "Cabine N") → incoming gagne (changement explicite).
 */
/**
 * Fusion des noms de lots.
 *
 * Le client envoie TOUS les slots, y compris ceux qu'il n'a pas touchés et
 * dont sa copie peut être périmée. Un « Cabine 3 » entrant ne vaut donc rien
 * par lui-même — il signifie le plus souvent « je ne sais pas », et l'écrire
 * effacerait le nom que quelqu'un a choisi sur un autre téléphone.
 *
 * Sauf quand le monteur vient précisément de renommer ce lot-là : `forces`
 * porte les slots qu'il a touchés dans cette écriture, et ceux-là passent,
 * même pour revenir à « Cabine 3 ». Un nom VIDE, lui, n'est jamais écrit :
 * un lot garde toujours un titre (demande de Micael, 14 octobre 2026).
 */
export function mergeCabineNoms(existing: string, incoming: string, forces?: unknown): string {
  if (!incoming.includes("Cab")) return incoming;
  const forcés = new Set<number>(
    String(forces || "")
      .split(/[,|]/)
      .map((t) => parseInt(t.replace(/\D/g, ""), 10))
      .filter((n) => Number.isFinite(n) && n > 0),
  );
  const exMap = parseCabineMap(existing);
  // Parser qui inclut les valeurs vides pour détecter les slots présents dans incoming
  const inMap = new Map<number, string>();
  const re1 = /Cab(\d+)\s*:([^|]*)/g;
  let m1: RegExpExecArray | null;
  while ((m1 = re1.exec(incoming))) {
    inMap.set(parseInt(m1[1], 10), m1[2].trim());
  }

  const merged = new Map(exMap);
  inMap.forEach((inVal, cabNum) => {
    if (inVal === "") {
      // Un titre ne s'efface pas. Au pire on repose le nom par défaut.
      if (!exMap.has(cabNum)) merged.set(cabNum, `Cabine ${cabNum}`);
      return;
    }
    const estDefaut = inVal === `Cabine ${cabNum}`;
    if (!estDefaut || forcés.has(cabNum) || !exMap.has(cabNum)) {
      merged.set(cabNum, inVal);
    }
    // sinon : existing a un nom choisi, incoming n'est qu'un défaut non voulu
  });

  return [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, val]) => `Cab${num}:${val}`)
    .join(" | ");
}

/**
 * Merge attribution (monteurs) : non-vide écrase toujours, vide = suppression explicite.
 * Le format encode TOUS les slots (même vides) pour permettre la suppression d'un monteur.
 * Ex: "Cab1:Micael | Cab2: | Cab3:Claudio" → Cab2 est explicitement vidé.
 */
export function mergeCabineAttribution(existing: string, incoming: string): string {
  if (!incoming.includes("Cab")) return incoming;
  const exMap = parseCabineMap(existing);
  // Parser qui capture aussi les slots vides
  const inMap = new Map<number, string>();
  const re2 = /Cab(\d+)\s*:([^|]*)/g;
  let m2: RegExpExecArray | null;
  while ((m2 = re2.exec(incoming))) {
    inMap.set(parseInt(m2[1], 10), m2[2].trim());
  }

  const merged = new Map(exMap);
  inMap.forEach((inVal, cabNum) => {
    // IMPORTANT : un slot NON-VIDE écrase ; un slot VIDE est IGNORÉ (on préserve
    // l'existant). On ne supprime JAMAIS un monteur via un slot vide — c'était
    // la cause des disparitions à répétition : tout envoi de l'attribution
    // complète depuis un état local incomplet (un monteur pas encore chargé)
    // vidait ces cabines. La suppression délibérée passe désormais par le champ
    // body.clearAttributionCabs (signal explicite, jamais ambigu).
    if (inVal) merged.set(cabNum, inVal);
  });

  const result = [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, val]) => val)
    .map(([num, val]) => `Cab${num}:${val}`)
    .join(" | ");
  return result;
}

/**
 * Merge du « monteur sous-traitance » PAR CABINE (colonne Notion « Monteurs
 * sous-traitance », encodée "Cab1:X | Cab2:Y").
 * `incoming` est un DELTA d'une seule cabine ("Cab3:Nom" pour définir, "Cab3:"
 * pour effacer) : le client n'envoie que la cabine modifiée, donc un slot vide
 * = suppression EXPLICITE (pas d'ambiguïté d'état incomplet, à la différence de
 * l'attribution des monteurs responsables).
 */
export function mergeCabineSousTraitance(existing: string, incoming: string): string {
  const map = parseCabineMap(existing);
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(incoming))) {
    const num = parseInt(m[1], 10);
    const val = m[2].trim();
    if (val) map.set(num, val); else map.delete(num);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, val]) => val)
    .map(([num, val]) => `Cab${num}:${val}`)
    .join(" | ");
}

/** Retire des cabines de la chaîne d'attribution (suppression EXPLICITE). */
export function clearCabinesFromAttribution(attribution: string, cabs: number[]): string {
  const map = parseCabineMap(attribution);
  for (const n of cabs) map.delete(Number(n));
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .filter(([, val]) => val)
    .map(([num, val]) => `Cab${num}:${val}`)
    .join(" | ");
}

// `clearEmptyFor` : cabines SOUS-TRAITÉES → une heure entrante VIDE efface
// réellement l'heure (au lieu de préserver l'existante). Les heures des
// sous-traitants ne sont pas suivies : l'utilisateur doit pouvoir les effacer.
export function mergeCabineTimes(existing: string, incoming: string, clearEmptyFor?: Set<number>): string {
  // Si le payload n'est pas au format multi-cabin, on passe tel quel
  if (!incoming.includes("Cab")) return incoming;

  const exMap = parseCabineMap(existing);

  // Parser étendu : capture AUSSI les slots vides "Cab3:" (valeur = "")
  // pour permettre la suppression explicite d'une cabine réinitialisée.
  // parseCabineMap exige [^|]+ donc il ignore les slots vides — on le refait ici.
  const inMap = new Map<number, string | null>(); // null = suppression explicite
  const reIn = /Cab(\d+)\s*:([^|]*)/g;
  let mIn: RegExpExecArray | null;
  while ((mIn = reIn.exec(incoming))) {
    const val = mIn[2].trim();
    inMap.set(parseInt(mIn[1], 10), val === "" ? null : val);
  }

  // Union : incoming prend le dessus sauf si Notion a une valeur avec date
  // et incoming n'en a pas (client en format ancien/dégradé).
  // Exception : valeur null = réinitialisation explicite → on supprime.
  // Fusionne un slot "date:heure" : la date entrante prime si présente, sinon on
  // garde l'existante ; l'heure entrante prime si présente, sinon on GARDE
  // l'heure existante (→ une entrée date-seule "2026-08-13:" ne détruit jamais
  // une heure réelle déjà enregistrée). Corrige la perte de date des cabines
  // SANS heure (sous-traitées).
  const splitSlot = (v: string): { date: string; time: string } => {
    const m = /^(\d{4}-\d{2}-\d{2}):?([\s\S]*)$/.exec(v || "");
    if (m) return { date: m[1], time: m[2].trim() };
    return { date: "", time: (v || "").trim() };
  };
  const mergeSlot = (exVal: string | undefined, inVal: string, forceClearTime: boolean): string => {
    const a = splitSlot(exVal || "");
    const b = splitSlot(inVal);
    const date = b.date || a.date;
    // Cabine sous-traitée : l'heure entrante fait AUTORITÉ (vide = effacée) ;
    // sinon on protège l'heure existante contre un client dégradé (date-seule).
    const time = forceClearTime ? b.time : (b.time || a.time);
    return date ? `${date}:${time}` : time;
  };

  const merged = new Map(exMap);
  inMap.forEach((inVal, cabNum) => {
    if (inVal === null) {
      // Suppression explicite (cabine réinitialisée) → retirer de Notion
      merged.delete(cabNum);
    } else {
      merged.set(cabNum, mergeSlot(exMap.get(cabNum), inVal, !!clearEmptyFor?.has(cabNum)));
    }
  });

  return [...merged.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([num, val]) => `Cab${num}:${val}`)
    .join(" | ");
}

// Efface les HEURES (garde la date/jour de montage) des cabines indiquées.
// Utilisé quand on assigne un monteur sous-traitance : ses heures ne sont pas
// suivies → on retire les heures auto-remplies éventuelles.
export function clearTimesForCabines(str: string, cabs: Set<number>): string {
  if (!str) return str;
  const out: { num: number; val: string }[] = [];
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) {
    const num = parseInt(m[1], 10);
    let val = m[2].trim();
    if (cabs.has(num)) {
      const dm = /^(\d{4}-\d{2}-\d{2})/.exec(val);
      val = dm ? `${dm[1]}:` : ""; // garde la date seule, sinon vide
    }
    if (val) out.push({ num, val });
  }
  return out.sort((a, b) => a.num - b.num).map((o) => `Cab${o.num}:${o.val}`).join(" | ");
}

// Cabines ayant une valeur NON VIDE dans un delta "Cab1:x | Cab2:y".
export function cabsWithValue(delta: string): Set<number> {
  const set = new Set<number>();
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(delta || ""))) { if (m[2].trim()) set.add(parseInt(m[1], 10)); }
  return set;
}

/** Les colonnes que la fusion peut réécrire. */
export const CHAMPS_PAR_LOT = [
  "heureArrivee", "heureDepart", "nomsCabines", "attributionCabines",
  "monteursSousTraitance", "etatMontage", "savRetouchesCabines", "commentairesSav",
  "causeSavCabines", "datesRdvSavCabines", "heureArriveeSav", "heureDepartSav",
  "collaborateursSavCabines", "datesSavClotureCabines", "interventionsSavCabines",
  "interventionsMontageCabines", "datesCmdPiecesSavCabines",
  "datesReceptionPiecesSavCabines", "dateSAVRecu",
] as const;

/** Faut-il relire la fiche et fusionner avant d'écrire ce corps ? */
export function besoinDeFusion(body: Record<string, any>): boolean {
  const hasClear = Array.isArray(body.clearAttributionCabs) && body.clearAttributionCabs.length > 0;
  return (
    body.heureArrivee !== undefined ||
    body.heureDepart !== undefined ||
    body.nomsCabines !== undefined ||
    body.attributionCabines !== undefined ||
    body.monteursSousTraitance !== undefined ||
    body.etatMontage !== undefined ||
    body.savRetouchesCabines !== undefined ||
    body.commentairesSav !== undefined ||
    body.causeSavCabines !== undefined ||
    body.datesRdvSavCabines !== undefined ||
    body.heureArriveeSav !== undefined ||
    body.heureDepartSav !== undefined ||
    body.collaborateursSavCabines !== undefined ||
    body.datesSavClotureCabines !== undefined ||
    body.interventionsSavCabines !== undefined ||
    body.interventionsMontageCabines !== undefined ||
    body.datesCmdPiecesSavCabines !== undefined ||
    body.datesReceptionPiecesSavCabines !== undefined ||
    body.dateSAVRecu !== undefined ||
    hasClear
  );
}

/**
 * Fusionne `body` (modifié SUR PLACE) avec la fiche `existing` : chaque
 * colonne par lot entrante devient la valeur complète qu'aura la fiche.
 */
export function fusionnerAvecExistant(existing: Record<string, any>, body: Record<string, any>): void {
  const hasClear = Array.isArray(body.clearAttributionCabs) && body.clearAttributionCabs.length > 0;
  // État sous-traitance résultant (existant + delta entrant) : sert à
  // traiter les heures des cabines sous-traitées comme « vidables ».
  const sousTraiteStr = (body.monteursSousTraitance !== undefined && String(body.monteursSousTraitance).includes("Cab"))
    ? mergeCabineSousTraitance(existing.monteursSousTraitance || "", String(body.monteursSousTraitance))
    : (existing.monteursSousTraitance || "");
  const sousTraiteSet = cabsWithValue(sousTraiteStr);
  // Cabines nouvellement assignées à un sous-traitant dans CE delta :
  // on efface leurs heures (auto-remplies) même si le payload n'envoie
  // pas heureArrivee/heureDepart (cas du seul changement de monteur).
  const newlySousTraite = (body.monteursSousTraitance !== undefined && String(body.monteursSousTraitance).includes("Cab"))
    ? cabsWithValue(String(body.monteursSousTraitance))
    : new Set<number>();

  if (body.heureArrivee !== undefined) {
    body.heureArrivee = mergeCabineTimes(existing.heureArrivee || "", body.heureArrivee, sousTraiteSet);
  } else if (newlySousTraite.size) {
    body.heureArrivee = clearTimesForCabines(existing.heureArrivee || "", newlySousTraite);
  }
  if (body.heureDepart !== undefined) {
    body.heureDepart = mergeCabineTimes(existing.heureDepart || "", body.heureDepart, sousTraiteSet);
  } else if (newlySousTraite.size) {
    body.heureDepart = clearTimesForCabines(existing.heureDepart || "", newlySousTraite);
  }
  if (body.nomsCabines !== undefined) {
    body.nomsCabines = mergeCabineNoms(existing.nomsCabines || "", body.nomsCabines, body.nomsCabinesForces);
  }
  if (body.attributionCabines !== undefined) {
    body.attributionCabines = mergeCabineAttribution(existing.attributionCabines || "", body.attributionCabines);
  }
  // Delta d'une seule cabine → merge sur l'existant Notion (multi-cabine).
  // En mono-cabine le client envoie une valeur libre sans "Cab" : on la
  // laisse telle quelle (le merge ne s'applique qu'au format multi).
  if (body.monteursSousTraitance !== undefined && String(body.monteursSousTraitance).includes("Cab")) {
    body.monteursSousTraitance = mergeCabineSousTraitance(existing.monteursSousTraitance || "", body.monteursSousTraitance);
  }
  // État du montage : même encodage/merge par cabine (delta d'une cabine).
  if (body.etatMontage !== undefined && String(body.etatMontage).includes("Cab")) {
    body.etatMontage = mergeCabineSousTraitance(existing.etatMontage || "", body.etatMontage);
  }
  // SAV / Retouches par cabine : même encodage/merge (valeur multi-ligne OK,
  // le merge utilise [^|]* qui tolère les sauts de ligne).
  if (body.savRetouchesCabines !== undefined && String(body.savRetouchesCabines).includes("Cab")) {
    body.savRetouchesCabines = mergeCabineSousTraitance(existing.savRetouchesCabines || "", body.savRetouchesCabines);
  }
  if (body.commentairesSav !== undefined && String(body.commentairesSav).includes("Cab")) {
    body.commentairesSav = mergeCabineSousTraitance(existing.commentairesSav || "", body.commentairesSav);
  }
  if (body.causeSavCabines !== undefined && String(body.causeSavCabines).includes("Cab")) {
    body.causeSavCabines = mergeCabineSousTraitance(existing.causeSavCabines || "", body.causeSavCabines);
  }
  if (body.datesRdvSavCabines !== undefined && String(body.datesRdvSavCabines).includes("Cab")) {
    body.datesRdvSavCabines = mergeCabineSousTraitance(existing.datesRdvSavCabines || "", body.datesRdvSavCabines);
  }
  // Heures SAV par cabine (multi-cabine) : merge « CabN:HH:MM » pour ne pas
  // écraser les autres cabines. Mono (valeur simple « HH:MM » sans « Cab »)
  // et multi-jours (format daté sans « Cab ») → écriture directe.
  if (body.heureArriveeSav !== undefined && String(body.heureArriveeSav).includes("Cab")) {
    body.heureArriveeSav = mergeCabineSousTraitance(existing.heureArriveeSav || "", body.heureArriveeSav);
  }
  if (body.heureDepartSav !== undefined && String(body.heureDepartSav).includes("Cab")) {
    body.heureDepartSav = mergeCabineSousTraitance(existing.heureDepartSav || "", body.heureDepartSav);
  }
  if (body.collaborateursSavCabines !== undefined && String(body.collaborateursSavCabines).includes("Cab")) {
    body.collaborateursSavCabines = mergeCabineSousTraitance(existing.collaborateursSavCabines || "", body.collaborateursSavCabines);
  }
  if (body.dateSAVRecu !== undefined && String(body.dateSAVRecu).includes("Cab")) {
    body.dateSAVRecu = mergeCabineSousTraitance(existing.dateSAVRecu || "", body.dateSAVRecu);
  }
  if (body.datesSavClotureCabines !== undefined && String(body.datesSavClotureCabines).includes("Cab")) {
    body.datesSavClotureCabines = mergeCabineSousTraitance(existing.datesSavClotureCabines || "", body.datesSavClotureCabines);
  }
  if (body.interventionsSavCabines !== undefined && String(body.interventionsSavCabines).includes("Cab")) {
    body.interventionsSavCabines = mergeCabineSousTraitance(existing.interventionsSavCabines || "", body.interventionsSavCabines);
  }
  if (body.interventionsMontageCabines !== undefined && String(body.interventionsMontageCabines).includes("Cab")) {
    body.interventionsMontageCabines = mergeCabineSousTraitance(existing.interventionsMontageCabines || "", body.interventionsMontageCabines);
  }
  if (body.datesCmdPiecesSavCabines !== undefined && String(body.datesCmdPiecesSavCabines).includes("Cab")) {
    body.datesCmdPiecesSavCabines = mergeCabineSousTraitance(existing.datesCmdPiecesSavCabines || "", body.datesCmdPiecesSavCabines);
  }
  if (body.datesReceptionPiecesSavCabines !== undefined && String(body.datesReceptionPiecesSavCabines).includes("Cab")) {
    body.datesReceptionPiecesSavCabines = mergeCabineSousTraitance(existing.datesReceptionPiecesSavCabines || "", body.datesReceptionPiecesSavCabines);
  }
  // Suppression EXPLICITE de monteurs (action « réinitialiser la cabine »).
  // Appliquée APRÈS le merge, sur l'attribution déjà fusionnée (ou l'existant).
  if (hasClear) {
    const base = body.attributionCabines !== undefined
      ? body.attributionCabines
      : (existing.attributionCabines || "");
    body.attributionCabines = clearCabinesFromAttribution(base, body.clearAttributionCabs);
  }
}
