import { describe, expect, it } from "vitest";
import { isValidLocation, shouldSendLocation, type LocationSample } from "./locationPolicy";

const sample = (overrides: Partial<LocationSample> = {}): LocationSample => ({
  lat: 30.466,
  lng: 31.184,
  accuracy: 15,
  capturedAt: 10_000,
  ...overrides,
});

describe("location policy", () => {
  it("rejects invalid coordinates and inaccurate fixes", () => {
    expect(isValidLocation(sample({ lat: 91 }))).toBe(false);
    expect(isValidLocation(sample({ accuracy: 101 }))).toBe(false);
    expect(isValidLocation(sample({ lat: 0, lng: 0 }))).toBe(false);
  });

  it("sends the first valid fix", () => {
    expect(shouldSendLocation(sample(), null, 0, 30_000, false)).toBe(true);
  });

  it("blocks concurrent and too-frequent updates", () => {
    const previous = sample({ capturedAt: 1_000 });
    expect(shouldSendLocation(sample(), previous, 1_000, 30_000, true)).toBe(false);
    expect(shouldSendLocation(sample(), previous, 1_000, 30_000, false)).toBe(false);
  });

  it("sends meaningful movement and a stationary heartbeat", () => {
    const previous = sample({ capturedAt: 1_000 });
    const moved = sample({ lat: 30.4662, capturedAt: 40_000 });
    const heartbeat = sample({ capturedAt: 130_000 });
    expect(shouldSendLocation(moved, previous, 1_000, 30_000, false)).toBe(true);
    expect(shouldSendLocation(heartbeat, previous, 1_000, 30_000, false)).toBe(true);
  });
});
