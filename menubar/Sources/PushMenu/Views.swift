import AppKit
import SwiftUI

// Palette: deep navy glass, one blue for "selected", a colour per thing that has one.
enum Theme {
    static let blue = Color(hex: "#3b82f6")
    static let violet = Color(hex: "#7c5cff")
    static let green = Color(hex: "#34d399")
    static let amber = Color(hex: "#fbbf24")
    static let red = Color(hex: "#f87171")
    static let ink = Color.white.opacity(0.94)
    static let ink2 = Color.white.opacity(0.58)
    static let ink3 = Color.white.opacity(0.36)
    static let card = Color.white.opacity(0.06)
    static let line = Color.white.opacity(0.09)
}

enum Tab: Int, CaseIterable {
    case profiles, player, display, tests, settings
    var icon: String { ["square.grid.2x2", "music.note", "sun.max", "wand.and.stars", "gearshape"][rawValue] }
    var title: String { ["PROFILES", "PLAYER", "DISPLAY", "TESTS", "SETTINGS"][rawValue] }
    var tint: Color { [Theme.blue, Color(hex: "#34d399"), Color(hex: "#fbbf24"), Color(hex: "#c084fc"), Color(hex: "#60a5fa")][rawValue] }
}

struct Card<Content: View>: View {
    var tint: Color? = nil
    var active = false
    @ViewBuilder var content: Content
    var body: some View {
        content
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(active && tint != nil ? LinearGradient(colors: [tint!.opacity(0.26), tint!.opacity(0.07)], startPoint: .leading, endPoint: .trailing)
                          : LinearGradient(colors: [Theme.card, Theme.card], startPoint: .leading, endPoint: .trailing)))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(active && tint != nil ? tint!.opacity(0.55) : Theme.line, lineWidth: 1))
    }
}

struct SectionTitle: View {
    let text: String
    var body: some View { Text(text).font(.system(size: 11, weight: .bold)).tracking(1.2).foregroundColor(Theme.ink2) }
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
                        Text(p.name).font(.system(size: 14, weight: .semibold)).foregroundColor(Theme.ink).lineLimit(1)
                        Text(isPinned ? "Master · stays on screen" : isActive ? "Auto · follows your app" : "Tap to make Master")
                            .font(.system(size: 11)).foregroundColor(isPinned ? tint : Theme.ink3)
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
                Image(systemName: icon).font(.system(size: 14, weight: .semibold)).foregroundColor(tint)
                    .frame(width: 30, height: 30).background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(tint.opacity(0.16)))
                VStack(alignment: .leading, spacing: 1) {
                    Text(title).font(.system(size: 13.5, weight: .semibold)).foregroundColor(Theme.ink)
                    if let s = subtitle { Text(s).font(.system(size: 11)).foregroundColor(Theme.ink3).lineLimit(2) }
                }
                Spacer(minLength: 4)
                Toggle("", isOn: $on).toggleStyle(.switch).labelsHidden().tint(Theme.blue)
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
                    Image(systemName: icon).font(.system(size: 13, weight: .semibold)).foregroundColor(tint)
                    Text(title).font(.system(size: 13.5, weight: .semibold)).foregroundColor(Theme.ink)
                    Spacer()
                    Text("\(Int(value))%").font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundColor(Theme.ink2)
                }
                Slider(value: $value, in: 5...100).tint(tint)
            }
        }
    }
}

struct Segmented: View {
    let options: [(String, String)]
    @Binding var value: String
    var tint: Color = Theme.blue
    var body: some View {
        HStack(spacing: 3) {
            ForEach(options, id: \.0) { o in
                Button { withAnimation(.easeOut(duration: 0.12)) { value = o.0 } } label: {
                    Text(o.1).font(.system(size: 12, weight: .semibold)).frame(maxWidth: .infinity).padding(.vertical, 7)
                        .foregroundColor(value == o.0 ? .white : Theme.ink2)
                        .background(RoundedRectangle(cornerRadius: 9, style: .continuous).fill(value == o.0 ? tint.opacity(0.85) : Color.clear))
                }.buttonStyle(.plain)
            }
        }
        .padding(3).background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.white.opacity(0.06)))
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
                    Image(systemName: icon).font(.system(size: 15, weight: .semibold)).foregroundColor(tint)
                        .frame(width: 34, height: 34).background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(tint.opacity(0.16)))
                    VStack(alignment: .leading, spacing: 1) {
                        Text(title).font(.system(size: 13.5, weight: .semibold)).foregroundColor(Theme.ink)
                        Text(subtitle).font(.system(size: 11)).foregroundColor(Theme.ink3)
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
    var statusText: String { !store.connected ? "Daemon not running" : store.standby ? "Push is turned off" : store.usb ? "Push connected" : "Push not connected" }

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
                LinearGradient(colors: [Color(hex: "#111d3f"), Color(hex: "#0a1226")], startPoint: .top, endPoint: .bottom)
                RadialGradient(colors: [tab.tint.opacity(0.28), .clear], center: .topLeading, startRadius: 4, endRadius: 330).animation(.easeInOut(duration: 0.35), value: tab)
                RadialGradient(colors: [Theme.violet.opacity(0.14), .clear], center: .bottomTrailing, startRadius: 4, endRadius: 300)
            })
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).stroke(Color.white.opacity(0.14), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .preferredColorScheme(.dark)
    }

    var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "square.grid.3x3.fill").font(.system(size: 17, weight: .bold)).foregroundColor(.white)
                .frame(width: 40, height: 40)
                .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(LinearGradient(colors: [Theme.blue, Theme.violet], startPoint: .topLeading, endPoint: .bottomTrailing)))
                .shadow(color: Theme.blue.opacity(0.5), radius: 8, y: 2)
            VStack(alignment: .leading, spacing: 3) {
                Text("Push Deck").font(.system(size: 16, weight: .bold)).foregroundColor(Theme.ink)
                HStack(spacing: 6) {
                    Circle().fill(statusColor).frame(width: 7, height: 7).shadow(color: statusColor.opacity(0.9), radius: 3)
                    Text(statusText).font(.system(size: 12)).foregroundColor(Theme.ink2)
                }
            }
            Spacer()
            Button { store.toggleStandby() } label: {
                Image(systemName: "power").font(.system(size: 13, weight: .bold))
                    .foregroundColor(store.standby ? Theme.red : Theme.ink2)
                    .frame(width: 34, height: 34)
                    .background(Circle().fill(store.standby ? Theme.red.opacity(0.18) : Color.white.opacity(0.07)))
                    .overlay(Circle().stroke(store.standby ? Theme.red.opacity(0.5) : Theme.line, lineWidth: 1))
            }.buttonStyle(.plain).help(store.standby ? "Turn Push on" : "Turn Push off")
        }
    }

    var tabBar: some View {
        HStack(spacing: 4) {
            ForEach(Tab.allCases, id: \.rawValue) { t in
                Button { withAnimation(.easeOut(duration: 0.15)) { tab = t } } label: {
                    Image(systemName: t.icon).font(.system(size: 15, weight: .semibold))
                        .foregroundColor(tab == t ? t.tint : Theme.ink2)
                        .frame(maxWidth: .infinity).frame(height: 36)
                        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(tab == t ? t.tint.opacity(0.20) : Color.clear))
                        .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(tab == t ? t.tint.opacity(0.45) : Color.clear, lineWidth: 1))
                }.buttonStyle(.plain).help(t.title.capitalized)
            }
        }
        .padding(4)
        .background(RoundedRectangle(cornerRadius: 15, style: .continuous).fill(Color.white.opacity(0.05)))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).stroke(Theme.line, lineWidth: 1))
    }

    @ViewBuilder var content: some View {
        switch tab {
        case .profiles:
            VStack(spacing: 8) {
                if store.profiles.isEmpty { Text(store.connected ? "No profiles yet" : "Start the daemon to see your profiles").font(.system(size: 12)).foregroundColor(Theme.ink3).padding(.top, 20) }
                ForEach(store.profiles) { ProfileRow(store: store, p: $0) }
            }
        case .player:
            VStack(spacing: 10) {
                ToggleRow(icon: "music.note", tint: Theme.green, title: "Player on the display", subtitle: "Half the display, with Spotify, YouTube Music and more",
                          on: Binding(get: { store.mediaMode != "off" }, set: { store.setPlayer(on: $0) }))
                Card { VStack(alignment: .leading, spacing: 8) {
                    Text("Player side").font(.system(size: 13.5, weight: .semibold)).foregroundColor(Theme.ink)
                    Segmented(options: [("left", "On the left"), ("right", "On the right")], value: Binding(get: { store.halfLayout }, set: { store.halfLayout = $0; store.setMedia("half_layout", $0) }), tint: Theme.green)
                } }
                Card { VStack(alignment: .leading, spacing: 8) {
                    Text("When nothing is playing").font(.system(size: 13.5, weight: .semibold)).foregroundColor(Theme.ink)
                    Segmented(options: [("last", "Last track"), ("empty", "Nothing playing")], value: Binding(get: { store.idleMode }, set: { store.idleMode = $0; store.setMedia("idle", $0) }), tint: Theme.green)
                } }
            }
        case .display:
            VStack(spacing: 10) {
                SliderRow(icon: "display", tint: Theme.amber, title: "Display brightness",
                          value: Binding(get: { store.displayBrightness }, set: { store.displayBrightness = $0; store.setSetting("display_brightness", $0.rounded(), quiet: true) }))
                SliderRow(icon: "circle.grid.3x3.fill", tint: Color(hex: "#fb923c"), title: "Pad and button brightness",
                          value: Binding(get: { store.padBrightness }, set: { store.padBrightness = $0; store.setSetting("brightness", $0.rounded(), quiet: true) }))
                ToggleRow(icon: "gauge.with.dots.needle.67percent", tint: Color(hex: "#d97757"), title: "Live Claude usage", subtitle: "Shows your plan limits and context on the display",
                          on: Binding(get: { store.claudeLive }, set: { store.claudeLive = $0; store.setSetting("claude_usage_live", $0) }))
            }
        case .tests:
            VStack(spacing: 8) {
                ActionRow(icon: "rainbow", tint: Color(hex: "#c084fc"), title: "Rainbow test", subtitle: "Pads, buttons and display light up") { store.runTest("rainbow") }
                ActionRow(icon: "eyedropper", tint: Color(hex: "#f472b6"), title: "Colour calibration", subtitle: "Tune how colours look on the pads") { store.runTest("cal_all") }
            }
        case .settings:
            VStack(spacing: 10) {
                ToggleRow(icon: "arrow.up.forward.app", tint: Theme.blue, title: "Open at login", subtitle: "Start this menu bar app when you log in",
                          on: Binding(get: { store.loginItem }, set: { store.loginItem = $0; LoginItem.set($0) }))
                Card { VStack(alignment: .leading, spacing: 8) {
                    Text("When the Push runs").font(.system(size: 13.5, weight: .semibold)).foregroundColor(Theme.ink)
                    ForEach([("login", "Start at login, always on"), ("login_sleep", "Start at login, sleep when idle"), ("ui_only", "Only while the dashboard is open"), ("manual", "Completely manual")], id: \.0) { o in
                        Button { store.lifecycle = o.0; store.setSetting("lifecycle", o.0) } label: {
                            HStack(spacing: 9) {
                                Image(systemName: store.lifecycle == o.0 ? "checkmark.circle.fill" : "circle").font(.system(size: 14)).foregroundColor(store.lifecycle == o.0 ? Theme.blue : Theme.ink3)
                                Text(o.1).font(.system(size: 12.5)).foregroundColor(store.lifecycle == o.0 ? Theme.ink : Theme.ink2)
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
                HStack(spacing: 8) { Image(systemName: "arrow.up.forward.app").font(.system(size: 13, weight: .semibold)); Text("Open Dashboard").font(.system(size: 13.5, weight: .semibold)) }
                    .foregroundColor(.white).frame(maxWidth: .infinity).frame(height: 40)
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(LinearGradient(colors: [Theme.blue, Color(hex: "#5b6cf0")], startPoint: .leading, endPoint: .trailing)))
                    .shadow(color: Theme.blue.opacity(0.45), radius: 8, y: 3)
            }.buttonStyle(.plain)
            Button { NSApp.terminate(nil) } label: {
                HStack(spacing: 7) { Image(systemName: "power").font(.system(size: 12, weight: .semibold)); Text("Quit").font(.system(size: 13.5, weight: .semibold)) }
                    .foregroundColor(Theme.ink2).frame(width: 92, height: 40)
                    .background(RoundedRectangle(cornerRadius: 13, style: .continuous).fill(Color.white.opacity(0.06)))
                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).stroke(Theme.line, lineWidth: 1))
            }.buttonStyle(.plain)
        }
    }
}
