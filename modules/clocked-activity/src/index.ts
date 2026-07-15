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
