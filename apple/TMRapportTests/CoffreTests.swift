import XCTest
@testable import TM_Rapport

/// Le coffre natif : ce qu'il garde, ce qu'il rend, ce qu'il refuse.
/// Chaque test travaille dans un dossier temporaire neuf.
final class CoffreTests: XCTestCase {

    private var dossier: URL!
    private var coffre: Coffre!

    override func setUpWithError() throws {
        dossier = FileManager.default.temporaryDirectory.appendingPathComponent("coffre-\(UUID().uuidString)")
        coffre = Coffre(racine: dossier)
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: dossier)
    }

    private func jpeg(_ n: UInt8 = 1) -> Coffre.Fichier {
        .init(nom: "photo-\(n).jpg", type: "image/jpeg", donnees: Data([0xFF, 0xD8, n, n, n, 0xFF, 0xD9]))
    }

    func testDeposeEtRendLaPhotoOctetPourOctet() throws {
        XCTAssertTrue(try coffre.deposerPhoto(id: "up-1-abc", meta: #"{"id":"up-1-abc"}"#, fichiers: [jpeg(1), jpeg(2)]))
        let attente = coffre.photosEnAttente()
        XCTAssertEqual(attente.map(\.id), ["up-1-abc"])
        let p = try XCTUnwrap(coffre.photo(id: "up-1-abc"))
        XCTAssertEqual(p.meta, #"{"id":"up-1-abc"}"#)
        XCTAssertEqual(p.fichiers, [jpeg(1), jpeg(2)])
    }

    func testUnDepotNEcraseJamaisUnDepotExistant() throws {
        try coffre.deposerPhoto(id: "up-2", meta: "premier", fichiers: [jpeg(1)])
        XCTAssertFalse(try coffre.deposerPhoto(id: "up-2", meta: "second", fichiers: [jpeg(9)]))
        let p = try XCTUnwrap(coffre.photo(id: "up-2"))
        XCTAssertEqual(p.meta, "premier")
        XCTAssertEqual(p.fichiers, [jpeg(1)])
    }

    func testRetirerArchiveSansEffacer() throws {
        try coffre.deposerPhoto(id: "up-3", meta: "m", fichiers: [jpeg()])
        try coffre.retirerPhoto(id: "up-3", motif: "confirme")
        XCTAssertTrue(coffre.photosEnAttente().isEmpty)
        let archive = try FileManager.default.contentsOfDirectory(atPath: coffre.dossierArchive.path)
        XCTAssertEqual(archive.count, 1)
        XCTAssertTrue(archive[0].hasSuffix("_confirme_up-3"))
        // Retirer ce qui n'y est pas ne fait rien.
        XCTAssertNoThrow(try coffre.retirerPhoto(id: "inconnue", motif: "confirme"))
    }

    func testLEntretienNeToucheJamaisAuxPhotosEnAttente() throws {
        try coffre.deposerPhoto(id: "attente", meta: "m", fichiers: [jpeg()])
        try coffre.deposerPhoto(id: "envoyee", meta: "m", fichiers: [jpeg()])
        try coffre.retirerPhoto(id: "envoyee", motif: "confirme")
        // Dans un an : l'archive est purgée, la photo en attente reste.
        let dansUnAn = Date().addingTimeInterval(365 * 24 * 3600)
        XCTAssertEqual(coffre.entretenir(maintenant: dansUnAn), 1)
        XCTAssertEqual(coffre.photosEnAttente().map(\.id), ["attente"])
        // Avant la durée de garde, l'archive reste.
        try coffre.deposerPhoto(id: "recente", meta: "m", fichiers: [jpeg()])
        try coffre.retirerPhoto(id: "recente", motif: "confirme")
        XCTAssertEqual(coffre.entretenir(maintenant: Date()), 0)
    }

    func testUnBrouillonInterrompuEstIgnoreEtNettoye() throws {
        // Un arrêt brutal pendant un dépôt laisse un dossier « .xxx » à moitié écrit.
        let brouillon = coffre.dossierPhotos.appendingPathComponent(".up-9.interrompu")
        try FileManager.default.createDirectory(at: brouillon, withIntermediateDirectories: true)
        XCTAssertTrue(coffre.photosEnAttente().isEmpty)
        XCTAssertEqual(coffre.entretenir(maintenant: Date().addingTimeInterval(7200)), 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: brouillon.path))
    }

    func testRefuseLesIdentifiantsQuiSortiraientDuCoffre() {
        for id in ["", "..", "../x", "a/b", ".cache", String(repeating: "a", count: 200)] {
            XCTAssertThrowsError(try coffre.deposerPhoto(id: id, meta: "m", fichiers: [jpeg()]), id)
        }
        XCTAssertTrue(Coffre.identifiantValide("up-1734567890123-ab12cd"))
    }

    func testLeCoffreSurvitARouvertureDeLApplication() throws {
        try coffre.deposerPhoto(id: "persistante", meta: "m", fichiers: [jpeg(7)])
        try coffre.enregistrerLocal(Data(#"{"tm-rapport-queue":"[1,2]"}"#.utf8))
        // Une nouvelle instance sur le même dossier : comme après un redémarrage.
        let rouvert = Coffre(racine: dossier)
        XCTAssertEqual(rouvert.photo(id: "persistante")?.fichiers, [jpeg(7)])
        XCTAssertEqual(rouvert.etat()["requetes"], 2)
    }

    func testSaisiesLocalesGardeLaVersionPrecedente() throws {
        try coffre.enregistrerLocal(Data(#"{"a":"1"}"#.utf8))
        try coffre.enregistrerLocal(Data(#"{"a":"2"}"#.utf8))
        XCTAssertEqual(coffre.lireLocal(), Data(#"{"a":"2"}"#.utf8))
        XCTAssertEqual(try Data(contentsOf: coffre.fichierLocalPrecedent), Data(#"{"a":"1"}"#.utf8))
        XCTAssertThrowsError(try coffre.enregistrerLocal(Data("pas du json".utf8)))
        XCTAssertThrowsError(try coffre.enregistrerLocal(Data("[1,2]".utf8)))
        XCTAssertEqual(coffre.lireLocal(), Data(#"{"a":"2"}"#.utf8))
    }

    // MARK: - Le protocole du pont (le même que la doublure des tests du site)

    func testProtocoleDuPont() throws {
        let b64 = Data([1, 2, 3]).base64EncodedString()
        var (r, e) = PontNatif.traiter(action: "deposerPhoto", corps: [
            "id": "up-p", "meta": "{}", "fichiers": [["nom": "a.jpg", "type": "image/jpeg", "base64": b64]],
        ], coffre: coffre)
        XCTAssertNil(e)
        XCTAssertEqual((r as? [String: Any])?["nouveau"] as? Bool, true)

        (r, e) = PontNatif.traiter(action: "inventaire", corps: [:], coffre: coffre)
        let inv = try XCTUnwrap(r as? [String: Any])
        XCTAssertEqual((inv["photos"] as? [[String: String]])?.first?["id"], "up-p")

        (r, e) = PontNatif.traiter(action: "photo", corps: ["id": "up-p"], coffre: coffre)
        let p = try XCTUnwrap(r as? [String: Any])
        XCTAssertEqual((p["fichiers"] as? [[String: String]])?.first?["base64"], b64)

        (r, e) = PontNatif.traiter(action: "retirerPhoto", corps: ["id": "up-p", "motif": "confirme"], coffre: coffre)
        XCTAssertNil(e)
        XCTAssertTrue(coffre.photosEnAttente().isEmpty)

        (r, e) = PontNatif.traiter(action: "local", corps: ["json": #"{"k":"v"}"#], coffre: coffre)
        XCTAssertNil(e)
        (r, e) = PontNatif.traiter(action: "deposerPhoto", corps: ["id": "x"], coffre: coffre)
        XCTAssertNotNil(e)
        (r, e) = PontNatif.traiter(action: "inconnue", corps: [:], coffre: coffre)
        XCTAssertNotNil(e)
    }

    func testCompatibiliteDesVersions() {
        XCTAssertTrue(Navigateur.plusRecente("1.10", que: "1.9"))
        XCTAssertTrue(Navigateur.plusRecente("2.0", que: "1.9.9"))
        XCTAssertFalse(Navigateur.plusRecente("1.0", que: "1.0"))
        XCTAssertFalse(Navigateur.plusRecente("1.0", que: "1.0.0"))
        XCTAssertFalse(Navigateur.plusRecente("1.2", que: "1.10"))
    }
}
