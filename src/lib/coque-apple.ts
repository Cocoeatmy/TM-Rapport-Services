/**
 * Les applications Apple (iPhone, iPad, Mac) affichent ce site tel quel :
 * chaque déploiement Vercel leur parvient seul, sans recompilation.
 *
 * Seul un changement de leur partie NATIVE (appareil photo, fichiers,
 * notifications, envoi en arrière-plan…) exige d'installer une nouvelle
 * version. Le jour où le site en dépend, on relève ce nombre : les apps plus
 * anciennes affichent alors « Mise à jour de l'application nécessaire » au
 * lieu de mal fonctionner en silence.
 *
 * À comparer avec MARKETING_VERSION dans apple/TM Rapport.xcodeproj.
 */
export const COQUE_APPLE_MINIMUM = "1.0";
