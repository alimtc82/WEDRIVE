import { haversineKm, type LatLng } from "./geo";

const MAX_ACCURACY_METERS = 100;
const MIN_MOVEMENT_METERS = 10;
const HEARTBEAT_MS = 120_000;

export interface LocationSample extends LatLng {
  accuracy: number;
  capturedAt: number;
}

export function isValidLocation(sample: LocationSample): boolean {
  return Number.isFinite(sample.lat) && Number.isFinite(sample.lng)
    && Number.isFinite(sample.accuracy) && Number.isFinite(sample.capturedAt)
    && sample.lat >= -90 && sample.lat <= 90
    && sample.lng >= -180 && sample.lng <= 180
    && sample.accuracy >= 0 && sample.accuracy <= MAX_ACCURACY_METERS
    && !(sample.lat === 0 && sample.lng === 0);
}

export function shouldSendLocation(
  sample: LocationSample,
  previous: LocationSample | null,
  lastSentAt: number,
  intervalMs: number,
  requestInFlight: boolean,
): boolean {
  if (requestInFlight || !isValidLocation(sample)) return false;
  if (!previous || lastSentAt === 0) return true;

  const elapsed = sample.capturedAt - lastSentAt;
  if (elapsed < Math.max(0, intervalMs)) return false;

  const movedMeters = haversineKm(previous, sample) * 1000;
  return movedMeters >= MIN_MOVEMENT_METERS || elapsed >= Math.max(intervalMs, HEARTBEAT_MS);
}
