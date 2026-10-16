import AppKit
import SwiftUI

// Menu bar companion for the Push daemon (ws://127.0.0.1:8472/ws): a dark glass panel under the menu bar icon with
// profiles, player, display, tests and settings. Replaces the plain drop-down menu.

final class Panel: NSPanel {
    override var canBecomeKey: Bool { true }
}

final class App: NSObject, NSApplicationDelegate, NSWindowDelegate {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    let store = Store()
    var panel: Panel!

    func applicationShouldHandleReopen(_ app: NSApplication, hasVisibleWindows flag: Bool) -> Bool { store.openDashboard(); return true }  // double-clicking the app again opens the UI

    func applicationWillTerminate(_ n: Notification) { DaemonHost.shared.stop() }

    func applicationDidFinishLaunching(_ n: Notification) {
        Theme.registerFonts()
        store.onIcon = { [weak self] in self?.refreshIcon() }
        refreshIcon()
        item.button?.target = self
        item.button?.action = #selector(toggle)

        let host = NSHostingView(rootView: RootView(store: store, close: { [weak self] in self?.hidePanel() }))
        host.frame = NSRect(x: 0, y: 0, width: 348, height: 520)
        host.wantsLayer = true
        host.layer?.backgroundColor = NSColor.clear.cgColor
        panel = Panel(contentRect: host.frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.contentView = host
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true
        panel.level = .popUpMenu
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.delegate = self
        DaemonHost.shared.start()
        // Opening the app by hand shows the dashboard; when macOS starts it at login it stays in the menu bar.
        let launchedAtLogin = NSAppleEventManager.shared().currentAppleEvent?.paramDescriptor(forKeyword: 0x70726474 /* prdt */)?.enumCodeValue == 0x6C676974 /* lgit */
        if !launchedAtLogin && !CommandLine.arguments.contains("--ui-snapshot") && !CommandLine.arguments.contains("--snapshot") { UIWindow.shared.show() }
        store.connect()
        if CommandLine.arguments.contains("--ui-snapshot") { UIWindow.shared.show() }
        if let i = CommandLine.arguments.firstIndex(of: "--snapshot"), i + 1 < CommandLine.arguments.count { snapshot(to: CommandLine.arguments[i + 1]) }
    }

    /// Developer aid: `PushMenu --snapshot <dir>` writes one PNG per tab (after the daemon has answered) and quits.
    func snapshot(to dir: String) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) {
            for t in Tab.allCases {
                let host = NSHostingView(rootView: RootView(store: self.store, tab: t, close: {}))
                host.frame = NSRect(x: 0, y: 0, width: 348, height: 520)
                let win = NSWindow(contentRect: host.frame, styleMask: [.borderless], backing: .buffered, defer: false)
                win.contentView = host
                win.backgroundColor = .clear
                win.orderFrontRegardless()
                host.layoutSubtreeIfNeeded()
                RunLoop.current.run(until: Date().addingTimeInterval(0.8))
                if let rep = host.bitmapImageRepForCachingDisplay(in: host.bounds) {
                    host.cacheDisplay(in: host.bounds, to: rep)
                    try? rep.representation(using: .png, properties: [:])?.write(to: URL(fileURLWithPath: "\(dir)/menu-\(t.rawValue).png"))
                }
                win.orderOut(nil)
            }
            NSApp.terminate(nil)
        }
    }

    func refreshIcon() {
        let s = store
        let symbol = !s.connected ? "bolt.slash" : s.standby ? "power" : (s.usb ? "square.grid.3x3.fill" : "exclamationmark.triangle")
        let img = NSImage(systemSymbolName: symbol, accessibilityDescription: "Push")
        img?.isTemplate = true
        item.button?.image = img
    }

    @objc func toggle() {
        if panel.isVisible { hidePanel(); return }
        guard let button = item.button, let win = button.window else { return }
        let r = win.convertToScreen(button.convert(button.bounds, to: nil))
        var x = r.midX - panel.frame.width / 2
        if let screen = win.screen ?? NSScreen.main { x = min(max(x, screen.visibleFrame.minX + 8), screen.visibleFrame.maxX - panel.frame.width - 8) }
        panel.setFrameOrigin(NSPoint(x: x, y: r.minY - panel.frame.height - 8))
        store.loginItem = LoginItem.isOn
        NSApp.activate(ignoringOtherApps: true)
        panel.makeKeyAndOrderFront(nil)
        store.panelOpen = true
    }

    func windowDidResignKey(_ notification: Notification) { hidePanel() }
    func hidePanel() { panel.orderOut(nil); store.panelOpen = false }   // the panel's pad logo animates only while the panel is open
}

if let i = CommandLine.arguments.firstIndex(of: "--login-item"), i + 1 < CommandLine.arguments.count {   // setup aid: PushMenu --login-item on|off
    LoginItem.set(CommandLine.arguments[i + 1] == "on")
    print("login item:", LoginItem.isOn ? "on" : "off")
    exit(0)
}

if let i = CommandLine.arguments.firstIndex(of: "--perm") {   // used by the daemon: PushMenu --perm [--ask] <bundle id>…  prints what macOS says about THIS app (the one in System Settings)
    let rest = Array(CommandLine.arguments[(i + 1)...])
    let ask = rest.contains("--ask")
    var out: [String: Int] = ["accessibility": AXIsProcessTrusted() ? 1 : 0]
    if let f = rest.firstIndex(of: "--folder"), f + 1 < rest.count {   // reading a protected folder is what makes macOS ask
        out["folder"] = (try? FileManager.default.contentsOfDirectory(atPath: rest[f + 1])) != nil ? 1 : 0
        print(String(data: (try? JSONSerialization.data(withJSONObject: out)) ?? Data(), encoding: .utf8) ?? "{}"); exit(0)
    }
    for b in rest where b != "--ask" {
        let d = NSAppleEventDescriptor(bundleIdentifier: b)
        out[b] = Int(AEDeterminePermissionToAutomateTarget(d.aeDesc!, typeWildCard, typeWildCard, ask))
    }
    if let data = try? JSONSerialization.data(withJSONObject: out), let t = String(data: data, encoding: .utf8) { print(t) }
    exit(0)
}

if CommandLine.arguments.contains("--windows") { WindowServer.run() }   // used by the daemon: the window pads (see WindowServer.swift); never returns

let app = NSApplication.shared
let delegate = App()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
