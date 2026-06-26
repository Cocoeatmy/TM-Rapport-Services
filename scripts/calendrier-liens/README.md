# Agent calendrier → liens client

Remplit automatiquement le champ **URL** des RDV de ton calendrier Apple avec le
lien client de l'app, à partir du numéro TM contenu dans le titre.

Exemple : tu crées le RDV `Montage - TM-2600508 - CANAsanitaire Sàrl …` →
quelques secondes plus tard, son champ URL contient
`https://tm-rapport-services.vercel.app/client/<token>`.

## Ce qui est traité

Les RDV dont le titre **commence par** l'un de ces préfixes **et** contiennent un
n° TM **et** dont l'URL est encore vide :

- `Montage - TM-…`, `Services - TM-…`, `SAV - TM-…`, `Garantie - TM-…`
- et toutes les variantes `PROV - …` (préfixe `PROV `).

Les RDV qui ont déjà un lien ne sont jamais touchés.

## Déclenchement

Un agent **launchd** surveille la base du calendrier
(`~/Library/Group Containers/group.com.apple.calendar/Calendar.sqlitedb`) et se
lance **dès qu'un RDV est ajouté / modifié / synchronisé** (y compris depuis
l'iPhone), avec un minimum de 45 s entre deux passages.

Le scan utilise **EventKit** (`tm-calendar-links.js`, exécuté par
`osascript -l JavaScript`) : requêtes indexées en millisecondes qui **ne pilotent
pas Calendar.app**, donc aucun ralentissement de l'application — y compris avec
des milliers de RDV. Un anti-rebond + un verrou évitent les passages en rafale.

## Prérequis côté serveur (à faire 1× sur Vercel)

Ajouter la variable d'environnement **`SHARE_LINK_KEY`** au projet Vercel avec la
valeur fournie (la même que dans `run-calendar-links.sh`), puis redéployer.
Sans elle, l'endpoint `/api/share-link` refuse les requêtes.

## Installation

```bash
cd "scripts/calendrier-liens"
./install.sh
# puis un premier passage manuel pour accepter l'autorisation « Calendrier » :
./run-calendar-links.sh
```

À la première exécution, macOS demande l'autorisation d'**accéder au Calendrier**
→ accepter. (System Settings → Confidentialité et sécurité → Calendriers.)

## Vérifier / déboguer

```bash
launchctl list | grep tmrapport          # agent chargé ?
tail -f /tmp/tm-calendar-links.log        # journaux
cat /tmp/tm-calendar-links.err            # erreurs

# Tester l'endpoint directement :
curl "https://tm-rapport-services.vercel.app/api/share-link?format=text&key=LA_CLE&tm=TM-2600508"
```

## Désinstaller

```bash
./uninstall.sh
```

## Sécurité

`run-calendar-links.sh` contient la clé secrète → laissé en `chmod 700`
(lisible par toi seul). Pour changer la clé : la modifier ici **et** dans Vercel.
