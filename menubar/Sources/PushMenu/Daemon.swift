import Foundation

/// Runs the Push daemon from inside the app bundle (Resources/venv + Resources/root) so the .app is the whole product.
/// If the daemon is already answering on the port (started from a terminal or a LaunchAgent), it is left alone.
final class DaemonHost {
    static let shared = DaemonHost()
    private var process: Process?
    private var stopping = false
    private let port = Int(ProcessInfo.processInfo.environment["PUSH_PORT"] ?? "") ?? 8472

    private var res: URL? { Bundle.main.resourceURL }
    var bundled: Bool { res.map { FileManager.default.fileExists(atPath: $0.appendingPathComponent("venv/bin/python3").path) } ?? false }
    static var dataDir: URL { FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Application Support/Push Deck") }

    private func portOpen() -> Bool {
        let s = socket(AF_INET, SOCK_STREAM, 0); defer { close(s) }
        var a = sockaddr_in(); a.sin_family = sa_family_t(AF_INET); a.sin_port = in_port_t(port).bigEndian; a.sin_addr.s_addr = inet_addr("127.0.0.1")
        return withUnsafePointer(to: &a) { $0.withMemoryRebound(to: sockaddr.self, capacity: 1) { connect(s, $0, socklen_t(MemoryLayout<sockaddr_in>.size)) } } == 0
    }

    private var watchdog: Timer?

    /// Starts the daemon now and keeps checking: if another copy of the app (or a terminal) was the one running it and goes away, this app takes over.
    func start() {
        launch()
        if watchdog == nil {
            watchdog = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
                guard let self = self, !self.stopping, self.process?.isRunning != true, !self.portOpen() else { return }
                self.launch()
            }
        }
    }

    private func launch() {
        guard bundled, let res = res, !stopping else { return }
        if portOpen() { return }
        try? FileManager.default.createDirectory(at: Self.dataDir, withIntermediateDirectories: true)
        let logs = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Push Deck.log")
        if !FileManager.default.fileExists(atPath: logs.path) { FileManager.default.createFile(atPath: logs.path, contents: nil) }
        let p = Process()
        p.executableURL = res.appendingPathComponent("venv/bin/python3")
        p.arguments = ["-m", "push_daemon"]
        p.currentDirectoryURL = res.appendingPathComponent("root")
        var env = ProcessInfo.processInfo.environment
        env["PYTHONPATH"] = res.appendingPathComponent("root/daemon").path
        env["PUSH_HOME"] = Self.dataDir.path
        env["DYLD_FALLBACK_LIBRARY_PATH"] = res.appendingPathComponent("lib").path + ":/opt/homebrew/lib:/usr/local/lib"
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        env["PUSH_APP_EXE"] = Bundle.main.executablePath ?? ""   // the daemon asks this app about macOS permissions (see permissions.py)
        env["PUSH_PARENT_PID"] = String(ProcessInfo.processInfo.processIdentifier)
        p.environment = env
        if let h = try? FileHandle(forWritingTo: logs) { h.seekToEndOfFile(); p.standardOutput = h; p.standardError = h }
        p.terminationHandler = { [weak self] _ in
            guard let self = self, !self.stopping else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) { self.start() }   // came down on its own: bring it back
        }
        do { try p.run(); process = p } catch { NSLog("daemon: \(error)") }
    }

    func stop() { stopping = true; watchdog?.invalidate(); process?.terminate(); process?.waitUntilExit() }
}
