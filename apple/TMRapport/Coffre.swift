import Foundation

/// Le coffre : une copie NATIVE, hors de WebKit, de tout ce que le site n'a
/// pas encore fait confirmer par le serveur — photos, signatures, saisies.
///
/// Le site garde ses propres files (IndexedDB pour les photos, stockage local
/// pour les saisies), et c'est toujours LUI qui envoie. Le coffre n'envoie
/// rien : il garde un double, dans les fichiers de l'application, là où ni un
/// nettoyage du cache de WebKit, ni un manque de place côté web, ni une
/// réinstallation de la page ne peuvent l'atteindre. Si un jour la file du
/// site revient vide alors que le coffre ne l'est pas, le site y reprend ce
/// qui lui manque, avec les mêmes identifiants.
///
/// Règles :
/// - un dépôt n'écrase jamais un dépôt existant (même identifiant = même
///   photo, déjà gardée) ;
/// - toute écriture est atomique : un arrêt brutal laisse l'ancien état ou le
///   nouveau, jamais un fichier à moitié écrit ;
/// - une photo ne quitte le coffre que sur ordre du site, une fois le serveur
///   ayant confirmé, et elle passe alors par l'archive, conservée
///   `dureeArchive` avant d'être effacée.
final class Coffre: @unchecked Sendable {

    static let partage = Coffre(racine: Coffre.racineParDefaut())

    /// Quatorze jours : le temps de s'apercevoir d'un problème et de
    /// retrouver une photo, sans remplir le téléphone.
    static let dureeArchive: TimeInterval = 14 * 24 * 3600

    let racine: URL
    private let verrou = NSLock()
    private let fm = FileManager.default

    init(racine: URL) {
        self.racine = racine
        for dossier in [dossierPhotos, dossierArchive] {
            try? fm.createDirectory(at: dossier, withIntermediateDirectories: true, attributes: Coffre.attributsProteges)
        }
    }

    static func racineParDefaut() -> URL {
        // Sous l'identifiant de l'app : hors bac à sable (essais sur Mac), le
        // dossier « Application Support » est partagé avec les autres apps.
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return base.appendingPathComponent(Bundle.main.bundleIdentifier ?? "TM.TM-Rapport", isDirectory: true)
            .appendingPathComponent("Coffre", isDirectory: true)
    }

    var dossierPhotos: URL { racine.appendingPathComponent("photos", isDirectory: true) }
    var dossierArchive: URL { racine.appendingPathComponent("archive", isDirectory: true) }
    var fichierLocal: URL { racine.appendingPathComponent("stockage-local.json") }
    var fichierLocalPrecedent: URL { racine.appendingPathComponent("stockage-local.precedent.json") }

    /// Lisible en arrière-plan après le premier déverrouillage qui suit un
    /// redémarrage — sinon un envoi de nuit ne pourrait pas relire les photos.
    private static var attributsProteges: [FileAttributeKey: Any]? {
        #if os(iOS)
        return [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        #else
        return nil
        #endif
    }

    private static var optionsEcriture: Data.WritingOptions {
        #if os(iOS)
        return [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        #else
        return [.atomic]
        #endif
    }

    enum Erreur: Error, Equatable {
        case identifiantInvalide
        case donneesInvalides
    }

    struct Fichier: Equatable {
        let nom: String
        let type: String
        let donnees: Data
    }

    /// Ce que le coffre range à côté des octets.
    private struct Fiche: Codable {
        /// La description de la photo telle que le site l'a envoyée (JSON).
        let meta: String
        let fichiers: [Entree]
        let deposeLe: Date
        struct Entree: Codable { let nom: String; let type: String; let fichier: String }
    }

    /// Un identifiant sert de nom de dossier : rien qui puisse en sortir.
    static func identifiantValide(_ id: String) -> Bool {
        guard !id.isEmpty, id.count <= 120, id != ".", id != ".." else { return false }
        return id.unicodeScalars.allSatisfy {
            CharacterSet.alphanumerics.contains($0) || "-_.".unicodeScalars.contains($0)
        } && !id.hasPrefix(".")
    }

    // MARK: - Photos

    /// Range une photo (ou une signature). Rend `false` si elle y était déjà.
    @discardableResult
    func deposerPhoto(id: String, meta: String, fichiers: [Fichier]) throws -> Bool {
        guard Coffre.identifiantValide(id) else { throw Erreur.identifiantInvalide }
        guard !fichiers.isEmpty else { throw Erreur.donneesInvalides }
        verrou.lock(); defer { verrou.unlock() }

        let final = dossierPhotos.appendingPathComponent(id, isDirectory: true)
        if fm.fileExists(atPath: final.path) { return false }

        // Tout s'écrit d'abord dans un dossier provisoire, puis un seul
        // renommage le met en place : un arrêt brutal au milieu ne laisse
        // qu'un brouillon, ignoré et nettoyé ensuite.
        let brouillon = dossierPhotos.appendingPathComponent(".\(id).\(UUID().uuidString)", isDirectory: true)
        try fm.createDirectory(at: brouillon, withIntermediateDirectories: true, attributes: Coffre.attributsProteges)
        do {
            var entrees: [Fiche.Entree] = []
            for (i, f) in fichiers.enumerated() {
                let nomFichier = "f\(i)"
                try f.donnees.write(to: brouillon.appendingPathComponent(nomFichier), options: Coffre.optionsEcriture)
                entrees.append(.init(nom: f.nom, type: f.type, fichier: nomFichier))
            }
            let fiche = Fiche(meta: meta, fichiers: entrees, deposeLe: Date())
            try JSONEncoder().encode(fiche).write(to: brouillon.appendingPathComponent("fiche.json"), options: Coffre.optionsEcriture)
            try fm.moveItem(at: brouillon, to: final)
        } catch {
            try? fm.removeItem(at: brouillon)
            throw error
        }
        return true
    }

    /// Le site a fait confirmer la photo par le serveur (ou l'a écartée
    /// lui-même) : elle passe à l'archive. Sans effet si elle n'y est pas.
    func retirerPhoto(id: String, motif: String) throws {
        guard Coffre.identifiantValide(id) else { throw Erreur.identifiantInvalide }
        verrou.lock(); defer { verrou.unlock() }
        let source = dossierPhotos.appendingPathComponent(id, isDirectory: true)
        guard fm.fileExists(atPath: source.path) else { return }
        let motifSur = motif.filter { $0.isLetter || $0.isNumber || $0 == "-" }.prefix(30)
        let horodatage = Int(Date().timeIntervalSince1970)
        let cible = dossierArchive.appendingPathComponent("\(horodatage)_\(motifSur.isEmpty ? "retire" : String(motifSur))_\(id)", isDirectory: true)
        try fm.moveItem(at: source, to: cible)
    }

    /// Les photos que le serveur n'a pas encore confirmées : identifiant et
    /// description, sans les octets.
    func photosEnAttente() -> [(id: String, meta: String, deposeLe: Date)] {
        verrou.lock(); defer { verrou.unlock() }
        let noms = (try? fm.contentsOfDirectory(atPath: dossierPhotos.path)) ?? []
        return noms.filter { !$0.hasPrefix(".") }.sorted().compactMap { id in
            guard let fiche = lireFiche(id) else { return nil }
            return (id, fiche.meta, fiche.deposeLe)
        }
    }

    /// Une photo complète, octets compris, pour la rendre au site.
    func photo(id: String) -> (meta: String, fichiers: [Fichier])? {
        guard Coffre.identifiantValide(id) else { return nil }
        verrou.lock(); defer { verrou.unlock() }
        guard let fiche = lireFiche(id) else { return nil }
        let dossier = dossierPhotos.appendingPathComponent(id, isDirectory: true)
        var fichiers: [Fichier] = []
        for e in fiche.fichiers {
            guard let d = try? Data(contentsOf: dossier.appendingPathComponent(e.fichier)) else { return nil }
            fichiers.append(.init(nom: e.nom, type: e.type, donnees: d))
        }
        return (fiche.meta, fichiers)
    }

    private func lireFiche(_ id: String) -> Fiche? {
        let url = dossierPhotos.appendingPathComponent(id, isDirectory: true).appendingPathComponent("fiche.json")
        guard let d = try? Data(contentsOf: url) else { return nil }
        let dec = JSONDecoder()
        return try? dec.decode(Fiche.self, from: d)
    }

    // MARK: - Saisies locales

    /// Le double des saisies que le site garde dans son stockage local — la
    /// file des envois, les heures pointées, les noms de lots… : un objet JSON
    /// `{ clé: valeur }`. La version précédente est gardée à côté.
    func enregistrerLocal(_ json: Data) throws {
        guard (try? JSONSerialization.jsonObject(with: json)) is [String: Any] else { throw Erreur.donneesInvalides }
        verrou.lock(); defer { verrou.unlock() }
        if let actuelle = try? Data(contentsOf: fichierLocal), actuelle != json {
            try? actuelle.write(to: fichierLocalPrecedent, options: Coffre.optionsEcriture)
        }
        try json.write(to: fichierLocal, options: Coffre.optionsEcriture)
    }

    func lireLocal() -> Data? {
        verrou.lock(); defer { verrou.unlock() }
        return try? Data(contentsOf: fichierLocal)
    }

    // MARK: - Entretien

    /// Efface les brouillons abandonnés et les archives plus vieilles que la
    /// durée de garde. Ne touche JAMAIS aux photos en attente.
    @discardableResult
    func entretenir(maintenant: Date = Date(), duree: TimeInterval = Coffre.dureeArchive) -> Int {
        verrou.lock(); defer { verrou.unlock() }
        var effaces = 0
        for nom in (try? fm.contentsOfDirectory(atPath: dossierPhotos.path)) ?? [] where nom.hasPrefix(".") {
            let url = dossierPhotos.appendingPathComponent(nom)
            // Un brouillon de plus d'une heure ne sera jamais terminé.
            let date = (try? fm.attributesOfItem(atPath: url.path)[.modificationDate] as? Date) ?? maintenant
            if maintenant.timeIntervalSince(date) > 3600 { try? fm.removeItem(at: url); effaces += 1 }
        }
        for nom in (try? fm.contentsOfDirectory(atPath: dossierArchive.path)) ?? [] {
            guard let secondes = Double(nom.split(separator: "_").first ?? "") else { continue }
            if maintenant.timeIntervalSince1970 - secondes > duree {
                try? fm.removeItem(at: dossierArchive.appendingPathComponent(nom))
                effaces += 1
            }
        }
        return effaces
    }

    /// En chiffres, pour le diagnostic.
    func etat() -> [String: Int] {
        let photos = photosEnAttente().count
        verrou.lock(); defer { verrou.unlock() }
        let archive = ((try? fm.contentsOfDirectory(atPath: dossierArchive.path)) ?? []).count
        var cles = 0, requetes = 0
        if let d = try? Data(contentsOf: fichierLocal),
           let t = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
            cles = t.count
            if let file = t["tm-rapport-queue"] as? String, let fd = file.data(using: .utf8),
               let liste = try? JSONSerialization.jsonObject(with: fd) as? [Any] {
                requetes = liste.count
            }
        }
        return ["photos": photos, "archive": archive, "cles": cles, "requetes": requetes]
    }
}
