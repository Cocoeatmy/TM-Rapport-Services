import SwiftUI

/// TM Rapport — iPhone, iPad et Mac, à partir d'un seul code.
///
/// Les trois plateformes partagent tout ce fichier et tous les autres : seuls
/// quelques blocs `#if os(macOS)` adaptent ce qui diffère réellement — une
/// fenêtre unique et des raccourcis clavier sur Mac, des feuilles sur iPhone.
@main
struct TMRapportApp: App {

    #if os(macOS)
    /// Sur Mac, une seule fenêtre principale : TM Rapport est une
    /// application, pas un navigateur à onglets. Les pages que le site ouvre
    /// à part ont leurs propres fenêtres.
    @StateObject private var navigateur = Navigateur()

    var body: some Scene {
        Window("TM Rapport", id: "principale") {
            Ecran(navigateur: navigateur)
                .frame(minWidth: 820, minHeight: 600)
        }
        .defaultSize(width: 1440, height: 900)
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
            }
        }
    }
    #else
    var body: some Scene {
        WindowGroup {
            // Chaque fenêtre (Split View, Stage Manager sur iPad) a sa propre
            // vue web : une vue web ne peut vivre qu'à un seul endroit. Elles
            // partagent la même session et les mêmes données hors ligne.
            EcranAutonome()
        }
    }
    #endif
}

#if os(iOS)
struct EcranAutonome: View {
    @StateObject private var navigateur = Navigateur()
    var body: some View { Ecran(navigateur: navigateur) }
}
#endif
