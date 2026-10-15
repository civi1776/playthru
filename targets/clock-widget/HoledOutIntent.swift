import AppIntents
import ActivityKit
import Foundation

// Runs entirely inside the widget extension process when the golfer taps
// "HOLED OUT" on the lock-screen Live Activity. Per Apple's LiveActivityIntent
// contract this executes in-process — no app launch, no unlock required,
// which is the whole point: a golfer who beats the shot clock can log it
// without fumbling to open the app mid-round.
//
// The extension has no Supabase session / auth context, so it can't safely
// write to the backend directly. Instead it drops a small signal into the
// shared App Group UserDefaults; the RN app picks it up and applies it the
// next time it comes to the foreground (see ClockedRoundScreen.js's
// "Lock-screen Holed Out hand-off" and ClockedActivityModule.swift's
// getPendingHoleCompletion / clearPendingHoleCompletion).
//
// NOTE: this identifier must exactly match APP_GROUP_ID in
// plugins/withClockWidget.js, ClockWidget.entitlements, the main app's
// entitlements, and ClockedActivityModule.swift's appGroupId.
private let appGroupId = "group.com.civiswings.playthru"
private let pendingHoleCompletionKey = "pendingHoleCompletion"

@available(iOS 17.0, *)
struct HoledOutIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Holed Out"
    static var description = IntentDescription("Logs that you finished the current hole from the lock screen.")

    @Parameter(title: "Hole")
    var hole: Int

    init() {
        self.hole = 0
    }

    init(hole: Int) {
        self.hole = hole
    }

    func perform() async throws -> some IntentResult {
        if let defaults = UserDefaults(suiteName: appGroupId) {
            let payload: [String: Any] = [
                "holeNumber": hole,
                "timestamp": Date().timeIntervalSince1970 * 1000,
            ]
            if let data = try? JSONSerialization.data(withJSONObject: payload) {
                defaults.set(data, forKey: pendingHoleCompletionKey)
            }
        }
        return .result()
    }
}
