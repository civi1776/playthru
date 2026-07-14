import { requireNativeModule, Platform } from "expo-modules-core";

const isIOS = Platform.OS === "ios";

const ClockedActivity = isIOS
  ? requireNativeModule("ClockedActivityModule")
  : null;

export async function startActivity(
  hole: number,
  par: number,
  endTimeMs: number
): Promise<string | null> {
  if (!isIOS || !ClockedActivity) return null;
  return ClockedActivity.startActivity(hole, par, endTimeMs);
}

export async function updateActivity(
  hole: number,
  par: number,
  endTimeMs: number
): Promise<void> {
  if (!isIOS || !ClockedActivity) return;
  return ClockedActivity.updateActivity(hole, par, endTimeMs);
}

export async function endActivity(): Promise<void> {
  if (!isIOS || !ClockedActivity) return;
  return ClockedActivity.endActivity();
}

export async function areActivitiesEnabled(): Promise<boolean> {
  if (!isIOS || !ClockedActivity) return false;
  return ClockedActivity.areActivitiesEnabled();
}
