import AppKit
import ServiceManagement
import SwiftUI

struct ProfileInfo: Identifiable, Equatable {
    let id: String
    let name: String
    let accent: String
    let bundle: String?
}

extension Color {
    init(hex: String) {
        let h = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var v: UInt64 = 0
        Scanner(string: h).scanHexInt64(&v)
        self.init(.sRGB, red: Double((v >> 16) & 255) / 255, green: Double((v >> 8) & 255) / 255, blue: Double(v & 255) / 255, opacity: 1)
    }
}

/// Everything the menu shows, kept in step with the daemon over ws://127.0.0.1:8472/ws.
final class Store: ObservableObject {
    @Published var connected = false
    @Published var usb = false
    @Published var standby = false
    @Published var lifecycle = "login"
    @Published var pinned: String?
    @Published var active: String?
    @Published var profiles: [ProfileInfo] = []
    @Published var displayBrightness = 100.0
    @Published var padBrightness = 100.0
    @Published var mediaMode = "off"
    @Published var halfLayout = "left"
    @Published var idleMode = "last"
    @Published var claudeLive = false
    @Published var loginItem = LoginItem.isOn
    var onIcon: () -> Void = {}

    private var task: URLSessionWebSocketTask?
    private var media: [String: Any] = [:]
    private var quietUntil: [String: Date] = [:]   // keys the user is changing right now: ignore the daemon's echo for a moment

    func connect() {
        task = URLSession.shared.webSocketTask(with: URL(string: "ws://127.0.0.1:8472/ws")!)
        task?.resume()
        listen()
    }

    private func listen() {
        task?.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .failure:
                DispatchQueue.main.async { self.connected = false; self.onIcon() }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.connect() }
            case .success(let msg):
                if case .string(let s) = msg, let d = s.data(using: .utf8), let j = try? JSONSerialization.jsonObject(with: d) as? [String: Any] {
                    DispatchQueue.main.async { self.handle(j) }
                }
                self.listen()
            }
        }
    }

    private func parseProfiles(_ list: [[String: Any]]) -> [ProfileInfo] {
        list.compactMap {
            guard let id = $0["id"] as? String, let name = $0["name"] as? String else { return nil }
            let accent = (($0["theme"] as? [String: Any])?["accent"] as? String) ?? "#6b7cff"
            var bundle = ($0["icon"] as? [String: Any])?["bundle"] as? String
            if bundle == nil, ($0["icon"] as? [String: Any]) == nil {
                bundle = (($0["match"] as? [String: Any])?["bundle_ids"] as? [String])?.first
            }
            return ProfileInfo(id: id, name: name, accent: accent, bundle: bundle)
        }
    }

    private func applySettings(_ s: [String: Any]) {
        lifecycle = s["lifecycle"] as? String ?? lifecycle
        func quiet(_ k: String) -> Bool { (quietUntil[k] ?? .distantPast) > Date() }
        if !quiet("display_brightness"), let v = s["display_brightness"] as? Double { displayBrightness = v }
        if !quiet("brightness"), let v = s["brightness"] as? Double { padBrightness = v }
        if let m = s["media"] as? [String: Any] {
            media = m
            let mode = m["mode"] as? String ?? "off"
            mediaMode = mode == "off" ? "off" : "half"
            halfLayout = m["half_layout"] as? String ?? "left"
            idleMode = m["idle"] as? String ?? "last"
        }
        claudeLive = s["claude_usage_live"] as? Bool ?? false
        if let sb = s["standby"] as? Bool { standby = sb }
    }

    private func handle(_ j: [String: Any]) {
        switch j["type"] as? String {
        case "hello":
            connected = true
            profiles = parseProfiles(j["profiles"] as? [[String: Any]] ?? [])
            pinned = j["pinned"] as? String
            active = j["active"] as? String
            usb = (j["status"] as? [String: Any])?["usb"] as? Bool ?? false
            standby = j["standby"] as? Bool ?? false
            applySettings(j["settings"] as? [String: Any] ?? [:])
        case "standby": standby = j["standby"] as? Bool ?? false
        case "status": usb = (j["status"] as? [String: Any])?["usb"] as? Bool ?? false
        case "active": pinned = j["pinned"] as? String; active = j["active"] as? String
        case "settings": applySettings(j["settings"] as? [String: Any] ?? [:])
        case "profiles": profiles = parseProfiles(j["profiles"] as? [[String: Any]] ?? [])
        default: break
        }
        onIcon()
    }

    func send(_ obj: [String: Any]) {
        guard let d = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: d, encoding: .utf8) else { return }
        task?.send(.string(s)) { _ in }
    }

    // MARK: actions
    func pin(_ id: String) { send(["type": "set_profile", "id": pinned == id ? NSNull() : id]) }
    func setSetting(_ key: String, _ value: Any, quiet: Bool = false) {
        if quiet { quietUntil[key] = Date().addingTimeInterval(0.8) }
        send(["type": "set_setting", "key": key, "value": value])
    }
    func setPlayer(on: Bool) {
        var m = media
        m["mode"] = on ? "half" : "off"
        mediaMode = on ? "half" : "off"
        setSetting("media", m)
    }
    func setMedia(_ key: String, _ value: String) {
        var m = media
        m[key] = value
        setSetting("media", m)
    }
    func toggleStandby() { send(["type": "standby", "on": !standby]) }
    func runTest(_ name: String) { send(["type": "run_test", "name": name]) }
    func openDashboard() { UIWindow.shared.show() }
}

/// "Open at login" for the menu bar app. Inside the app bundle (Push Deck.app) it registers as a proper login item with
/// ServiceManagement, so System Settings lists it by name with its icon. A bare binary falls back to a LaunchAgent.
enum LoginItem {
    static let label = "com.arcept.pushdeck.menubar"
    static var path: String { NSHomeDirectory() + "/Library/LaunchAgents/\(label).plist" }
    static var inBundle: Bool { Bundle.main.bundlePath.hasSuffix(".app") }
    static var isOn: Bool { inBundle ? SMAppService.mainApp.status == .enabled : FileManager.default.fileExists(atPath: path) }

    static func set(_ on: Bool) {
        if inBundle {
            do { if on { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() } } catch { NSLog("login item: \(error)") }
        } else if on {
            guard let exe = Bundle.main.executablePath else { return }
            let plist: [String: Any] = ["Label": label, "ProgramArguments": [URL(fileURLWithPath: exe).resolvingSymlinksInPath().path],
                                        "RunAtLoad": true, "ProcessType": "Interactive"]
            try? FileManager.default.createDirectory(atPath: NSHomeDirectory() + "/Library/LaunchAgents", withIntermediateDirectories: true)
            (plist as NSDictionary).write(toFile: path, atomically: true)
        } else {
            try? FileManager.default.removeItem(atPath: path)
        }
    }
}
