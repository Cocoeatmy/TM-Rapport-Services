import XCTest

/// L'app, pilotée comme par un doigt, sur le banc d'essai local
/// (apple/Banc/banc.html, servi sur http://localhost:3138 pendant les tests).
///
/// Ce que ces tests prouvent dans la VRAIE vue web de l'app :
/// les boîtes de dialogue du site s'affichent et rendent la bonne réponse,
/// une fenêtre ouverte par le site s'ouvre et se ferme, un téléchargement
/// aboutit, et le coffre natif garde une photo — octets intacts — à travers
/// une fermeture complète de l'application.
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
        champ.tap()
        champ.typeText("2")
        app.alerts.buttons["OK"].tap()
        XCTAssertTrue(resultat("saisi Cab12").waitForExistence(timeout: 5))
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
}
