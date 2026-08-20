import { describe, expect, it } from "vitest";
import { guessKind, haversineKm } from "./geo";

describe("geo helpers", () => {
  it("returns zero for identical coordinates", () => {
    expect(haversineKm({ lat: 30.466, lng: 31.184 }, { lat: 30.466, lng: 31.184 })).toBe(0);
  });

  it("calculates a plausible Benha to Cairo distance", () => {
    const distance = haversineKm({ lat: 30.466, lng: 31.184 }, { lat: 30.0444, lng: 31.2357 });
    expect(distance).toBeGreaterThan(45);
    expect(distance).toBeLessThan(50);
  });

  it("classifies only distances over 30km as intercity", () => {
    expect(guessKind(30)).toBe("in_city");
    expect(guessKind(30.01)).toBe("intercity");
  });
});
