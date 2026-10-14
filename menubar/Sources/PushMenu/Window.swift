import AppKit
import WebKit

/// The Push Deck window: the daemon's UI in a native web view, so it behaves like an app (own Dock icon, no browser tabs).
/// Links to other sites open in the default browser; exported profiles go through a Save panel.
final class UIWindow: NSObject, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, WKScriptMessageHandler {
    static let shared = UIWindow()
    static let base = URL(string: "http://127.0.0.1:\(ProcessInfo.processInfo.environment["PUSH_PORT"] ?? "8472")/")!
    private var window: NSWindow?
    private var web: WKWebView?
    private var retry = 0
    private var splash: NSWindow?
    private var launched = false
    private var released = false

    /// The first time the window is opened in a run, the splash comes first, on its own: a small see-through window with just the card and its
    /// shadow. When the splash page says it is done, the real window opens at its own size and the app behind it fades in.
    func show() {
        if window == nil { build() }
        NSApp.setActivationPolicy(.regular)       // Dock icon and Cmd-Tab entry while the window is open
        installMenu()
        if !launched {
            launched = true
            let dev = CommandLine.arguments.contains("--ui-snapshot") || CommandLine.arguments.contains("--no-splash")
            if !dev { showSplash(); NSApp.activate(ignoringOtherApps: true); return }
            release()
        }
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func showSplash() {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "splashDone")
        let w = WKWebView(frame: .zero, configuration: cfg)
        w.navigationDelegate = self
        w.setValue(false, forKey: "drawsBackground")
        w.underPageBackgroundColor = .clear
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1240, height: 820), styleMask: [.borderless], backing: .buffered, defer: false)   // the card is 960 x 540; the rest is room for its shadow
        win.contentView = w
        win.isOpaque = false; win.backgroundColor = .clear; win.hasShadow = false
        win.level = .floating; win.isReleasedWhenClosed = false
        win.center()
        win.makeKeyAndOrderFront(nil)   // fully opaque from the start: macOS does not put a window with alpha 0 on screen; the page fades its card in
        win.orderFrontRegardless()
        splash = win
        w.load(URLRequest(url: URL(string: "?splashwin=1", relativeTo: Self.base)!))
        DispatchQueue.main.asyncAfter(deadline: .now() + 25) { [weak self] in self?.splashFinished() }   // never leave the user without a window
    }

    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) { if m.name == "splashDone" { splashFinished() } }

    private func splashFinished() {
        guard !released else { return }
        release()
        guard let win = window else { return }
        win.alphaValue = 0
        win.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        NSAnimationContext.runAnimationGroup { $0.duration = 0.5; win.animator().alphaValue = 1 }
        let sp = splash; splash = nil
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { sp?.orderOut(nil) }
    }

    /// Let the page behind the splash start (it fades in, and the first-run setup opens).
    private func release() {
        released = true
        runRelease()
    }
    private func runRelease() {
        web?.evaluateJavaScript("try{sessionStorage.setItem('push-shell-released','1')}catch(e){};document.documentElement.dataset.booted='1';window.dispatchEvent(new Event('push-booted'))", completionHandler: nil)
    }

    private func build() {
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .default()
        let w = WKWebView(frame: .zero, configuration: cfg)
        w.navigationDelegate = self; w.uiDelegate = self
        w.underPageBackgroundColor = .black
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900), styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView], backing: .buffered, defer: false)
        win.title = (Bundle.main.infoDictionary?["CFBundleName"] as? String) ?? "Push Deck"
        win.contentView = w
        win.contentMinSize = NSSize(width: 1280, height: 720)   // the lowest-resolution Mac screens; below this the layout breaks
        win.isReleasedWhenClosed = false
        win.backgroundColor = .black
        win.delegate = self
        win.setFrameAutosaveName("PushDeckWindow")
        if !win.setFrameUsingName("PushDeckWindow") { win.center() }
        if let vis = (win.screen ?? NSScreen.main)?.visibleFrame, win.frame.width > vis.width || win.frame.height > vis.height {   // never larger than the screen
            win.setFrame(NSRect(x: vis.minX, y: vis.minY, width: min(win.frame.width, vis.width), height: min(win.frame.height, vis.height)), display: false)
        }
        window = win; web = w
        w.load(URLRequest(url: URL(string: "?shell=1", relativeTo: Self.base)!))
    }

    func windowWillClose(_ n: Notification) { NSApp.setActivationPolicy(.accessory) }   // back to menu bar only

    // The daemon may still be starting: try again for a few seconds.
    func webView(_ w: WKWebView, didFailProvisionalNavigation n: WKNavigation!, withError e: Error) {
        guard retry < 20 else { return }
        retry += 1
        let u = (e as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL ?? Self.base
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { w.load(URLRequest(url: u)) }
    }
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
        retry = 0
        guard w === web else { return }
        if released { runRelease() }   // the page finished loading after the splash was done
        if let k = CommandLine.arguments.firstIndex(of: "--ui-pre-eval"), k + 1 < CommandLine.arguments.count { w.evaluateJavaScript(CommandLine.arguments[k + 1], completionHandler: nil) }   // developer aid: run JS as soon as the page has loaded
        // Developer aid: `PushMenu --ui-snapshot out.png` saves the web view's picture after it has settled, then quits.
        if let i = CommandLine.arguments.firstIndex(of: "--ui-snapshot"), i + 1 < CommandLine.arguments.count {
            let path = CommandLine.arguments[i + 1]
            DispatchQueue.main.asyncAfter(deadline: .now() + (CommandLine.arguments.firstIndex(of: "--ui-wait").flatMap { Double(CommandLine.arguments[$0 + 1]) } ?? 4)) {
                if let j = CommandLine.arguments.firstIndex(of: "--ui-eval"), j + 1 < CommandLine.arguments.count {
                    w.evaluateJavaScript(CommandLine.arguments[j + 1]) { r, e in print("eval:", r ?? "nil", e ?? "") }
                }
                w.takeSnapshot(with: nil) { img, _ in
                    if let t = img?.tiffRepresentation, let rep = NSBitmapImageRep(data: t), let png = rep.representation(using: .png, properties: [:]) { try? png.write(to: URL(fileURLWithPath: path)) }
                    NSApp.terminate(nil)
                }
            }
        }
    }

    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if a.shouldPerformDownload { decisionHandler(.download); return }
        if let u = a.request.url, let h = u.host, h != "127.0.0.1", h != "localhost", u.scheme?.hasPrefix("http") == true {
            NSWorkspace.shared.open(u); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }
    func webView(_ w: WKWebView, decidePolicyFor r: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(r.canShowMIMEType ? .allow : .download)
    }
    func webView(_ w: WKWebView, navigationAction: WKNavigationAction, didBecome d: WKDownload) { d.delegate = self }
    func webView(_ w: WKWebView, navigationResponse: WKNavigationResponse, didBecome d: WKDownload) { d.delegate = self }

    // window.open / target=_blank: Spotify sign-in and docs links go to the real browser
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url { NSWorkspace.shared.open(u) }
        return nil
    }
    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "OK"); a.addButton(withTitle: "Cancel")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = m; a.runModal(); completionHandler()
    }

    func download(_ d: WKDownload, decideDestinationUsing r: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        let p = NSSavePanel(); p.nameFieldStringValue = suggestedFilename
        completionHandler(p.runModal() == .OK ? p.url : nil)
    }

    /// Accessory apps have no menu bar, so Cmd-C/V/A/Z/Q and window shortcuts need one made here.
    private func installMenu() {
        guard NSApp.mainMenu == nil else { return }
        let main = NSMenu()
        func add(_ title: String, _ items: [(String, Selector?, String)]) {
            let m = NSMenu(title: title); let top = NSMenuItem(); top.submenu = m; main.addItem(top)
            for (t, s, k) in items { if t == "-" { m.addItem(.separator()) } else { m.addItem(NSMenuItem(title: t, action: s, keyEquivalent: k)) } }
        }
        add("Push Deck", [("Hide Push Deck", #selector(NSApplication.hide(_:)), "h"), ("-", nil, ""), ("Quit Push Deck", #selector(NSApplication.terminate(_:)), "q")])
        add("Edit", [("Undo", Selector(("undo:")), "z"), ("Redo", Selector(("redo:")), "Z"), ("-", nil, ""), ("Cut", #selector(NSText.cut(_:)), "x"), ("Copy", #selector(NSText.copy(_:)), "c"), ("Paste", #selector(NSText.paste(_:)), "v"), ("Select All", #selector(NSText.selectAll(_:)), "a")])
        add("View", [("Reload", #selector(WKWebView.reload(_:)), "r")])
        add("Window", [("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"), ("Close", #selector(NSWindow.performClose(_:)), "w")])
        NSApp.mainMenu = main
    }
}
