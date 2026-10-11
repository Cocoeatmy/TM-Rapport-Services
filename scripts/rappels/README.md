# Agent signalements ↔ app Rappels

Pose dans l'app **Rappels** tous les signalements (pièces manquantes, défauts,
constats d'avant-intervention) encore ouverts, et les tient à jour **dans les
deux sens** : réglé dans l'app → coché dans Rappels ; coché dans Rappels →
réglé dans l'app.

Un rappel porte, dans cet ordre : le **lien du chantier** (première ligne,
cliquable), le nom du chantier, le **n° OFR TM**, le lot, le type, la référence
(pièces), le statut, **qui** a signalé et **quand** (jour, heure, ancienneté en
jours), la description, le dernier échange, les **adresses des photos** et le
**rapport PDF**.

## Une LISTE « Signalements », pas une section

L'app Rappels sait découper une liste en **sections** — mais Apple ne les expose
nulle part. Vérifié deux fois sur ce Mac :

- `EKReminder` ne répond ni à `section` ni à `sectionIdentifier`, et les classes
  `EKSection` / `EKReminderSection` n'existent pas ;
- le dictionnaire AppleScript de Rappels ne connaît que `account`, `list` et
  `reminder`.

**Aucun programme ne peut donc déposer quoi que ce soit dans une section.** Un
rappel déposé dans une liste sectionnée atterrit hors section, et l'app le range
sous « Autres ».

L'agent vise donc une **liste** nommée « Signalements » (réglable par la
variable `LISTE` de `run-rappels.sh`) :

- si elle n'existe pas, **il la crée** dans le même compte iCloud ;
- si ses rappels se trouvent ailleurs — liste renommée, déplacement à la main —
  **il les y ramène** au lieu d'en créer d'autres.

Pour retrouver le classement visuel : dans Rappels, *Fichier → Nouveau groupe*
nommé « TM Douche Montage », puis glisser « Signalements » dedans. L'agent suit
le **nom** de la liste, pas sa position : ranger ne casse rien.

## Pourquoi les photos ne sont pas jointes

Le champ « Ajouter une image… » existe bien dans l'app, mais il n'est pas
ouvert aux programmes. `EKReminder` accepte `addAttachment:`, puis EventKit
**plante à l'enregistrement** (`+[EKPersistentAttachment alternateUniverseClass]:
unrecognized selector`) : le framework n'est pas câblé pour les pièces jointes
de rappels. Essayé, dans une liste jetable, supprimée depuis.

À la place : les **adresses des photos** dans la note — Rappels les rend
cliquables, elles s'ouvrent en pleine taille — et le lien du **rapport PDF**,
qui les rassemble toutes et s'ouvre **sans se connecter**.

## Pourquoi le lien est dans la note et pas dans le champ « URL »

Le champ URL visible dans l'app n'est accessible ni à EventKit (on y écrit,
l'app ne l'affiche pas) ni à AppleScript (pas de propriété `url`). La note, elle,
s'affiche sous le titre dans la liste et Rappels y rend les adresses
cliquables : d'où le lien en **première ligne**. Le champ EventKit est tout de
même renseigné, au cas où une version d'iOS le ferait remonter.

## Clôture dans les deux sens

- **Réglé dans l'app** → le rappel est **coché** (jamais supprimé : la trace de
  ce qui a été traité a de la valeur).
- **Coché dans Rappels** → le signalement est **réglé dans l'app** au passage
  suivant, avec exactement les écritures du bouton « réglé » (statut, drapeau,
  horodatage, report Notion « Soucis montages clôturé » quand tous les défauts
  d'un chantier sont réglés), plus un commentaire
  « Réglé depuis l'app Rappels » pour savoir d'où vient la clôture.

## Ce que l'agent ne fait pas, volontairement

- **Il ne touche qu'aux rappels portant son marqueur `[tm:…]`** (en fin de
  notes). Un rappel écrit à la main dans la même liste n'est jamais modifié,
  déplacé ni coché.
- **Il ne supprime jamais rien** — ni rappel, ni signalement.
- **Il ne pose ni échéance ni drapeau.** La moitié des signalements ouverts a
  plus d'un mois : des échéances les afficheraient tous en retard dès le premier
  jour, et tu couperais les notifications de Rappels dans la semaine.
  L'ancienneté passe par la **priorité** — plus de 60 jours : haute, plus de
  21 jours : moyenne, sinon basse. Une échéance posée à la main est conservée.

## Installation

```bash
cd "scripts/rappels"
cp run-rappels.sh.template run-rappels.sh   # puis renseigne SHARE_LINK_KEY
./install.sh
./run-rappels.sh                            # 1er passage : accepter « Rappels »
```

À la première exécution, macOS demande l'autorisation d'accéder aux **Rappels**
→ accepter. (Réglages Système → Confidentialité et sécurité → Rappels.)

La clé est la **même** que celle de l'agent calendrier (`SHARE_LINK_KEY`, déjà
posée sur Vercel) : c'est la même machine, une deuxième clé ne protégerait rien
de plus.

## Déclenchement

Agent **launchd**, toutes les **10 minutes**, plus un passage à l'ouverture de
session.

> ⚠️ L'agent tourne sur **ce Mac**. Mac éteint = liste figée (jamais fausse :
> rien n'est effacé), et une case cochée sur l'iPhone ne remontera dans l'app
> qu'au réveil du Mac.

## Vérifier / déboguer

```bash
launchctl list | grep tmrapport.rappels   # agent chargé ?
tail -f /tmp/tm-rappels.log               # journaux
cat /tmp/tm-rappels.err                   # erreurs
```

Chaque passage écrit une ligne de bilan :

```
liste "Signalements" — ouverts: 50 | créés: 10 | déplacés: 40 | mis à jour: 40
  | cochés car réglés dans l'app: 0 | réglés dans l'app car cochés ici: 0
```

Tester l'endpoint seul :

```bash
curl -s "https://tm-rapport-services.vercel.app/api/rappels/signalements?key=LA_CLE" | head -c 800
```

## Désinstaller

```bash
./uninstall.sh
```

Les rappels déjà posés restent dans la liste : à toi de les trier.

## Sécurité

`run-rappels.sh` contient la clé → `chmod 700`, non versionné (`.gitignore`).
