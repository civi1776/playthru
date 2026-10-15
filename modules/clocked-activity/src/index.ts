import { Platform } from "expo-modules-core";

let Native: any = null;

if (Platform.OS === "ios") {
  try {
    // requireOptionalNativeModule returns null instead of throwing
    const { requireOptionalNativeModule } = require("expo-modules-core");
    Native = requireOptionalNativeModule("ClockedActivityModule");
  } catch {
    Native = null;
  }
}

export function areActivitiesSupported(): boolean {
  return Native != null;
}

export async function startActivity(
  hole: number,
  par: number,
  endTimeMs: number
): Promise<string | null> {
  if (!Native) return null;
  try { return await Native.startActivity(hole, par, endTimeMs); }
  catch { return null; }
}

export async function updateActivity(
  hole: number,
  par: number,
  endTimeMs: number
): Promise<void> {
  if (!Native) return;
  try { await Native.updateActivity(hole, par, endTimeMs); }
  catch {}
}

export async function endActivity(): Promise<void> {
  if (!Native) return;
  try { await Native.endActivity(); }
  catch {}
}

export async function areActivitiesEnabled(): Promise<boolean> {
  if (!Native) return false;
  try { return await Native.areActivitiesEnabled(); }
  catch { return false; }
}

// ─── Lock-screen "Holed Out" hand-off ───────────────────────────────────────
// The Live Activity's button runs inside the widget extension process (via a
// LiveActivityIntent) and can't reach Supabase or app state directly, so it
// writes a small signal into the shared App Group UserDefaults instead. The
// RN app reads it back here the next time it comes to the foreground and
// applies it as if the in-app "HOLED OUT" button had been tapped.
export type PendingHoleCompletion = { holeNumber: number; timestamp: number } | null;

export async function getPendingHoleCompletion(): Promise<PendingHoleCompletion> {
  if (!Native) return null;
  try {
    const result = await Native.getPendingHoleCompletion();
    if (!result || typeof result.holeNumber !== "number" || typeof result.timestamp !== "number") {
      return null;
    }
    return { holeNumber: result.holeNumber, timestamp: result.timestamp };
  } catch {
    return null;
  }
}

export async function clearPendingHoleCompletion(): Promise<void> {
  if (!Native) return;
  try { await Native.clearPendingHoleCompletion(); }
  catch {}
}
