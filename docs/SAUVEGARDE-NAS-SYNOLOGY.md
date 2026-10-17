# Une troisième copie, sur votre Synology DS220+

> Procédure documentée, **non exécutée**. Elle ne demande aucun identifiant
> et n'ouvre aucun accès depuis l'extérieur.

## Pourquoi un troisième niveau

| Niveau | Où | Protège de | Ne protège pas de |
|---|---|---|---|
| 1. Production | Notion + Redis | — | tout |
| 2. Sauvegarde nocturne | pages `[DATA]` du **même** espace Notion | une écriture fautive de l'application | la perte de l'espace Notion |
| 3. Copie hebdomadaire | pièce jointe chiffrée, dans Gmail | la perte de Notion | la perte du compte Gmail |
| **4. Copie NAS** | **votre DS220+, chez vous** | **la perte des comptes en ligne** | l'incendie du local (voir Hyper Backup) |

Le NAS est le seul maillon que personne d'autre que vous ne contrôle.

## La solution retenue : le NAS va CHERCHER, on ne lui envoie rien

C'est le point important. Ouvrir le NAS sur Internet pour que Vercel y
dépose un fichier, c'est exposer un disque qui contient toute l'entreprise.
On fait l'inverse : **le NAS télécharge**, à heure dite, depuis une adresse
protégée par le secret que vous seul détenez. Rien n'est ouvert, rien n'est
exposé, et aucune clé ne quitte la maison.

## Mise en place, en six gestes

### 1. Un dossier partagé

DSM → **Panneau de configuration → Dossier partagé → Créer**
Nom : `TM-Sauvegardes`. Cochez **Chiffrer ce dossier partagé** — la clé
reste sur le NAS, et le disque est illisible s'il est volé.

### 2. Un compte dédié

DSM → **Utilisateur et groupe → Créer** : `tm-archives`, sans accès à
DSM, lecture-écriture sur `TM-Sauvegardes` uniquement. Si ce compte fuit,
il n'ouvre que ce dossier.

### 3. La tâche planifiée

DSM → **Planificateur de tâches → Créer → Tâche planifiée → Script
défini par l'utilisateur**. Nom : « Archive TM ». Utilisateur : `root`
(nécessaire pour écrire dans un dossier chiffré monté). Planning : tous
les **lundis à 7 h** — soit après la copie du dimanche 2 h.

Script :

```sh
#!/bin/sh
# Récupère l'archive chiffrée de TM Rapport Services.
# Le secret n'est PAS écrit ici : il est lu dans un fichier à part,
# accessible du seul root, pour qu'il n'apparaisse ni dans l'interface
# de DSM ni dans les journaux de tâches.
DOSSIER=/volume1/TM-Sauvegardes
SECRET=$(cat /root/.tm-cron-secret)
JOUR=$(date +%Y-%m-%d)

# --fail : une page d'erreur HTML ne doit pas se retrouver enregistrée
# sous le nom d'une archive.
curl --fail --silent --show-error \
     --max-time 600 \
     -H "Authorization: Bearer $SECRET" \
     -o "$DOSSIER/tm-archive-$JOUR.json.tmenc" \
     "https://tm-rapport-services.vercel.app/api/admin/sauvegardes/export-chiffre"

if [ $? -ne 0 ]; then
  echo "ÉCHEC du téléchargement de l'archive du $JOUR" >&2
  exit 1
fi

# Une archive vide ou minuscule est un échec déguisé.
TAILLE=$(wc -c < "$DOSSIER/tm-archive-$JOUR.json.tmenc")
if [ "$TAILLE" -lt 10000 ]; then
  echo "Archive suspecte : $TAILLE octets" >&2
  mv "$DOSSIER/tm-archive-$JOUR.json.tmenc" "$DOSSIER/SUSPECT-$JOUR.bin"
  exit 1
fi

# On garde un an, pas davantage : au-delà, une archive ne sert plus.
find "$DOSSIER" -name "tm-archive-*.tmenc" -mtime +365 -delete
echo "Archive du $JOUR : $TAILLE octets"
```

Puis, **en SSH sur le NAS**, déposez le secret hors du script :

```sh
echo -n 'VOTRE_CRON_SECRET' > /root/.tm-cron-secret && chmod 600 /root/.tm-cron-secret
```

`CRON_SECRET` est déjà défini dans Vercel : c'est celui-là, et il ne doit
jamais être recopié dans le champ « script » de DSM, qui est lisible par
tout administrateur du NAS.

### 4. L'alerte en cas d'échec

Dans la tâche, cochez **« Envoyer les détails d'exécution par e-mail »** et
**« uniquement lorsque le script se termine anormalement »**. Une sauvegarde
qui échoue en silence n'existe pas.

### 5. La vérification, une fois, à la main

C'est l'étape qu'on saute toujours et qui décide de tout :

```sh
node scripts/dechiffrer-archive.mjs \
     /volume1/TM-Sauvegardes/tm-archive-2026-10-19.json.tmenc \
     'votre phrase secrète' \
     /tmp/verif.json
```

Le script affiche le nombre de lignes par liste. S'ils ressemblent à la
réalité, la chaîne entière est bonne.

### 6. Hors du bâtiment

Un NAS protège d'une panne, pas d'un incendie. DSM → **Hyper Backup** →
une copie du dossier `TM-Sauvegardes` vers un disque USB que vous
emportez, ou vers un stockage distant. Les archives étant déjà chiffrées,
leur destination importe peu.

## Ce qui reste à faire côté application

La route `/api/admin/sauvegardes/export-chiffre` **n'existe pas encore** :
l'export actuel exige une session d'administrateur (un cookie), ce qu'un
script de NAS ne peut pas tenir. Il faut une porte à secret, comme pour
les tâches planifiées.

C'est une quinzaine de lignes, calquées sur `/api/cron/export-hebdo` :
même contrôle de `CRON_SECRET`, même `rassemblerLesListes`, même
`chiffrer`, mais le fichier est rendu au lieu d'être expédié. Elle n'a pas
été écrite parce que la mise en production ne l'attendait pas, et qu'une
route qui sort toutes les données mérite d'être ajoutée délibérément, pas
en fin de campagne.

**En attendant**, la copie hebdomadaire par courriel arrive déjà chiffrée
dans votre boîte : une règle Gmail peut l'archiver, et vous pouvez glisser
la pièce jointe sur le NAS. C'est manuel, et c'est déjà trois niveaux.
