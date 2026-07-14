import ActivityKit
import Foundation

struct ClockWidgetAttributes: ActivityAttributes {
    /// Static data — set once when the activity starts
    let hole: Int
    let par: Int

    /// Dynamic data — updated via ContentState
    struct ContentState: Codable, Hashable {
        let endTime: Date
        let isOver: Bool
    }
}
