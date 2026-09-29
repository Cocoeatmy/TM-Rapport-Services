#!/bin/bash
#
# Rafraîchissement quotidien des montants — LECTURE SEULE sur vos dossiers.
#
# Trois temps : relire les documents comptables, rapprocher les offres des
# fiches Notion, puis poser les montants MANQUANTS. Une fiche déjà renseignée
# n'est jamais touchée : le rapprochement l'écarte en amont, donc une
# correction faite à la main tient, et le passage du lendemain ne la défait pas.
#
# Le balayage complet prend une dizaine de secondes. Le faire chaque jour
# plutôt qu'en fin de mois ne coûte rien et garde les chiffres à jour.

set -u
cd "$(dirname "$0")/../.." || exit 1

# Verrou : si un passage tourne encore, on saute plutôt que de se chevaucher.
LOCKDIR="/tmp/tm-scan-montants.lock.d"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  echo "[$(date '+%d.%m %H:%M')] déjà en cours, on saute."
  exit 0
fi
trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT

echo "═══ $(date '+%d.%m.%Y %H:%M') ═══"

export $(grep -E '^(NOTION_TOKEN|NOTION_DATABASE_ID)=' .env.local | xargs) 2>/dev/null

node scripts/scan/extraire.mjs   --sortie data/scan.json          || exit 1
node scripts/scan/rapprocher.mjs --sortie data/rapprochement.csv  || exit 1
node scripts/scan/ecrire.mjs     --ecrire                         || exit 1

echo "Terminé."
