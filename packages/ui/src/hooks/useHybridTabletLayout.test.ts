import { describe, expect, test } from "bun:test";
import { computeIsHybridTablet } from "./useHybridTabletLayout";

describe("computeIsHybridTablet", () => {
  test("true only when every input is true", () => {
    expect(computeIsHybridTablet(true, true, true, true)).toBe(true);
  });

  test("false when surface is not mobile", () => {
    expect(computeIsHybridTablet(false, true, true, true)).toBe(false);
  });

  test("false when toggle is off", () => {
    expect(computeIsHybridTablet(true, false, true, true)).toBe(false);
  });

  test("false when size class is not enabled", () => {
    expect(computeIsHybridTablet(true, true, false, true)).toBe(false);
  });

  test("false when not roomy for panels", () => {
    expect(computeIsHybridTablet(true, true, true, false)).toBe(false);
  });
});
