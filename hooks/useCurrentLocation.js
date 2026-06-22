import { useState, useEffect } from 'react';
import * as Location from 'expo-location';

/**
 * useCurrentLocation
 *
 * Requests foreground location permission on mount and subscribes to continuous
 * GPS updates via expo-location's watchPositionAsync. Designed for use during
 * an active round to power the GPS rangefinder.
 *
 * Permission note: requests FOREGROUND permission only (when-in-use).
 * Background location is NOT requested — the rangefinder only needs GPS while
 * the app is open and the user is on the scorecard screen.
 *
 * Accuracy note: uses Location.Accuracy.High (~10 m horizontal accuracy).
 * BestForNavigation is intentionally avoided — it enables the barometric
 * altimeter and increased CPU polling, which noticeably drains battery during
 * a 4-hour round.
 *
 * Throttle: updates fire at most once per 2 seconds AND once per 5 meters of
 * movement. The OS delivers whichever threshold is crossed first.
 *
 * @returns {{
 *   location: { latitude: number, longitude: number, accuracy: number, timestamp: number } | null,
 *   error: Error | null,
 *   permissionStatus: 'granted' | 'denied' | 'undetermined',
 * }}
 *
 * Caveats:
 * - Returns location: null until the first fix arrives (may take a few seconds
 *   on a cold start or indoors).
 * - On iOS simulator, location is simulated. On Android emulator, a mock
 *   location provider must be configured.
 * - If the user denies permission, location stays null and permissionStatus
 *   is 'denied'. The hook will NOT re-request permission automatically.
 */
export function useCurrentLocation() {
  const [location,         setLocation]         = useState(null);
  const [error,            setError]            = useState(null);
  const [permissionStatus, setPermissionStatus] = useState('undetermined');

  useEffect(() => {
    let subscription = null;
    let cancelled    = false;

    const start = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;

        setPermissionStatus(status);

        if (status !== 'granted') {
          // Permission denied — nothing more to do. Don't throw; this is an
          // expected user action, not an error.
          return;
        }

        subscription = await Location.watchPositionAsync(
          {
            accuracy:         Location.Accuracy.High,
            timeInterval:     2000,   // minimum ms between updates
            distanceInterval: 5,      // minimum meters of movement between updates
          },
          (pos) => {
            if (cancelled) return;
            setLocation({
              latitude:  pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy:  pos.coords.accuracy,
              timestamp: pos.timestamp,
            });
          },
        );
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (subscription) subscription.remove();
    };
  }, []);

  return { location, error, permissionStatus };
}
