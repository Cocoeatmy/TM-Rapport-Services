import SwiftUI
import WebKit
import Network
#if os(iOS)
import UIKit
#else
import AppKit
#endif

/// La vue web de TM Rapport, et tout ce qu'un navigateur fait d'habitude sans
/// qu'on y pense.
///
/// Une vue web d'application n'est PAS Safari. Laissée à elle-même, elle
/// n'affiche aucune boîte de dialogue — les `confirm()` du site renverraient
/// « non » en silence, et les suppressions deviendraient impossibles ; elle
/// n'ouvre pas les fenêtres `target=_blank` ; elle n'enregistre aucun
/// document. Ce fichier rend tout cela, sans toucher au site.
@MainActor
final class Navigateur: NSObject, ObservableObject {

    /// UNE seule vue web pour toute l'application. Deux vues feraient tourner
    /// deux fois les files d'envoi du site, chacune ignorant l'autre — et une
    /// même photo pourrait partir deux fois. C'est aussi elle que réveille
    /// l'envoi en arrière-plan.
    static let principal = Navigateur()

    /// Le pont vers le coffre natif (voir PontNatif).
    let pont = PontNatif(coffre: .partage)
    /// Ce qui attend encore d'être envoyé, selon le dernier relevé du site.
    private(set) var resteAEnvoyer = 0
    private var synchroEnCours: Task<[String: Any]?, Never>?

    enum Etat: Equatable {
        case chargement
        case pret
        /// Le site n'a pas pu s'ouvrir et rien n'était en réserve.
        case injoignable(String)
    }

    @Published private(set) var etat: Etat = .chargement
    /// La couleur que le site déclare pour sa barre du haut (`theme-color`).
    @Published private(set) var couleurTheme: Color?
    /// La couleur du fond de page, pour le bas de l'écran sous la barre d'accueil.
    @Published private(set) var couleurFond: Color?
    /// Une fenêtre ouverte par le site (`window.open`, `target=_blank`).
    @Published var fenetreSecondaire: FenetreSecondaire?
    /// Un document à partager (iOS) une fois téléchargé.
    @Published var documentAPartager: DocumentPartage?
    /// La version minimale exigée par le site, quand cette app est plus
    /// ancienne : une partie native dont le site a désormais besoin manque.
    @Published var miseAJourRequise: String?
    private var dernierControle: Date?

    let vue: WKWebView
    private var observations: [NSKeyValueObservation] = []
    private let surveillance = NWPathMonitor()
    private var reseauDisponible = true
    /// Les téléchargements en cours, et ce qu'on fera du fichier ensuite.
    private var telechargements: [ObjectIdentifier: (destination: URL?, partager: Bool)] = [:]

    override init() {
        let conf = WKWebViewConfiguration()
        // Le magasin PERSISTANT : la session, IndexedDB (les photos en
        // attente) et les réserves du service worker survivent à la
        // fermeture de l'app et au redémarrage de l'appareil.
        conf.websiteDataStore = .default()
        // Condition posée par iOS pour activer le service worker dans une
        // application : les domaines du site sont déclarés dans
        // `WKAppBoundDomains`, et la vue s'y limite.
        conf.limitsNavigationsToAppBoundDomains = true
        conf.applicationNameForUserAgent = Configuration.nomAgent
        conf.preferences.javaScriptCanOpenWindowsAutomatically = true
        conf.userContentController.addScriptMessageHandler(pont, contentWorld: .page, name: PontNatif.nom)
        #if os(iOS)
        conf.allowsInlineMediaPlayback = true
        conf.mediaTypesRequiringUserActionForPlayback = []
        #endif

        vue = WKWebView(frame: .zero, configuration: conf)
        super.init()
        pont.surEtat = { [weak self] e in self?.noterEtat(e) }
        DispatchQueue.global(qos: .utility).async { Coffre.partage.entretenir() }

        vue.navigationDelegate = self
        vue.uiDelegate = self
        // Le geste de retour, au bord de l'écran ou au trackpad.
        vue.allowsBackForwardNavigationGestures = true
        #if os(iOS)
        // La page occupe toute la hauteur jusqu'au bord, fond compris, comme
        // dans Safari ; sans cela, une bande blanche apparaît sous la page.
        vue.scrollView.contentInsetAdjustmentBehavior = .never
        #endif
        // Safari → Développement → cet appareil : les journaux du site,
        // indispensables pour diagnostiquer sur chantier.
        if #available(iOS 16.4, macOS 13.3, *) { vue.isInspectable = true }
        #if os(iOS)
        vue.isOpaque = false
        vue.backgroundColor = .clear
        vue.scrollView.backgroundColor = .clear
        #else
        vue.setValue(false, forKey: "drawsBackground")
        #endif

        observations.append(vue.observe(\.themeColor, options: [.initial, .new]) { [weak self] v, _ in
            let c = v.themeColor
            Task { @MainActor in self?.couleurTheme = c.map(Navigateur.couleur) }
        })
        observations.append(vue.observe(\.underPageBackgroundColor, options: [.initial, .new]) { [weak self] v, _ in
            let c = v.underPageBackgroundColor
            Task { @MainActor in self?.couleurFond = c.map(Navigateur.couleur) }
        })

        // Le réseau revient pendant qu'on affiche « injoignable » : on
        // retente seul, sans attendre un geste.
        surveillance.pathUpdateHandler = { [weak self] chemin in
            let ok = chemin.status == .satisfied
            Task { @MainActor in
                guard let self else { return }
                let revenu = ok && !self.reseauDisponible
                self.reseauDisponible = ok
                if revenu, case .injoignable = self.etat { self.charger() }
                // Le réseau revient : ce qui attendait part tout de suite.
                if revenu, self.etat == .pret { Task { await self.synchroniser(raison: "reseau") } }
            }
        }
        surveillance.start(queue: DispatchQueue(label: "tm.reseau"))

        charger()
    }

    deinit { surveillance.cancel() }

    // MARK: - Commandes

    func charger() {
        if Configuration.sousTestsUnitaires { return }
        etat = .chargement
        #if DEBUG
        if essaisLocaux {
            preparerEssais { [weak self] in self?.vue.load(URLRequest(url: Configuration.adresse)) }
            return
        }
        #endif
        vue.load(URLRequest(url: Configuration.adresse))
    }

    #if DEBUG
    // MARK: - Essais automatisés (compilations Debug, serveur LOCAL seulement)

    /// Les commandes d'essai ne valent que vers cette machine : absentes des
    /// versions installées (Release), sans effet sur le site en ligne.
    private var essaisLocaux: Bool {
        guard let hote = Configuration.adresse.host, ["localhost", "127.0.0.1"].contains(hote) else { return false }
        let d = UserDefaults.standard
        return d.string(forKey: "TMJetonTest") != nil || d.bool(forKey: "TMEssais")
            || d.bool(forKey: "TMEffacerStockageWeb") || d.string(forKey: "TMScriptEssai") != nil
    }
    private var scriptEssaiFait = false

    /// - `-TMEffacerStockageWeb YES` : efface IndexedDB et le stockage local
    ///   de localhost — exactement ce que fait iOS quand il fait de la place.
    /// - `-TMEssais YES` : le site expose `window.tmApple.essais`.
    /// - `-TMJetonTest <jeton>` : une session de test.
    private func preparerEssais(_ suite: @escaping () -> Void) {
        let d = UserDefaults.standard
        let magasin = vue.configuration.websiteDataStore
        let hote = Configuration.adresse.host ?? "localhost"
        if d.bool(forKey: "TMEssais") {
            vue.configuration.userContentController.addUserScript(WKUserScript(
                source: "window.__tmEssaisApple = true;", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        let poserJeton = {
            guard let jeton = d.string(forKey: "TMJetonTest"),
                  let biscuit = HTTPCookie(properties: [.domain: hote, .path: "/", .name: "auth-token", .value: jeton])
            else { suite(); return }
            magasin.httpCookieStore.setCookie(biscuit) { suite() }
        }
        guard d.bool(forKey: "TMEffacerStockageWeb") else { poserJeton(); return }
        let types: Set<String> = [WKWebsiteDataTypeIndexedDBDatabases, WKWebsiteDataTypeLocalStorage]
        magasin.fetchDataRecords(ofTypes: types) { [weak self] enregistrements in
            let locaux = enregistrements.filter { $0.displayName == "localhost" || $0.displayName == "127.0.0.1" }
            magasin.removeData(ofTypes: types, for: locaux) {
                self?.journal("ESSAI stockage web effacé (\(locaux.map(\.displayName)))")
                poserJeton()
            }
        }
    }

    /// `-TMScriptEssai "<js>"` : exécuté une fois, quelques secondes après le
    /// chargement ; le résultat part dans la console (`ESSAI …`).
    private func executerScriptEssai() {
        guard essaisLocaux, !scriptEssaiFait, let script = UserDefaults.standard.string(forKey: "TMScriptEssai") else { return }
        scriptEssaiFait = true
        let vue = self.vue
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in
            vue.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { (r: Result<Any, Error>) in
                Task { @MainActor in
                    switch r {
                    case .success(let v): self?.journal("ESSAI \(v)")
                    case .failure(let e): self?.journal("ESSAI erreur \(e.localizedDescription)")
                    }
                }
            }
        }
    }
    #endif

    func recharger() {
        if vue.url == nil || etat != .pret { charger() } else { vue.reload() }
    }

    // MARK: - Synchronisation

    /// Demande au site d'envoyer tout ce qui attend (`window.tmApple`), et
    /// rend ce qui reste ensuite. Une seule à la fois ; `nil` si la page
    /// n'est pas là ou ne connaît pas encore le pont.
    @discardableResult
    func synchroniser(raison: String, delai: TimeInterval = 25) async -> [String: Any]? {
        if let enCours = synchroEnCours { return await enCours.value }
        let tache = Task<[String: Any]?, Never> { @MainActor in
            defer { self.synchroEnCours = nil }
            // Lancée en arrière-plan, la page se charge peut-être encore.
            let debut = Date()
            while self.etat != .pret, Date().timeIntervalSince(debut) < 12 {
                try? await Task.sleep(nanoseconds: 250_000_000)
            }
            guard self.etat == .pret else { return nil }
            let script = "if (!window.tmApple || !window.tmApple.synchroniser) return null; return await window.tmApple.synchroniser(raison);"
            let resultat = await withTaskGroup(of: [String: Any]?.self) { groupe -> [String: Any]? in
                groupe.addTask { @MainActor in
                    let r = try? await self.vue.callAsyncJavaScript(script, arguments: ["raison": raison], contentWorld: .page)
                    return r as? [String: Any]
                }
                groupe.addTask {
                    try? await Task.sleep(nanoseconds: UInt64(delai * 1_000_000_000))
                    return nil
                }
                let premier = await groupe.next() ?? nil
                groupe.cancelAll()
                return premier
            }
            if let resultat { self.noterEtat(resultat) }
            self.journal("SYNCHRO \(raison) → \(resultat.map { "\($0)" } ?? "sans réponse")")
            return resultat
        }
        synchroEnCours = tache
        return await tache.value
    }

    private func noterEtat(_ e: [String: Any]) {
        let n = { (cle: String) in (e[cle] as? NSNumber)?.intValue ?? 0 }
        resteAEnvoyer = n("photosEnAttente") + n("requetesEnAttente") + n("rapportsNonEnvoyes")
    }

    func reculer() { if vue.canGoBack { vue.goBack() } }
    func avancer() { if vue.canGoForward { vue.goForward() } }

    // MARK: - Outils

    static func couleur(_ c: PlatformColor) -> Color {
        #if os(iOS)
        return Color(uiColor: c)
        #else
        return Color(nsColor: c)
        #endif
    }

    /// Un lien qui n'est pas TM Rapport : il part dans l'application qui le
    /// connaît — Plans, Waze, Mail, Téléphone, Safari.
    func ouvrirAilleurs(_ url: URL) {
        #if os(iOS)
        UIApplication.shared.open(url)
        #else
        NSWorkspace.shared.open(url)
        #endif
    }

    private func journal(_ texte: String) {
        guard Configuration.diagnostic else { return }
        print("[TMRapport] \(texte)")
        fflush(stdout)
    }

    /// En mode diagnostic, ce que voit la page : c'est ainsi que l'essai du
    /// démarrage sans réseau se vérifie sans écran.
    private func diagnostiquer(_ webView: WKWebView) {
        guard Configuration.diagnostic else { return }
        let script = """
        const caches_ = (self.caches ? await caches.keys() : []);
        let entrees = 0;
        for (const c of caches_) { entrees += (await (await caches.open(c)).keys()).length; }
        return JSON.stringify({ titre: document.title, adresse: location.href,
          serviceWorker: !!(navigator.serviceWorker && navigator.serviceWorker.controller),
          caches: caches_.length, entrees, enLigne: navigator.onLine,
          agent: navigator.userAgent.slice(-40) });
        """
        // Tout de suite, puis une fois le service worker installé et le
        // pré-chargement fait.
        for delai in [0.0, 12.0] {
            DispatchQueue.main.asyncAfter(deadline: .now() + delai) { [weak self, weak webView] in
                webView?.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { resultat in
                    Task { @MainActor in
                        switch resultat {
                        case .success(let v):
                            self?.journal("PAGE+\(Int(delai))s \(v as? String ?? "?")")
                            if delai > 0, let webView { self?.photographier(webView) }
                        case .failure(let e): self?.journal("PAGE+\(Int(delai))s erreur=\(e.localizedDescription)")
                        }
                    }
                }
            }
        }
    }

    // MARK: - Compatibilité site ↔ app installée

    /// Le site déclare la version minimale de l'app dont il a besoin
    /// (`coqueAppleMinimum` dans /api/build). La demande part DE LA PAGE, avec
    /// la session de l'utilisateur ; hors ligne, elle échoue sans bruit.
    private func controlerCompatibilite() {
        if let d = dernierControle, Date().timeIntervalSince(d) < 600 { return }
        dernierControle = Date()
        let script = """
        try {
          const r = await fetch('/api/build', { cache: 'no-store', credentials: 'same-origin' });
          if (!r.ok) return null;
          const j = await r.json();
          return typeof j.coqueAppleMinimum === 'string' ? j.coqueAppleMinimum : null;
        } catch { return null; }
        """
        vue.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page) { [weak self] resultat in
            Task { @MainActor in
                guard let self, case .success(let v) = resultat, let minimum = v as? String else { return }
                let requise = Navigateur.plusRecente(minimum, que: Configuration.versionCoque)
                self.miseAJourRequise = requise ? minimum : nil
                self.journal("COMPATIBILITÉ app=\(Configuration.versionCoque) minimum=\(minimum) \(requise ? "MISE À JOUR REQUISE" : "ok")")
            }
        }
    }

    /// « 1.10 » est plus récente que « 1.9 » : comparaison nombre par nombre.
    nonisolated static func plusRecente(_ a: String, que b: String) -> Bool {
        let x = a.split(separator: ".").map { Int($0) ?? 0 }
        let y = b.split(separator: ".").map { Int($0) ?? 0 }
        for i in 0..<max(x.count, y.count) {
            let p = i < x.count ? x[i] : 0, q = i < y.count ? y[i] : 0
            if p != q { return p > q }
        }
        return false
    }

    /// En mode diagnostic, une image de ce qu'affiche la vue web, dans le
    /// dossier temporaire de l'application : la preuve visuelle d'un essai.
    private func photographier(_ webView: WKWebView) {
        webView.takeSnapshot(with: nil) { [weak self] image, _ in
            guard let image else { return }
            #if os(iOS)
            let donnees = image.pngData()
            #else
            let donnees = image.tiffRepresentation.flatMap { NSBitmapImageRep(data: $0) }?
                .representation(using: .png, properties: [:])
            #endif
            let fichier = FileManager.default.temporaryDirectory.appendingPathComponent("tm-diagnostic.png")
            if let donnees, (try? donnees.write(to: fichier)) != nil {
                Task { @MainActor in self?.journal("IMAGE \(fichier.path)") }
            }
        }
    }

    private static let erreursReseau: Set<Int> = [
        NSURLErrorNotConnectedToInternet, NSURLErrorCannotConnectToHost,
        NSURLErrorCannotFindHost, NSURLErrorTimedOut, NSURLErrorNetworkConnectionLost,
        NSURLErrorDNSLookupFailed, NSURLErrorInternationalRoamingOff, NSURLErrorDataNotAllowed,
    ]
}

#if os(iOS)
typealias PlatformColor = UIColor
#else
typealias PlatformColor = NSColor
#endif

// MARK: - Navigation

extension Navigateur: WKNavigationDelegate {

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .allow }
        let schema = url.scheme?.lowercased() ?? ""

        if ["mailto", "tel", "sms", "facetime", "facetime-audio", "maps", "waze", "comgooglemaps", "itms-apps"].contains(schema) {
            ouvrirAilleurs(url)
            return .cancel
        }
        if ["about", "blob", "data", "javascript"].contains(schema) { return .allow }
        if navigationAction.shouldPerformDownload { return .download }
        if Configuration.estInterne(url) { return .allow }

        // Un sous-cadre (carte intégrée, aperçu) : on le laisse à la page.
        if let cadre = navigationAction.targetFrame, !cadre.isMainFrame { return .allow }

        // Le cadre principal voudrait quitter TM Rapport : on ouvre le lien
        // ailleurs, et l'application reste où elle était.
        ouvrirAilleurs(url)
        return .cancel
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse) async -> WKNavigationResponsePolicy {
        if let r = navigationResponse.response as? HTTPURLResponse,
           let cd = r.value(forHTTPHeaderField: "Content-Disposition"),
           cd.lowercased().contains("attachment") {
            return .download
        }
        if !navigationResponse.canShowMIMEType { return .download }
        return .allow
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        prendreEnCharge(download, partager: true)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        prendreEnCharge(download, partager: true)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === vue {
            etat = .pret
            controlerCompatibilite()
        }
        journal("CHARGÉ \(webView.url?.absoluteString ?? "?")")
        diagnostiquer(webView)
        #if DEBUG
        if webView === vue { executerScriptEssai() }
        #endif
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let e = error as NSError
        journal("ÉCHEC \(e.domain) \(e.code) \(e.localizedDescription)")
        // Une navigation annoncée puis abandonnée par nous-mêmes (lien
        // externe, téléchargement) n'est pas une panne.
        if e.code == NSURLErrorCancelled || e.domain == "WebKitErrorDomain" { return }
        guard webView === vue else { return }
        // On n'affiche « injoignable » QUE si rien n'est à l'écran. Une page
        // déjà ouverte reste utilisable : c'est tout l'intérêt du hors ligne.
        if Navigateur.erreursReseau.contains(e.code), webView.url == nil || etat != .pret {
            etat = .injoignable(e.localizedDescription)
        }
    }

    /// iOS tue le processus de la vue web quand l'app dort longtemps en
    /// arrière-plan. Sans ceci, on revient sur une page blanche.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        journal("PROCESSUS WEB TERMINÉ — rechargement")
        if webView === vue { recharger() } else { webView.reload() }
    }
}

// MARK: - Boîtes de dialogue, fenêtres, autorisations

extension Navigateur: WKUIDelegate {

    /// `window.open` et `target=_blank`. Une page de TM Rapport s'ouvre dans
    /// une fenêtre à part — feuille sur iPhone et iPad, vraie fenêtre sur Mac —
    /// qui partage la session : l'écran d'où l'on vient reste intact
    /// derrière. Un lien externe part dans son application.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        let url = navigationAction.request.url
        if let url, !url.absoluteString.isEmpty, url.scheme != "about", !Configuration.estInterne(url) {
            ouvrirAilleurs(url)
            return nil
        }
        let secondaire = WKWebView(frame: .zero, configuration: configuration)
        secondaire.navigationDelegate = self
        secondaire.uiDelegate = self
        secondaire.allowsBackForwardNavigationGestures = true
        if #available(iOS 16.4, macOS 13.3, *) { secondaire.isInspectable = true }
        let fenetre = FenetreSecondaire(vue: secondaire)
        #if os(iOS)
        fenetreSecondaire = fenetre
        #else
        FenetresMac.ouvrir(fenetre, navigateur: self)
        #endif
        return secondaire
    }

    /// `window.close()` depuis une fenêtre secondaire.
    func webViewDidClose(_ webView: WKWebView) {
        #if os(iOS)
        if fenetreSecondaire?.vue === webView { fenetreSecondaire = nil }
        #else
        FenetresMac.fermer(webView)
        #endif
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async {
        await Dialogues.alerte(message)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await Dialogues.confirmation(message)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo) async -> String? {
        await Dialogues.saisie(prompt, valeur: defaultText)
    }

    /// Caméra et micro (lecteur de code QR, dictée) : accordés au site de
    /// TM Rapport, sans redemander à chaque fois. iOS pose lui-même la
    /// question une seule fois, pour toute l'application.
    func webView(_ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin,
                 initiatedBy frame: WKFrameInfo, type: WKMediaCaptureType) async -> WKPermissionDecision {
        Configuration.domainesInternes.contains(origin.host.lowercased()) ? .grant : .prompt
    }

    #if os(macOS)
    /// `<input type="file">` sur Mac : le panneau d'ouverture de fichiers.
    /// (Sur iPhone et iPad, la vue web propose seule l'appareil photo et la
    /// photothèque.)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters,
                 initiatedByFrame frame: WKFrameInfo) async -> [URL]? {
        let panneau = NSOpenPanel()
        panneau.allowsMultipleSelection = parameters.allowsMultipleSelection
        panneau.canChooseDirectories = parameters.allowsDirectories
        panneau.canChooseFiles = true
        return panneau.runModal() == .OK ? panneau.urls : nil
    }
    #endif
}

// MARK: - Téléchargements

extension Navigateur: WKDownloadDelegate {

    func prendreEnCharge(_ download: WKDownload, partager: Bool) {
        download.delegate = self
        telechargements[ObjectIdentifier(download)] = (nil, partager)
    }

    /// Télécharge ce qu'affiche une fenêtre secondaire — le PDF qu'on regarde —
    /// avec la session de l'application, pour le partager ou l'enregistrer.
    func telecharger(_ url: URL, depuis webView: WKWebView) {
        webView.startDownload(using: URLRequest(url: url)) { [weak self] download in
            Task { @MainActor in self?.prendreEnCharge(download, partager: true) }
        }
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse,
                  suggestedFilename: String) async -> URL? {
        let nom = suggestedFilename.isEmpty ? "document" : suggestedFilename
        #if os(macOS)
        // Sur Mac : le dossier Téléchargements, comme un navigateur.
        let dossier = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        #else
        // Sur iPhone et iPad : un dossier temporaire, puis la feuille de
        // partage — Enregistrer dans Fichiers, AirDrop, Imprimer, Mail.
        let dossier = FileManager.default.temporaryDirectory.appendingPathComponent("telechargements", isDirectory: true)
        try? FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        #endif
        let destination = Navigateur.cheminLibre(dossier.appendingPathComponent(nom))
        telechargements[ObjectIdentifier(download)]?.destination = destination
        journal("TÉLÉCHARGEMENT → \(destination.lastPathComponent)")
        return destination
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let suivi = telechargements.removeValue(forKey: ObjectIdentifier(download)),
              let fichier = suivi.destination else { return }
        #if os(macOS)
        NSWorkspace.shared.activateFileViewerSelecting([fichier])
        #else
        if suivi.partager { documentAPartager = DocumentPartage(fichier: fichier) }
        #endif
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        telechargements.removeValue(forKey: ObjectIdentifier(download))
        journal("TÉLÉCHARGEMENT ÉCHOUÉ \(error.localizedDescription)")
        Task { await Dialogues.alerte("Le document n'a pas pu être téléchargé.\n\(error.localizedDescription)") }
    }

    /// « rapport.pdf » existe déjà : « rapport 2.pdf ».
    static func cheminLibre(_ url: URL) -> URL {
        let fm = FileManager.default
        guard fm.fileExists(atPath: url.path) else { return url }
        let base = url.deletingPathExtension().lastPathComponent
        let ext = url.pathExtension
        let dossier = url.deletingLastPathComponent()
        for i in 2...999 {
            let candidat = dossier.appendingPathComponent(ext.isEmpty ? "\(base) \(i)" : "\(base) \(i).\(ext)")
            if !fm.fileExists(atPath: candidat.path) { return candidat }
        }
        return dossier.appendingPathComponent(UUID().uuidString + (ext.isEmpty ? "" : ".\(ext)"))
    }
}

/// Une fenêtre ouverte par le site.
struct FenetreSecondaire: Identifiable {
    let id = UUID()
    let vue: WKWebView
}

/// Un fichier téléchargé, prêt pour la feuille de partage.
struct DocumentPartage: Identifiable {
    let id = UUID()
    let fichier: URL
}
