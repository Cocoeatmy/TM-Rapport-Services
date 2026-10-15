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
