// Remplit le champ URL des RDV du calendrier avec le lien client TM Rapport,
// via EventKit (API calendrier d'Apple) — requêtes indexées, ne pilote PAS
// Calendar.app → aucun ralentissement de l'app, même avec des milliers de RDV.
//
// Usage : osascript -l JavaScript tm-calendar-links.js "<BASE_URL>" "<SHARE_LINK_KEY>"
//
// Ne traite que les RDV dont le titre commence par un préfixe autorisé
// (Montage / Services / SAV / Garantie, et variantes "PROV - …"), qui
// contiennent un n° TM, et dont l'URL est encore vide.

function run(argv) {
  ObjC.import('EventKit');
  ObjC.import('Foundation');

  if (argv.length < 2) return 'args manquants';
  const baseURL = argv[0];
  const apiKey = argv[1];

  const app = Application.currentApplication();
  app.includeStandardAdditions = true;

  const store = $.EKEventStore.alloc.init;

  // ── Demande d'accès (macOS 14+ : full access ; sinon ancienne API) ──────────
  let done = false, granted = false;
  if (store.requestFullAccessToEventsWithCompletion) {
    store.requestFullAccessToEventsWithCompletion((g) => { granted = g; done = true; });
  } else {
    store.requestAccessToEntityTypeCompletion(0, (g) => { granted = g; done = true; });
  }
  const rl = $.NSRunLoop.currentRunLoop;
  let spins = 0;
  while (!done && spins < 1200) { // ~60 s max le temps que l'utilisateur clique
    rl.runModeBeforeDate($.NSDefaultRunLoopMode, $.NSDate.dateWithTimeIntervalSinceNow(0.05));
    spins++;
  }
  if (!granted) return 'ACCES CALENDRIER REFUSE';

  // ── Fenêtre : passé proche → ~5 mois devant ────────────────────────────────
  const start = $.NSDate.dateWithTimeIntervalSinceNow(-3 * 86400);
  const end = $.NSDate.dateWithTimeIntervalSinceNow(150 * 86400);
  const pred = store.predicateForEventsWithStartDateEndDateCalendars(start, end, $());
  const events = store.eventsMatchingPredicate(pred);
  const count = events.count;

  const prefixes = ['Montage ', 'Services ', 'SAV ', 'Garantie ', 'PROV '];
  let filled = 0;

  for (let i = 0; i < count; i++) {
    const ev = events.objectAtIndex(i);

    const title = ObjC.unwrap(ev.title) || '';
    if (!title) continue;
    if (!prefixes.some((p) => title.indexOf(p) === 0)) continue;

    // URL déjà présente ? on saute.
    const abs = ObjC.unwrap(ev.URL ? ev.URL.absoluteString : $()) || '';
    if (abs) continue;

    // Extraire "TM-<chiffres>".
    const m = title.match(/TM-\d+/);
    if (!m) continue;
    const tm = m[0];

    // Récupérer le lien client.
    const reqURL = baseURL + '/api/share-link?format=text&key=' + apiKey + '&tm=' + tm;
    let link = '';
    try {
      link = app.doShellScript("/usr/bin/curl -fsS --max-time 20 '" + reqURL + "'");
    } catch (e) {
      link = '';
    }
    if (typeof link !== 'string' || link.indexOf('http') !== 0) continue;

    // Écrire l'URL et enregistrer.
    ev.URL = $.NSURL.URLWithString($(link.trim()));
    try {
      store.saveEventSpanCommitError(ev, 0 /* EKSpanThisEvent */, true, $());
      filled++;
    } catch (e) { /* ignore */ }
  }

  return 'RDV remplis: ' + filled + ' (sur ' + count + ' RDV dans la fenêtre)';
}
