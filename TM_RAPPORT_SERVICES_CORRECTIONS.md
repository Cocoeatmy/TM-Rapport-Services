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
