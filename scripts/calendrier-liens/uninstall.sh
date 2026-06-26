#!/bin/bash
# Désinstalle l'agent calendrier → liens.
LABEL="com.tmrapport.calendar-links"
UID_NUM="$(id -u)"
launchctl bootout "gui/$UID_NUM/$LABEL" 2>/dev/null || true
rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
echo "🗑️  Agent désinstallé : $LABEL"
