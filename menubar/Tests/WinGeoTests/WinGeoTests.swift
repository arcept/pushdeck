import XCTest
import CoreGraphics
@testable import WinGeo

final class WinGeoTests: XCTestCase {
    let area = CGRect(x: 0, y: 25, width: 1500, height: 875)          // a display with a menu bar
    let win = CGRect(x: 100, y: 100, width: 800, height: 600)

    func t(_ op: Op, _ w: CGRect? = nil, last: Last? = nil, restore: CGRect? = nil, in a: CGRect? = nil) -> Result? {
        target(op, window: w ?? win, area: a ?? area, last: last, restore: restore)
    }

    func testHalvesAndQuarters() {
        XCTAssertEqual(t(.leftHalf)?.frame, CGRect(x: 0, y: 25, width: 750, height: 875))
        XCTAssertEqual(t(.rightHalf)?.frame, CGRect(x: 750, y: 25, width: 750, height: 875))
        XCTAssertEqual(t(.topHalf)?.frame, CGRect(x: 0, y: 25, width: 1500, height: 438))
        XCTAssertEqual(t(.bottomHalf)?.frame, CGRect(x: 0, y: 463, width: 1500, height: 437))
        XCTAssertEqual(t(.topLeft)?.frame, CGRect(x: 0, y: 25, width: 750, height: 438))
        XCTAssertEqual(t(.bottomRight)?.frame, CGRect(x: 750, y: 463, width: 750, height: 437))
        XCTAssertEqual(t(.maximize)?.frame, area)
    }

    func testThirdsLeaveNoGapOrOverlap() {
        let odd = CGRect(x: 0, y: 0, width: 1000, height: 700)       // 1000 / 3 is not a whole number
        let a = t(.firstThird, in: odd)!.frame, b = t(.centerThird, in: odd)!.frame, c = t(.lastThird, in: odd)!.frame
        XCTAssertEqual(a.maxX, b.minX); XCTAssertEqual(b.maxX, c.minX); XCTAssertEqual(c.maxX, odd.maxX); XCTAssertEqual(a.minX, odd.minX)
    }

    func testRepeatedHalfCyclesHalfTwoThirdsThird() {
        var last: Last? = nil, widths: [CGFloat] = []
        var cur = win
        for _ in 0..<4 {
            let r = t(.leftHalf, cur, last: last)!
            widths.append(r.frame.width); cur = r.frame; last = Last(op: .leftHalf, step: r.step, frame: r.frame)
        }
        XCTAssertEqual(widths, [750, 1000, 500, 750])
    }

    func testRightHalfStaysAnchoredToTheRightEdge() {
        var last: Last? = nil, cur = win
        for _ in 0..<3 {
            let r = t(.rightHalf, cur, last: last)!
            XCTAssertEqual(r.frame.maxX, area.maxX)
            cur = r.frame; last = Last(op: .rightHalf, step: r.step, frame: r.frame)
        }
    }

    func testCycleSurvivesASmallClampAndResetsWhenWindowMoved() {
        let first = t(.leftHalf)!
        let clamped = first.frame.insetBy(dx: -1, dy: 0)                               // the app made it 2 pt wider
        let again = t(.leftHalf, clamped, last: Last(op: .leftHalf, step: first.step, frame: first.frame))!
        XCTAssertEqual(again.step, 1)
        let moved = first.frame.offsetBy(dx: 40, dy: 0)                                // the user dragged it: start over
        XCTAssertEqual(t(.leftHalf, moved, last: Last(op: .leftHalf, step: 1, frame: first.frame))!.step, 0)
        XCTAssertEqual(t(.rightHalf, first.frame, last: Last(op: .leftHalf, step: 1, frame: first.frame))!.step, 0)
    }

    func testCenterKeepsSizeAndShrinksToFit() {
        XCTAssertEqual(t(.center)?.frame, CGRect(x: 350, y: 163, width: 800, height: 600))
        let big = CGRect(x: 0, y: 0, width: 3000, height: 2000)
        XCTAssertEqual(t(.center, big)?.frame, area)
    }

    func testFullScreenHasNoGeometry() {
        XCTAssertNil(t(.fullScreen))
        XCTAssertEqual(Op(rawValue: "full-screen"), .fullScreen)
    }

    func testRestore() {
        XCTAssertNil(t(.restore))
        XCTAssertEqual(t(.restore, restore: win)?.frame, win)
    }

    // A laptop display with a larger one above-left, as on a real desk: the order is left to right, then top to bottom.
    let main = CGRect(x: 0, y: 25, width: 1500, height: 875)
    let big = CGRect(x: -1616, y: -1415, width: 2560, height: 1415)

    func testDisplayOrderAndLookup() {
        XCTAssertEqual(ordered([main, big]), [big, main])
        XCTAssertEqual(displayIndex(of: CGRect(x: 100, y: 100, width: 400, height: 300), in: ordered([main, big])), 1)
        XCTAssertEqual(displayIndex(of: CGRect(x: -1000, y: -1000, width: 400, height: 300), in: ordered([main, big])), 0)
        XCTAssertEqual(displayIndex(of: CGRect(x: 5000, y: 100, width: 400, height: 300), in: ordered([main, big])), 1)   // off every display: nearest
    }

    func testNextDisplayKeepsRelativePlaceAndWraps() {
        let w = CGRect(x: 0, y: 25, width: 750, height: 875)                           // left half of main
        let r = moveToDisplay(window: w, areas: [main, big], forward: true)!           // main is last in order, so next wraps to the big one
        XCTAssertEqual(r, CGRect(x: -1616, y: -1415, width: 1280, height: 1415))        // left half of the big display
        XCTAssertEqual(moveToDisplay(window: r, areas: [main, big], forward: false)!, CGRect(x: 0, y: 25, width: 750, height: 875).insetBy(dx: 0, dy: 0))
    }

    func testMovingToASmallerDisplayShrinks() {
        let w = CGRect(x: -1616, y: -1415, width: 2560, height: 1415)
        let r = moveToDisplay(window: w, areas: [main, big], forward: true)!
        XCTAssertEqual(r, main)
    }

    func testSingleDisplayDoesNothing() {
        XCTAssertNil(moveToDisplay(window: win, areas: [main], forward: true))
    }
}
