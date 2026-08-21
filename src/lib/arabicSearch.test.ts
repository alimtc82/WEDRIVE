import { describe, expect, it } from "vitest";
import { findArabicMatch, normalizeArabic } from "./arabicSearch";

describe("Arabic smart search", () => {
  it("treats common Arabic letter variants as equivalent", () => {
    expect(normalizeArabic("إشبيليّة").replace("ّ", "")).toBe("اشبيليه");
    expect(normalizeArabic("مؤسسة")).toBe("موسسه");
  });

  it("finds a tolerant match while preserving display indexes", () => {
    expect(findArabicMatch("شارع إبراهيم", "ابرا")).toEqual({ start: 5, length: 4 });
  });

  it("returns no match for an unrelated query", () => {
    expect(findArabicMatch("كفر السرايا", "المنشية")).toBeNull();
  });
});
