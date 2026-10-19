import Foundation
#if os(iOS)
import UIKit
#endif

/// Ce que l'application doit savoir avant d'ouvrir quoi que ce soit.
///
/// ── Le principe de toute l'application ─────────────────────────────────────
///
/// TM Rapport existe déjà : c'est le site. Cette application ne le recopie
/// pas, elle l'OUVRE — dans la vue web d'Apple, celle que Safari utilise
/// lui-même. Une correction déployée sur Vercel arrive donc ici sans
/// recompiler quoi que ce soit, sur l'iPhone, l'iPad et le Mac à la fois.
///
/// Le code natif ne fait que ce que le site ne sait pas faire seul : afficher
/// les boîtes de dialogue, ouvrir les liens externes, enregistrer les
/// documents, et — plus tard — garder les photos et les envoyer app fermée.
enum Configuration {

    /// L'adresse du site.
    ///
    /// Pour les essais seulement, elle se remplace au lancement :
    /// `-TMBaseURL http://localhost:3137`. Rien ne l'enregistre : l'app
    /// relancée normalement retrouve toujours la production.
    static var adresse: URL {
        #if DEBUG
        // Essais seulement : une app distribuée (TestFlight, App Store) ne
        // peut JAMAIS être pointée ailleurs que sur la production.
        if let surcharge = UserDefaults.standard.string(forKey: "TMBaseURL"),
           let url = URL(string: surcharge), url.scheme != nil, url.host != nil {
            return url
        }
        #endif
        return URL(string: "https://tm-rapport-services.vercel.app")!
    }

    /// Les domaines qui s'ouvrent DANS l'application. Tout autre lien — une
    /// carte, Waze, une fiche Notion — part dans l'application concernée,
    /// pour qu'on ne se retrouve jamais coincé hors de TM Rapport sans
    /// bouton pour revenir.
    ///
    /// Ils doivent figurer aussi dans `WKAppBoundDomains` (Info.plist) : c'est
    /// la condition pour qu'iOS active le service worker, donc le hors ligne.
    static var domainesInternes: Set<String> {
        var d: Set<String> = ["tm-rapport-services.vercel.app"]
        if let h = adresse.host?.lowercased() { d.insert(h) }
        return d
    }

    static func estInterne(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return domainesInternes.contains(host)
    }

    /// La version de la coque native, telle que l'App Store ou TestFlight la connaît.
    static let versionCoque: String =
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"

    /// Ajouté à l'identité du navigateur : le site peut ainsi savoir qu'il
    /// tourne dans l'application, et dans quelle version. C'est ce qui
    /// permettra, le jour où un module natif changera, de demander une mise
    /// à jour au lieu de casser. La détection iPhone/iPad/Mac du site n'est
    /// pas affectée : le reste de la signature est celui de Safari.
    static var nomAgent: String { "TMRapportApp/\(versionCoque) (\(plateforme))" }

    static var plateforme: String {
        #if os(macOS)
        return "macOS"
        #else
        return UIDevice.current.userInterfaceIdiom == .pad ? "iPadOS" : "iOS"
        #endif
    }

    /// Mode diagnostic : à chaque page chargée, l'app écrit dans sa console ce
    /// qu'elle voit — titre, adresse, service worker actif ou non. Sert aux
    /// essais automatiques du démarrage sans réseau. `-TMDiagnostic YES`.
    static var diagnostic: Bool { UserDefaults.standard.bool(forKey: "TMDiagnostic") }

    /// L'app sert d'hôte aux tests unitaires : elle ne charge alors rien.
    static var sousTestsUnitaires: Bool {
        ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil
    }
}
