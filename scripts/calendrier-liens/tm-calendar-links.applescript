-- Remplit automatiquement le champ URL des RDV du calendrier avec le lien
-- client de l'app TM Rapport, à partir du numéro TM contenu dans le titre.
--
-- Usage : osascript tm-calendar-links.applescript "<BASE_URL>" "<SHARE_LINK_KEY>"
-- Appelé par run-calendar-links.sh (lui-même déclenché par l'agent launchd).
--
-- Ne traite que les RDV dont le titre commence par un préfixe autorisé
-- (Montage / Services / SAV / Garantie, et les variantes "PROV - …")
-- ET qui contiennent un n° TM ET dont le champ URL est encore vide.

on run argv
	if (count of argv) < 2 then return "args manquants"
	set baseURL to item 1 of argv
	set apiKey to item 2 of argv

	-- Fenêtre temporelle : on regarde du passé proche jusqu'à ~7 mois devant.
	set startWindow to (current date) - (3 * days)
	set endWindow to (current date) + (210 * days)

	-- Préfixes de titre autorisés (suivis d'un espace).
	set allowedPrefixes to {"Montage ", "Services ", "SAV ", "Garantie ", "PROV "}

	set filledCount to 0

	tell application "Calendar"
		set calList to every calendar
		repeat with cal in calList
			set evs to {}
			try
				set evs to (every event of cal whose start date is greater than or equal to startWindow and start date is less than or equal to endWindow)
			on error
				set evs to {}
			end try

			repeat with ev in evs
				set s to ""
				try
					set s to summary of ev as string
				end try
				if s is not "" then
					if my startsWithAllowed(s, allowedPrefixes) then
						-- URL déjà présente ? on saute.
						set u to missing value
						try
							set u to url of ev
						end try
						if u is missing value or (u as string) is "" then
							set tmId to my extractTM(s)
							if tmId is not "" then
								set reqURL to baseURL & "/api/share-link?format=text&key=" & apiKey & "&tm=" & tmId
								set theLink to ""
								try
									set theLink to do shell script "/usr/bin/curl -fsS --max-time 20 " & quoted form of reqURL
								end try
								if theLink starts with "http" then
									try
										set url of ev to theLink
										set filledCount to filledCount + 1
									end try
								end if
							end if
						end if
					end if
				end if
			end repeat
		end repeat
	end tell

	return "RDV remplis: " & filledCount
end run

-- Vrai si s commence par l'un des préfixes autorisés.
on startsWithAllowed(s, prefixes)
	repeat with p in prefixes
		set p to p as string
		if (length of s) ≥ (length of p) then
			if (text 1 thru (length of p) of s) is p then return true
		end if
	end repeat
	return false
end startsWithAllowed

-- Extrait "TM-" suivi des chiffres (ex. "TM-2600508"). "" si absent.
on extractTM(s)
	set ix to offset of "TM-" in s
	if ix = 0 then return ""
	set afterTM to text (ix + 3) thru -1 of s
	set digits to ""
	repeat with c in characters of afterTM
		set c to c as string
		if c ≥ "0" and c ≤ "9" then
			set digits to digits & c
		else
			exit repeat
		end if
	end repeat
	if digits is "" then return ""
	return "TM-" & digits
end extractTM
