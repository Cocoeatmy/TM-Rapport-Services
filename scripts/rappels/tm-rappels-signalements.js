// Pose les signalements encore ouverts dans une liste de l'app Rappels, via
// EventKit — la même API que l'agent calendrier, avec l'entité « rappel » au
// lieu de « événement ».
//
// Usage : osascript -l JavaScript tm-rappels-signalements.js "<BASE_URL>" "<SHARE_LINK_KEY>" ["<NOM DE LA LISTE>"]
//
// Ce que le script NE fait pas, volontairement :
//
//  • il n'invente rien. Titre, notes, lien, priorité viennent tels quels de
//    /api/rappels/signalements, où la mise en forme est testée. Ici on ne
//    fait que comparer et écrire ;
//
//  • il ne touche QUE les rappels portant son marqueur « [tm:…] ». Un rappel
//    écrit à la main dans la même liste n'est jamais modifié ni coché ;
//
//  • cocher ici RÈGLE le signalement dans l'app : la synchro est un
//    aller-retour. Régler dans l'app coche le rappel, cocher le rappel règle
//    dans l'app — avec un commentaire qui dit d'où vient la clôture ;
//
//  • il n'écrit ni échéance ni drapeau. La moitié des signalements a plus
//    d'un mois : des échéances les afficheraient tous en retard dès le
//    premier jour, et la liste serait coupée dans la semaine. L'ancienneté
//    passe par la priorité, qui trie sans sonner. Une échéance posée à la
//    main est donc conservée.

function run(argv) {
  ObjC.import('EventKit');
  ObjC.import('Foundation');

  if (argv.length < 2) return 'args manquants';
  const baseURL = String(argv[0]).replace(/\/+$/, '');
  const apiKey = argv[1];
  const listeVoulue = argv[2] || 'Signalements';
  // Repli : la liste telle qu'elle existe aujourd'hui chez lui.
  const listeRepli = 'TM Douche Montage';

  const app = Application.currentApplication();
  app.includeStandardAdditions = true;

  const store = $.EKEventStore.alloc.init;
  const REMINDER = 1; // EKEntityTypeReminder
  const FULL = 3;     // EKAuthorizationStatusFullAccess
  const rl = $.NSRunLoop.currentRunLoop;

  // ── Accès Rappels ───────────────────────────────────────────────────────────
  // Même prudence que pour le calendrier : on lit le statut (synchrone et
  // fiable) et on re-sonde après la demande, sans se fier au callback.
  let status = Number($.EKEventStore.authorizationStatusForEntityType(REMINDER));
  if (status !== FULL) {
    if (store.requestFullAccessToRemindersWithCompletion) {
      store.requestFullAccessToRemindersWithCompletion(() => {});
    } else {
      store.requestAccessToEntityTypeCompletion(REMINDER, () => {});
    }
    let spins = 0;
    while (status !== FULL && spins < 1200) { // ~60 s, le temps du clic
      rl.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.05));
      status = Number($.EKEventStore.authorizationStatusForEntityType(REMINDER));
      spins++;
    }
  }
  if (status !== FULL) return 'ACCES RAPPELS REFUSE (statut ' + status + ')';

  // ── La liste cible ──────────────────────────────────────────────────────────
  //
  // Une LISTE, et non une « section » : l'app Rappels sait découper une liste
  // en sections, mais Apple ne les expose NULLE PART — ni `EKReminder.section`
  // (le sélecteur n'existe pas), ni le dictionnaire AppleScript de Rappels,
  // qui ne connaît que compte / liste / rappel. Aucun programme ne peut donc
  // déposer quoi que ce soit dans une section. La liste du même nom est le
  // seul équivalent atteignable ; rangée dans un groupe, elle donne le même
  // classement à l'écran.
  //
  // Si elle n'existe pas, on la crée : mieux vaut une liste juste que des
  // rappels au mauvais endroit.
  let toutes = store.calendarsForEntityType(REMINDER);
  const noms = [];
  let liste = null;
  for (let i = 0; i < toutes.count; i++) {
    const c = toutes.objectAtIndex(i);
    const n = ObjC.unwrap(c.title) || '';
    noms.push(n);
    if (n === listeVoulue) liste = c;
  }
  if (!liste) {
    const modele = store.defaultCalendarForNewReminders;
    if (modele.isNil()) return 'AUCUNE LISTE DE RAPPELS (listes vues : ' + noms.join(' | ') + ')';
    const neuve = $.EKCalendar.calendarForEntityTypeEventStore(REMINDER, store);
    neuve.title = $(listeVoulue);
    neuve.source = modele.source;
    try { store.saveCalendarCommitError(neuve, true, $()); } catch (e) {
      return 'CREATION DE LA LISTE "' + listeVoulue + '" IMPOSSIBLE : ' + e;
    }
    liste = neuve;
    toutes = store.calendarsForEntityType(REMINDER);
  }
  const nomListe = ObjC.unwrap(liste.title);

  // ── Ce que l'app dit être ouvert ────────────────────────────────────────────
  // Passage par un fichier : la réponse fait plusieurs dizaines de kilo-octets,
  // et la faire transiter par la sortie d'un shell est un pari inutile.
  const tmp = '/tmp/tm-rappels-' + $.NSProcessInfo.processInfo.processIdentifier + '.json';
  const reqURL = baseURL + '/api/rappels/signalements?key=' + apiKey;
  try {
    app.doShellScript("/usr/bin/curl -fsS --max-time 60 -o " + JSON.stringify(tmp)
      + " " + JSON.stringify(reqURL));
  } catch (e) {
    return 'APPEL API ECHOUE : ' + e;
  }
  let data = null;
  try {
    const brut = ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(tmp, $.NSUTF8StringEncoding, $()));
    data = JSON.parse(brut);
  } catch (e) { data = null; }
  try { $.NSFileManager.defaultManager.removeItemAtPathError(tmp, $()); } catch (e) {}
  if (!data || !data.ok || !Array.isArray(data.liste)) return 'REPONSE API ILLISIBLE';

  const voulus = new Map();
  data.liste.forEach(function (r) { if (r && r.cle) voulus.set(r.cle, r); });

  // ── Ce qui est déjà posé, cochés compris ────────────────────────────────────
  //
  // On regarde TOUTES les listes, pas seulement la cible. Deux raisons :
  //  • les cochés comptent — sans eux, un rappel traité à la main renaîtrait
  //    au passage suivant ;
  //  • un rappel déplacé à la main vers une autre liste reste reconnu. Sans
  //    cela, le jour où la liste cible change, l'agent recréerait tout en
  //    double et laisserait l'ancienne série orpheline.
  // Seuls les rappels portant le marqueur sont retenus : le reste de tes
  // listes personnelles n'est ni lu ni touché au-delà de ce filtre.
  const pred = store.predicateForRemindersInCalendars(toutes);
  let trouves = null;
  store.fetchRemindersMatchingPredicateCompletion(pred, function (res) { trouves = res; });
  let tours = 0;
  while (trouves === null && tours < 1200) { // ~60 s
    rl.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.05));
    tours++;
  }
  if (trouves === null) return 'LECTURE DES RAPPELS EN TIMEOUT';

  const MARQUEUR = /\[(tm:(?:piece|defaut):[A-Za-z0-9_-]+)\]/;
  const existants = new Map();
  for (let i = 0; i < trouves.count; i++) {
    const rem = trouves.objectAtIndex(i);
    const notes = ObjC.unwrap(rem.notes) || '';
    const m = notes.match(MARQUEUR);
    if (m) existants.set(m[1], rem);
  }

  let crees = 0, majs = 0, deplaces = 0, coches = 0;
  // Cochés ici alors que l'app les croit ouverts → à régler dans l'app.
  const aCloturer = [];

  // ── Créer, déplacer, mettre à jour ──────────────────────────────────────────
  voulus.forEach(function (r, cle) {
    const deja = existants.get(cle);
    if (!deja) {
      const rem = $.EKReminder.reminderWithEventStore(store);
      rem.calendar = liste;
      rem.title = $(r.titre);
      rem.notes = $(r.notes);
      rem.priority = r.priorite;
      if (r.url) rem.URL = $.NSURL.URLWithString($(r.url));
      try { store.saveReminderCommitError(rem, true, $()); crees++; } catch (e) {}
      return;
    }

    /* Coché ici alors que le signalement est encore ouvert dans l'app : on le
       remonte pour le régler là-bas. Au passage suivant, le signalement ne
       sera plus dans la liste des ouverts et le rappel restera coché, sans
       qu'on ait à le rouvrir ni à le combattre. */
    if (deja.completed) { aCloturer.push(cle); return; }

    /* Rappel posé ailleurs — liste renommée, ou déplacé à la main : on le
       ramène dans la liste cible plutôt que d'en créer un second. */
    let bouge = false;
    if (ObjC.unwrap(deja.calendar.calendarIdentifier) !== ObjC.unwrap(liste.calendarIdentifier)) {
      deja.calendar = liste;
      bouge = true;
    }

    const titreActuel = ObjC.unwrap(deja.title) || '';
    const notesActuelles = ObjC.unwrap(deja.notes) || '';
    const urlActuelle = ObjC.unwrap(deja.URL ? deja.URL.absoluteString : $()) || '';
    const prioActuelle = Number(deja.priority);
    const change = (titreActuel !== r.titre) || (notesActuelles !== r.notes)
      || (prioActuelle !== r.priorite) || (urlActuelle !== (r.url || ''));
    if (!change && !bouge) return;

    if (titreActuel !== r.titre) deja.title = $(r.titre);
    if (notesActuelles !== r.notes) deja.notes = $(r.notes);
    if (prioActuelle !== r.priorite) deja.priority = r.priorite;
    if (r.url && urlActuelle !== r.url) deja.URL = $.NSURL.URLWithString($(r.url));
    try {
      store.saveReminderCommitError(deja, true, $());
      if (bouge) deplaces++;
      if (change) majs++;
    } catch (e) {}
  });

  // ── Cocher ce qui a été réglé dans l'app ────────────────────────────────────
  // On coche plutôt qu'on ne supprime : la trace de ce qui a été traité a de
  // la valeur, et supprimer ce que l'on n'a pas créé est un geste qu'un agent
  // ne devrait jamais faire seul.
  existants.forEach(function (rem, cle) {
    if (voulus.has(cle)) return;
    if (rem.completed) return;
    rem.completed = true;
    try { store.saveReminderCommitError(rem, true, $()); coches++; } catch (e) {}
  });

  // ── Remonter vers l'app ce qui a été coché ici ──────────────────────────────
  let remontes = 0;
  if (aCloturer.length > 0) {
    const corps = JSON.stringify({ key: apiKey, cloturer: aCloturer });
    const envoi = '/tmp/tm-rappels-post-' + $.NSProcessInfo.processInfo.processIdentifier + '.json';
    try {
      $(corps).writeToFileAtomicallyEncodingError(envoi, true, $.NSUTF8StringEncoding, $());
      const rep = app.doShellScript("/usr/bin/curl -fsS --max-time 60 -X POST"
        + " -H 'Content-Type: application/json' --data-binary @" + JSON.stringify(envoi)
        + " " + JSON.stringify(baseURL + '/api/rappels/signalements'));
      const j = JSON.parse(rep);
      remontes = (j && j.ok) ? Number(j.clos || 0) : 0;
    } catch (e) { remontes = -1; }
    try { $.NSFileManager.defaultManager.removeItemAtPathError(envoi, $()); } catch (e) {}
  }

  return 'liste "' + nomListe + '" — ouverts: ' + voulus.size
    + ' | créés: ' + crees + ' | déplacés: ' + deplaces + ' | mis à jour: ' + majs
    + ' | cochés car réglés dans l\'app: ' + coches
    + ' | réglés dans l\'app car cochés ici: ' + (remontes < 0 ? 'ECHEC' : remontes);
}
