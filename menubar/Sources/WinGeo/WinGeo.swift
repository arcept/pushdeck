import CoreGraphics

// Window layout maths for the Push Deck window pads. Pure functions on rectangles in "top-left origin" screen space
// (the space the Accessibility API uses: y grows downward, the primary display's top-left corner is 0,0).
// Layout names follow Rectangle (MIT, github.com/rxhanson/Rectangle) so the vocabulary is familiar.

public enum Op: String, CaseIterable {
    case topLeft = "top-left", topHalf = "top-half", topRight = "top-right"
    case leftHalf = "left-half", rightHalf = "right-half"
    case bottomLeft = "bottom-left", bottomHalf = "bottom-half", bottomRight = "bottom-right"
    case firstThird = "first-third", centerThird = "center-third", lastThird = "last-third"
    case maximize, center, restore
    case fullScreen = "full-screen"   // enter or leave full screen: no geometry, handled by the window server
    case nextDisplay = "next-display", previousDisplay = "previous-display"
}

/// What the last pad press produced, so pressing the same pad again can step to the next size.
public struct Last: Equatable {
    public var op: Op
    public var step: Int
    public var frame: CGRect
    public init(op: Op, step: Int, frame: CGRect) { self.op = op; self.step = step; self.frame = frame }
}

public struct Result: Equatable {
    public var frame: CGRect
    public var step: Int
    public init(frame: CGRect, step: Int) { self.frame = frame; self.step = step }
}

/// Fractions of the screen a pad cycles through when pressed again: half, then two-thirds, then one-third.
let halfCycle: [CGFloat] = [1.0 / 2, 2.0 / 3, 1.0 / 3]
let thirdCycle: [CGFloat] = [1.0 / 3, 2.0 / 3]
let tolerance: CGFloat = 3   // an app may clamp a size by a few points; this still counts as "the window is where we put it"

public func nearlyEqual(_ a: CGRect, _ b: CGRect) -> Bool {
    abs(a.minX - b.minX) <= tolerance && abs(a.minY - b.minY) <= tolerance && abs(a.width - b.width) <= tolerance && abs(a.height - b.height) <= tolerance
}

/// Splits `total` starting at `origin` into integer points: the piece from fraction `from` to `to`. Edges are rounded, so neighbouring pieces never leave a gap.
func span(_ origin: CGFloat, _ total: CGFloat, _ from: CGFloat, _ to: CGFloat) -> (CGFloat, CGFloat) {
    let a = (origin + total * from).rounded(), b = (origin + total * to).rounded()
    return (a, b - a)
}

/// The rectangle `op` asks for inside `area` (the display's usable area). `window` is the current frame, `last` the previous press (for cycling),
/// `restore` the frame to go back to. `nil` when the op can't run (restore with nothing saved; a display op: use `moveToDisplay`; full screen: no geometry).
public func target(_ op: Op, window: CGRect, area: CGRect, last: Last?, restore: CGRect?) -> Result? {
    let again = last.flatMap { $0.op == op && nearlyEqual($0.frame, window) ? $0 : nil }
    func cycle(_ sizes: [CGFloat]) -> (CGFloat, Int) {
        let i = again.map { ($0.step + 1) % sizes.count } ?? 0
        return (sizes[i], i)
    }
    let (x, y, w, h) = (area.minX, area.minY, area.width, area.height)
    func rect(_ cols: (CGFloat, CGFloat), _ rows: (CGFloat, CGFloat), _ step: Int = 0) -> Result {
        let c = span(x, w, cols.0, cols.1), r = span(y, h, rows.0, rows.1)
        return Result(frame: CGRect(x: c.0, y: r.0, width: c.1, height: r.1), step: step)
    }
    switch op {
    case .topLeft: return rect((0, 0.5), (0, 0.5))
    case .topRight: return rect((0.5, 1), (0, 0.5))
    case .bottomLeft: return rect((0, 0.5), (0.5, 1))
    case .bottomRight: return rect((0.5, 1), (0.5, 1))
    case .leftHalf: let (f, i) = cycle(halfCycle); return rect((0, f), (0, 1), i)
    case .rightHalf: let (f, i) = cycle(halfCycle); return rect((1 - f, 1), (0, 1), i)
    case .topHalf: let (f, i) = cycle(halfCycle); return rect((0, 1), (0, f), i)
    case .bottomHalf: let (f, i) = cycle(halfCycle); return rect((0, 1), (1 - f, 1), i)
    case .firstThird: let (f, i) = cycle(thirdCycle); return rect((0, f), (0, 1), i)
    case .lastThird: let (f, i) = cycle(thirdCycle); return rect((1 - f, 1), (0, 1), i)
    case .centerThird: return rect((1.0 / 3, 2.0 / 3), (0, 1))
    case .maximize: return rect((0, 1), (0, 1))
    case .center:   // keep the size (shrunk to fit the display), centre it
        let cw = min(window.width, w), ch = min(window.height, h)
        return Result(frame: CGRect(x: (x + (w - cw) / 2).rounded(), y: (y + (h - ch) / 2).rounded(), width: cw, height: ch), step: 0)
    case .restore: return restore.map { Result(frame: $0, step: 0) }
    case .nextDisplay, .previousDisplay, .fullScreen: return nil
    }
}

/// Displays in a stable order: left to right, then top to bottom (a display above the others comes after the one beside it at the same x).
public func ordered(_ areas: [CGRect]) -> [CGRect] {
    areas.sorted { $0.minX != $1.minX ? $0.minX < $1.minX : $0.minY < $1.minY }
}

/// Index of the display the window mostly sits on (largest overlap; a window on no display goes to the nearest by centre).
public func displayIndex(of window: CGRect, in areas: [CGRect]) -> Int? {
    guard !areas.isEmpty else { return nil }
    let overlap = areas.map { a -> CGFloat in let i = a.intersection(window); return i.isNull ? 0 : i.width * i.height }
    if let best = overlap.max(), best > 0 { return overlap.firstIndex(of: best) }
    let c = CGPoint(x: window.midX, y: window.midY)
    return areas.indices.min { hypot(areas[$0].midX - c.x, areas[$0].midY - c.y) < hypot(areas[$1].midX - c.x, areas[$1].midY - c.y) }
}

/// Moves the window to the next (or previous) display, keeping its relative position and size; it is shrunk if the new display is smaller.
/// `areas` are the usable areas of every display. nil with only one display.
public func moveToDisplay(window: CGRect, areas: [CGRect], forward: Bool) -> CGRect? {
    let list = ordered(areas)
    guard list.count > 1, let from = displayIndex(of: window, in: list) else { return nil }
    let to = (from + (forward ? 1 : list.count - 1)) % list.count
    let a = list[from], b = list[to]
    let w = min(window.width * b.width / a.width, b.width), h = min(window.height * b.height / a.height, b.height)
    let x = b.minX + (window.minX - a.minX) / a.width * b.width, y = b.minY + (window.minY - a.minY) / a.height * b.height
    return CGRect(x: min(max(x, b.minX), b.maxX - w).rounded(), y: min(max(y, b.minY), b.maxY - h).rounded(), width: w.rounded(), height: h.rounded())
}
