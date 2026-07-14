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

public class ClockedActivityModule: Module {
    private var currentActivityId: String?

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
