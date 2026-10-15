/**
 * Combien de CABINES un SAV concerne — et non combien en compte le chantier.
 *
 * La liste « RDV SAV à fixer » affichait le nombre total de cabines du
 * projet : 75 en face de Gétaz Miauton, alors que trois douches au plus
 * attendaient une intervention. À lire la liste, on croyait à une semaine de
 * travail là où il y avait une matinée.
 *
 * Un SAV se signale toujours sur UNE cabine : tout est encodé par lot
 * (« Cab12:… »). On sait donc compter juste. Une même cabine peut porter
 * plusieurs défauts — ce qui compte ici, c'est le nombre de cabines, pas le
 * nombre de signalements ; le détail par défaut reste dans la fiche.
 *
 * Quatre états, exclusifs, pour une cabine :
 *
 *   réglé        le SAV est clôturé (une date de clôture existe) ;
 *   attente      une pièce est commandée et pas encore reçue — fixer un
 *                rendez-vous ferait revenir l'équipe sans la pièce ;
 *   planifié     une intervention est datée, et rien n'est arrivé depuis
 *                qui obligerait à repasser ;
 *   à fixer      tout le reste : il faut appeler.
 *
 * Et un cas qu'on ne peut pas trancher : les SAV de l'ANCIENNE base, suivis
 * au niveau du projet (colonne « État - SAV »), sans la moindre mention de
 * lot. Pour ceux-là on ne devine pas — `detaille` vaut faux et l'écran dit
 * « à vérifier » plutôt que d'avancer un chiffre faux.
 */

export interface SourceSavCabines {
  nbCabines?: number | null;
  commentairesSav?: string | null;
  causeSavCabines?: string | null;
  datesRdvSavCabines?: string | null;
  collaborateursSavCabines?: string | null;
  savRetouchesCabines?: string | null;
  interventionsSavCabines?: string | null;
  datesCmdPiecesSavCabines?: string | null;
  datesReceptionPiecesSavCabines?: string | null;
  datesSavClotureCabines?: string | null;
  documentsSavDemande?: { name?: string }[] | null;
  photosSavRetouches?: { name?: string }[] | null;
}

export interface ComptesSav {
  /** Cabines concernées par un SAV, tous états confondus. */
  concernees: number;
  aFixer: number;
  planifies: number;
  enAttentePiece: number;
  regles: number;
  /** Faux = SAV suivi au niveau du projet, sans détail par lot. */
  detaille: boolean;
}

/** Décode une colonne « Cab1:valeur | Cab2:valeur ». */
export function parseCabMap(raw?: string | null): Record<number, string> {
  const m: Record<number, string> = {};
  const re = /Cab(\d+)\s*:([^|]*)/g;
  let x: RegExpExecArray | null;
  while ((x = re.exec(raw || ""))) {
    const v = x[2].trim();
    if (v) m[parseInt(x[1], 10)] = v;
  }
  return m;
}

/** Les lots sur lesquels un SAV a laissé une trace, quelle qu'elle soit. */
export function cabinesAvecSav(p: SourceSavCabines): Set<number> {
  const cabs = new Set<number>();
  const colonnes = [
    p.commentairesSav, p.causeSavCabines, p.datesRdvSavCabines,
    p.collaborateursSavCabines, p.savRetouchesCabines, p.interventionsSavCabines,
    p.datesCmdPiecesSavCabines, p.datesReceptionPiecesSavCabines,
    p.datesSavClotureCabines,
  ];
  for (const raw of colonnes) {
    Object.keys(parseCabMap(raw)).forEach((k) => cabs.add(parseInt(k, 10)));
  }
  for (const f of [...(p.documentsSavDemande || []), ...(p.photosSavRetouches || [])]) {
    const mm = /\.Cab(\d+)\./.exec(f?.name || "");
    if (mm) cabs.add(parseInt(mm[1], 10));
  }
  return cabs;
}

/**
 * L'état d'un SAV, cabine par cabine.
 *
 * Une cabine ne passe dans « réglés » que lorsque son SAV est clôturé : tant
 * qu'il reste quoi que ce soit d'ouvert, elle compte parmi les cabines à
 * traiter.
 */
export function comptesSavParCabine(p: SourceSavCabines): ComptesSav {
  const cabs = cabinesAvecSav(p);
  if (cabs.size === 0) {
    return { concernees: 0, aFixer: 0, planifies: 0, enAttentePiece: 0, regles: 0, detaille: false };
  }
  const rdv = parseCabMap(p.datesRdvSavCabines);
  const cloture = parseCabMap(p.datesSavClotureCabines);
  const piecesCmd = parseCabMap(p.datesCmdPiecesSavCabines);
  const piecesRecues = parseCabMap(p.datesReceptionPiecesSavCabines);

  let aFixer = 0, planifies = 0, enAttentePiece = 0, regles = 0;
  for (const n of cabs) {
    if ((cloture[n] || "").trim()) { regles++; continue; }
    const cmd = (piecesCmd[n] || "").slice(0, 10);
    const recu = (piecesRecues[n] || "").slice(0, 10);
    if (cmd && !recu) { enAttentePiece++; continue; }
    const date = (rdv[n] || "").slice(0, 10);
    if (!date) { aFixer++; continue; }
    /* Pièce arrivée APRÈS le dernier passage : il faut repasser, donc il
       reste un rendez-vous à caler. Le jour même compte comme après. */
    if (recu && recu >= date) { aFixer++; continue; }
    planifies++;
  }
  return { concernees: cabs.size, aFixer, planifies, enAttentePiece, regles, detaille: true };
}

/* ────────────────────────────────────────────────────────────────────────
   LE SAV AU NIVEAU DU PROJET

   Au-dessus du compte par cabine, une question plus simple : ce dossier
   demande-t-il encore qu'on décroche le téléphone ?

   Deux bases y répondent et il faut lire les deux.

   • L'ANCIENNE : une colonne « État - SAV » sur le projet, sans mention de
     lot. Elle dit où en est le contact avec le client.
   • LA NOUVELLE : le détail par cabine, celui que compte
     `comptesSavParCabine`.

   Un dossier qui demande un rendez-vous selon L'UNE des deux en demande un.
   On n'additionne pas, on ne tranche pas : on retient la plus alarmante.
   C'est le sens de la règle donnée pour cette correction — mieux vaut un
   dossier affiché avec un avertissement qu'un dossier disparu en silence.
   ──────────────────────────────────────────────────────────────────────── */

/** Casse, accents et espaces n'ont jamais eu à décider de rien. */
function normEtat(s?: string | null): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
}

/** États de l'ancienne base qui réclament encore la prise d'un rendez-vous. */
export const ETATS_SAV_A_FIXER = [
  "A contacter",
  "Contact sans réponse",
  "Attente news",
  "En cours de traitement",
];

/** États de l'ancienne base où le rendez-vous est déjà calé. */
export const ETATS_SAV_PLANIFIE = ["RDV fixé"];

/** États de l'ancienne base qui closent le dossier. */
export const ETATS_SAV_CLOS = ["Terminé", "Annulé", "Rapport clôturé", "Aucun SAV"];

const A_FIXER_NORM = new Set(ETATS_SAV_A_FIXER.map(normEtat));
const PLANIFIE_NORM = new Set(ETATS_SAV_PLANIFIE.map(normEtat));
const CLOS_NORM = new Set(ETATS_SAV_CLOS.map(normEtat));

export interface SourceSavProjet extends SourceSavCabines {
  id: string;
  etatSAV?: string | null;
}

export interface EtatSavProjet {
  /** Un SAV est en cours — quel que soit son stade. */
  ouvert: boolean;
  /** Il reste une intervention à caler. */
  necessiteRdv: boolean;
  /** Pourquoi, en une phrase affichable telle quelle. */
  raison: string;
  comptes: ComptesSav;
}

/**
 * L'état SAV d'un projet, les deux bases lues ensemble.
 *
 * `necessiteRdv` est volontairement généreux : une cabine qui attend une
 * pièce y compte. On ne peut pas encore appeler le client, c'est entendu —
 * mais le dossier doit rester sous les yeux, et la raison est écrite à côté.
 * C'est exactement ce qui manquait : CANAsanitaire Lot 23, pièce commandée
 * le 15 octobre et jamais reçue, avait quitté la liste sans bruit.
 */
export function etatSavProjet(p: SourceSavProjet): EtatSavProjet {
  const comptes = comptesSavParCabine(p);
  const etat = normEtat(p.etatSAV);
  const ancienneAFixer = A_FIXER_NORM.has(etat);
  const anciennePlanifie = PLANIFIE_NORM.has(etat);
  /* Un état hors nomenclature — faute de frappe, valeur ajoutée dans Notion
     sans prévenir — n'est pas un état clos. On le traite comme ouvert et on
     le signale : c'est le seul moyen qu'il ne se perde pas. */
  const ancienneInconnue = !!etat && !ancienneAFixer && !anciennePlanifie && !CLOS_NORM.has(etat);

  const raisons: string[] = [];
  if (ancienneAFixer) raisons.push(`État SAV « ${(p.etatSAV || "").trim()} »`);
  if (ancienneInconnue) raisons.push(`État SAV inconnu « ${(p.etatSAV || "").trim()} »`);
  if (comptes.aFixer > 0) raisons.push(`${comptes.aFixer} cabine${comptes.aFixer > 1 ? "s" : ""} sans rendez-vous`);
  if (comptes.enAttentePiece > 0) raisons.push(`${comptes.enAttentePiece} cabine${comptes.enAttentePiece > 1 ? "s" : ""} en attente de pièce`);

  const necessiteRdv = ancienneAFixer || ancienneInconnue
    || comptes.aFixer > 0 || comptes.enAttentePiece > 0;

  const ouvert = necessiteRdv || anciennePlanifie || comptes.planifies > 0;
  if (!necessiteRdv && anciennePlanifie) raisons.push("Rendez-vous fixé");
  if (!necessiteRdv && comptes.planifies > 0) {
    raisons.push(`${comptes.planifies} cabine${comptes.planifies > 1 ? "s" : ""} planifiée${comptes.planifies > 1 ? "s" : ""}`);
  }

  return { ouvert, necessiteRdv, raison: raisons.join(" · "), comptes };
}

export interface AnomalieSav {
  projet: SourceSavProjet;
  raison: string;
}

/**
 * Le garde-fou : ce que les données réclament, face à ce que l'écran montre.
 *
 * La liste « RDV SAV à fixer » a perdu des dossiers plus d'une fois, et
 * toujours de la même manière — un filtre, un dédoublonnage, une règle
 * d'exclusion ajoutée pour une bonne raison, et le dossier sort sans que
 * personne ne s'en aperçoive. On ne peut pas prévenir la prochaine
 * trouvaille de ce genre ; on peut en revanche la rendre bruyante.
 *
 * On relit donc toutes les données brutes, on en déduit les dossiers qui
 * réclament un rendez-vous, et on vérifie qu'ils sont bien à l'écran. Ce
 * qui manque est nommé.
 */
export function controleCoherenceSav(
  tous: SourceSavProjet[],
  affiches: Iterable<string>,
): AnomalieSav[] {
  const vus = new Set(affiches);
  const manquants: AnomalieSav[] = [];
  const dejaCompte = new Set<string>();
  for (const p of tous) {
    if (!p?.id || dejaCompte.has(p.id)) continue;
    dejaCompte.add(p.id);
    if (vus.has(p.id)) continue;
    const e = etatSavProjet(p);
    if (e.necessiteRdv) manquants.push({ projet: p, raison: e.raison });
  }
  return manquants;
}
