import SwiftUI
import WebKit
#if os(iOS)
import UIKit
#else
import AppKit
#endif

// MARK: - La vue web dans SwiftUI

#if os(iOS)
struct VueWeb: UIViewRepresentable {
    let vue: WKWebView
    var echelle: CGFloat = 1
    func makeUIView(context: Context) -> ConteneurEchelle { ConteneurEchelle(vue: vue, echelle: echelle) }
    func updateUIView(_ conteneur: ConteneurEchelle, context: Context) { conteneur.echelle = echelle }
}

/// La vue web, mise en page dans un cadre réduit puis agrandie d'autant
/// (voir Navigateur, « Échelle »). À l'échelle 1, elle occupe simplement
/// tout le conteneur.
final class ConteneurEchelle: UIView {
    let vue: WKWebView
    var echelle: CGFloat { didSet { if echelle != oldValue { setNeedsLayout() } } }

    init(vue: WKWebView, echelle: CGFloat) {
        self.vue = vue
        self.echelle = echelle
        super.init(frame: .zero)
        clipsToBounds = true
        addSubview(vue)
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) non pris en charge") }

    override func layoutSubviews() {
        super.layoutSubviews()
        let f = max(0.5, echelle)
        vue.transform = .identity
        vue.layer.anchorPoint = .zero
        vue.frame = CGRect(x: 0, y: 0, width: bounds.width / f, height: bounds.height / f)
        if f != 1 { vue.transform = CGAffineTransform(scaleX: f, y: f) }
    }
}
#else
struct VueWeb: NSViewRepresentable {
    let vue: WKWebView
    var echelle: CGFloat = 1 // l'app Mac native s'affiche déjà à 100 %
    func makeNSView(context: Context) -> WKWebView { vue }
    func updateNSView(_ nsView: WKWebView, context: Context) {}
}
#endif

// MARK: - L'écran principal

/// Le site, tel quel, avec autour lui ce qu'un navigateur fournit : la
/// couleur de la barre d'état, l'écran « injoignable », les fenêtres
/// secondaires et la feuille de partage.
struct Ecran: View {
    @ObservedObject var navigateur: Navigateur

    /// Le bleu du thème, en attendant que le site déclare le sien.
    private static let bleuTM = Color(red: 30 / 255, green: 58 / 255, blue: 95 / 255)

    var body: some View {
        ZStack {
            // Derrière la barre d'état, la couleur que le site déclare —
            // exactement comme Safari ; sous la barre d'accueil, le fond de
            // page. Le site lui-même reste dans la zone sûre, comme dans
            // Safari : il n'a pas été écrit pour passer sous l'encoche.
            VStack(spacing: 0) {
                (navigateur.couleurHaut ?? navigateur.couleurTheme ?? Ecran.bleuTM)
                (navigateur.couleurFond ?? navigateur.couleurTheme ?? Ecran.bleuTM)
            }
            .ignoresSafeArea()

            VueWeb(vue: navigateur.vue, echelle: navigateur.echelle)
                #if os(iOS)
                // En bas, la page continue sous la barre d'accueil, comme
                // dans Safari : la vue web garde elle-même le bas du contenu
                // atteignable. En haut, elle reste sous la barre d'état.
                .ignoresSafeArea(.container, edges: .bottom)
                #endif

            if case .injoignable(let detail) = navigateur.etat {
                Injoignable(detail: detail) { navigateur.charger() }
            }

            if let minimum = navigateur.miseAJourRequise {
                VStack {
                    Spacer()
                    MiseAJourRequise(minimum: minimum) { navigateur.miseAJourRequise = nil }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 12)
                }
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        #if os(iOS)
        .sheet(item: $navigateur.fenetreSecondaire) { fenetre in
            FenetreSecondaireVue(fenetre: fenetre, navigateur: navigateur)
        }
        /* La feuille de partage ne se présente d'ici que si aucune fenêtre
           secondaire n'est ouverte : SwiftUI ne superpose pas deux feuilles
           sur la même vue, et le bouton « Partager ou enregistrer » d'une
           fenêtre secondaire restait sans effet. La fenêtre secondaire la
           présente alors elle-même (FenetreSecondaireVue). */
        .sheet(item: Binding(
            get: { navigateur.fenetreSecondaire == nil ? navigateur.documentAPartager : nil },
            set: { navigateur.documentAPartager = $0 }
        )) { doc in
            FeuilleDePartage(fichiers: [doc.fichier])
        }
        #endif
    }
}

/// Le site n'a pas pu s'ouvrir, et l'appareil n'en avait aucune copie.
///
/// Ce cas ne doit survenir qu'au tout PREMIER lancement sans réseau : une
/// fois le site chargé une fois, son service worker le ressert hors ligne.
/// L'écran le dit franchement plutôt que d'afficher une page blanche, et
/// réessaie seul dès que le réseau revient.
struct Injoignable: View {
    let detail: String
    let reessayer: () -> Void

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 44, weight: .regular))
                .foregroundStyle(.white.opacity(0.85))
            Text("TM Rapport est injoignable")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white)
            Text("L'application n'a pas encore été ouverte avec du réseau sur cet appareil, ou le site ne répond pas. Elle réessaiera seule dès que la connexion revient.")
                .font(.callout)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.75))
                .frame(maxWidth: 420)
            Button(action: reessayer) {
                Text("Réessayer")
                    .font(.body.weight(.semibold))
                    .padding(.horizontal, 22)
                    .padding(.vertical, 10)
                    .background(Color(red: 37 / 255, green: 99 / 255, blue: 235 / 255), in: Capsule())
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            Text(detail)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.4))
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(red: 12 / 255, green: 22 / 255, blue: 38 / 255).ignoresSafeArea())
    }
}

/// Le site a évolué au point d'exiger une partie native que cette app n'a
/// pas encore. Elle continue de fonctionner, mais le dit, au lieu de laisser
/// une fonction échouer en silence.
struct MiseAJourRequise: View {
    let minimum: String
    let plusTard: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "arrow.down.app.fill")
                .font(.title2)
                .foregroundStyle(.white)
            VStack(alignment: .leading, spacing: 4) {
                Text("Mise à jour de l'application nécessaire")
                    .font(.subheadline.weight(.semibold))
                Text("Installez la version \(minimum) de TM Rapport (vous avez la \(Configuration.versionCoque)). Certaines fonctions pourraient ne pas marcher d'ici là.")
                    .font(.caption)
                    .opacity(0.85)
            }
            .foregroundStyle(.white)
            Spacer(minLength: 0)
            Button("Plus tard", action: plusTard)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
                .buttonStyle(.plain)
        }
        .padding(14)
        .frame(maxWidth: 560)
        .background(Color(red: 30 / 255, green: 58 / 255, blue: 95 / 255), in: RoundedRectangle(cornerRadius: 14))
        .shadow(color: .black.opacity(0.25), radius: 12, y: 4)
    }
}

#if os(iOS)
// MARK: - Fenêtre secondaire (iPhone, iPad)

/// Une page ouverte par `window.open` ou `target=_blank` : le planning en
/// PDF, un document, un aperçu. Elle s'ouvre en feuille, par-dessus l'écran
/// d'où l'on vient, qui reste intact derrière.
struct FenetreSecondaireVue: View {
    let fenetre: FenetreSecondaire
    @ObservedObject var navigateur: Navigateur
    @Environment(\.dismiss) private var fermer

    var body: some View {
        NavigationStack {
            VueWeb(vue: fenetre.vue)
                .ignoresSafeArea(edges: .bottom)
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Fermer") { fermer() }
                    }
                    ToolbarItem(placement: .primaryAction) {
                        Button {
                            if let url = fenetre.vue.url { navigateur.telecharger(url, depuis: fenetre.vue) }
                        } label: {
                            Image(systemName: "square.and.arrow.up")
                        }
                        .accessibilityLabel("Partager ou enregistrer")
                    }
                }
        }
        // Le document téléchargé depuis cette fenêtre se partage PAR-DESSUS elle.
        .sheet(item: $navigateur.documentAPartager) { doc in
            FeuilleDePartage(fichiers: [doc.fichier])
        }
    }
}

/// La feuille de partage d'iOS : Enregistrer dans Fichiers, AirDrop,
/// Imprimer, Mail.
struct FeuilleDePartage: UIViewControllerRepresentable {
    let fichiers: [URL]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: fichiers, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}
#endif

#if os(macOS)
// MARK: - Fenêtres secondaires (Mac)

/// Sur Mac, une page ouverte par le site s'ouvre dans une vraie fenêtre,
/// qu'on déplace, redimensionne et ferme comme n'importe quelle autre.
@MainActor
enum FenetresMac {
    private static var ouvertes: [ObjectIdentifier: NSWindow] = [:]

    static func ouvrir(_ fenetre: FenetreSecondaire, navigateur: Navigateur) {
        let w = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1000, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered, defer: false)
        w.title = "TM Rapport"
        w.isReleasedWhenClosed = false
        w.contentView = fenetre.vue
        w.center()
        w.makeKeyAndOrderFront(nil)
        ouvertes[ObjectIdentifier(fenetre.vue)] = w
        // Le titre suit la page.
        let obs = fenetre.vue.observe(\.title, options: [.new]) { v, _ in
            let t = v.title
            Task { @MainActor in if let t, !t.isEmpty { w.title = t } }
        }
        objc_setAssociatedObject(w, "tm.observation", obs, .OBJC_ASSOCIATION_RETAIN)
    }

    static func fermer(_ vue: WKWebView) {
        ouvertes.removeValue(forKey: ObjectIdentifier(vue))?.close()
    }
}
#endif
