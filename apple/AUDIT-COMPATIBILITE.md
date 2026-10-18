# Audit de compatibilité Web / iPhone / iPad / Mac

18 octobre 2026. Branche `apple/conversion`.

## Méthode

Les trois apps Apple affichent le site lui-même, dans le moteur WebKit, celui de Safari.
La logique métier est donc la même partout : projets, Notion, rapports, droits.
Ce qui peut différer, ce sont les fonctions du navigateur que le site utilise.
L'audit a donc porté sur deux plans :

1. **La logique du site**, vérifiée par ses tests automatiques. Les tests de
   bout en bout tournent dans WebKit, au gabarit d'un iPhone.
2. **Chaque fonction du navigateur** utilisée par le site, éprouvée dans la
   vraie vue web de l'app. Un banc d'essai local est piloté par des tests
   d'interface sur les simulateurs iPhone et iPad, et par des scripts sur Mac.

Inventaire automatique du site : 26 pages, 128 routes d'API, 73 composants.
Le site utilise une quarantaine de fonctions du navigateur, dont une vingtaine
peuvent se comporter différemment dans une app.

## Légende

- **VALIDÉE** : testée avec succès.
- **CORRIGÉE** : problème trouvé, corrigé, puis retesté avec succès.
- **NON VÉRIFIÉE** : aucun test concluant possible ici.
- **INCOMPATIBLE** : limitation ou dysfonctionnement restant.

Abréviations de la colonne « Preuve » :
- **E2E-WK** : test de bout en bout du site, dans WebKit, au gabarit iPhone.
- **SIM** : test d'interface dans la vraie app, sur simulateur iPhone et iPad.
- **MAC** : script dans la vraie app Mac.
- **RÉEL** : constaté sur l'appareil réel.
- **UNIT** : tests unitaires du site.

## Matrice

| # | Fonctionnalité | iPhone | iPad | Mac | Preuve |
|---|---|---|---|---|---|
| 1 | Ouverture de l'app, site chargé | VALIDÉE | VALIDÉE | VALIDÉE | RÉEL sur les trois |
| 2 | Démarrage sans réseau | VALIDÉE | VALIDÉE | VALIDÉE | SIM, MAC |
| 3 | Connexion | VALIDÉE | VALIDÉE | VALIDÉE | RÉEL : page de connexion sur iPad, session sur iPhone et Mac |
| 4 | Session gardée après fermeture et mise à jour | VALIDÉE | NON VÉRIFIÉE | VALIDÉE | RÉEL iPhone et Mac ; l'iPad n'était pas encore connecté |
| 5 | Déconnexion | NON VÉRIFIÉE | NON VÉRIFIÉE | NON VÉRIFIÉE | Mécanisme web standard, non éprouvé dans l'app |
| 6 | Désactivation d'un compte | CORRIGÉE | CORRIGÉE | CORRIGÉE | UNIT (6 tests) ; côté serveur, identique partout |
| 7 | Thème Signal, affichage | VALIDÉE | VALIDÉE | VALIDÉE | RÉEL et captures ; E2E-WK garde-fous d'affichage |
| 8 | Tableau de bord, listes, onglets | VALIDÉE | VALIDÉE | VALIDÉE | RÉEL ; E2E-WK |
| 9 | Recherche, filtres | VALIDÉE | VALIDÉE | VALIDÉE | UNIT (recherche multi-mots, accents) ; même moteur |
| 10 | Fiche projet, propriétés Notion | VALIDÉE | VALIDÉE | VALIDÉE | E2E-WK ; UNIT ; côté serveur, identique |
| 11 | Création, modification de projet | VALIDÉE | VALIDÉE | VALIDÉE | UNIT et routes ; écriture via la file des saisies (E2E-WK) |
| 12 | Calendrier, planning, rendez-vous | VALIDÉE | VALIDÉE | VALIDÉE | UNIT ; glisser-déposer réservé à la souris (Mac), comme sur le web |
| 13 | Rapport de montage : texte | CORRIGÉE | CORRIGÉE | CORRIGÉE | E2E-WK : une correction pouvait être écrasée par l'ancienne version |
| 14 | Photos obligatoires | CORRIGÉE | CORRIGÉE | CORRIGÉE | E2E-WK : synchronisation figée et photo vide dans WebKit, corrigées |
| 15 | Choix d'une photo dans la photothèque | VALIDÉE | VALIDÉE | NON VÉRIFIÉE | SIM ; sur Mac, panneau d'ouverture de fichiers non piloté |
| 16 | Appareil photo, prise de vue | NON VÉRIFIÉE | NON VÉRIFIÉE | NON VÉRIFIÉE | Pas de caméra sur simulateur : appareil réel requis |
| 17 | Signature client | VALIDÉE | VALIDÉE | VALIDÉE | E2E-WK (pavé, hors ligne, une seule écriture) ; même moteur |
| 18 | Signalement de défaut sans photo | VALIDÉE | VALIDÉE | VALIDÉE | E2E-WK : créé une fois même si la réponse se perd |
| 19 | Signalement de défaut avec photo, hors ligne | CORRIGÉE | CORRIGÉE | CORRIGÉE | E2E-WK : était impossible hors ligne, passe maintenant par la file |
| 20 | Pièces, cartons, livraisons (photos) | VALIDÉE | VALIDÉE | VALIDÉE | Même champ fichier que les photos ; SIM photothèque |
| 21 | QR code (caméra) | NON VÉRIFIÉE | NON VÉRIFIÉE | NON VÉRIFIÉE | L'accès caméra est accordé par l'app ; lecture réelle à tester sur appareil |
| 22 | Dictée vocale (micro, enregistreur) | VALIDÉE | VALIDÉE | NON VÉRIFIÉE | SIM : micro et enregistrement fonctionnent |
| 23 | PDF ouverts par le site (planning, documents) | VALIDÉE | VALIDÉE | VALIDÉE | SIM : feuille avec Fermer et Partager ; MAC : vraie fenêtre |
| 24 | PDF fabriqués par la page (statistiques, heures) | CORRIGÉE | CORRIGÉE | CORRIGÉE | SIM et MAC : n'ouvraient rien ; s'ouvrent dans l'app |
| 25 | Exports téléchargés | CORRIGÉE | CORRIGÉE | CORRIGÉE | SIM : remplaçaient l'app ; feuille de partage. MAC : Téléchargements |
| 26 | Liens documents /f, /s, /sav, /sig | CORRIGÉE | CORRIGÉE | CORRIGÉE | Le PDF remplaçait le chantier ; l'app se déclare fenêtre autonome (SIM) |
| 27 | Partage (feuille de partage iOS) | VALIDÉE | VALIDÉE | sans objet | SIM |
| 28 | Boîtes de dialogue alert, confirm, prompt | VALIDÉE | VALIDÉE | NON VÉRIFIÉE | SIM ; Mac : même code (NSAlert), automatisation refusée par macOS |
| 29 | Fenêtres ouvertes par le site | VALIDÉE | VALIDÉE | VALIDÉE | SIM : feuille ; MAC : fenêtre indépendante |
| 30 | Fenêtre envoyée vers un site extérieur | CORRIGÉE | CORRIGÉE | CORRIGÉE | SIM : une fenêtre vide restait ouverte |
| 31 | Liens extérieurs (Maps, Waze, WhatsApp) | VALIDÉE | VALIDÉE | VALIDÉE | SIM : Safari s'ouvre, la page reste |
| 32 | Appeler, écrire (tel:, mailto:) | VALIDÉE | VALIDÉE | VALIDÉE | SIM : la page reste ; ouverture réelle à confirmer sur appareil |
| 33 | Presse-papiers | VALIDÉE | VALIDÉE | NON VÉRIFIÉE | SIM |
| 34 | Géolocalisation (météo, tournée) | VALIDÉE | VALIDÉE | NON VÉRIFIÉE | SIM ; Mac : autorisation présente, non pilotée |
| 35 | Écran maintenu allumé pendant l'envoi | VALIDÉE | VALIDÉE | VALIDÉE | SIM : API présente dans la vue web |
| 36 | Travail hors ligne, journée complète | CORRIGÉE | CORRIGÉE | CORRIGÉE | E2E-WK scénario 60 (voir plus bas) |
| 37 | Synchronisation après coupure et interruptions | CORRIGÉE | CORRIGÉE | CORRIGÉE | E2E-WK : 503, rechargement, réponse perdue |
| 38 | Aucun envoi en double | VALIDÉE | VALIDÉE | VALIDÉE | E2E-WK ; serveur : doublon de photo écarté par URL et nom |
| 39 | Conservation hors de WebKit (coffre natif) | VALIDÉE | VALIDÉE | VALIDÉE | SIM et MAC : stockage effacé, photo et heures restaurées octet pour octet |
| 40 | Fermeture forcée, redémarrage de l'app | VALIDÉE | VALIDÉE | VALIDÉE | SIM : coffre gardé à travers une fermeture complète |
| 41 | Envoi au départ en arrière-plan et au retour | VALIDÉE | VALIDÉE | sans objet | SIM |
| 42 | Réveil par iOS pour envoyer | NON VÉRIFIÉE | NON VÉRIFIÉE | sans objet | Refusé par le simulateur ; appareil réel requis |
| 43 | Envoi avant de quitter (Mac) | sans objet | sans objet | VALIDÉE | MAC : synchronisation « quitter » au journal |
| 44 | Mises à jour du site sans réinstaller | VALIDÉE | VALIDÉE | VALIDÉE | SIM : rechargement seul, à l'ouverture et app ouverte |
| 45 | Contrôle de compatibilité site / app | VALIDÉE | VALIDÉE | VALIDÉE | SIM et MAC : bandeau si l'app est trop ancienne |
| 46 | Mise à jour de l'app sans perte | VALIDÉE | NON VÉRIFIÉE | VALIDÉE | RÉEL : session et données gardées après réinstallation |
| 47 | Administration, droits, permissions | VALIDÉE | VALIDÉE | VALIDÉE | UNIT ; contrôlés par le serveur, identiques partout |
| 48 | Notifications dans l'app (cloche) | VALIDÉE | VALIDÉE | VALIDÉE | Lecture par le serveur, même code |
| 49 | Notifications push | INCOMPATIBLE | INCOMPATIBLE | INCOMPATIBLE | La vue web d'une app n'a pas de push web ; le site ne l'utilise d'ailleurs pas |
| 50 | Avertissement en quittant la page Droits avec des modifications | sans objet | sans objet | INCOMPATIBLE | Une vue web d'app n'affiche pas cet avertissement, comme Safari sur iPhone |

**Décompte, sur 50 fonctionnalités :**

| Statut | iPhone | iPad | Mac |
|---|---|---|---|
| VALIDÉE | 33 | 31 | 27 |
| CORRIGÉE | 10 | 10 | 10 |
| NON VÉRIFIÉE | 4 | 6 | 8 |
| INCOMPATIBLE | 1 | 1 | 2 |
| Sans objet | 2 | 2 | 3 |

## Le scénario « journée hors ligne » (e2e/60)

Il tourne dans WebKit, au gabarit d'un iPhone, avec le site compilé. Seuls
Notion, Cloudinary et Redis sont simulés, avec des données fictives.

1. Le matin, avec réseau, le monteur ouvre deux chantiers.
2. Sur le chantier A, sans réseau :
   - 7 photos obligatoires, le texte du rapport, un défaut avec photo, la signature ;
   - le rapport est finalisé.
3. Sur le chantier B, sans réseau : une photo et une signature.
4. Le réseau revient mal : 3 refus du serveur, un envoi coupé par un
   rechargement de l'app, et une réponse perdue.
5. Résultat :
   - chaque photo est rattachée une seule fois, au bon champ, avec des octets identiques ;
   - chaque signature est écrite une fois ;
   - le rapport est dans sa dernière version ;
   - le défaut est créé une fois, avec sa photo ;
   - le rapport est envoyé une fois ;
   - les files sont vides et rien n'est abandonné.

Ce scénario a révélé quatre défauts du site. Ils touchaient aussi l'app web
installée sur iPhone, et ils sont corrigés :

1. **Synchronisation figée.** Dans WebKit, la file se bloquait après le
   premier envoi, et plus rien ne partait avant un rechargement.
2. **Photo envoyée vide.** Une photo pouvait partir avec zéro octet après une réécriture de la file.
3. **Texte écrasé.** Une correction du rapport pouvait être écrasée par l'ancienne version.
4. **Défaut avec photo impossible hors ligne.** Il passe maintenant par la file des photos.

## Tests automatiques au 18 octobre 2026

| Suite | Résultat |
|---|---|
| Tests unitaires du site | 1 311 réussis |
| Tests de bout en bout du site, dont 4 de la journée hors ligne | 47 réussis, 6 ignorés, 0 échec |
| Journée hors ligne, rejouée dans Chromium | 4 réussis |
| Tests natifs du coffre | 10 réussis, sur Mac, iPhone et iPad |
| Tests d'interface de l'app | 15 réussis sur iPhone et sur iPad |

## Ce qui exige un appareil réel

- **Appareil photo :** prise de vue, puis photo enregistrée dans le rapport.
- **QR code :** lecture réelle d'un code de cabine.
- **Réveil en arrière-plan :** une photo laissée en attente doit partir après fermeture de l'app.
- **Appels et e-mails :** ouverture réelle de Téléphone et de Mail.
- **Mac :** confirmation d'une suppression, choix d'un fichier, position.

## Protection des données pendant l'audit

- Aucune donnée réelle n'a été lue ni écrite : serveur local, clés factices, compte fictif.
- Aucun déploiement en production : tout est sur la branche `apple/conversion`.
- Les apps installées ont été mises à jour, jamais désinstallées : session et données conservées.
- Le seul fichier créé hors du projet, un export d'essai dans Téléchargements, a été retiré après vérification.
