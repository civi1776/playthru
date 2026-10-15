import ExpoModulesCore
import ActivityKit

// Mirror the widget's attributes so ActivityKit can match them
struct ClockWidgetAttributes: ActivityAttributes {
    let hole: Int
    let par: Int

    struct ContentState: Codable, Hashable {
        let endTime: Date
        let isOver: Bool
    }
}

// Shape of the "Holed Out" signal written by HoledOutIntent (in the widget
// extension) into the shared App Group UserDefaults. Mirrors the JSON dict
// the intent writes — see targets/clock-widget/HoledOutIntent.swift.
struct PendingHoleCompletionRecord: Record {
    @Field var holeNumber: Int = 0
    @Field var timestamp: Double = 0
}

public class ClockedActivityModule: Module {
    private var currentActivityId: String?

    // Must match APP_GROUP_ID in plugins/withClockWidget.js and the group
    // referenced in targets/clock-widget/HoledOutIntent.swift /
    // ClockWidget.entitlements / ClockedGolf's own entitlements.
    private static let appGroupId = "group.com.civiswings.playthru"
    private static let pendingHoleCompletionKey = "pendingHoleCompletion"

    public func definition() -> ModuleDefinition {
        Name("ClockedActivityModule")

        AsyncFunction("startActivity") { (hole: Int, par: Int, endTimeMs: Double) -> String? in
            guard #available(iOS 16.2, *) else { return nil }
            guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }

            // End any existing activity first
            self.endAllActivities()

            let endTime = Date(timeIntervalSince1970: endTimeMs / 1000.0)
            let attributes = ClockWidgetAttributes(hole: hole, par: par)
            let state = ClockWidgetAttributes.ContentState(endTime: endTime, isOver: false)

            do {
                let content = ActivityContent(state: state, staleDate: endTime.addingTimeInterval(300))
                let activity = try Activity.request(
                    attributes: attributes,
                    content: content,
                    pushType: nil
                )
                self.currentActivityId = activity.id
                return activity.id
            } catch {
                return nil
            }
        }

        AsyncFunction("updateActivity") { (hole: Int, par: Int, endTimeMs: Double) in
            guard #available(iOS 16.2, *) else { return }

            // End current, start new (attributes are immutable — hole/par changed)
            self.endAllActivities()

            let endTime = Date(timeIntervalSince1970: endTimeMs / 1000.0)
            let attributes = ClockWidgetAttributes(hole: hole, par: par)
            let state = ClockWidgetAttributes.ContentState(endTime: endTime, isOver: false)

            do {
                let content = ActivityContent(state: state, staleDate: endTime.addingTimeInterval(300))
                let activity = try Activity.request(
                    attributes: attributes,
                    content: content,
                    pushType: nil
                )
                self.currentActivityId = activity.id
            } catch {
                // silent
            }
        }

        AsyncFunction("endActivity") {
            guard #available(iOS 16.2, *) else { return }
            self.endAllActivities()
        }

        AsyncFunction("areActivitiesEnabled") { () -> Bool in
            guard #available(iOS 16.2, *) else { return false }
            return ActivityAuthorizationInfo().areActivitiesEnabled
        }

        // Read back the pending "Holed Out" signal left by the lock-screen
        // Live Activity button, if any. Does NOT clear it — the JS side
        // clears explicitly after deciding whether it still applies.
        AsyncFunction("getPendingHoleCompletion") { () -> PendingHoleCompletionRecord? in
            guard let defaults = UserDefaults(suiteName: Self.appGroupId) else { return nil }
            guard let data = defaults.data(forKey: Self.pendingHoleCompletionKey) else { return nil }
            guard
                let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                let hole = json["holeNumber"] as? Int,
                let ts = json["timestamp"] as? Double
            else { return nil }

            var record = PendingHoleCompletionRecord()
            record.holeNumber = hole
            record.timestamp = ts
            return record
        }

        AsyncFunction("clearPendingHoleCompletion") {
            UserDefaults(suiteName: Self.appGroupId)?.removeObject(forKey: Self.pendingHoleCompletionKey)
        }
    }

    @available(iOS 16.2, *)
    private func endAllActivities() {
        let finalState = ClockWidgetAttributes.ContentState(endTime: Date(), isOver: true)
        let finalContent = ActivityContent(state: finalState, staleDate: nil)
        for activity in Activity<ClockWidgetAttributes>.activities {
            Task {
                await activity.end(finalContent, dismissalPolicy: .immediate)
            }
        }
        currentActivityId = nil
    }
}
