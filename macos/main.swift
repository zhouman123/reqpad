// reqpad macOS shell: a WKWebView window plus the local Node server it needs.
// The server is a child process, so quitting the app leaves nothing running.
import Cocoa
import WebKit

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var window: NSWindow?
    private var webView: WKWebView?
    private var server: Process?
    private var startupError: String?

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        let port = firstFreePort()
        buildWindow()

        guard let node = findNode() else {
            showError("""
            没找到 Node.js。

            请先安装（任选一个）：
            · brew install node
            · https://nodejs.org

            装完重新打开 reqpad。
            """)
            return
        }
        startServer(node: node, port: port)
        waitForServer(port: port, attempt: 0)
    }

    func applicationWillTerminate(_ notification: Notification) {
        server?.terminate()
    }

    func windowWillClose(_ notification: Notification) {
        NSApp.terminate(nil)
    }

    // MARK: - UI

    private func buildMenu() {
        let mainMenu = NSMenu()
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Quit reqpad", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        NSApp.mainMenu = mainMenu
    }

    private func buildWindow() {
        let web = WKWebView(frame: .zero)
        web.autoresizingMask = [.width, .height]

        let win = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1180, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        win.title = "reqpad"
        // A shrunken window hides the whole UI, so keep it usable and always
        // start at a sane size instead of whatever frame was last dragged to.
        win.minSize = NSSize(width: 900, height: 560)
        win.setContentSize(NSSize(width: 1180, height: 820))
        win.center()
        win.contentView = web
        win.delegate = self
        win.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)

        window = win
        webView = web
    }

    private func loadUI(port: Int) {
        guard let url = URL(string: "http://127.0.0.1:\(port)/") else { return }
        webView?.load(URLRequest(url: url))
    }

    private func showError(_ text: String) {
        let html = """
        <html><body style="font:14px -apple-system;padding:40px;color:#1e1e21">
        <h3 style="color:#e4551f">reqpad</h3>
        <pre style="white-space:pre-wrap;font:13px ui-monospace">\(text)</pre>
        </body></html>
        """
        webView?.loadHTMLString(html, baseURL: nil)
    }

    // MARK: - server lifecycle

    private func findNode() -> String? {
        // A GUI app inherits a minimal PATH, and a Homebrew keg can be a broken
        // symlink (or the default `node` is simply absent), so every candidate
        // has to prove it actually runs.
        for path in nodeCandidates() where FileManager.default.isExecutableFile(atPath: path) {
            if nodeWorks(path) { return path }
        }
        return nil
    }

    private func nodeCandidates() -> [String] {
        var list: [String] = []
        if let fromPath = loginShellNode() { list.append(fromPath) }
        list.append(contentsOf: ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"])
        list.append(contentsOf: versionedNodes(base: "/opt/homebrew/opt", prefix: "node"))
        list.append(contentsOf: versionedNodes(base: "\(NSHomeDirectory())/.nvm/versions/node", prefix: "v"))

        var seen = Set<String>()
        return list.filter { seen.insert($0).inserted }
    }

    // Homebrew.opt and nvm both keep versions side by side, e.g.
    // /opt/homebrew/opt/node@22/bin/node, ~/.nvm/versions/node/v22.23.4/bin/node
    private func versionedNodes(base: String, prefix: String) -> [String] {
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: base) else { return [] }
        return entries
            .filter { $0.hasPrefix(prefix) }
            .sorted { $0.compare($1, options: .numeric) == .orderedDescending }
            .map { "\(base)/\($0)/bin/node" }
    }

    private func loginShellNode() -> String? {
        let probe = Process()
        probe.executableURL = URL(fileURLWithPath: "/bin/zsh")
        probe.arguments = ["-lc", "command -v node"]
        let pipe = Pipe()
        probe.standardOutput = pipe
        probe.standardError = Pipe()
        guard (try? probe.run()) != nil else { return nil }
        probe.waitUntilExit()
        let output = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        return output
            .split(separator: "\n")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .first { $0.hasPrefix("/") }
    }

    private func nodeWorks(_ path: String) -> Bool {
        let probe = Process()
        probe.executableURL = URL(fileURLWithPath: path)
        probe.arguments = ["-v"]
        probe.standardOutput = Pipe()
        probe.standardError = Pipe()
        guard (try? probe.run()) != nil else { return false }
        probe.waitUntilExit()
        return probe.terminationStatus == 0
    }

    private func startServer(node: String, port: Int) {
        guard let resources = Bundle.main.resourceURL else { return }
        let script = resources.appendingPathComponent("server.mjs")
        let log = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("reqpad-server.log")
        FileManager.default.createFile(atPath: log.path, contents: nil)
        let handle = try? FileHandle(forWritingTo: log)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: node)
        process.arguments = [script.path]
        process.currentDirectoryURL = resources
        process.environment = ProcessInfo.processInfo.environment.merging(["PORT": String(port)]) { $1 }
        process.standardOutput = handle
        process.standardError = handle
        do {
            try process.run()
            server = process
        } catch {
            startupError = error.localizedDescription
        }
    }

    private func waitForServer(port: Int, attempt: Int) {
        guard attempt < 40 else {
            let log = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("reqpad-server.log")
            let tail = (try? String(contentsOf: log, encoding: .utf8))?.suffix(600) ?? ""
            showError("本地服务没起来。\n\n\(startupError ?? "")\n\n\(tail)")
            return
        }
        guard let url = URL(string: "http://127.0.0.1:\(port)/api/health") else { return }
        var request = URLRequest(url: url)
        request.timeoutInterval = 1
        URLSession.shared.dataTask(with: request) { [weak self] _, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                DispatchQueue.main.async { self?.loadUI(port: port) }
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
                    self?.waitForServer(port: port, attempt: attempt + 1)
                }
            }
        }.resume()
    }

    // MARK: - port

    private func firstFreePort() -> Int {
        for port in 4600...4699 where isPortFree(port) {
            return port
        }
        return 4599
    }

    private func isPortFree(_ port: Int) -> Bool {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        var addr = sockaddr_in()
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = in_port_t(UInt16(port).bigEndian)
        addr.sin_addr.s_addr = inet_addr("127.0.0.1")
        let result = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return result == 0
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
