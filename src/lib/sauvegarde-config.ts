/**
 * L'état de la configuration des sauvegardes — sans jamais dire les secrets.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────
 *
 * Une variable d'environnement de type « Secret » ne se relit pas : Vercel
 * n'en rend qu'un marqueur. On ne peut donc pas vérifier depuis l'extérieur
 * qu'elle est bien arrivée. La seule réponse honnête vient de
 * l'application elle-même : c'est elle qui la lit, ou ne la lit pas.
 *
 * Ce diagnostic ne rend que des OUI/NON et des longueurs. Jamais une
 * valeur, jamais un fragment, jamais un début. Un diagnostic qui laisse
 * filtrer ce qu'il diagnostique ne vaut rien.
 *
 * Il sert aussi après coup : le jour où la copie hebdomadaire n'arrive
 * plus, cette page dit en trois secondes si c'est la configuration qui a
 * bougé.
 */
import { gmailEnabled } from "./email";

export interface EtatConfiguration {
  /** Tout est en place pour que la copie hebdomadaire parte. */
  prete: boolean;
  destinataireDefini: boolean;
  /** Le domaine seul, pour reconnaître l'adresse sans la publier. */
  destinataireDomaine: string | null;
  phraseDefinie: boolean;
  phraseAssezLongue: boolean;
  /** Une indication de robustesse, pas la phrase. */
  phraseLongueur: number;
  secretTacheDefini: boolean;
  courrielConfigure: boolean;
  /** Ce qui manque, en clair, pour qu'on sache quoi faire. */
  manques: string[];
}

export function etatConfiguration(): EtatConfiguration {
  const destinataire = (process.env.BACKUP_EMAIL || "").trim();
  const passe = process.env.BACKUP_PASSPHRASE || "";
  const secret = process.env.CRON_SECRET || "";

  const destinataireDefini = destinataire.length > 0;
  const phraseDefinie = passe.length > 0;
  const phraseAssezLongue = passe.length >= 12;
  const secretTacheDefini = secret.length > 0;
  const courrielConfigure = gmailEnabled;

  const manques: string[] = [];
  if (!destinataireDefini) manques.push("BACKUP_EMAIL n'est pas défini : aucune copie n'est expédiée.");
  if (!phraseDefinie) manques.push("BACKUP_PASSPHRASE n'est pas définie : l'archive ne partira pas en clair, donc elle ne partira pas.");
  else if (!phraseAssezLongue) manques.push(`BACKUP_PASSPHRASE fait ${passe.length} caractères : il en faut 12 au minimum.`);
  if (!secretTacheDefini) manques.push("CRON_SECRET n'est pas défini : la tâche hebdomadaire refuse de s'exécuter.");
  if (!courrielConfigure) manques.push("GMAIL_USER / GMAIL_APP_PASSWORD manquent : l'envoi passerait par Resend, qui n'écrit qu'à l'adresse du compte.");

  return {
    prete: manques.length === 0,
    destinataireDefini,
    /* Le domaine suffit à reconnaître « c'est bien ma boîte » sans écrire
       l'adresse dans une réponse d'API qui pourrait être journalisée. */
    destinataireDomaine: destinataireDefini ? destinataire.split("@")[1] || null : null,
    phraseDefinie,
    phraseAssezLongue,
    phraseLongueur: passe.length,
    secretTacheDefini,
    courrielConfigure,
    manques,
  };
}
