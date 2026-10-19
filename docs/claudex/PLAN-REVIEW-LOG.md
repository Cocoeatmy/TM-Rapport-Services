# Journal Claudex Loop — versionnement et suivi des versions

- Hôte / planificateur / constructeur : Claude Code (claude-opus-5-5). Relecteur du plan et inspecteur : Codex CLI 0.159.2 (modèle : configuration du CLI, non imposé).
- Plan : docs/claudex/PLAN-versions.md. Tours de plan max : 5. Corrections max : 2. Inspections max : 2.
- Autorisation : implémentation + tests + déploiement Web après validation ; aucune publication Apple ; aucune suppression de données.
- Artefacts du runner : hors dépôt (scratchpad de session).

## Tour 1 — 2026-10-19 19:49
SHA256 du plan : 89e60c41e41812e90a4ae25a4b3ab4cc7e658bb21e59ca876f92d1568939fa9d
Résultat : REVISE (Codex, gpt-6-astra, effort low, lecture seule, 67 s). Artefacts : scratchpad/claudex/tour1.
Constats : R1 high (SW renavigue toutes les fenêtres à l'activation), R2 high (numéro publié avant écriture durable), R3 high (restauration ne restitue pas les numéros d'origine), R4 medium (repli sha ambigu), R5 medium (application manuelle hors ligne), R6 medium (état partagé entre onglets).
Dispositions : les six ACCEPTÉS (voir dispositions-tour1.md, copié ci-dessous en résumé) ; plan révisé.

## Tour 2 — 2026-10-19 19:52
SHA256 du plan : d7bac3a8eec65b0282b8c82a7eeed91e3d5dcd9cf53769daf1175731fa346bd5

### Dispositions tour 2
R7, R8, R11 résolus par abandon du registre au profit d'un numéro fixé à la compilation (horodatage UTC). R9, R10 acceptés : plus aucune purge, remplacement vérifié de la coquille par le SW, nettoyage borné à 30 jours. Détail : dispositions-tour2.md (hors dépôt).

## Tour 3 — Codex (reprise de session)
Plan SHA256 : 4b94c26658ffe43b0b33e066cff5a4d1ce667371f93a300724a668b907a4c790
Résultat : REVISE (session Codex 01a15548…, gpt-6-astra/low, lecture seule). R12 (moyen) libellé horaire non unique ; R13 (haut) préparation non tout-ou-rien ; R14 (moyen) nettoyage par âge HTTP.

### Dispositions tour 3
R12, R13, R14 acceptés : identité = deploiement, libellé non ordonné ; préparation tout-ou-rien en cache temporaire ; rétention par versions utilisées. Détail : dispositions-tour3.md (hors dépôt).

## Tour 4 — Codex (reprise de session)
Plan SHA256 : 66141a4c56641292b0f1e66d94627386582b22f9427fffcb8c69add78c704862
Résultat : REVISE. R15 (haut) écrivains HTML concurrents ; R16 (moyen) pré-caches non bornés.

### Dispositions tour 4
R15 accepté (coordination de tous les écrivains HTML + contrôle VERIFIER_PRETE). R16 accepté sur la garantie ; prémisse corrigée par mesure en production (nom du pré-cache constant). Détail : dispositions-tour4.md (hors dépôt).

## Tour 5 — Codex (reprise de session, dernier tour autorisé)
Plan SHA256 : 2cb6d2872665611c35dfa02f642d9e2f490e1d31ae8415d12ad74cba470899a0
Résultat : REVISE. R17 (haut) préparation par page vs par déploiement ; R18 (moyen) dépendance possible à un ancien pré-cache.

### Dispositions tour 5 — budget de relecture du plan épuisé (5 tours)
- R15/R17 : résolus en **resserrant la garantie** plutôt qu'en étendant le protocole : l'application n'a lieu qu'en ligne et ne vide aucun cache ; « prête » = coquille `/` et sa fermeture téléchargées et vérifiées (information), pas une promesse d'exécution hors ligne de toutes les pages ; les écrivains opportunistes existants restent inchangés et leur limite hors ligne (pages autres que `/`) est signalée hors périmètre. Protocole VERIFIER_PRETE et filtrage des écrivains retirés.
- R18 : accepté — recopie des entrées d'un ancien pré-cache dans le cache principal avant suppression, conservation si la recopie échoue ; test avec changement réel de nom.
- R14 simplifié : ensemble conservé = fermeture (cache seulement) des HTML en cache et des racines signalées < 7 jours ; toute erreur annule le nettoyage.
- **Cette dernière révision n'a pas été relue par Codex au stade du plan** (budget atteint). Elle sera jugée par l'inspection Codex indépendante (session neuve) du code construit, contre ce plan.
Plan SHA256 final (après corrections de cohérence §2.4, §4, §5) : cf928f67d2bd1eedfe1893ab04802b6db7e5f933abaabbd4bdb03a089feac1a8

## Construction (Claude, hôte)
Base : f50cadba18e1bbab8cd7f70bce80124caec1d02e. Constructeur : Claude (hôte). Inspecteur : Codex (session neuve, lecture seule).
Preuves de l'hôte avant inspection 1 : tsc OK ; vitest 1398 ; Playwright 63 + e2e/37 7/7 ; XCTest 11/11 ; Release iOS + macOS OK.
Preuves avant inspection 2 : tsc OK ; vitest 107 fichiers / 1401 tests ; Playwright suite complète 72 réussis / 12 ignorés (bancs à la demande), dont e2e/37 10/10.

## Inspection 1 — Codex (session neuve 01a1556d…, gpt-6-astra/low, lecture seule) : REVISE
- V19 (haut) éditeurs sans rôle de dialogue : ACCEPTÉ — détection des calques plein écran sans rôle (`fenetreOuverte`), test e2e avec brouillon + champ quitté + 62 s d'inactivité.
- V20 (moyen) lectures de files qui avalent les erreurs : ACCEPTÉ — `compterSaisiesStrict`, `getPendingUploads` direct ; illisible = non vide ; tests unitaires.
- V21 (haut) métadonnées illisibles écrasées : ACCEPTÉ — `lireMeta` distingue absent/illisible, aucune réécriture ni nettoyage sur illisible ; test e2e.
- V22 (moyen) polices citées par CSS : ACCEPTÉ — `citationsCss` (url() résolues depuis la feuille), en préparation et en rétention ; test e2e avec police citée seulement par une feuille.
- V23 (moyen) publication non tout-ou-rien : ACCEPTÉ par **révision explicite de l'invariant** (plan §2.4) : ajouts de fragments à empreinte seulement, métadonnées, puis `/` en dernier et en une écriture ; aucun échec possible après `/`.
- V24 (moyen) nettoyage jamais déclenché sans préparation : ACCEPTÉ — nettoyage après chaque signal d'usage (une fois par jour), en série avec les préparations.
- Limitation relevée (scénarios promis non testés) : ajoutés — version ancienne encore signalée (code, chargement paresseux, feuille, police), coupure pendant le rechargement, métadonnées illisibles, calque sans rôle. Non ajouté : échecs d'écriture du stockage (non injectables proprement dans Chromium) — signalé.

## Inspection 2 — Codex : NON EXÉCUTÉE (quota)
Le 19.10.2026 vers 20 h 45, la CLI Codex a répondu « You've hit your usage limit … try again at Oct 20th, 2026 12:15 AM » (session échouée après 38 s, aucun verdict). **Aucun accord de Codex n'est revendiqué pour les corrections V19–V24.**

## Relecture indépendante de substitution — Claude (agent séparé, contexte neuf, lecture seule) : REVISE
Ce n'est PAS Codex. Verdict : corrections V19–V24 confirmées ; 3 constats moyens, 5 faibles, tous acceptés et corrigés :
1. (moyen) nettoyage pouvant supprimer un fichier écrit pendant son calcul → liste des supprimables relevée AVANT, compteur d'écritures, abandon si écriture pendant le calcul.
2. (moyen) caches tm-prep-* abandonnés (iOS tue le worker) → tous jetés au début de chaque préparation.
3. (moyen) brouillon sans champ actif (droits d'accès) → `marquerTravailNonEnregistre`, câblé dans droits-view ; retient même l'application manuelle.
4. (faible) inactivité « infinie » au démarrage → comptée depuis le chargement et le retour au premier plan.
5. (faible) PURGE_APP_SHELL vidait encore les caches → répond sans rien effacer ; test e2e.
6. (faible) préparation en échec permanent silencieuse → proposition manuelle au 3e échec ; métadonnées illisibles → reconstruction notée, nettoyage suspendu 7 jours (test e2e).
7. (faible) suffixe `?dpl=` → toléré par RE_FRAGMENT.
8. (faible) champs libres dans le battement → formats stricts (sha hex, dpl_…, env énuméré, dates ISO) ; tests.
Preuves après corrections : tsc OK ; vitest 107 fichiers / 1404 tests ; Playwright 73 réussis / 12 ignorés (bancs à la demande), dont e2e/37 11/11.
Plan SHA256 après corrections de relecture : 5c3c868e80e0dd0c61d3c47fe9870167bb3e6e958f84ea1c09d3a589524b65d3
