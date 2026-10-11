# Agent signalements → app Rappels

Pose dans l'app **Rappels** d'Apple tous les signalements (pièces manquantes et
défauts) encore ouverts, et **coche** ceux que tu règles dans l'app.

Un rappel porte : le **n° TM**, le lot, le type, le statut, **qui** a signalé et
**quand** (jour et heure, plus l'ancienneté en jours), la description, le dernier
échange, les **adresses des photos**, le lien pour **traiter** le signalement et
le lien du **rapport PDF**.

## Sections ou listes : à lire avant d'installer

Dans Rappels, tu as une **liste** « TM Douche Montage » découpée en **sections**
(Facturations, Signalements, Devis, Mesures, Montages).

**EventKit — l'API d'Apple — n'expose pas les sections.** Vérifié sur ce Mac :
`EKReminder` n'a ni `section` ni `sectionIdentifier`. Aucun programme ne peut
donc déposer un rappel dans une section précise ; il atterrirait dans la liste,
hors section.

Deux façons de faire, au choix :

**A. Un groupe de listes (recommandé).** Dans Rappels : *Fichier → Nouveau
groupe*, nomme-le « TM Douche Montage », puis crée dedans une liste
**« Signalements »** (et plus tard « Facturations », « Devis »…). Visuellement
c'est le même classement ; techniquement chaque liste est adressable. L'agent
écrit alors dans la liste « Signalements » et ne touche à rien d'autre.

**B. Ne rien changer.** Si la liste « Signalements » n'existe pas, l'agent se
rabat sur la liste **« TM Douche Montage »** et y dépose les rappels hors
section. Ça marche, c'est juste moins rangé.

Le nom de la liste visée se règle dans `run-rappels.sh` (variable `LISTE`).

## Ce que l'agent ne fait pas, volontairement

- **Il ne touche qu'aux rappels portant son marqueur `[tm:…]`** (en fin de
  notes). Un rappel que tu écris à la main dans la même liste n'est jamais
  modifié ni coché.
- **Il ne ressuscite pas un rappel que tu as coché.** Si tu coches alors que le
  signalement est encore ouvert dans l'app, c'est un geste délibéré : il est
  respecté. Pour le faire revenir, décoche-le.
- **Il ne pose ni échéance ni drapeau.** La moitié des signalements ouverts a
  plus d'un mois : des échéances les afficheraient tous en retard dès le premier
  jour, et tu couperais les notifications de Rappels dans la semaine.
  L'ancienneté passe par la **priorité** — plus de 60 jours : haute, plus de
  21 jours : moyenne, sinon basse. Une échéance que tu poses à la main est
  conservée.
- **Il ne supprime jamais rien.** Un signalement réglé fait cocher son rappel,
  pas disparaître.
- **Il n'écrit rien dans l'app ni dans Notion.** Le trajet est à sens unique :
  app → Rappels.
- **Les constats « avant intervention » sont écartés.** Ce sont des états des
  lieux photographiés avant de poser, pas des problèmes à réparer.
- **Les photos ne sont pas jointes** : `EKCalendarItem.attachments` est en
  lecture seule, aucune API publique n'en ajoute. Les notes portent leurs
  adresses (cliquables), plus le rapport PDF qui les rassemble et s'ouvre sans
  se connecter.

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
session. Un signalement n'est pas une urgence à la seconde, et interroger Notion
plus souvent ne servirait à rien.

> ⚠️ L'agent tourne sur **ce Mac**. Mac éteint = liste figée (mais jamais
> fausse : rien n'est effacé, les rappels posés restent).

## Vérifier / déboguer

```bash
launchctl list | grep tmrapport.rappels   # agent chargé ?
tail -f /tmp/tm-rappels.log               # journaux
cat /tmp/tm-rappels.err                   # erreurs
```

Chaque passage écrit une ligne de bilan :
`liste "Signalements" — ouverts: 40 | créés: 2 | mis à jour: 1 | cochés (réglés): 3 | laissés cochés: 0`

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
