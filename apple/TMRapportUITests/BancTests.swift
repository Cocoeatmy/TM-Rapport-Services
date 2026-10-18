import XCTest

/// L'app, pilotée comme par un doigt, sur le banc d'essai local
/// (apple/Banc/banc.html, servi sur http://localhost:3138 pendant les tests).
///
/// Ce que ces tests prouvent dans la VRAIE vue web de l'app :
/// les boîtes de dialogue du site s'affichent et rendent la bonne réponse,
/// une fenêtre ouverte par le site s'ouvre et se ferme, un téléchargement
/// aboutit, et le coffre natif garde une photo — octets intacts — à travers
/// une fermeture complète de l'application.
#if os(iOS)
final class BancTests: XCTestCase {

    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-TMBaseURL", "http://localhost:3138/banc.html"]
        app.launch()
        XCTAssertTrue(resultat("pret").waitForExistence(timeout: 20), "le banc ne s'est pas chargé")
    }

    private func resultat(_ debut: String) -> XCUIElement {
        app.webViews.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH %@", debut)).firstMatch
    }

    private func toucher(_ libelle: String) {
        let b = app.webViews.buttons[libelle].firstMatch
        XCTAssertTrue(b.waitForExistence(timeout: 10), "bouton \(libelle) introuvable")
        b.tap()
    }

    func testLesBoitesDeDialogueDuSite() throws {
        toucher("Alerte")
        let alerte = app.alerts.firstMatch
        XCTAssertTrue(alerte.waitForExistence(timeout: 5))
        XCTAssertTrue(alerte.staticTexts["Bonjour du banc"].exists)
        alerte.buttons["OK"].tap()
        XCTAssertTrue(resultat("alerte vue").waitForExistence(timeout: 5))

        // confirm() : sans l'app, il répondrait « non » sans rien montrer.
        toucher("Confirmer")
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["OK"].tap()
        XCTAssertTrue(resultat("confirme oui").waitForExistence(timeout: 5))

        toucher("Confirmer")
        XCTAssertTrue(app.alerts.firstMatch.waitForExistence(timeout: 5))
        app.alerts.buttons["Annuler"].tap()
        XCTAssertTrue(resultat("confirme non").waitForExistence(timeout: 5))

        toucher("Saisir")
        let champ = app.alerts.textFields.firstMatch
        XCTAssertTrue(champ.waitForExistence(timeout: 5))
        XCTAssertEqual(champ.value as? String, "Cab1")
        // Toucher le champ sélectionne son texte sous iOS 27 (la frappe le
        // remplace), pas sous iOS 26 (elle le complète) : on vérifie que ce
        // qui est tapé revient bien à la page, dans les deux cas.
        champ.tap()
        champ.typeText("2")
        app.alerts.buttons["OK"].tap()
        let saisi = resultat("saisi ")
        XCTAssertTrue(saisi.waitForExistence(timeout: 5))
        XCTAssertTrue(["saisi Cab12", "saisi 2"].contains(saisi.label), saisi.label)
    }

    func testUneFenetreOuverteParLeSite() throws {
        toucher("Ouvrir fenetre")
        let fermer = app.buttons["Fermer"]
        XCTAssertTrue(fermer.waitForExistence(timeout: 10), "la fenêtre secondaire ne s'est pas ouverte")
        XCTAssertTrue(app.buttons["Partager ou enregistrer"].exists)
        fermer.tap()
        XCTAssertTrue(resultat("pret").waitForExistence(timeout: 5))
    }

    func testUnTelechargementArriveALaFeuilleDePartage() throws {
        let lien = app.webViews.links["Telecharger"].firstMatch
        XCTAssertTrue(lien.waitForExistence(timeout: 10))
        lien.tap()
        // La feuille de partage d'iOS : Enregistrer dans Fichiers, AirDrop…
        let feuille = app.otherElements["ActivityListView"].firstMatch
        let ok = feuille.waitForExistence(timeout: 10)
            || app.collectionViews.cells.firstMatch.waitForExistence(timeout: 2)
        XCTAssertTrue(ok, "la feuille de partage n'est pas apparue")
    }

    func testLeCoffreGardeUnePhotoAuDelaDUneFermeture() throws {
        toucher("Pont")
        XCTAssertTrue(resultat("pont present").waitForExistence(timeout: 5))

        toucher("Coffre retirer") // part d'un coffre propre
        XCTAssertTrue(resultat("retrait ok").waitForExistence(timeout: 5))

        toucher("Coffre deposer")
        XCTAssertTrue(resultat("depot ok nouveau").waitForExistence(timeout: 5))
        toucher("Coffre deposer") // le même identifiant : rien n'est écrasé
        XCTAssertTrue(resultat("depot ok deja").waitForExistence(timeout: 5))

        // Fermeture complète de l'app, puis réouverture.
        app.terminate()
        app.launch()
        XCTAssertTrue(resultat("pret").waitForExistence(timeout: 20))

        toucher("Coffre inventaire")
        XCTAssertTrue(resultat("inventaire 1 octets intacts").waitForExistence(timeout: 5))

        toucher("Coffre retirer")
        XCTAssertTrue(resultat("retrait ok").waitForExistence(timeout: 5))
        toucher("Coffre inventaire")
        XCTAssertTrue(resultat("inventaire 0").waitForExistence(timeout: 5))
    }

    func testLAppDemandeLEnvoiAuDepartEtAuRetour() throws {
        toucher("Effacer synchros")
        XCTAssertTrue(resultat("synchros effacees").waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home)
        sleep(4)
        app.activate()
        XCTAssertTrue(app.webViews.buttons["Synchros"].waitForExistence(timeout: 10))
        sleep(2)
        toucher("Synchros")
        let attendu = app.webViews.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH 'synchros' AND label CONTAINS 'depart' AND label CONTAINS 'retour'")).firstMatch
        XCTAssertTrue(attendu.waitForExistence(timeout: 5), "l'app n'a pas demandé l'envoi au départ et au retour")
    }

    /// Le champ « photo » du site ouvre la photothèque d'iOS, et la photo
    /// choisie arrive dans la page.
    func testChoisirUnePhotoDansLaPhotothèque() throws {
        let champ = app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS[c] 'Photo' OR label CONTAINS[c] 'Choisir' OR label CONTAINS[c] 'Choose'")).firstMatch
        XCTAssertTrue(champ.waitForExistence(timeout: 10), "champ photo introuvable")
        champ.tap()
        let phototheque = app.buttons.matching(NSPredicate(format:
            "label IN {'Photothèque', 'Photo Library', 'Bibliothèque de photos'}")).firstMatch
        if phototheque.waitForExistence(timeout: 5) { phototheque.tap() }
        // Le sélecteur de photos d'iOS tourne dans un autre processus, hors
        // de portée du test : on touche la première vignette par sa position.
        sleep(4)
        if UIDevice.current.userInterfaceIdiom == .pad {
            // Sur iPad, le sélecteur est une fenêtre centrée, barre latérale à gauche.
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.437, dy: 0.465)).tap()
            sleep(2)
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.807, dy: 0.26)).tap()
        } else {
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.18, dy: 0.46)).tap()
            // L'aperçu de la photo s'ouvre ; on valide (coche en haut à droite).
            sleep(2)
            app.coordinate(withNormalizedOffset: CGVector(dx: 0.90, dy: 0.125)).tap()
        }
        XCTAssertTrue(resultat("fichier image/").waitForExistence(timeout: 15), "la photo choisie n'est pas arrivée dans la page")
    }
    // MARK: - Fonctions du navigateur utilisées par le site

    /// Accepte les demandes d'autorisation (iOS et vue web), comme le ferait
    /// un monteur au premier usage.
    private func accepterAutorisations(pendant secondes: Double = 6) {
        let libelles = ["Autoriser", "Allow", "OK", "Autoriser une fois", "Allow Once",
                        "Lorsque l’app est active", "Allow While Using App", "Autoriser lorsque l’app est active"]
        let sb = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let fin = Date().addingTimeInterval(secondes)
        while Date() < fin {
            var touche = false
            for source in [sb.alerts, app.alerts] where source.firstMatch.exists {
                for l in libelles where source.buttons[l].firstMatch.exists {
                    source.buttons[l].firstMatch.tap(); touche = true; break
                }
            }
            if !touche { usleep(400_000) }
        }
    }

    func testUnExportFabriqueParLaPageEstEnregistreEtNonAffiche() throws {
        toucher("Exporter blob")
        let feuille = app.otherElements["ActivityListView"].firstMatch
        let ok = feuille.waitForExistence(timeout: 10) || app.collectionViews.cells.firstMatch.waitForExistence(timeout: 2)
        XCTAssertTrue(ok, "le fichier exporté n'est pas arrivé à la feuille de partage")
    }

    func testUnPdfFabriqueParLaPageSOuvreDansLApp() throws {
        toucher("PDF blob fenetre")
        XCTAssertTrue(app.buttons["Fermer"].waitForExistence(timeout: 10), "le PDF ne s'est pas ouvert dans une fenêtre de l'app")
        app.buttons["Fermer"].tap()
        XCTAssertTrue(app.webViews.buttons["Alerte"].waitForExistence(timeout: 5))
    }

    func testUnLienExterneOuvreSafariSansQuitterLaPage() throws {
        let lien = app.webViews.links["Lien externe"].firstMatch
        XCTAssertTrue(lien.waitForExistence(timeout: 10))
        lien.tap()
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 15), "Safari ne s'est pas ouvert")
        app.activate()
        XCTAssertTrue(app.webViews.buttons["Alerte"].waitForExistence(timeout: 10), "la page de l'app a été remplacée")
    }

    func testUneFenetreEnvoyeeVersLExterieurNeLaissePasDeFenetreVide() throws {
        toucher("Fenetre externe")
        let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
        XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 15), "Safari ne s'est pas ouvert")
        app.activate()
        XCTAssertTrue(app.webViews.buttons["Alerte"].waitForExistence(timeout: 10))
        XCTAssertFalse(app.buttons["Fermer"].exists, "une fenêtre vide est restée ouverte")
    }

    /// Appeler un client, lui écrire : le lien part vers Téléphone ou Mail
    /// (absents du simulateur), et la page du chantier reste en place.
    func testAppelerEtEcrireNeQuittentPasLaPage() throws {
        for libelle in ["Appeler", "Ecrire"] {
            let lien = app.webViews.links[libelle].firstMatch
            XCTAssertTrue(lien.waitForExistence(timeout: 10))
            lien.tap()
            sleep(2)
            accepterAutorisations(pendant: 1)
            if app.state != .runningForeground { app.activate() }
            XCTAssertTrue(app.webViews.buttons["Alerte"].waitForExistence(timeout: 10), "la page a été remplacée après \(libelle)")
        }
    }

    func testLePressePapiers() throws {
        toucher("Copier")
        accepterAutorisations(pendant: 2)
        XCTAssertTrue(resultat("copie ok").waitForExistence(timeout: 8))
    }

    func testLaPosition() throws {
        toucher("Position")
        accepterAutorisations(pendant: 8)
        XCTAssertTrue(resultat("position ok").waitForExistence(timeout: 15), "position non obtenue")
    }

    func testLeMicroEtLEnregistreur() throws {
        toucher("Micro")
        accepterAutorisations(pendant: 8)
        let r = resultat("micro")
        XCTAssertTrue(r.waitForExistence(timeout: 15))
        print("RESULTAT-MICRO \(r.label)")
        XCTAssertTrue(r.label.hasPrefix("micro ok enregistreur"), r.label)
    }

    func testLesCapacitesDeLaVueWeb() throws {
        toucher("Capacites")
        let r = resultat("capacites")
        XCTAssertTrue(r.waitForExistence(timeout: 5))
        print("RESULTAT-CAPACITES \(r.label)")
        XCTAssertTrue(r.label.contains("autonome=true") && r.label.contains("sw=true") && r.label.contains("idb=true") && r.label.contains("uuid=true"), r.label)
    }
}

#endif

#if os(macOS)
/// Sur Mac : les mêmes boîtes de dialogue (en NSAlert) et les fenêtres
/// ouvertes par le site, qui deviennent de vraies fenêtres.
final class BancMacTests: XCTestCase {

    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["-TMBaseURL", "http://localhost:3138/banc.html"]
        app.launch()
        XCTAssertTrue(resultat("pret").waitForExistence(timeout: 20), "le banc ne s'est pas chargé")
    }

    override func tearDownWithError() throws {
        app.terminate()
    }

    private func resultat(_ debut: String) -> XCUIElement {
        app.webViews.descendants(matching: .any)
            .matching(NSPredicate(format: "label BEGINSWITH %@ OR value BEGINSWITH %@", debut, debut)).firstMatch
    }

    private func toucher(_ libelle: String) {
        let b = app.webViews.buttons[libelle].firstMatch
        XCTAssertTrue(b.waitForExistence(timeout: 10), "bouton \(libelle) introuvable")
        b.click()
    }

    func testBoitesDeDialogueSurMac() throws {
        toucher("Confirmer")
        let dialogue = app.dialogs.firstMatch
        XCTAssertTrue(dialogue.waitForExistence(timeout: 5), "la confirmation ne s'est pas affichée")
        dialogue.buttons["OK"].click()
        XCTAssertTrue(resultat("confirme oui").waitForExistence(timeout: 5))

        toucher("Confirmer")
        XCTAssertTrue(app.dialogs.firstMatch.waitForExistence(timeout: 5))
        app.dialogs.firstMatch.buttons["Annuler"].click()
        XCTAssertTrue(resultat("confirme non").waitForExistence(timeout: 5))
    }

    func testUneFenetreOuverteParLeSiteDevientUneFenetre() throws {
        let avant = app.windows.count
        toucher("Ouvrir fenetre")
        let attente = expectation(for: NSPredicate(format: "count > %d", avant), evaluatedWith: app.windows)
        wait(for: [attente], timeout: 10)
        XCTAssertGreaterThan(app.windows.count, avant)
    }
}
#endif
