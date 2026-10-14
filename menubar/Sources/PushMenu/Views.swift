import AppKit
import SwiftUI

// The same look as the app window and the first-run setup: near-black card, one soft lavender accent, Quicksand type,
// pale primary buttons, mono captions. Colours mean state (green on, amber warning, red off), never decoration.
enum Theme {
    static let accent = Color(hex: "#aeb0ff")
    static let blue = accent           // "selected" everywhere
    static let violet = Color(hex: "#5c64ff")
    static let green = Color(hex: "#3cdc78")
    static let amber = Color(hex: "#ffbe32")
    static let red = Color(hex: "#ff5a5a")
    static let ink = Color(hex: "#eeeef3")
    static let ink2 = Color(hex: "#a5a5b3")
    static let ink3 = Color(hex: "#6b6b77")
    static let bg = Color(hex: "#0b0b0f")
    static let card = Color(hex: "#111117")
    static let well = Color(hex: "#16161d")
    static let line = Color.white.opacity(0.08)

    /// Quicksand and IBM Plex Mono live in the app's design/fonts folder; register them once so SwiftUI can use them by name.
    static func registerFonts() {
        let roots = [Bundle.main.resourceURL?.appendingPathComponent("root/design/fonts"), URL(fileURLWithPath: FileManager.default.currentDirectoryPath).appendingPathComponent("../design/fonts")].compactMap { $0 }
        for r in roots { for f in ["Quicksand-VF.ttf", "IBMPlexMono-Regular.ttf", "IBMPlexMono-Bold.ttf"] { CTFontManagerRegisterFontsForURL(r.appendingPathComponent(f) as CFURL, .process, nil) } }
    }
    static func qs(_ size: CGFloat, _ weight: Font.Weight = .semibold) -> Font { .custom("Quicksand", size: size).weight(weight) }
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font { .custom("IBM Plex Mono", size: size).weight(weight) }
}

enum Tab: Int, CaseIterable {
    case profiles, player, display, tests, settings
    var icon: String { ["square.grid.2x2", "music.note", "sun.max", "wand.and.stars", "gearshape"][rawValue] }
    var title: String { ["Profiles", "Player", "Display", "Tests", "Settings"][rawValue] }
    var tint: Color { Theme.accent }
}

/// The app's mark: a 3 x 3 grid of pads, the diagonal lit, with the soft wave that runs through it in the app.
struct PadMark: View {
    var size: CGFloat = 30
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            let gap = size * 0.1
            VStack(spacing: gap) {
                ForEach(0..<3, id: \.self) { r in
                    HStack(spacing: gap) {
                        ForEach(0..<3, id: \.self) { c in
                            let lit = r == c
                            let wave = max(0, sin((t * 1.1) - Double(r + c) * 0.9))
                            RoundedRectangle(cornerRadius: size * 0.09, style: .continuous)
                                .fill(Theme.accent.opacity(lit ? 1 : 0.16 + 0.34 * pow(wave, 6)))
                        }
                    }
                }
            }.frame(width: size, height: size)
        }
    }
}

struct Card<Content: View>: View {
    var tint: Color? = nil
    var active = false
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(.horizontal, 13).padding(.vertical, 11)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(active ? Theme.well : Theme.card))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(active ? (tint ?? Theme.accent).opacity(0.5) : Theme.line, lineWidth: 1))
    }
}

struct SectionTitle: View {
    let text: String
    var body: some View { Text(text.uppercased()).font(Theme.mono(10.5, .bold)).tracking(1.1).foregroundColor(Theme.ink3) }
}

struct AppIcon: View {
    let bundle: String?
    let accent: Color
    var size: CGFloat = 30
    var body: some View {
        Group {
            if let b = bundle, let url = URL(string: "http://127.0.0.1:8472/api/app-icon/\(b)") {
                AsyncImage(url: url) { ph in
                    if let img = ph.image { img.resizable().scaledToFit() } else { RoundedRectangle(cornerRadius: 8).fill(accent.opacity(0.5)) }
                }
            } else {
                RoundedRectangle(cornerRadius: 8, style: .continuous).fill(accent)
            }
        }
        .frame(width: size, height: size)
    }
}

struct ProfileRow: View {
    @ObservedObject var store: Store
    let p: ProfileInfo
    @State private var hover = false
    var body: some View {
        let tint = Color(hex: p.accent)
        let isActive = store.active == p.id, isPinned = store.pinned == p.id
        Button { store.pin(p.id) } label: {
            Card(tint: tint, active: isActive) {
                HStack(spacing: 11) {
                    AppIcon(bundle: p.bundle, accent: tint)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(p.name).font(Theme.qs(14.5, .bold)).foregroundColor(Theme.ink).lineLimit(1)
                        Text(isPinned ? "Master · stays on screen" : isActive ? "Auto · follows your app" : "Tap to make Master")
                            .font(Theme.qs(11.5, .medium)).foregroundColor(isPinned ? tint : Theme.ink3)
                    }
                    Spacer(minLength: 4)
                    Image(systemName: isPinned ? "pin.fill" : "pin")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(isPinned ? tint : Theme.ink3.opacity(hover ? 1.6 : 1))
                        .rotationEffect(.degrees(isPinned ? 0 : 35))
                }
            }
            .scaleEffect(hover ? 1.01 : 1)
        }
        .buttonStyle(.plain)
        .onHover { h in withAnimation(.easeOut(duration: 0.12)) { hover = h } }
    }
}

struct ToggleRow: View {
    let icon: String
    let tint: Color
    let title: String
    var subtitle: String? = nil
    @Binding var on: Bool
    var body: some View {
        Card {
            HStack(spacing: 11) {
                Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundColor(Theme.ink2)
                    .frame(width: 32, height: 32).background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(Theme.well))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(Theme.qs(14, .bold)).foregroundColor(Theme.ink)
                    if let s = subtitle { Text(s).font(Theme.qs(11.5, .medium)).foregroundColor(Theme.ink3).lineLimit(2) }
                }
                Spacer(minLength: 4)
                Toggle("", isOn: $on).toggleStyle(.switch).labelsHidden().tint(Theme.accent)
            }
        }
    }
}

struct SliderRow: View {
    let icon: String
    let tint: Color
    let title: String
    @Binding var value: Double
    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundColor(Theme.ink2)
                    Text(title).font(Theme.qs(14, .bold)).foregroundColor(Theme.ink)
                    Spacer()
                    Text("\(Int(value))%").font(Theme.mono(11.5, .medium)).foregroundColor(Theme.ink2)
                }
                Slider(value: $value, in: 5...100).tint(Theme.accent)
            }
        }
    }
}

struct Segmented: View {
    let options: [(String, String)]
    @Binding var value: String
    var tint: Color = Theme.accent
    var body: some View {
        HStack(spacing: 3) {
            ForEach(options, id: \.0) { o in
                Button { withAnimation(.easeOut(duration: 0.15)) { value = o.0 } } label: {
                    Text(o.1).font(Theme.qs(12, .bold)).frame(maxWidth: .infinity).padding(.vertical, 7)
                        .foregroundColor(value == o.0 ? Theme.bg : Theme.ink2)
                        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(value == o.0 ? Theme.ink : Color.clear))
                }.buttonStyle(.plain)
            }
        }
        .padding(3).background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Theme.well))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line, lineWidth: 1))
    }
}

struct ActionRow: View {
    let icon: String
    let tint: Color
    let title: String
    let subtitle: String
    let action: () -> Void
    @State private var hover = false
    var body: some View {
        Button(action: action) {
            Card(tint: tint, active: hover) {
                HStack(spacing: 11) {
                    Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundColor(Theme.ink2)
                        .frame(width: 34, height: 34).background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Theme.well))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title).font(Theme.qs(14, .bold)).foregroundColor(Theme.ink)
                        Text(subtitle).font(Theme.qs(11.5, .medium)).foregroundColor(Theme.ink3)
                    }
                    Spacer()
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold)).foregroundColor(Theme.ink3)
                }
            }
        }.buttonStyle(.plain).onHover { h in withAnimation(.easeOut(duration: 0.12)) { hover = h } }
    }
}

struct RootView: View {
    @ObservedObject var store: Store
    var close: () -> Void
    @State private var tab: Tab

    init(store: Store, tab: Tab = .profiles, close: @escaping () -> Void) {
        self.store = store
        self.close = close
        _tab = State(initialValue: tab)
    }

    var statusColor: Color { !store.connected ? Theme.red : store.standby ? Theme.amber : store.usb ? Theme.green : Theme.amber }
    var statusText: String { !store.connected ? "Daemon not running" : store.standby ? "Push is turned off" : store.usb ? "Push 2 connected" : "No Push 2 found" }

    var body: some View {
        VStack(spacing: 14) {
            header
            tabBar
            VStack(alignment: .leading, spacing: 10) {
                HStack { SectionTitle(text: tab.title); Spacer() }
                ScrollView(.vertical, showsIndicators: false) { content.padding(.bottom, 2) }
            }
            .frame(maxHeight: .infinity, alignment: .top)
            footer
        }
        .padding(18)
        .frame(width: 348, height: 520)
        .background(
            ZStack {
                Theme.bg
                RadialGradient(colors: [Theme.violet.opacity(0.30), .clear], center: .top, startRadius: 4, endRadius: 300)
            })
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.09), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .preferredColorScheme(.dark)
    }

    var header: some View {
        HStack(spacing: 12) {
            PadMark(size: 30)
            VStack(alignment: .leading, spacing: 4) {
                Text("Push Deck").font(Theme.qs(17, .bold)).tracking(-0.2).foregroundColor(Theme.ink)
                HStack(spacing: 6) {
                    Circle().fill(statusColor).frame(width: 6, height: 6).shadow(color: statusColor.opacity(0.8), radius: 3)
                    Text(statusText).font(Theme.qs(12, .medium)).foregroundColor(Theme.ink2)
                }
            }
            Spacer()
            Button { store.toggleStandby() } label: {
                Image(systemName: "power").font(.system(size: 13, weight: .bold))
                    .foregroundColor(store.standby ? Theme.red : Theme.ink2)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(store.standby ? Theme.red.opacity(0.14) : Theme.well))
                    .overlay(Circle().stroke(store.standby ? Theme.red.opacity(0.5) : Theme.line, lineWidth: 1))
            }.buttonStyle(.plain).help(store.standby ? "Turn Push on" : "Turn Push off")
        }
    }

    var tabBar: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases, id: \.rawValue) { t in
                Button { withAnimation(.easeOut(duration: 0.15)) { tab = t } } label: {
                    Image(systemName: t.icon).font(.system(size: 14.5, weight: .semibold))
                        .foregroundColor(tab == t ? Theme.bg : Theme.ink2)
                        .frame(maxWidth: .infinity).frame(height: 34)
                        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(tab == t ? Theme.ink : Color.clear))
                }.buttonStyle(.plain).help(t.title)
            }
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(Theme.card))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(Theme.line, lineWidth: 1))
    }

    @ViewBuilder var content: some View {
        switch tab {
        case .profiles:
            VStack(spacing: 8) {
                if store.profiles.isEmpty { Text(store.connected ? "No profiles yet" : "Start the daemon to see your profiles").font(Theme.qs(12.5, .medium)).foregroundColor(Theme.ink3).padding(.top, 20) }
                ForEach(store.profiles) { ProfileRow(store: store, p: $0) }
            }
        case .player:
            VStack(spacing: 10) {
                ToggleRow(icon: "music.note", tint: Theme.accent, title: "Player on the display", subtitle: "Half the display, with Spotify, YouTube Music and more",
                          on: Binding(get: { store.mediaMode != "off" }, set: { store.setPlayer(on: $0) }))
                Card { VStack(alignment: .leading, spacing: 8) {
                    Text("Player side").font(Theme.qs(14, .bold)).foregroundColor(Theme.ink)
                    Segmented(options: [("left", "On the left"), ("right", "On the right")], value: Binding(get: { store.halfLayout }, set: { store.halfLayout = $0; store.setMedia("half_layout", $0) }), tint: Theme.accent)
                } }
                Card { VStack(alignment: .leading, spacing: 8) {
                    Text("When nothing is playing").font(Theme.qs(14, .bold)).foregroundColor(Theme.ink)
                    Segmented(options: [("last", "Last track"), ("empty", "Nothing playing")], value: Binding(get: { store.idleMode }, set: { store.idleMode = $0; store.setMedia("idle", $0) }), tint: Theme.accent)
                } }
            }
        case .display:
            VStack(spacing: 10) {
                SliderRow(icon: "display", tint: Theme.accent, title: "Display brightness",
                          value: Binding(get: { store.displayBrightness }, set: { store.displayBrightness = $0; store.setSetting("display_brightness", $0.rounded(), quiet: true) }))
                SliderRow(icon: "circle.grid.3x3.fill", tint: Theme.accent, title: "Pad and button brightness",
                          value: Binding(get: { store.padBrightness }, set: { store.padBrightness = $0; store.setSetting("brightness", $0.rounded(), quiet: true) }))
                ToggleRow(icon: "gauge.with.dots.needle.67percent", tint: Theme.accent, title: "Live Claude usage", subtitle: "Shows your plan limits and context on the display",
                          on: Binding(get: { store.claudeLive }, set: { store.claudeLive = $0; store.setSetting("claude_usage_live", $0) }))
            }
        case .tests:
            VStack(spacing: 8) {
                ActionRow(icon: "rainbow", tint: Theme.accent, title: "Rainbow test", subtitle: "Pads, buttons and display light up") { store.runTest("rainbow") }
                ActionRow(icon: "eyedropper", tint: Theme.accent, title: "Colour calibration", subtitle: "Tune how colours look on the pads") { store.runTest("cal_all") }
            }
        case .settings:
            VStack(spacing: 10) {
                ToggleRow(icon: "arrow.up.forward.app", tint: Theme.blue, title: "Open at login", subtitle: "Start this menu bar app when you log in",
                          on: Binding(get: { store.loginItem }, set: { store.loginItem = $0; LoginItem.set($0) }))
                Card { VStack(alignment: .leading, spacing: 8) {
                    Text("When the Push runs").font(Theme.qs(14, .bold)).foregroundColor(Theme.ink)
                    ForEach([("login", "Start at login, always on"), ("login_sleep", "Start at login, sleep when idle"), ("ui_only", "Only while the dashboard is open"), ("manual", "Completely manual")], id: \.0) { o in
                        Button { store.lifecycle = o.0; store.setSetting("lifecycle", o.0) } label: {
                            HStack(spacing: 9) {
                                Image(systemName: store.lifecycle == o.0 ? "checkmark.circle.fill" : "circle").font(.system(size: 14)).foregroundColor(store.lifecycle == o.0 ? Theme.blue : Theme.ink3)
                                Text(o.1).font(Theme.qs(12.5, .medium)).foregroundColor(store.lifecycle == o.0 ? Theme.ink : Theme.ink2)
                                Spacer()
                            }.contentShape(Rectangle())
                        }.buttonStyle(.plain)
                    }
                } }
            }
        }
    }

    var footer: some View {
        HStack(spacing: 10) {
            Button { store.openDashboard(); close() } label: {
                HStack(spacing: 8) { Image(systemName: "arrow.up.forward.app").font(.system(size: 13, weight: .bold)); Text("Open Push Deck").font(Theme.qs(14, .bold)) }
                    .foregroundColor(Theme.bg).frame(maxWidth: .infinity).frame(height: 40)
                    .background(Capsule().fill(Theme.ink))
            }.buttonStyle(.plain)
            Button { NSApp.terminate(nil) } label: {
                HStack(spacing: 7) { Image(systemName: "power").font(.system(size: 12, weight: .bold)); Text("Quit").font(Theme.qs(14, .bold)) }
                    .foregroundColor(Theme.ink2).frame(width: 92, height: 40)
                    .background(Capsule().fill(Theme.well))
                    .overlay(Capsule().stroke(Theme.line, lineWidth: 1))
            }.buttonStyle(.plain)
        }
    }
}
