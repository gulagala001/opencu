import AppKit
import ApplicationServices

// A private, disposable application. It never reads another application's UI.
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 120, y: 120, width: 420, height: 180),
    styleMask: [.titled, .closable, .resizable], backing: .buffered, defer: false)
window.title = "OpenCU isolated native verification"
window.isReleasedWhenClosed = false
let field = NSTextField(frame: NSRect(x: 20, y: 75, width: 380, height: 32))
field.setAccessibilityIdentifier("opencu-native-fixture-input")
window.contentView!.addSubview(field)
func reply(_ value: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data + Data([10]))
}
// Record only synthetic Shift edges delivered to this disposable app.
var shiftEvents = 0
var deliveredShift = false
let shiftMonitor = NSEvent.addLocalMonitorForEvents(matching: [.flagsChanged, .keyDown, .keyUp]) { event in
    if event.keyCode == 56, let raw = event.cgEvent,
       raw.getIntegerValueField(.eventSourceUnixProcessID) > 0 {
        deliveredShift = event.modifierFlags.contains(.shift)
        shiftEvents += 1
    }
    return event
}
func state() -> [String: Any] {
    ["text": field.stringValue, "pid": Int(getpid()), "windowId": window.windowNumber,
     "shiftHeld": CGEventSource.keyState(.combinedSessionState, key: 56),
     "focused": app.isActive && window.isKeyWindow,
     "deliveredShift": deliveredShift, "shiftEvents": shiftEvents]
}
window.makeKeyAndOrderFront(nil)
app.activate(ignoringOtherApps: true)
window.makeFirstResponder(field)
Thread.detachNewThread {
    while let line = readLine() {
        guard let data = line.data(using: .utf8), let request = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
        DispatchQueue.main.async {
            switch request["command"] as? String {
            case "externalEdit":
                field.stringValue = request["text"] as? String ?? "external"
                window.makeFirstResponder(field)
                if let editor = field.currentEditor() { editor.selectedRange = NSRange(location: field.stringValue.utf16.count, length: 0) }
            case "resize": window.setContentSize(NSSize(width: 480, height: 220))
            case "focus":
                window.makeKeyAndOrderFront(nil); app.activate(ignoringOtherApps: true)
                window.makeFirstResponder(field)
                if let editor = field.currentEditor() { editor.selectedRange = NSRange(location: field.stringValue.utf16.count, length: 0) }
            case "close": window.close()
            case "quit": app.terminate(nil)
            default: break
            }
            reply(["id": request["id"] ?? NSNull(), "state": state()])
        }
    }
    DispatchQueue.main.async { app.terminate(nil) }
}
DispatchQueue.main.async { reply(["ready": true, "state": state()]) }
app.run()
