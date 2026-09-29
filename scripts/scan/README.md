# Montants — extraction depuis les dossiers comptables

Remplit le champ Notion « Montant OFR » à partir des offres PDF, puis le tient
à jour chaque jour. Sans ce montant, aucune statistique ne peut parler
d'argent : le taux de transformation compte des mesures, le carnet compte des
cabines, la rentabilité n'existe pas.

## La règle qui prime sur tout

**Les dossiers sources sont lus, jamais modifiés.**

```
~/Desktop/TM Douche Montage Sàrl/Devis
~/Desktop/TM - Administrations/Factures
~/Desktop/TM - Administrations/Dépenses
```

Aucun script n'y écrit, n'y crée ni n'y efface quoi que ce soit. Les sorties
vont dans `data/`, qui est ignoré par git — ces montants ne doivent partir ni
sur GitHub ni sur Vercel.

## Les trois temps

| Script | Ce qu'il fait | Écrit dans Notion |
|---|---|---|
| `extraire.mjs` | Lit les PDF, en sort les montants | non |
| `rapprocher.mjs` | Relie les offres aux fiches, produit un contrôle | non |
| `ecrire.mjs` | Pose les montants manquants | **oui, avec `--ecrire`** |

L'essai à blanc est le défaut de `ecrire.mjs` : il faut `--ecrire` pour qu'une
requête parte. Une erreur de chemin ne peut donc pas se traduire par mille
cinq cents écritures.

## Ce qui n'est jamais écrasé

Une fiche portant déjà un montant est écartée par le rapprochement. Une
correction faite à la main tient : le passage du lendemain ne la défait pas.

## Le passage quotidien

`com.tmrapport.montants` tourne à 6 h, avant le rapport du matin. Si le Mac
dort à cette heure-là, launchd lance le passage manqué au réveil.

```bash
launchctl list | grep montants     # présent ?
tail -30 /tmp/tm-montants.log      # dernier passage
bash scripts/scan/run-scan.sh      # à la main
```

Pour l'arrêter : `launchctl unload ~/Library/LaunchAgents/com.tmrapport.montants.plist`

## Deux pièges rencontrés, pour mémoire

**Un numéro de référence lu comme un montant** a produit une facture à 29,8
millions de francs — des colonnes de tableau recollées par l'extracteur de
texte. Le motif exige désormais des milliers correctement séparés, ou au plus
six chiffres d'affilée, et un plafond par document rattrape le reste.

**Deux numérotations d'offre coexistent** : l'ancienne à cinq chiffres
(`TM-00172`), l'actuelle à sept (`TM-2600885`), avec parfois un suffixe de
révision. La première version en ignorait 628.

## Ce qui ne marche pas : les charges

Les factures fournisseurs et les dépenses sont des documents de tiers, sans
format commun. **18 % seulement sont lisibles** — le reste est composé de PDF
sans texte, de photos de tickets, ou de mises en page où aucun total n'est
identifiable. Le chiffre obtenu ne veut donc rien dire et n'est affiché nulle
part. Les rendre exploitables demanderait de la reconnaissance de caractères,
et resterait fragile sur un ticket photographié de travers.
