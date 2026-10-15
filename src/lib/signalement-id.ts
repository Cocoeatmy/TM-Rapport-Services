/**
 * L'identifiant d'un signalement, fabriqué sur le téléphone.
 *
 * Il l'était côté serveur, à chaque requête reçue. Une requête lente coupée
 * au bout de quelques secondes repartait dans la file, revenait, et le
 * serveur — n'ayant aucun moyen de reconnaître la même demande — créait un
 * second signalement. Puis un troisième. C'est ce qu'a vu Micael le
 * 16 octobre 2026 : trois exemplaires du même constat sur chaque douche.
 *
 * En le fabriquant ici, une fois, le même identifiant accompagne toutes les
 * tentatives : le serveur reconnaît la demande et répond sans rien ajouter.
 */
export function identifiantSignalement(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* Contexte non sécurisé : on retombe sur l'horodatage, suffisant pour
       distinguer deux signalements créés par le même téléphone. */
  }
  return `sig-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
