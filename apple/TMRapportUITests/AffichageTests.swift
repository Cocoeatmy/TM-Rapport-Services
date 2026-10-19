import XCTest

#if os(iOS)
/// Contrôle d'affichage du VRAI site dans l'app, sur un serveur local aux
/// données fictives. Lancé seulement à la demande (variable AFFICHAGE_DOSSIER),
/// car il lui faut le serveur de test et un jeton (AFFICHAGE_JETON).
final class AffichageTests: XCTestCase {

    private func photo(_ nom: String) {
        guard let dossier = ProcessInfo.processInfo.environment["AFFICHAGE_DOSSIER"] else { return }
        let image = XCUIScreen.main.screenshot().pngRepresentation
        try? image.write(to: URL(fileURLWithPath: dossier).appendingPathComponent("\(nom).png"))
    }

    /// Les demandes de position (iOS, puis la page) : acceptées, comme un monteur.
    private func accepterAutorisations(_ app: XCUIApplication, pendant secondes: Double) {
        let sb = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let libelles = ["Autoriser lorsque l’app est active", "Allow While Using App", "Autoriser une fois", "Autoriser", "Allow", "Continue", "Continuer"]
        let fin = Date().addingTimeInterval(secondes)
        while Date() < fin {
            for source in [sb.alerts, app.alerts] where source.firstMatch.exists {
                for l in libelles where source.buttons[l].firstMatch.exists { source.buttons[l].firstMatch.tap(); break }
            }
            if app.buttons["Continue"].exists { app.buttons["Continue"].tap() }
            usleep(400_000)
        }
    }

    func testAccueilRechercheChargeEtPaysage() throws {
        let env = ProcessInfo.processInfo.environment
        guard env["AFFICHAGE_DOSSIER"] != nil, let jeton = env["AFFICHAGE_JETON"] else {
            throw XCTSkip("contrôle d'affichage lancé à la demande seulement")
        }
        XCUIDevice.shared.orientation = .portrait
        let app = XCUIApplication()
        let releve = env["AFFICHAGE_SANS_RELEVE"] ?? "NO"
        app.launchArguments = ["-TMBaseURL", "http://localhost:3139", "-TMJetonTest", jeton, "-TMSansReleveCouleur", releve,
                               "-TMThemeEssai", env["AFFICHAGE_THEME"] ?? "signal"]
        app.launch()
        accepterAutorisations(app, pendant: 10)
        // iPhone : le bouton rond ; iPad (thème Signal) : le champ de l'en-tête.
        let bouton = app.webViews.buttons["Recherche globale (⌘K)"].firstMatch
        let champEnTete = app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS 'Rechercher un projet'")).firstMatch
        let ouvreur = champEnTete.waitForExistence(timeout: 20) && champEnTete.isHittable ? champEnTete : bouton
        XCTAssertTrue(ouvreur.waitForExistence(timeout: 20), "aucun moyen d'ouvrir la recherche")
        sleep(4)
        photo("1-accueil")

        // La recherche, clavier ouvert.
        ouvreur.tap()
        sleep(1)
        let champ = app.webViews.textFields.firstMatch
        if champ.waitForExistence(timeout: 5) { champ.tap() }
        accepterAutorisations(app, pendant: 2)
        sleep(1)
        app.typeText("Ch")
        sleep(2)
        photo("2-recherche-clavier")
        let resultat = app.webViews.buttons.matching(NSPredicate(format: "label CONTAINS 'Chantier de test E2E'")).firstMatch
        XCTAssertTrue(resultat.waitForExistence(timeout: 5), "aucun résultat dans la recherche")
        XCTAssertTrue(resultat.isHittable, "le premier résultat n'est pas visible au-dessus du clavier")
        // Les résultats défilent.
        app.webViews.firstMatch.swipeUp()
        sleep(1)
        photo("3-recherche-defilee")
        app.typeText("\u{1B}") // Échap
        sleep(1)
        if app.webViews.buttons["Esc"].exists { app.webViews.buttons["Esc"].tap() }
        sleep(1)

        // Le graphique de la semaine.
        let titre = app.webViews.staticTexts["Charge de la semaine"].firstMatch
        for _ in 0..<15 where !(titre.exists && titre.isHittable) { app.webViews.firstMatch.swipeUp(velocity: .slow) }
        // Le titre visible : on remonte d'un cran pour voir le graphique entier
        // sous l'en-tête collant.
        if titre.exists {
            let haut = app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.62))
            haut.press(forDuration: 0.05, thenDragTo: app.webViews.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.42)))
        }
        sleep(1)
        photo("4-charge")

        XCUIDevice.shared.orientation = .landscapeLeft
        sleep(2)
        photo("5-paysage")
        XCUIDevice.shared.orientation = .portrait
    }
}
#endif
