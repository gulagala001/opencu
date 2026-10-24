import Foundation

@main
struct InteractionChecks {
    static func main() throws {
        var roles = [1: "AXMenu", 2: "AXMenuItem", 3: "AXStaticText", 4: "AXButton"]
        var parents = [2: 1, 3: 2]
        var actions = [2: ["AXCancel", "AXPress", "AXPick"], 4: ["AXPress"]]
        var disabled = Set<Int>()
        func click(_ id: Int) throws -> (element: Int, action: String)? {
            try accessibilityClickTarget(id, role: { roles[$0] ?? "AXGroup" }, parent: { parents[$0] },
                enabled: { !disabled.contains($0) }, actions: { actions[$0] ?? [] })
        }
        func expect(_ condition: Bool) { precondition(condition) }
        func failure(_ expected: String, _ run: () throws -> Void) {
            do { try run(); fatalError("Expected \(expected)") }
            catch let error as NativeFailure { precondition(error.code == expected, "\(error.code) != \(expected)") }
            catch { fatalError("Unexpected error: \(error)") }
        }
        try expect(click(2)?.action == "AXPick")
        try expect(click(3)?.element == 2 && click(3)?.action == "AXPick")
        actions[2] = ["AXPick"]
        try expect(click(3)?.action == "AXPick")
        actions[2] = ["AXPress"]
        try expect(click(2)?.action == "AXPress")
        actions[2] = ["AXCancel"]
        failure("UNSUPPORTED_ACTION") { _ = try click(3) }
        disabled.insert(2)
        actions[2] = ["AXPick"]
        failure("ELEMENT_DISABLED") { _ = try click(3) }
        try expect(click(4)?.action == "AXPress")
        // A menu container must not climb into the popup and reopen it.
        parents[1] = 4
        try expect(click(1) == nil)

        roles = [10: "AXWindow", 11: "AXButton", 12: "AXSheet", 13: "AXButton", 14: "AXSheet", 15: "AXButton", 20: "AXWindow", 21: "AXButton"]
        parents = [11: 10, 12: 10, 13: 12, 14: 12, 15: 14, 21: 20]
        let contains = { (root: Int, element: Int) in
            accessibilityContains(root, element, parent: { parents[$0] }, equal: ==)
        }
        let children = { (node: Int) in parents.filter { $0.value == node }.map(\.key) }
        let sheet = { (node: Int) in roles[node] == "AXSheet" }
        precondition(contains(10, 15) && !contains(12, 11) && !contains(12, 21))
        failure("MODAL_STATE_UNAVAILABLE") { _ = try accessibilityActiveSheet(10, children: { _ in throw NativeFailure("MODAL_STATE_UNAVAILABLE", "AXChildren read failed", ["inputDispatched": false]) }, isSheet: sheet, contains: contains, focused: 15) }
        try expect(accessibilityActiveSheet(10, children: children, isSheet: sheet, contains: contains, focused: 15) == 14)
        try expect(accessibilityActiveSheet(20, children: children, isSheet: sheet, contains: contains, focused: 15) == nil)
        roles[16] = "AXSheet"; parents[16] = 10
        failure("MODAL_STATE_UNAVAILABLE") { _ = try accessibilityActiveSheet(10, children: children, isSheet: sheet, contains: contains, focused: nil) }
        try expect(accessibilityActiveSheet(10, children: children, isSheet: sheet, contains: contains, focused: 15) == 14)
        parents.removeValue(forKey: 12); parents.removeValue(forKey: 16)
        try expect(accessibilityActiveSheet(10, children: children, isSheet: sheet, contains: contains, focused: 11) == nil)

        roles = [30: "AXTextArea", 31: "AXScrollArea", 32: "AXWindow"]
        parents = [30: 31, 31: 32]
        var rects = [30: CGRect(x: 24, y: -1000, width: 700, height: 1800), 31: CGRect(x: 24, y: 110, width: 700, height: 270), 32: CGRect(x: 0, y: 0, width: 760, height: 560)]
        var hidden = Set<Int>()
        func visible() throws -> CGRect {
            try accessibilityVisibleBounds(30, bounds: { rects[$0] }, parent: { parents[$0] },
                clips: { ["AXScrollArea", "AXWindow"].contains(roles[$0] ?? "") }, hidden: { hidden.contains($0) })
        }
        try expect(visible() == rects[31])
        rects[30] = CGRect(x: 24, y: -600, width: 700, height: 300)
        failure("ELEMENT_NOT_VISIBLE") { _ = try visible() }
        rects[30] = CGRect(x: 24, y: 350, width: 700, height: 500)
        try expect(visible() == CGRect(x: 24, y: 350, width: 700, height: 30))
        hidden.insert(31)
        failure("ELEMENT_NOT_VISIBLE") { _ = try visible() }
        hidden.removeAll();rects.removeValue(forKey:31)
        failure("ELEMENT_NOT_VISIBLE") { _ = try visible() }

        let dialog = CGRect(x: 400, y: 300, width: 400, height: 180)
        let own = WindowRecord(id: 101, pid: 123, title: "", bounds: dialog)
        let foreign = WindowRecord(id: 201, pid: 456, title: "", bounds: dialog)
        try expect(accessibilityCaptureWindow(dialog, pid: 123, candidates: [foreign, own]).id == 101)
        failure("MODAL_CAPTURE_UNAVAILABLE") { _ = try accessibilityCaptureWindow(dialog, pid: 123, candidates: [foreign]) }
        failure("MODAL_CAPTURE_UNAVAILABLE") { _ = try accessibilityCaptureWindow(dialog, pid: 123, candidates: [own, WindowRecord(id: 102, pid: 123, title: "duplicate", bounds: dialog)]) }
        let mapping = ScreenshotMapping(bounds: dialog, width: 800, height: 360, token: "sheet", windowId: 101)
        try expect(mapping.point(400, 180) == CGPoint(x: 600, y: 390))
        print("macOS interaction checks passed: menu actions/descendants/disabled items, sheet ownership/nesting/closure, clipped and hidden geometry")
    }
}
