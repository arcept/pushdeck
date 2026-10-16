import AppKit
import ApplicationServices
import WinGeo

/// `PushMenu --windows`: the window pads' engine. The daemon starts it once and writes one layout name per line to its stdin ("left-half");
/// it moves and resizes the front app's focused window through the Accessibility API and answers with one JSON line.
/// It is the app's own binary on purpose: macOS keeps Accessibility per app, so the Push Deck entry in System Settings covers it, and
/// the daemon (a separate Python program) does not need one. It exits when the daemon closes the pipe, or after 10 idle minutes. Layout maths lives in WinGeo.
enum WindowServer {
    static func run() -> Never {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)   // a live run loop is needed: NSScreen and the front app are only kept current while it runs
        DispatchQueue.global().async {
            while let line = readLine() {
                let name = line.trimmingCharacters(in: .whitespacesAndNewlines)
                if !name.isEmpty { DispatchQueue.main.sync { Engine.shared.handle(name) } }
            }
            exit(0)
        }
        Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in   // idle for 10 minutes: end; the daemon starts a new one on the next press
            if Date().timeIntervalSince(Engine.shared.lastUse) > 600 { exit(0) }
        }
        app.run()
        exit(0)
    }

    final class Engine {
        static let shared = Engine()
        struct Key: Hashable { let pid: pid_t; let hash: CFHashCode }
        var lasts: [Key: Last] = [:]      // what the last pad press did to each window, so the same pad again steps to the next size
        var restores: [Key: CGRect] = [:]  // where each window was before the pads first moved it

        func reply(_ ok: Bool, _ fields: [String: Any] = [:]) {
            let obj = ["ok": ok].merging(fields) { a, _ in a }
            if let d = try? JSONSerialization.data(withJSONObject: obj), let s = String(data: d, encoding: .utf8) { print(s); fflush(stdout) }
        }
        func fail(_ why: String) { reply(false, ["err": why]) }

        var lastUse = Date()

        func handle(_ name: String) {
            lastUse = Date()
            guard let op = Op(rawValue: name) else { return fail("unknown layout \(name)") }
            guard AXIsProcessTrusted() else { return fail("accessibility") }   // checked every time: it can be granted while this runs
            // The Push Deck window itself counts as a window like any other: when its window is in front (testing a pad from the editor), that is the one that moves.
            guard let front = frontApp() else { return fail("no app in front") }
            let appEl = AXUIElementCreateApplication(front.processIdentifier)
            guard let win = window(of: appEl) else { return fail("no window") }
            if bool(win, kAXMinimizedAttribute) { return fail("minimized") }
            let key = Key(pid: front.processIdentifier, hash: CFHash(win))
            let wasFull = bool(win, fullScreenAttr)
            if op == .fullScreen {   // enter or leave full screen
                guard (wasFull ? leaveFullScreen(win, pid: front.processIdentifier) : enterFullScreen(win, pid: front.processIdentifier)) else { return fail("full screen not supported") }
                lasts[key] = nil
                return reply(true, ["op": op.rawValue, "app": front.bundleIdentifier ?? "", "fullscreen": bool(win, fullScreenAttr)])
            }
            if op == .close {   // the red button: the app still asks about unsaved work, as it does for a click
                var button = closeButton(of: win)
                if button == nil && wasFull, leaveFullScreen(win, pid: front.processIdentifier) { button = closeButton(of: win) }   // a full-screen window hides its buttons
                guard let b = button, AXUIElementPerformAction(b, kAXPressAction as CFString) == .success else { return fail("can't close") }
                lasts[key] = nil; restores[key] = nil
                return reply(true, ["op": op.rawValue, "app": front.bundleIdentifier ?? ""])
            }
            if op == .minimize {   // the yellow button; a full-screen window leaves full screen first
                if wasFull, !leaveFullScreen(win, pid: front.processIdentifier) { return fail("full screen not supported") }
                guard AXUIElementSetAttributeValue(win, kAXMinimizedAttribute as CFString, kCFBooleanTrue) == .success else { return fail("can't minimize") }
                lasts[key] = nil
                return reply(true, ["op": op.rawValue, "app": front.bundleIdentifier ?? ""])
            }
            let areas = displays()
            let moving = op == .nextDisplay || op == .previousDisplay
            if wasFull {   // a full-screen window can't be placed: leave full screen first (macOS animates this), then carry on as for any window
                if moving && areas.count < 2 { return fail("only one display") }
                guard leaveFullScreen(win, pid: front.processIdentifier) else { return fail("full screen not supported") }
            }
            guard let cur = frame(of: win) else { return fail("window has no frame") }
            guard !areas.isEmpty, let here = WinGeo.displayIndex(of: cur, in: areas) else { return fail("no display") }
            var want: CGRect
            var step = 0
            switch op {
            case .nextDisplay, .previousDisplay:
                guard let r = moveToDisplay(window: cur, areas: areas, forward: op == .nextDisplay) else { return fail("only one display") }
                want = r
            default:
                guard let r = target(op, window: cur, area: areas[here], last: lasts[key], restore: restores[key]) else { return fail("nothing to restore") }
                want = r.frame; step = r.step
            }
            if op != .restore, lasts[key].map({ !nearlyEqual($0.frame, cur) }) ?? true { restores[key] = cur }   // remember the original, not our own result
            let area = areas[WinGeo.displayIndex(of: want, in: areas) ?? here]
            let got = apply(win, appEl, want, area: area)
            if op == .restore { lasts[key] = nil } else { lasts[key] = Last(op: op, step: step, frame: got) }
            if wasFull && moving {   // a window that was full screen goes full screen again, on the display it is on now
                RunLoop.current.run(until: Date().addingTimeInterval(0.2))   // let the window settle on its new display before going full screen there
                if enterFullScreen(win, pid: front.processIdentifier) { lasts[key] = nil }
            }
            if lasts.count > 64 { lasts.removeAll(); restores.removeAll() }
            reply(true, ["op": op.rawValue, "app": front.bundleIdentifier ?? "", "frame": [got.minX, got.minY, got.width, got.height].map { Int($0) },
                         "clamped": !nearlyEqual(got, want), "fullscreen": bool(win, fullScreenAttr)])
        }

        /// The app whose window is in front. Normally what macOS says; if it says nothing (or says this helper), the owner of the topmost ordinary window on screen.
        func frontApp() -> NSRunningApplication? {
            if let f = NSWorkspace.shared.frontmostApplication, f.processIdentifier != getpid() { return f }
            guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else { return nil }   // front to back
            for w in list {
                guard let pid = w[kCGWindowOwnerPID as String] as? Int32, pid != getpid(), (w[kCGWindowLayer as String] as? Int) == 0,
                      let b = w[kCGWindowBounds as String] as? [String: CGFloat], (b["Width"] ?? 0) > 100, (b["Height"] ?? 0) > 100,
                      let app = NSRunningApplication(processIdentifier: pid), app.activationPolicy == .regular else { continue }
                return app
            }
            return nil
        }

        /// Usable area of every display (menu bar and Dock excluded) in the Accessibility API's space: origin at the primary display's top-left, y down.
        func displays() -> [CGRect] {
            guard let primary = NSScreen.screens.first else { return [] }
            return NSScreen.screens.map { s in let v = s.visibleFrame; return CGRect(x: v.minX, y: primary.frame.height - v.maxY, width: v.width, height: v.height) }
        }

        /// The window to move: the focused one, else the main one, else the first. Only real windows count (Finder's desktop is a scroll area in the same list).
        func window(of app: AXUIElement) -> AXUIElement? {
            func isWindow(_ el: AXUIElement) -> Bool {
                var r: CFTypeRef?
                return AXUIElementCopyAttributeValue(el, kAXRoleAttribute as CFString, &r) == .success && (r as? String) == kAXWindowRole
            }
            for attr in [kAXFocusedWindowAttribute, kAXMainWindowAttribute] {   // Finder and others report no focused window while another app has focus
                var v: CFTypeRef?
                if AXUIElementCopyAttributeValue(app, attr as CFString, &v) == .success, let w = v, isWindow(w as! AXUIElement) { return (w as! AXUIElement) }
            }
            var v: CFTypeRef?
            if AXUIElementCopyAttributeValue(app, kAXWindowsAttribute as CFString, &v) == .success, let list = v as? [AXUIElement] { return list.first(where: isWindow) }
            return nil
        }

        let fullScreenAttr = "AXFullScreen"

        func trySetFullScreen(_ win: AXUIElement, _ on: Bool) -> Bool {
            var settable = DarwinBoolean(false)
            guard AXUIElementIsAttributeSettable(win, fullScreenAttr as CFString, &settable) == .success, settable.boolValue else { return false }
            return AXUIElementSetAttributeValue(win, fullScreenAttr as CFString, on ? kCFBooleanTrue : kCFBooleanFalse) == .success
        }

        /// Sets full screen. A window that is not allowed to (an app's own windows are often built "auxiliary", so they can sit over another app's full-screen
        /// Space) gets one chance to allow it: the app is told by a distributed notification and answers by changing the window's behaviour (Push Deck's
        /// own window does, see UIWindow.swift). Then it is tried once more.
        func setFullScreen(_ win: AXUIElement, _ on: Bool, pid: pid_t) -> Bool {
            if trySetFullScreen(win, on) { return true }
            guard on else { return false }
            DistributedNotificationCenter.default().postNotificationName(Notification.Name("com.arcept.pushdeck.prepareFullScreen"), object: nil, userInfo: ["pid": NSNumber(value: pid)], deliverImmediately: true)
            pause(0.25)
            return trySetFullScreen(win, on)
        }

        /// Runs the run loop in short slices until `done` is true or the time is up (the run loop must stay alive for screens and the front app to stay current).
        func waitUntil(_ seconds: TimeInterval, _ done: () -> Bool) -> Bool {
            let end = Date().addingTimeInterval(seconds)
            while Date() < end { if done() { return true }; RunLoop.current.run(until: Date().addingTimeInterval(0.05)) }
            return done()
        }

        /// The sizes of the app's on-screen windows as the window server sees them (nothing needs Screen Recording for sizes).
        func onScreenSizes(_ pid: pid_t) -> [CGSize] {
            guard let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as? [[String: Any]] else { return [] }
            return list.compactMap { w in
                guard (w[kCGWindowOwnerPID as String] as? Int32) == pid, (w[kCGWindowLayer as String] as? Int) == 0,
                      let b = w[kCGWindowBounds as String] as? [String: CGFloat], let width = b["Width"], let height = b["Height"], height > 100 else { return nil }
                return CGSize(width: width, height: height)
            }
        }
        func isDisplaySized(_ s: CGSize) -> Bool { NSScreen.screens.contains { abs($0.frame.width - s.width) < 2 && abs($0.frame.height - s.height) < 2 } }

        func pause(_ seconds: TimeInterval) { RunLoop.current.run(until: Date().addingTimeInterval(seconds)) }

        /// Leaves full screen and waits until macOS has finished the animation. The Accessibility flag flips at the START of it (and its full-screen window
        /// is gone after a fraction of a second), so this waits for the app's normal window to be on screen again, and never less than 0.7 s in all
        /// (it takes about 0.6 s). Moving the window earlier leaves a ghost image of it behind on the old display.
        func leaveFullScreen(_ win: AXUIElement, pid: pid_t) -> Bool {
            let start = Date()
            guard setFullScreen(win, false, pid: pid), waitUntil(2.5, { !bool(win, fullScreenAttr) }) else { return false }
            _ = waitUntil(3.0) { let sizes = onScreenSizes(pid); return !sizes.isEmpty && !sizes.contains(where: isDisplaySized) }
            let rest = 0.7 - Date().timeIntervalSince(start)
            if rest > 0 { pause(rest) }
            pause(0.1)
            return true
        }

        /// Enters full screen and waits until the animation has finished. A second try after a short pause: macOS refuses it while the window is still settling.
        func enterFullScreen(_ win: AXUIElement, pid: pid_t) -> Bool {
            for attempt in 0..<2 {
                if setFullScreen(win, true, pid: pid), waitUntil(1.5, { bool(win, fullScreenAttr) }) {
                    _ = waitUntil(3.0) { onScreenSizes(pid).contains(where: isDisplaySized) }
                    pause(0.25)   // it appears at the start of the animation; the reply only needs to wait a moment, the animation finishes by itself
                    return true
                }
                if attempt == 0 { pause(0.7) }
            }
            return false
        }

        func closeButton(of win: AXUIElement) -> AXUIElement? {
            var v: CFTypeRef?
            return AXUIElementCopyAttributeValue(win, kAXCloseButtonAttribute as CFString, &v) == .success ? (v as! AXUIElement?) : nil
        }

        func bool(_ el: AXUIElement, _ attr: String) -> Bool {
            var v: CFTypeRef?
            return AXUIElementCopyAttributeValue(el, attr as CFString, &v) == .success && (v as? Bool) == true
        }

        func frame(of win: AXUIElement) -> CGRect? {
            var p: CFTypeRef?, s: CFTypeRef?
            var pt = CGPoint.zero, sz = CGSize.zero
            guard AXUIElementCopyAttributeValue(win, kAXPositionAttribute as CFString, &p) == .success, let pv = p, AXValueGetValue(pv as! AXValue, .cgPoint, &pt),
                  AXUIElementCopyAttributeValue(win, kAXSizeAttribute as CFString, &s) == .success, let sv = s, AXValueGetValue(sv as! AXValue, .cgSize, &sz) else { return nil }
            return CGRect(origin: pt, size: sz)
        }

        func set(_ win: AXUIElement, position: CGPoint) { var p = position; if let v = AXValueCreate(.cgPoint, &p) { AXUIElementSetAttributeValue(win, kAXPositionAttribute as CFString, v) } }
        func set(_ win: AXUIElement, size: CGSize) { var s = size; if let v = AXValueCreate(.cgSize, &s) { AXUIElementSetAttributeValue(win, kAXSizeAttribute as CFString, v) } }

        /// Moves and sizes the window and returns where it really ended up (an app can refuse a size). Size goes before and after the move because the
        /// first size can be clamped by the old position. Apps with "enhanced user interface" on (Terminal, some others) animate and ignore quick changes, so it is off during the move.
        func apply(_ win: AXUIElement, _ app: AXUIElement, _ r: CGRect, area: CGRect) -> CGRect {
            var e: CFTypeRef?
            let enhanced = AXUIElementCopyAttributeValue(app, "AXEnhancedUserInterface" as CFString, &e) == .success && (e as? Bool) == true
            if enhanced { AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanFalse) }
            defer { if enhanced { AXUIElementSetAttributeValue(app, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue) } }
            set(win, size: r.size); set(win, position: r.origin); set(win, size: r.size)
            guard var got = frame(of: win) else { return r }
            // An app that kept a bigger minimum size would hang off the display: pull it back inside.
            let x = max(area.minX, min(got.minX, area.maxX - got.width)), y = max(area.minY, min(got.minY, area.maxY - got.height))
            if x != got.minX || y != got.minY { set(win, position: CGPoint(x: x, y: y)); got = frame(of: win) ?? got }
            return got
        }
    }
}
