/**
 * Un envoi à la fois, par champ.
 *
 * Deux enregistrements partis à un cheveu d'intervalle s'en vont vers deux
 * serveurs différents, et rien ne garantit l'ordre dans lequel Notion les
 * applique. En tapant « SDB » dans le nom d'un lot, trois enregistrements
 * partaient — « S », « SD », « SDB » — et il suffisait que « SD » arrive en
 * dernier pour que la dernière lettre disparaisse quelques secondes plus tard,
 * au rafraîchissement de la page.
 *
 * Les envois d'un même champ se suivent donc au lieu de se doubler : le
 * dernier parti est le dernier écrit, quelle que soit la lenteur du premier.
 * Un envoi raté ne bloque pas la file — le suivant part quand même.
 */
export type EnvoiEnSerie = (cle: string, envoi: () => Promise<unknown>) => Promise<unknown>;

export function fileDEnvoi(): EnvoiEnSerie {
  const chaines = new Map<string, Promise<unknown>>();
  return (cle, envoi) => {
    const precedent = chaines.get(cle) ?? Promise.resolve();
    const suivant = precedent.catch(() => undefined).then(envoi);
    chaines.set(cle, suivant);
    suivant.catch(() => undefined).then(() => {
      if (chaines.get(cle) === suivant) chaines.delete(cle);
    });
    return suivant;
  };
}
