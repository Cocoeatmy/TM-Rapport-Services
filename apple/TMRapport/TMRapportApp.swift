import SwiftUI

/// TM Rapport — iPhone, iPad et Mac, à partir d'un seul code.
///
/// Les trois plateformes partagent tout ce fichier et tous les autres : seuls
/// quelques blocs `#if os(macOS)` adaptent ce qui diffère réellement — une
/// fenêtre et des raccourcis clavier sur Mac, des feuilles sur iPhone.
@main
struct TMRapportApp: App {

    #if os(iOS)
    @UIApplicationDelegateAdaptor(DelegueApp.self) private var delegue
    #else
    @NSApplicationDelegateAdaptor(DelegueApp.self) private var delegue
    #endif
    @Environment(\.scenePhase) private var phase

    /// La seule vue web de l'application (voir Navigateur.principal).
    @StateObject private var navigateur = Navigateur.principal

    #if os(macOS)
    var body: some Scene {
        // Une seule fenêtre principale : TM Rapport est une application, pas
        // un navigateur à onglets. Les pages que le site ouvre à part ont
        // leurs propres fenêtres. Fermer la fenêtre ne quitte pas l'app : les
        // envois continuent, et un clic sur l'icône du Dock la rouvre.
        Window("TM Rapport", id: "principale") {
            Ecran(navigateur: navigateur)
                .frame(minWidth: 820, minHeight: 600)
        }
        .defaultSize(width: 1440, height: 900)
        .onChange(of: phase) { _, p in if p == .active { ArrierePlan.auRetour() } }
        .commands {
            CommandGroup(replacing: .newItem) {}
            CommandMenu("Navigation") {
                Button("Recharger") { navigateur.recharger() }
                    .keyboardShortcut("r", modifiers: .command)
                Button("Précédent") { navigateur.reculer() }
                    .keyboardShortcut("[", modifiers: .command)
                Button("Suivant") { navigateur.avancer() }
                    .keyboardShortcut("]", modifiers: .command)
                Divider()
                Button("Accueil") { navigateur.charger() }
                    .keyboardShortcut("h", modifiers: [.command, .shift])
                Divider()
                Button("Envoyer ce qui attend") { ArrierePlan.auRetour() }
                    .keyboardShortcut("s", modifiers: [.command, .shift])
            }
        }
    }
    #else
    var body: some Scene {
        // Une seule fenêtre (UIApplicationSupportsMultipleScenes = NO) : deux
        // fenêtres feraient tourner deux fois les envois du site.
        WindowGroup {
            Ecran(navigateur: navigateur)
        }
        // Avec un clavier (iPad, et l'app iPad sur un Mac) : le zoom de la page.
        .commands {
            CommandMenu("Présentation") {
                Button("Agrandir") { navigateur.zoomer(0.1) }.keyboardShortcut("+", modifiers: .command)
                Button("Réduire") { navigateur.zoomer(-0.1) }.keyboardShortcut("-", modifiers: .command)
                Button("Taille par défaut") { navigateur.zoomer(nil) }.keyboardShortcut("0", modifiers: .command)
            }
        }
        .onChange(of: phase) { _, p in
            switch p {
            case .background: ArrierePlan.auDepart()
            case .active: ArrierePlan.auRetour()
            default: break
            }
        }
    }
    #endif
}

#if os(iOS)
final class DelegueApp: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Les réveils en arrière-plan doivent être connus d'iOS avant la fin
        // du lancement — y compris quand iOS lance l'app pour un envoi.
        MainActor.assumeIsolated {
            ArrierePlan.enregistrer()
            _ = Navigateur.principal
        }
        return true
    }
}
#else
final class DelegueApp: NSObject, NSApplicationDelegate {
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        MainActor.assumeIsolated {
            ArrierePlan.avantDeQuitter { ok in sender.reply(toApplicationShouldTerminate: ok) }
        }
        return .terminateLater
    }
}
#endif
