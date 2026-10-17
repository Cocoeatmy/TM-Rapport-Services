# TM Rapport Services — corrections de l'audit du 17 octobre 2026

Branche : `fix/audit-complet-rapport-services`
Point de départ : `40d022f`
**Rien n'est déployé.** Aucune donnée de production n'a été modifiée.

---

## Inventaire de référence

Relevé en lecture seule le 17.10.2026 à 14 h 11, avant toute modification.
Il sert à vérifier, après coup, que rien n'a bougé.

| Donnée | Nombre |
|---|---:|
| Projets actifs | 235 |
| Projets (tous) | 1 649 |
| Défauts | 80 |
| Pièces manquantes | 25 |
| Cabines en stock | 7 |

---

## Tableau des corrections

| Anomalie | État | Correction | Tests |
|---|---|---|---|
| **A1** — sauvegarde destructrice | ✅ Testé | Garde-fou dans `setData`, vraie copie datée, relecture de vérification, restauration protégée | 15 |
| **A2** — signature hors ligne | ✅ Testé | Passe par la file persistante des photos, statut visible, alerte si impossible | — ¹ |
| **A3** — doublons de pièces | ✅ Testé | Verrou partagé, détection de rejeu, pierres tombales | 16 + 5 |
| **A4** — faux succès | ✅ Testé | `addToQueue` rend un booléen, 507 au lieu de 200, cache sacrifié avant la saisie | 12 |
| **A5** — contenu perdu | ✅ Testé | Le corps est conservé, bouton « Renvoyer », plus de suppression par ancienneté | inclus |
| **A6** — périmètre des projets | ✅ Testé | Filtre serveur sur 14 routes + fiche + recherche + écriture | 18 |
| **A7** — dépendances | ✅ Testé | 39 → 1 vulnérabilité, 2 critiques → 0 | build |
| **A8** — débordement photo | ✅ Testé | Sonde Redis, répartition extraite et vérifiée | 10 |
| **A9** — architecture | ⚠️ Partiel | 7 bibliothèques extraites ; les gros fichiers non découpés (voir plus bas) | — |
| **A10** — doublons existants | ⏸ Volontairement non fait | Les 8 lignes de TM-2600825 sont intactes, comme demandé | — |

¹ La signature n'a pas de test automatisé : elle vit dans un composant React
de 13 600 lignes, et aucun composant n'est testé dans ce dépôt. La file
qu'elle emprunte, elle, est la même que celle des photos.

---

## Détail

### A1 — la sauvegarde ne peut plus détruire

**Fichiers** : `src/lib/kv-store.ts`, `src/lib/sauvegarde.ts` (nouveau),
`src/app/api/cron/backup/route.ts`, `src/app/api/admin/sauvegardes/route.ts` (nouveau)

Trois barrières, là où il n'y en avait aucune :

1. **`setData` refuse** de remplacer une liste de deux éléments ou plus par une
   liste vide, sauf autorisation explicite. Un témoin de taille est tenu dans
   Redis, donc connu même d'une instance froide — celle d'une tâche nocturne.
2. **La tâche n'écrit plus jamais sur l'original.** Elle copie vers
   `sauvegarde-<clé>-<jour>`, sept emplacements en rotation hebdomadaire.
3. **La lecture lève** au lieu de rendre du vide (`getDataFresh`), et la copie
   est **relue** avant d'être déclarée bonne.

La restauration existe mais exige : le droit d'administration, une phrase de
confirmation à recopier, et un refus automatique si elle ferait perdre des
lignes. **Elle n'a pas été exécutée.**

### A2 — la signature part, ou le dit

**Fichiers** : `src/app/projet/[id]/page.tsx`, `src/lib/idb-uploads.ts`,
`src/lib/cloudinary-upload.ts`

La signature emprunte désormais la file IndexedDB des photos, étendue d'un
chemin « champ texte » pour écrire dans `signatureUrl`. Elle hérite donc de
tout ce que cette file sait faire : reprise après coupure, backoff, et
**aucune suppression locale avant confirmation**.

Sous le pavé de signature, une ligne dit l'état : *« Enregistrée sur
l'appareil — en attente d'envoi »* puis *« Signature enregistrée »*. Si la
mise en file échoue, un message de quinze secondes le dit sans détour.

### A3 — les pièces protégées comme les défauts

**Fichiers** : `src/app/api/pieces/route.ts`, `src/lib/verrou-liste.ts` (nouveau),
`src/app/api/defauts/route.ts`

Le verrou a quitté la route des défauts pour une bibliothèque partagée. Les
deux listes tiennent maintenant le **même** verrou (sous deux noms distincts),
la même détection de rejeu et les mêmes pierres tombales.

**Correction d'une affirmation de l'audit** : les pièces avaient déjà une
garde par identifiant client. Il manquait trois protections sur quatre, pas
quatre.

### A4 et A5 — la file ne ment plus, et n'oublie plus

**Fichiers** : `src/lib/offline.ts`, `src/components/offline-banner.tsx`

- `addToQueue` rend un booléen. Avant de renoncer, il **sacrifie le cache** des
  listes : elles se reconstruisent, pas la saisie d'un monteur.
- Si c'est vraiment impossible, `offlineFetch` renvoie **507** et une bannière
  rouge le dit sans ambiguïté.
- Les écritures abandonnées **gardent leur contenu** et leur projet, avec un
  bouton « Renvoyer ».
- Une écriture de plus de deux semaines est **mise de côté, non supprimée**.

### A6 — le périmètre appliqué

**Fichiers** : `src/lib/perimetre-projets.ts` et `perimetre-serveur.ts` (nouveaux),
14 routes de liste, `projects/[id]`, `projects/search`

**La règle, et pourquoi elle n'est pas littérale** : 216 des 235 chantiers en
cours n'ont aucun collaborateur attribué. « Uniquement les siens » au pied de
la lettre aurait montré six projets à Jacobo. La règle retenue cache les
chantiers **d'un collègue**, jamais ceux que personne n'a pris.

**Le piège évité** : les listes sont servies avec `s-maxage`, donc mises en
cache par le CDN pour tout le monde. Un compte restreint reçoit maintenant une
réponse `private, no-store`. Un compte non restreint — tous, aujourd'hui —
reçoit **exactement** la réponse d'avant, en-têtes compris : aucune perte de
performance.

### A7 — dépendances

| | Avant | Après |
|---|---:|---:|
| Critiques | 2 | **0** |
| Hautes | 27 | **1** |
| Total | 39 | **1** |

- `next` 16.2.2 → **16.4.2**
- `nodemailer` 7 → **10** (typage adapté dans `src/lib/email.ts`)
- `sharp` 0.34.5 → **0.35.5**
- `shadcn` déplacé en `devDependencies` — c'est un outil en ligne de commande,
  il n'a jamais tourné en production, et il tirait `express` → `proxy-addr`
  (critique)
- **`next-pwa` retiré** : il n'était pas utilisé — le service worker est écrit
  à la main — et tirait à lui seul douze vulnérabilités

**Reste `xlsx` (haute, aucun correctif publié).** Les deux failles — pollution
de prototype et ReDoS — se déclenchent à la **lecture** d'un classeur. Cette
application n'en lit aucun : `export-excel.tsx` ne fait qu'écrire
(`json_to_sheet`, `writeFile`). Risque non atteignable en l'état. À revoir si
un import de classeur est ajouté un jour.

### A8 — débordement photo

**Fichiers** : `src/lib/photo-overflow.ts`, `src/app/api/photos/attach/route.ts`

Le débordement n'était lu que lorsque le champ était plein. Un champ repassé
sous les cent fichiers gardait pourtant son débordement, qu'on effaçait à la
réécriture suivante. Une sonde Redis — sans lecture Notion — tranche le cas.

### A9 — architecture

**Fait** : sept bibliothèques extraites, chacune testable et testée —
`sauvegarde`, `verrou-liste`, `perimetre-projets`, `perimetre-serveur`,
`projets-cache`, `recherche-projets`, `photo-overflow` (répartition).

**Non fait, et c'est délibéré** : `projet/[id]/page.tsx` (13 600 lignes),
`monteur-dashboard.tsx` (9 900) et `page.tsx` (6 200) n'ont pas été découpés.
Ce découpage ne peut pas se faire sans tests de composants — il n'en existe
aucun — et le risque de régression silencieuse dépasse largement le bénéfice
dans le cadre de cette mission. C'est un chantier à part entière, à mener
écran par écran, en commençant par en couvrir un de tests.

### A10 — doublons existants

**Non touchés, comme demandé.** Les huit copies d'« aimant cassé » sur
TM-2600825 (14–15 octobre, toutes antérieures au correctif) sont intactes.

Procédure de nettoyage préparée, **non exécutée** : `doublonsAvere()` dans
`signalement-integrite.ts` regroupe les copies et désigne l'original (le plus
ancien). Il suffirait de supprimer les `rejeux` un par un via l'interface — le
verrou garantit désormais qu'ils ne reviendront pas.

---

## Tests

| | Avant | Après |
|---|---:|---:|
| Fichiers de test | 74 | **79** |
| Tests | 1 007 | **1 083** |
| Échecs | 0 | **0** |

**Nouveaux fichiers** : `sauvegarde.test.ts` (15), `pieces-integrite.test.ts`
(16), `offline-fiabilite.test.ts` (12), `perimetre-projets.test.ts` (18),
`photo-debordement.test.ts` (10). Plus 5 tests ajoutés à `defauts-verrou`.

**Correspondance avec les tests demandés**

| Demandé | Couvert par |
|---|---|
| A — sauvegarde | `sauvegarde.test.ts` : timeout, 429, 500, JSON invalide, coupure |
| E — duplication | `pieces-integrite.test.ts` |
| F — suppression | `pieces-integrite.test.ts` |
| G — stockage saturé | `offline-fiabilite.test.ts` |
| H — écriture abandonnée | `offline-fiabilite.test.ts` |
| I — sécurité | `perimetre-projets.test.ts` |
| J — plus de 100 photos | `photo-debordement.test.ts` |

**Non automatisés** : B (signature hors ligne), C (photos hors ligne),
D (rapport complet hors ligne), K (fermeture), L (retour du réseau). Ils
exigent un vrai navigateur, IndexedDB et un réseau qu'on coupe. Aucun
composant n'est testé dans ce dépôt, et monter cet outillage dépasse le cadre
de cette mission.

---

## Ce qui reste à faire de votre côté

1. **Autoriser le déploiement** — rien n'est en production.
2. **Décider pour les 8 doublons** de TM-2600825.
3. **Vérifier au doigt**, après déploiement : une signature hors réseau, puis
   le retour du réseau.


---

# Deuxième campagne — 17 octobre 2026 (après-midi)

Objet : **tester réellement** ce qui n'était jusque-là vérifié que par
raisonnement, et corriger ce que ces tests révéleraient.

## Outillage installé

| Outil | Rôle |
|---|---|
| `fake-indexeddb` | Un vrai IndexedDB en mémoire : la file des photos et de la signature s'exécute pour de bon dans les tests Node |
| `jsdom` + Testing Library | Premiers tests de composants de ce dépôt |
| Playwright + WebKit + Chromium | L'application **compilée**, dans un navigateur, au gabarit d'un iPhone |

La configuration Vitest a deux environnements (`node` et `navigateur`) pour
que les tests existants continuent de tourner inchangés.

## Ce que les tests réels ont trouvé — et qui a été corrigé

| # | Trouvé par | Défaut | Correction |
|---|---|---|---|
| 1 | Tests de routes | L'empreinte d'un signalement incluait **l'auteur**. À la suppression elle était calculée sur l'enregistrement (qui en a un), au rejeu sur le corps envoyé (qui n'en a pas) : les pierres tombales ne correspondaient jamais, et un signalement effacé pouvait revenir | L'auteur sort de l'empreinte |
| 2 | Tests de routes | Sans Redis, `avecVerrou` n'exécutait **rien en série** : trois créations simultanées s'écrasaient, deux signalements perdus | File d'attente en mémoire, seconde barrière, toujours active |
| 3 | Bout en bout | Une réponse inattendue de l'API de facturation faisait **planter toute la fiche projet** dans son écran d'erreur | Validation de la forme de la réponse |
| 4 | Bout en bout | La signature chargeait son module de file **à la demande**, donc au moment précis où le réseau manque | Import statique |
| 5 | Bout en bout | Quand la mise en file échouait, la carte affichait quand même **« Signature enregistrée »** — le faux succès exact que cette mission traque | Troisième état : « NON enregistrée — prévenez le bureau » |
| 6 | Bout en bout | Le pavé disait « Signature enregistrée » à côté de « NON enregistrée » : deux messages contraires sur le même écran | Le pavé dit « Signature **apposée** » : il ne connaît que son tracé |

## Tests ajoutés

| Fichier | Tests | Ce qu'il démontre |
|---|---:|---|
| `file-envois.navigateur.test.ts` | 12 | Scénarios A→D sur un vrai IndexedDB : rien n'est supprimé avant confirmation, les octets ne repartent jamais deux fois, 120 photos passent sans perte |
| `signalements-routes.test.ts` | 23 | Tests A→F sur les **vraies routes** : rejeu, suppression, concurrence, pour les défauts ET les pièces |
| `sauvegarde-restauration.test.ts` | 18 | Sauvegarde, pannes Notion et Redis, **restauration comparée enregistrement par enregistrement**, export indépendant |
| `acces-projets-routes.test.ts` | 19 | Quatre comptes, trois politiques, accès direct, et le cache partagé qui ne fuit pas |
| `composants-signature.test.tsx` | 11 | Premier composant testé du dépôt |
| `etat-rapport.navigateur.test.ts` | 8 | La chaîne complète des statuts, signature comprise |
| `e2e/10-signature-hors-ligne.spec.ts` | 3 | Le parcours A→C dans un navigateur réel |
| `e2e/20-iphone-echec-stockage.spec.ts` | 3 | Rendu iPhone, gestes tactiles, et le refus de stockage avoué |

## Sauvegardes : ce que l'analyse a montré

Les sauvegardes nocturnes écrivent dans des pages Notion `[DATA] …` — **la
même base, le même espace de travail et le même jeton** que les données
d'origine. Elles protègent du cas probable (une écriture fautive de
l'application) et de rien d'autre : si Notion est en cause, les deux copies
partent ensemble.

D'où `/api/admin/sauvegardes/export` : un fichier à télécharger et à ranger
où vous voulez. Aucun service tiers, aucun abonnement. Il dit ce qu'il n'a
pas pu lire au lieu de le rendre vide, et répond 206 quand il est partiel.

## Limites, nommées

1. **WebKit sous Playwright ne stocke pas de `Blob` dans IndexedDB.** Vérifié :
   le même enregistrement passe avec un `Uint8Array`. Les parcours hors ligne
   tournent donc sur Chromium au gabarit iPhone ; WebKit couvre le rendu, les
   gestes et le chemin d'échec. Safari sur un vrai iPhone sait le faire —
   l'application s'en sert tous les jours pour ses photos.
2. **Le service worker est désactivé pendant les tests de bout en bout** : il
   s'interpose entre la page et Playwright. Il n'est donc pas couvert.
3. **Les octets d'une photo après redémarrage** ne sont pas vérifiés : les
   deux bancs d'essai perdent les `Blob` à la relecture. Ce que les tests
   prouvent, c'est que l'enregistrement survit (projet, champ visé, statut).
4. **Trois fichiers de 6 000 à 13 600 lignes** restent non découpés.
5. **`xlsx`** : vulnérabilité sans correctif, hors d'atteinte ici (l'app
   n'analyse aucun classeur, elle n'en écrit que). À revoir si un import
   arrive un jour.

---

# Troisième campagne — 17 octobre 2026 (soir)

Objet : les **quatre vérifications demandées avant déploiement**. Chacune
visait une limite que la campagne précédente avait nommée au lieu de la
lever. Les quatre sont levées.

## 1 — Le service worker, le vrai

Limite précédente : *« le service worker est désactivé pendant les tests de
bout en bout ; il n'est donc pas couvert »*.

`e2e/30-service-worker.spec.ts` — 4 tests, sur l'application **compilée**,
avec `serviceWorkers: "allow"` et le `public/sw.js` de production.

| Test | Ce qu'il démontre |
|---|---|
| s'installe et met la coquille en réserve | Le worker prend la main et son cache n'est pas vide |
| **ouvre l'application SANS RÉSEAU** après une première visite | Réseau coupé pour de bon, l'application s'ouvre quand même — la promesse de la PWA |
| la fiche d'un projet déjà consulté se rouvre sans réseau | Pas de page blanche sur le chantier |
| les fragments de code déjà vus sont resservis sans réseau | Le cas qui échouait sans worker : le pavé de signature est un fragment chargé à la demande. Chaque `/_next/static/chunks/*.js` est re-demandé hors ligne et doit répondre avec des octets |

Chromium seulement : Playwright n'intercepte les requêtes d'un service
worker que sur ce moteur.

## 2 — Les octets d'une photo, après extinction complète

Limite précédente : *« les octets d'une photo après redémarrage ne sont pas
vérifiés : les deux bancs d'essai perdent les `Blob` à la relecture »*.

`e2e/31-photos-octets.spec.ts` — 2 tests, avec un **profil de navigateur sur
disque** (`launchPersistentContext`). Le navigateur est réellement éteint,
puis rallumé sur le même profil.

- l'image est déposée **hors réseau**, puis relue après extinction :
  **même taille, même SHA-256, même nom** ;
- rallumé **avec** le réseau, la file se vide seule et l'écriture part vers
  le bon champ du bon projet.

L'image passe par le pavé de signature : ce n'est pas un détour, photos et
signature empruntent le **même appel** (`addPendingUpload`), le même magasin
IndexedDB et la même structure `{ name, type, blob }`.

## 3 — La signature est-elle dans le PDF ?

`src/__tests__/pdf-signature.test.ts` — 4 tests.

Le PDF est **réellement rendu** par `@react-pdf/renderer`, avec et sans
signature, et on mesure la différence de taille : une image PNG de 4 228
octets ne peut pas grossir le document si elle n'y est pas. Deux approches
plus directes ont échoué et sont documentées dans le fichier — compter les
images ne marche pas (le logo en contient déjà quatre), intercepter `fetch`
non plus (react-pdf ne passe pas par le `fetch` global).

## 4 — L'archive est-elle vraiment restaurable ?

C'était la bonne question : **l'export produisait un fichier que personne
n'avait jamais rouvert.** Il n'y avait aucun chemin de retour.

### Ce qui a été construit

| Élément | Rôle |
|---|---|
| `src/lib/archive.ts` | Le format, en un seul endroit : construction, **validation** (y compris le repérage d'un fichier tronqué par ses empreintes), comparaison, nommage |
| `POST /api/admin/sauvegardes/import` | Le chemin de retour. **Simulation par défaut** — sans `appliquer: true`, rien ne s'écrit |
| `/admin/sauvegardes` | La page. Regarder les copies, en télécharger une, en réinstaller une. Accessible depuis le menu, réservée à l'administrateur |
| `rassemblerLesListes` dans `sauvegarde.ts` | Une seule définition de « ce qu'on sauvegarde », pour que l'export manuel et la copie hebdomadaire ne divergent pas |

Les verrous de l'import sont ceux de la restauration interne : droit
d'administration, **phrase de confirmation qui contient la date de
l'archive** (on ne réinstalle pas celle d'il y a six mois en croyant prendre
celle d'hier), refus automatique de toute perte nette, et refus d'écrire sur
un état actuel illisible — on ne devine pas ce qu'on écrase.

### Ce qui le prouve

`src/__tests__/archive-restauration.test.ts` — 18 tests. Le scénario
principal va jusqu'au bout :

1. cinq listes fictives vivent dans un magasin en mémoire ;
2. on **télécharge** par la vraie route, et on garde le **texte** du fichier ;
3. **le magasin est vidé** — comme si l'espace Notion avait disparu ;
4. le texte est relu depuis zéro, validé, simulé, puis appliqué ;
5. comparaison enregistrement par enregistrement, y compris ce qui se perd
   d'habitude : l'ordre, les dates, l'imbriqué profond, et `""`, `0`,
   `false`, `null` — qu'une sérialisation bâclée transforme en « absent ».

Les autres tests couvrent le refus d'un fichier tronqué, d'un fichier qui
n'est pas une archive, d'une version future, des clés inventées, et chacun
des quatre verrous.

## Sauvegarde automatique indépendante de Notion, sans abonnement

Options examinées, et celle qui a été retenue :

| Piste | Verdict |
|---|---|
| **Courriel hebdomadaire avec l'archive en pièce jointe** | **Retenue.** Gmail est déjà configuré (`GMAIL_USER` / `GMAIL_APP_PASSWORD`, utilisés par le rapport quotidien). Aucun service en plus, aucun abonnement, aucun tiers de plus que ceux qui détiennent déjà les données. La boîte aux lettres conserve l'archive aussi longtemps que vous le voulez, et personne ne peut vous en couper l'accès du jour au lendemain |
| Dépôt Git privé (GitHub) | Techniquement gratuit, mais place les données d'exploitation dans un dépôt de code — mauvais endroit, et une fuite de jeton deviendrait une fuite de données |
| Stockage objet (S3, R2, B2) | Fiable, mais c'est un compte de plus, une facture de plus et des clés de plus à surveiller |
| Vercel Blob | Lié au même hébergeur que l'application : même défaut que Notion, sous un autre nom |
| Téléchargement manuel | Déjà là, mais dépend de quelqu'un qui y pense |

`GET /api/cron/export-hebdo` — tous les dimanches à 2 h (`vercel.json`) :

- **ne fait rien tant que `BACKUP_EMAIL` n'est pas défini.** Aucun courriel
  que personne n'a réclamé ;
- comprime au-delà de 8 Mo (Gmail rechigne au-delà) ;
- **échoue bruyamment** si rien n'a pu être lu, plutôt que d'expédier une
  archive vide qui laisserait croire que tout va bien ;
- `sendEmail` accepte désormais des pièces jointes, côté Gmail comme côté
  Resend.

`src/__tests__/archive-hebdo.test.ts` — 7 tests, dont le seul qui compte :
**la pièce jointe expédiée est ouverte, validée, et réinstallée dans un
magasin vidé.** Aucun courriel n'est réellement envoyé.

## Tests ajoutés par cette campagne

| Fichier | Tests |
|---|---:|
| `e2e/30-service-worker.spec.ts` | 4 |
| `e2e/31-photos-octets.spec.ts` | 2 |
| `src/__tests__/pdf-signature.test.ts` | 4 |
| `src/__tests__/archive-restauration.test.ts` | 18 |
| `src/__tests__/archive-hebdo.test.ts` | 7 |

## État de la suite

| Contrôle | Résultat |
|---|---|
| `vitest run` | **1 203 tests, 88 fichiers — tous verts** |
| `playwright test` | **14 tests — tous verts** (WebKit + Chromium, sur l'application compilée) |
| `tsc --noEmit` | aucune erreur |
| `npm run build` | compilation réussie, les quatre nouvelles routes présentes |
| `eslint` sur les fichiers touchés | aucune alerte nouvelle |

Un test a échoué en cours de route et a bien fait : l'inventaire des droits
(`droits.test.ts`) a refusé les trois nouvelles routes tant qu'elles
n'étaient pas classées. `node scripts/gen-droits.mjs` les a inscrites
— page admin, route à droit, tâche planifiée.

## Données de production : inchangées

Vérifié en lecture seule après la campagne : **1 649** fiches Notion,
**80** signalements, **25** pièces, et le projet aux **8** signalements
historiques intact. Rien ne pouvait être écrit : les tests unitaires
remplacent entièrement le magasin, et les tests de bout en bout tournent
avec un jeton Notion volontairement invalide — les journaux du serveur de
test le confirment ligne après ligne.

## Limites restantes

Les points 2 et 3 des limites précédentes sont levés. Restent :

1. **WebKit sous Playwright ne stocke pas de `Blob` dans IndexedDB** — les
   parcours hors ligne tournent sur Chromium au gabarit iPhone. Safari sur
   un vrai appareil sait le faire.
2. **Trois fichiers de 6 000 à 13 600 lignes** restent non découpés.
3. **`xlsx`** : vulnérabilité sans correctif, hors d'atteinte ici.
4. **L'import est plafonné à 4,5 Mo** par requête chez Vercel. Au-delà, on
   réinstalle liste par liste (`cles: ["defauts"]`). Les volumes actuels en
   sont très loin.

---

# Quatrième campagne — 17 octobre 2026 (préparation du déploiement)

## 1 — La signature DANS le PDF, vue de ses pixels

Reproche fondé : un écart de taille entre deux documents ne prouve rien.

Le test a été refait. Un paraphe est **dessiné dans le test** — une boucle
cursive, dans une encre d'une teinte unique (10, 20, 90) qui n'existe nulle
part ailleurs. Le PDF est produit, puis **rouvert et décodé** avec `pdf-lib` :
on y retrouve l'objet image, on détend son flux, et on compare les pixels un
par un à ceux qu'on a dessinés.

| Vérification | Résultat |
|---|---|
| Image 600×200 présente dans le document signé | oui, en `/DeviceRGB` + son masque `/DeviceGray` |
| Pixels identiques au tracé | **11 167 pixels opaques, 0 divergence** |
| Document non signé | aucune image 600×200 — le cadre entier disparaît |
| Contrôle de validité du test | en retirant la signature, le test **échoue** |

Le rendu a aussi été regardé à l'œil : le paraphe apparaît dans le cadre
« Signature du client », à la bonne place et aux bonnes proportions.

## 2 — Les archives : ce qu'elles contiennent, et sous quelle protection

### Ce qu'on y trouve, mesuré sur les données réelles

| Mesure | Nombre |
|---|---:|
| Adresses électroniques | 100 |
| Chaînes de forme « numéro de téléphone » | 567 |
| Adresses de photographies Cloudinary | 233 |
| Noms de chantiers distincts | 252 |
| Collaborateurs nommés | 10 |
| Lignes de journal d'activité nominatif | 3 202 |

Et un point décisif, vérifié : **les adresses Cloudinary s'ouvrent sans
aucune authentification** (HTTP 206 sur une requête anonyme). Une archive en
clair n'est donc pas seulement une liste de noms : c'est un trousseau qui
ouvre toutes les photographies de chantier.

Verdict : l'archive est sensible. Elle ne sort jamais en clair.

### La protection

`src/lib/archive-chiffree.ts` — **AES-256-GCM**, clé dérivée d'une phrase
secrète par **scrypt** (N = 32 768). GCM authentifie autant qu'il chiffre :
un fichier abîmé d'un seul octet est refusé, au lieu de rendre une bouillie
plausible.

L'enveloppe porte son mode d'emploi en clair sur ses deux premières lignes —
algorithme, sel, vecteur, étiquette, empreinte du contenu. Ce n'est pas une
faiblesse : c'est ce qui garantit qu'on saura la rouvrir dans dix ans.

**`scripts/dechiffrer-archive.mjs`** la rouvre avec **Node seul, sans aucune
dépendance**. C'est le filet du filet : si cette application, Vercel et
Notion ont tous disparu, ce script et la phrase secrète suffisent.

### Règles d'expédition

| Condition | Comportement |
|---|---|
| `BACKUP_EMAIL` absent | ne fait rien, le dit (`actif: false`) |
| `BACKUP_PASSPHRASE` absente ou < 12 caractères | **refuse d'expédier**, répond 503 |
| `CRON_SECRET` absent | **refuse de s'exécuter**, répond 503 — cette tâche-ci sort toutes les données de l'application, une adresse devinée ne doit pas suffire |
| Rien n'a pu être lu | n'expédie pas d'archive vide, répond 500 |

`src/__tests__/archive-chiffrement.test.ts` — 16 tests, dont : rien du
contenu ne transparaît dans l'enveloppe, deux enveloppes du même contenu
diffèrent, le script de secours rouvre et rend l'archive, et **la pièce
jointe du courriel restaure tout dans un magasin vidé**.

## 3 — Contrôles avant déploiement

| Contrôle | Constat |
|---|---|
| **Variables d'environnement** | 26 définies en production. Aucune manquante : tout ce que le code lit en plus a une valeur de repli (`BEXIO_TOKEN_KEY`→`JWT_SECRET`, `UPSTASH_*`→`KV_REST_API_*`, etc.). **Deux à ajouter** pour activer la copie hebdomadaire : `BACKUP_EMAIL`, `BACKUP_PASSPHRASE` |
| **Paramètres Vercel** | Projet `tm-rapport-services`, région `fra1`, Node 24.x, `buildCommand` inchangé |
| **Tâches planifiées** | 11 avant, 12 après. Une seule ajoutée : `/api/cron/export-hebdo`, dimanche 2 h. Aucun doublon, aucun chevauchement |
| **Nouvelles routes** | 3 routes + 1 page. Classées par `gen-droits.mjs` : page `admin-ecran`, les deux API `droit`, la tâche `cron` |
| **Permissions** | `/api/admin/sauvegardes{,/export,/import}` exigent `administration.droits`. `/api/cron/export-hebdo` tombe dans le préfixe public `/api/cron/` comme toutes les tâches, et se protège lui-même par `CRON_SECRET` — désormais **obligatoire** pour cette route |
| **Retour arrière** | Vercel conserve les déploiements : `vercel rollback <url>` remet l'actuel en ligne en une minute. Côté dépôt, `main` est à `40d022f` et n'est pas touché tant que rien n'est poussé |
| **Compatibilité du retour arrière** | Les écritures de cette version restent lisibles par l'ancienne : les clés `sauvegarde-*` et `kv:temoin:*` sont additives, et aucun format existant ne change. Une réserve nommée plus bas |

### Deux problèmes d'environnement trouvés et réparés

iCloud synchronise ce dossier et y avait laissé des **copies en double** :

1. **Dans `.git`** — neuf copies de l'index et un faux `refs/remotes/origin/main 2`
   pointant sur un objet absent. `git fetch` échouait : *« did not send all
   necessary objects »*. **Le `git push` aurait échoué.** Les copies ont été
   mises de côté puis retirées ; `git fsck` et `git fetch` sont propres.
2. **Dans `.next`** — des `routes.d 2.ts`, `cache-life.d 3.ts` que `tsc`
   lisait et qui le faisaient échouer sur des identifiants en double.
   `tsconfig.json` les exclut maintenant (`**/* ?.ts`).

Aucun fichier du projet n'a été perdu : seules des copies de fichiers
générés ont été retirées.

## 4 — État de la suite

| Contrôle | Résultat |
|---|---|
| `vitest run` | **1 221 tests, 89 fichiers — tous verts** |
| `playwright test` | **14 tests — tous verts** |
| `tsc --noEmit` | aucune erreur |
| `npm run build` | compilation réussie, les 4 routes présentes |
| `eslint` | **90 erreurs / 30 avertissements, contre 90 / 32 sur `main`** — la branche est plus propre : 17 imports morts, restes des refactorisations précédentes, ont été retirés |

## 5 — Données de production

Revérifié en lecture seule, après tous ces travaux : **1 649** fiches Notion,
**80** signalements, **25** pièces, et le projet aux **8** signalements
historiques intact.

---

# Cinquième campagne — 17 octobre 2026 (affichage iPadOS / iOS)

Objet : l'affichage sur iPad, décrit comme « textes qui se superposent,
éléments mal positionnés, interfaces insuffisamment adaptées » — **sans
toucher à l'apparence de macOS**.

## 1 — Comment les défauts ont été trouvés

Pas à l'œil, et pas page par page. Une **sonde** (`e2e/sonde-affichage.ts`)
mesure les rectangles réellement calculés par le navigateur et relève
quatre choses : débordement horizontal, chevauchement de textes, contenu
coupé sans moyen de l'atteindre, cible tactile sous 36 px.

Elle parcourt **13 gabarits × 29 écrans × 2 thèmes**, avec des **données
denses** — noms de chantiers à rallonge, trente projets, quatorze
signalements. Le premier relevé, fait avec un seul chantier au nom court,
n'avait presque rien trouvé : *un tableau vide ne déborde jamais*.

### Deux erreurs de méthode, corrigées en route

1. **Le harnais se connectait en administrateur mais `/api/auth` répondait
   « monteur »** : les onze écrans d'administration renvoyaient à l'accueil
   et le relevé croyait les avoir inspectés.
2. **Le projet Playwright émulait le tactile pour TOUS les gabarits**, y
   compris ceux dits « macOS ». La première comparaison avant/après montrait
   donc jusqu'à 70 % de pixels différents sur Mac — un Mac qui recevait les
   styles de l'iPad. Il y a maintenant deux projets : `affichage-mac`
   (souris, pointeur fin) et `affichage-tactile` (doigt).

## 2 — La stratégie : le type de pointeur, jamais la largeur

Une règle en largeur ne distingue pas un iPad d'une fenêtre macOS étroite.
Tout ce qui est propre au tactile vit donc dans `src/app/tactile.css`, sous
`@media (hover: none) and (pointer: coarse)`.

macOS répond toujours `pointer: fine` et `hover: hover` — avec un trackpad,
avec une souris, à n'importe quelle largeur. **Aucune ligne de ce fichier ne
peut l'atteindre.** Ce n'est pas une précaution vérifiée après coup, c'est
une impossibilité.

## 3 — Les défauts corrigés

| # | Où | Ce qui n'allait pas | Correction |
|---|---|---|---|
| 1 | Thème Signal, tout iPad | Le rail n'apparaissait qu'à 1024 px. Un iPad en portrait fait 744 à 1032 : il recevait **la barre d'onglets du téléphone**, dix entrées pour 732 px utiles. « Déstockage » coupé en plein mot, « Chantiers » et « Stats » hors de vue | Le rail dès 700 px **sur écran tactile**. Même condition en CSS et en JS (`REQUETE_RAIL`), pour qu'elles ne divergent pas |
| 2 | Signal, iPad | Rail ET onglets affichés ensemble : deux navigations concurrentes, dont une tronquée | Les onglets s'effacent exactement quand le rail paraît |
| 3 | Signal, en-tête | « Rechercher un projet ou lancer une action » passait **sur trois lignes** et débordait du bandeau | Une seule ligne, coupée par des points de suspension |
| 4 | Signal, en-tête | « Nouveau projet » chevauchait les boutons ronds | Sous 1100 px, l'icône seule |
| 5 | Signal, cartes du jour | « 1 projet » sortait du cadre | Les lignes s'enroulent (règle devenue générale : là où tout tient, rien ne s'enroule) |
| 6 | Signal, en-tête de carte | « Cette semaine » s'imprimait **par-dessus** « Signaux » à 1032 px | Titre et commandes s'enroulent |
| 7 | Signal, charge de la semaine | Le bloc refusait de rétrécir et poussait la page à **429 px sur un écran de 390** | Il rétrécit, la bande de filtres défile à l'intérieur |
| 8 | Tous thèmes, iPhone | Les quatre raccourcis dépassaient de l'écran | La rangée s'enroule |
| 9 | Tous thèmes, iPhone SE | Les huit icônes de la fiche projet dépassaient de 9 px | Elles s'enroulent |
| 10 | Devis en attente, iPad mini | La colonne « Relance » large de 240 px, figée, débordait | Elle accepte de rétrécir |
| 11 | Thème classique, iPhone | « Semaine -1 » s'imprimait sur « Semaine +1 » | Grille deux par deux sous 560 px, **sur écran tactile seulement** |
| 12 | Thème classique, iPhone | Les filtres des chantiers PPE se chevauchaient (ils n'ont de mise en page que dans Signal) | Rangée qui s'enroule, sur écran tactile |
| 13 | Partout, tactile | Plus de **400 cibles sous 36 px** : onglets de 32 px, boutons ronds de 36, pastilles de 28 | 40 px minimum, avec les exceptions nommées (lignes de liste, tableaux, cases à cocher) |
| 14 | iOS | Safari **zoome** dès qu'on touche un champ dont le texte fait moins de 16 px, et ne dézoome jamais | 16 px minimum sur les champs, sur écran tactile |

## 4 — Le résultat, mesuré

Défauts relevés, avant → après :

| Gabarit | Thème Signal | Thème classique |
|---|---|---|
| **macOS 1440 et 1680** | **0 → 0** | **0 → 0** |
| iPad mini portrait | 145 → **6** | 290 → **7** |
| iPad 11″ portrait | 181 → **8** | 290 → **7** |
| iPad 13″ portrait | 183 → **8** | 290 → **7** |
| iPad demi-écran | 435 → **35** | 478 → **36** |
| iPhone 13 | 431 → **35** | 469 → **36** |

**Plus aucun chevauchement, plus aucun débordement, plus aucun contenu coupé
— sur aucun gabarit, dans aucun des deux thèmes.** Ce qui reste est
uniquement une poignée de petites cibles tactiles.

## 5 — La preuve que macOS n'a pas bougé

Captures avant/après, **comparées octet par octet** par un décodeur PNG
écrit pour l'occasion (aucune dépendance).

Première mesure du **bruit de fond** — deux captures du même code : jusqu'à
2 % de différence, à cause des dégradés de fond animés en boucle. Les
animations sont donc gelées pendant la photographie, ce qui ramène le bruit
à **0,013 % au pire**.

| Série | Résultat |
|---|---|
| macOS, thème classique | **46 / 46 captures RIGOUREUSEMENT identiques** |
| macOS, thème Signal | 31 / 46 identiques, les 15 autres entre 0,001 % et 0,009 % — **sous le bruit de fond** |

## 6 — Les garde-fous ajoutés

| Fichier | Rôle |
|---|---|
| `e2e/51-garde-affichage.spec.ts` | 6 tests : iPad portrait, iPad demi-écran, iPhone, dans les deux thèmes. **Échoue** sur tout chevauchement, débordement ou contenu coupé |
| `e2e/52-garde-macos.spec.ts` | 4 tests : le Mac doit rester sans défaut. Vérifie d'abord que le contexte est bien `pointer: fine` — sans quoi il mesurerait un iPad |
| `e2e/50-affichage.spec.ts` | Le relevé complet, sur demande (`TM_RELEVE=1`) |
| `e2e/59-captures.spec.ts` | Les captures, sur demande (`TM_CAPTURES=<gabarits>`) |

Le garde-fou a été **éprouvé par mutation** : en retirant une des
corrections, il tombe et nomme le défaut exact.

## 7 — Ce qui n'est pas prouvé

**Aucun test n'a tourné sur un iPad ni un iPhone physique.** Tout ce qui
précède vient de Chromium pilotant des gabarits et un type de pointeur
émulés. C'est fidèle pour la mise en page, et ça ne remplace pas un essai
réel — notamment pour le pavé de signature au doigt et à l'Apple Pencil,
et pour la prise de photo.

---

# Après le déploiement — ce que la production a révélé (17 octobre 2026)

Deux anomalies trouvées **en vérifiant la version en ligne**, et corrigées
puis redéployées dans la foulée. Elles méritent d'être nommées : aucune
n'aurait été visible sans aller interroger la production.

## A — L'archive emportait 500 lignes de journal sur 3 202

Le journal a migré vers une **liste Redis** (ajout en O(1), 20 000 entrées)
parce que réécrire un gros bloc Notion à chaque action coûtait trop cher.
La clé Notion `logs` existe toujours, mais ne contient plus que le reliquat
d'avant la migration — et plus rien ne s'y écrit.

L'export lisait cette clé seule. Il annonçait donc 500 lignes là où
l'application en affichait 3 202, **sans rien signaler**. Ce n'est pas une
sauvegarde partielle : c'est une sauvegarde trompeuse.

Corrigé : les deux sources sont lues et fusionnées comme le fait déjà
`/api/logs`. Si les deux tombent, l'archive le dit au lieu d'annoncer un
journal vide. Vérifié en ligne : **3 202 lignes**, archive de 1 406 Ko.

## B — L'aperçu d'une restauration annonçait un écart imaginaire

Conséquence du précédent : la simulation comparait la clé Notion seule à
l'archive complète, et affichait « logs : actuel 500, archive 3 202,
écart +2 702 » alors que rien ne changerait. Or c'est sur cet aperçu qu'on
décide d'écraser des données.

Corrigé : un seul chemin de lecture (`lireListeSauvegardable`) pour
l'export et pour l'aperçu. Vérifié en ligne : **tous les écarts à zéro**.

---

# Photographies Cloudinary — ce qui est possible, et ce qui ne l'est pas

## Le constat, vérifié

| Mesure | Valeur |
|---|---|
| Compte | `dzqpr6cbh`, plan **gratuit** |
| Ressources | **8 376** images, 4,1 Go |
| Type de diffusion | `upload` pour toutes |
| Mode d'accès | `public` pour toutes |
| Test anonyme | **HTTP 206** — l'image s'ouvre sans authentification |

Les adresses sont longues et aléatoires : ce sont des **URL secrètes**.
Quiconque en obtient une voit la photographie ; personne ne les devine.

## Ce qui a été fait, sans rien casser

La vraie fuite n'était pas Cloudinary : c'était **la diffusion des
adresses**. Une archive en clair dans une boîte aux lettres, c'est 233
liens ouverts posés chez un tiers. Depuis cette campagne, l'archive est
chiffrée (AES-256-GCM) et ne part jamais autrement.

## Ce qui n'a pas été fait, et pourquoi

Passer les images en diffusion `authenticated` est **techniquement
possible et pratiquement destructeur** : le `public_id` survit, mais
l'adresse `/image/upload/…` renvoie alors 401. Or ces adresses sont
stockées dans Notion, affichées dans l'application, et transmises aux
clients par les portails. Les basculer casserait tout, d'un coup, pour
8 376 images.

Bonne nouvelle au passage, vérifiée en décodant un PDF : **react-pdf
télécharge et INCORPORE les images** (objets `/Image` en `FlateDecode`).
Les rapports déjà générés ne dépendent donc d'aucun lien et survivraient
à une migration.

## La migration, préparée mais NON exécutée

Elle se fait en trois temps, et aucun ne peut être improvisé :

1. inventorier les 8 376 ressources et leur usage (Notion, portails, PDF) ;
2. signer les URL à l'affichage — application, portails clients, liens
   partagés — avec une expiration ;
3. seulement ensuite, basculer le mode d'accès, par lots, en vérifiant.

Tant que ce n'est pas fait, le compte reste en plan gratuit, où les
fonctions de média restreint sont de toute façon limitées.

---

# Sauvegarde sur le NAS Synology

Procédure complète dans **`docs/SAUVEGARDE-NAS-SYNOLOGY.md`** : dossier
chiffré, compte dédié, tâche planifiée qui **va chercher** l'archive
plutôt que de recevoir quoi que ce soit — aucun port ouvert, aucune clé
qui sorte de chez vous — contrôle de taille, alerte en cas d'échec,
rétention d'un an, et la vérification manuelle qui valide la chaîne.

Une pièce manque côté application : une route d'export **à secret**
(`/api/admin/sauvegardes/export-chiffre`), puisqu'un script de NAS ne peut
pas tenir une session d'administrateur. Une quinzaine de lignes calquées
sur la tâche hebdomadaire. Elle n'a pas été écrite : une route qui sort
l'intégralité des données s'ajoute délibérément, pas en fin de campagne.
En attendant, la copie hebdomadaire arrive déjà chiffrée dans la boîte aux
lettres et peut être déposée sur le NAS à la main.
