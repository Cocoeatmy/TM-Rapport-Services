/**
 * Qui a travaillé sur un passage, sans attendre qu'on le coche.
 *
 * Le problème, tel qu'il se produit sur le chantier : la première photo du
 * matin crée l'intervention, et celle-ci ne retenait que la personne qui
 * avait envoyé la photo. Partis à deux, les monteurs voyaient donc un seul
 * nom coché — et à sept heures du matin, personne ne pense à cocher le nom du
 * collègue. Le relevé des heures perdait la moitié des heures travaillées, et
 * ça ne se voyait qu'au moment de facturer.
 *
 * Or l'information existe déjà : Notion sait qui a rendez-vous, dans
 * « Collaborateurs montages ». C'est l'équipe PRÉVUE, et elle est juste dans
 * la quasi-totalité des cas. On s'en sert donc comme point de départ, en y
 * ajoutant la personne qui est réellement là si elle n'était pas annoncée —
 * un remplacement de dernière minute ne doit pas la faire disparaître.
 *
 * Ce choix ne vaut QU'À LA CRÉATION d'un passage. Une fois le passage posé,
 * décocher quelqu'un est un geste délibéré — un collègue absent, un départ
 * anticipé — et rien ne vient le défaire.
 */

/** Les noms d'une liste « A & B », propres et sans doublon. */
export function listeDeNoms(brut: string | null | undefined): string[] {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const n of String(brut || "").split("&")) {
    const nom = n.trim();
    if (!nom) continue;
    const cle = nom.toLowerCase();
    if (vus.has(cle)) continue;
    vus.add(cle);
    out.push(nom);
  }
  return out;
}

/**
 * L'équipe d'un passage qui commence.
 *
 * `prevus` : le champ Notion « Collaborateurs montages ».
 * `present` : la personne connectée qui déclenche le passage (photo, saisie).
 *
 * L'ordre de Notion est conservé — c'est celui que l'écran affiche partout
 * ailleurs — et la personne présente est ajoutée à la fin si elle manquait.
 */
export function equipeDuJour(
  prevus: string | null | undefined,
  present?: string | null,
): string {
  const noms = listeDeNoms(prevus);
  const moi = String(present || "").trim();
  if (moi && !noms.some((n) => n.toLowerCase() === moi.toLowerCase())) noms.push(moi);
  return noms.join(" & ");
}

/**
 * Les noms à proposer sur une ligne donnée.
 *
 * La liste des monteurs du jour, plus ceux qui figurent DÉJÀ sur cette ligne
 * et n'en font plus partie. Sans ce complément, le nom d'un collègue parti
 * disparaîtrait de l'écran tout en restant enregistré : on croirait la ligne
 * vide, on la « corrigerait », et le relevé d'un montage qu'il a réellement
 * fait serait faussé.
 */
export function nomsAProposer(
  actifs: readonly string[],
  valeurActuelle: string | null | undefined,
): string[] {
  const out = [...actifs];
  const vus = new Set(out.map((n) => n.toLowerCase()));
  for (const n of listeDeNoms(valeurActuelle)) {
    if (vus.has(n.toLowerCase())) continue;
    vus.add(n.toLowerCase());
    out.push(n);
  }
  return out;
}

/**
 * L'équipe d'un LOT, déduite de ses passages.
 *
 * Le lot avait son propre choix de monteurs, juste au-dessus de la liste des
 * passages, qui redemandait exactement les mêmes noms. Un lot fait en une
 * seule visite obligeait donc à cocher deux fois la même équipe, et les deux
 * endroits finissaient par se contredire — c'est le second, le passage, qui
 * dit la vérité, puisqu'il porte aussi la date et les heures.
 *
 * On garde tous ceux qui sont venus, dans l'ordre où ils apparaissent : un
 * renfort arrivé au second passage fait partie de l'équipe du lot.
 */
export function equipeDesPassages(
  passages: readonly { collaborateurs?: string | null }[],
): string {
  const vus = new Set<string>();
  const out: string[] = [];
  for (const p of passages || []) {
    for (const n of listeDeNoms(p?.collaborateurs)) {
      const cle = n.toLowerCase();
      if (vus.has(cle)) continue;
      vus.add(cle);
      out.push(n);
    }
  }
  return out.join(" & ");
}
