# TM Rapport pour iPhone, iPad et Mac

Une seule application Apple, un seul code Swift, pour les trois appareils.
Elle affiche le site TM Rapport tel quel : aucune interface n'a été redessinée.

## Ce qui se met à jour seul, et ce qui demande une réinstallation

| Changement | Comment il arrive dans l'app |
|---|---|
| Tout ce qui se passe dans le site : écrans, thème Signal, règles, API, hors ligne | Seul, au déploiement Vercel. Le composant `MajAuto` recharge la page dès que la version déployée change. |
| La partie native : fenêtres, téléchargements, appareil photo, partage, icône | Il faut recompiler et réinstaller l'app. |

Quand le site finit par dépendre d'une partie native plus récente, on relève
`COQUE_APPLE_MINIMUM` dans `src/lib/coque-apple.ts`. Les apps plus anciennes
affichent alors « Mise à jour de l'application nécessaire » et continuent de
fonctionner. Cette valeur doit rester égale ou inférieure à `MARKETING_VERSION`
dans le projet Xcode.

## Ouvrir et compiler

Le projet se trouve dans `apple/TM Rapport.xcodeproj`, avec un seul schéma, « TM Rapport ».

- **Mac** : choisir la destination « My Mac », puis Product > Run.
- **iPhone ou iPad** : brancher l'appareil, le choisir comme destination, puis Product > Run.
  À la première installation, il faut autoriser le développeur dans
  Réglages > Général > VPN et gestion de l'appareil, puis activer le mode
  développeur si iOS le demande.

Équipe de signature : 76WCK6SFR6. Identifiant : `TM.TM-Rapport`.

Compilation en ligne de commande, sans signature :

```bash
xcodebuild -project "TM Rapport.xcodeproj" -scheme "TM Rapport" -destination 'platform=macOS' CODE_SIGNING_ALLOWED=NO build
```

## Essais sans toucher à la production

Ces réglages se passent au lancement, depuis Xcode (Edit Scheme > Arguments) ou en ligne de commande.

| Argument | Effet |
|---|---|
| `-TMBaseURL http://localhost:3137` | Ouvre un serveur local au lieu du site en ligne. |
| `-TMDiagnostic YES` | Écrit dans la console ce que voit la page : service worker, caches, compatibilité, capture d'écran. |
| `-TMJetonTest <jeton>` | Compilations Debug seulement, et seulement vers localhost : pose une session de test. |

### Démarrage à froid sans réseau

L'essai vérifié le 18 octobre 2026 sur Mac, simulateur iPhone et simulateur iPad :

1. Compiler le site et le lancer en local sur le port 3137, avec les clés de test de `playwright.config.ts`.
2. Lancer l'app avec `-TMBaseURL http://localhost:3137 -TMDiagnostic YES`.
   Après une douzaine de secondes, la console indique un service worker actif et plus de cent fichiers en cache.
3. Arrêter le serveur, puis relancer l'app.
   L'interface du site s'affiche depuis le cache, et non la page « Hors ligne » ni l'écran « TM Rapport est injoignable ».

## Ce que fait la partie native

- **Navigateur.swift** : la vue web, la session persistante, le service worker et les liens externes vers Plans, Waze, Mail ou Téléphone. Elle gère aussi les téléchargements, l'appareil photo, le micro et le contrôle de compatibilité.
- **Dialogues.swift** : les `alert`, `confirm` et `prompt` du site. Sans ce fichier, chaque confirmation de suppression répondrait « non » en silence.
- **Vues.swift** : l'écran, la page « injoignable », le bandeau de mise à jour, les fenêtres secondaires et la feuille de partage.
- **Configuration.swift** : l'adresse du site et le nom de l'app transmis au site, `TMRapportApp/<version> (<plateforme>)`.

Le domaine du site est déclaré dans `WKAppBoundDomains` du fichier Info.plist. C'est cette déclaration qui permet au service worker de fonctionner dans l'app.
Un nouveau domaine interne doit y être ajouté, sinon le hors ligne cesse de fonctionner pour ce domaine.
