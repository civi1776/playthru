import ActivityKit
import SwiftUI
import WidgetKit

// MARK: - Colors
private let bgColor = Color(red: 9/255, green: 15/255, blue: 10/255)
private let gold = Color(red: 201/255, green: 168/255, blue: 76/255)
private let cream = Color(red: 245/255, green: 237/255, blue: 216/255)
private let redWarn = Color(red: 232/255, green: 93/255, blue: 74/255)
private let dim = Color(red: 122/255, green: 110/255, blue: 88/255)

struct ClockWidgetLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: ClockWidgetAttributes.self) { context in
            // ── Lock screen / banner card ──
            lockScreenView(context: context)
                .activityBackgroundTint(bgColor)
                .activitySystemActionForegroundColor(cream)
        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded regions
                DynamicIslandExpandedRegion(.leading) {
                    Text("CLOCKED")
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(gold)
                        .kerning(3)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("HOLE \(context.attributes.hole)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundColor(cream)
                }
                DynamicIslandExpandedRegion(.center) {
                    timerText(endTime: context.state.endTime, isOver: context.state.isOver)
                        .font(.system(size: 32, weight: .ultraLight).monospacedDigit())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text("PAR \(context.attributes.par)")
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundColor(dim)
                        .kerning(2)
                }
            } compactLeading: {
                Text("H\(context.attributes.hole)")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundColor(gold)
            } compactTrailing: {
                timerText(endTime: context.state.endTime, isOver: context.state.isOver)
                    .font(.system(size: 12, weight: .semibold).monospacedDigit())
            } minimal: {
                timerText(endTime: context.state.endTime, isOver: context.state.isOver)
                    .font(.system(size: 12, weight: .semibold).monospacedDigit())
                    .foregroundColor(gold)
            }
        }
    }

    // MARK: - Lock screen view
    @ViewBuilder
    private func lockScreenView(context: ActivityViewContext<ClockWidgetAttributes>) -> some View {
        VStack(spacing: 6) {
            HStack {
                Text("CLOCKED")
                    .font(.system(size: 9, weight: .bold))
                    .foregroundColor(gold)
                    .kerning(3)
                Spacer()
                Text("HOLE \(context.attributes.hole) \u{00B7} PAR \(context.attributes.par)")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(cream)
                    .kerning(1)
            }

            timerText(endTime: context.state.endTime, isOver: context.state.isOver)
                .font(.system(size: 44, weight: .ultraLight).monospacedDigit())
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Timer text (native countdown)
    @ViewBuilder
    private func timerText(endTime: Date, isOver: Bool) -> some View {
        if isOver || endTime <= Date() {
            Text("OVER")
                .foregroundColor(redWarn)
        } else {
            Text(timerInterval: Date()...endTime, countsDown: true)
                .foregroundColor(gold)
        }
    }
}
