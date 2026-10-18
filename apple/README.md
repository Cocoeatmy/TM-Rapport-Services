# TM Rapport pour iPhone, iPad et Mac

Une seule application Apple, un seul code Swift, pour les trois appareils.
Elle affiche le site TM Rapport tel quel : aucune interface n'a été redessinée.

## Ce qui se met à jour seul, et ce qui demande une réinstallation

| Changement | Comment il arrive dans l'app |
|---|---|
| Tout ce qui se passe dans le site : écrans, thème Signal, règles, API, hors ligne | Seul, au déploiement Vercel. Le composant `MajAuto` recharge la page dès que la version déployée change, à l'ouverture comme en cours d'utilisation. |
| La partie native : coffre, fenêtres, téléchargements, envois en arrière-plan, icône | Il faut recompiler et réinstaller l'app. |

Quand le site finit par dépendre d'une partie native plus récente, on relève
`COQUE_APPLE_MINIMUM` dans `src/lib/coque-apple.ts`. Les apps plus anciennes
affichent alors « Mise à jour de l'application nécessaire » et continuent de
fonctionner. Cette valeur doit rester égale ou inférieure à `MARKETING_VERSION`
dans le projet Xcode.

## Le coffre natif et les envois

Le site garde ses propres files d'envoi : IndexedDB pour les photos et la
signature, le stockage local pour les saisies. Dans l'app, et seulement là,
il en confie aussi un double au **coffre**, un dossier de l'application que
WebKit ne peut pas vider.

- **Photos et signatures.** Chaque photo mise en file est déposée au coffre.
  Elle n'en sort que lorsque le serveur a confirmé l'envoi, et passe alors
  14 jours par une archive. Si la file du site revient vide, il y reprend ce
  qui lui manque, avec les mêmes identifiants.
- **Saisies locales.** Les clés que le site protège déjà, dont la file des
  envois, les heures et les noms de lots, sont doublées au coffre. Elles ne
  sont remises que si le stockage local a été entièrement vidé, jamais
  par-dessus une saisie existante.
- **Envois.** C'est toujours le site qui envoie. L'app lui demande de le faire
  au départ en arrière-plan, au retour, au retour du réseau, et quand iOS la
  réveille. Une seule passe à la fois, pour qu'aucune saisie ne parte deux fois.

### Ce qu'Apple permet, et rien de plus

- En quittant l'app, iOS accorde une trentaine de secondes : l'envoi en cours peut finir.
- Ensuite, iOS réveille l'app quand il le juge bon, selon le réseau, la batterie et les habitudes.
  Ce n'est pas une synchronisation permanente.
- Une app fermée de force n'est plus réveillée avant d'être rouverte. Rien n'est perdu pour autant.
- Le simulateur refuse de programmer ces réveils : ils ne se vérifient que sur un vrai appareil.

## Ouvrir et compiler

Le projet se trouve dans `apple/TM Rapport.xcodeproj`, avec un seul schéma, « TM Rapport ».

- **Mac** : choisir la destination « My Mac », puis Product > Run.
- **iPhone ou iPad** : brancher l'appareil, le choisir comme destination, puis Product > Run.
  Le mode développeur doit être activé sur l'appareil, dans Réglages > Confidentialité et sécurité.

Équipe de signature : 76WCK6SFR6. Identifiant : `TM.TM-Rapport`.

## Les tests

| Suite | Où | Commande |
|---|---|---|
| Pont du site vers le coffre | Node, jsdom | `npx vitest run src/__tests__/coffre-apple.navigateur.test.ts` |
| Coffre natif et protocole | Mac | `xcodebuild test -scheme "TM Rapport" -destination 'platform=macOS' -only-testing:TMRapportTests` |
| Interface sur banc d'essai | Simulateur iPhone ou iPad | voir ci-dessous |

Les tests d'interface pilotent la vraie vue web sur `apple/Banc/banc.html`,
qu'il faut servir en local avant de les lancer :

```bash
cd apple/Banc && python3 -m http.server 3138 --bind 127.0.0.1
```

```bash
xcodebuild test -project "TM Rapport.xcodeproj" -scheme "TM Rapport" -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -only-testing:TMRapportUITests
```

Sur Mac, les tests d'interface exigent que le mode d'automatisation soit
autorisé une fois par l'administrateur du Mac.

## Essais sans toucher à la production

Ces réglages se passent au lancement, depuis Xcode (Edit Scheme > Arguments) ou en ligne de commande.

| Argument | Effet |
|---|---|
| `-TMBaseURL http://localhost:3137` | Ouvre un serveur local au lieu du site en ligne. |
| `-TMDiagnostic YES` | Écrit dans la console ce que voit la page : service worker, caches, synchronisations, compatibilité, capture d'écran. |
| `-TMJetonTest <jeton>` | Debug et localhost seulement : pose une session de test. |
| `-TMEssais YES` | Debug et localhost seulement : le site expose `window.tmApple.essais`. |
| `-TMEffacerStockageWeb YES` | Debug et localhost seulement : efface IndexedDB et le stockage local de localhost, comme iOS quand il fait de la place. |
| `-TMScriptEssai "<js>"` | Debug et localhost seulement : exécute un script après le chargement et écrit le résultat. |

Les essais de bout en bout du 18 octobre 2026 ont utilisé ces arguments :
démarrage à froid sans réseau, photo prise puis stockage web effacé puis
photo restaurée octet pour octet, et nouvelle version du site détectée app ouverte.

## Ce que fait la partie native

- **Navigateur.swift** : l'unique vue web, la session persistante, le service worker et les liens externes vers Plans, Waze, Mail ou Téléphone. Elle gère aussi les téléchargements, l'appareil photo, le micro, la compatibilité et les synchronisations.
- **Coffre.swift** et **PontNatif.swift** : le coffre natif et le pont `window.webkit.messageHandlers.tmCoffre`.
- **ArrierePlan.swift** : les envois au départ, au retour et au réveil par iOS ; sur Mac, une dernière tentative avant de quitter.
- **Dialogues.swift** : les `alert`, `confirm` et `prompt` du site. Sans ce fichier, chaque confirmation de suppression répondrait « non » en silence.
- **Vues.swift** : l'écran, la page « injoignable », le bandeau de mise à jour, les fenêtres secondaires et la feuille de partage.
- **Configuration.swift** : l'adresse du site et le nom de l'app transmis au site, `TMRapportApp/<version> (<plateforme>)`.

Le domaine du site est déclaré dans `WKAppBoundDomains` du fichier Info.plist. C'est cette déclaration qui permet au service worker de fonctionner dans l'app.
Un nouveau domaine interne doit y être ajouté, sinon le hors ligne cesse de fonctionner pour ce domaine.
