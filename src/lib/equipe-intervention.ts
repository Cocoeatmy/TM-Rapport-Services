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
