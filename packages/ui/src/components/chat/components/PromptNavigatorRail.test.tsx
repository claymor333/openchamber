import { describe, expect, test } from "bun:test";
import { resolveRailGutterWidth, shouldConsumeGutterClick } from "./PromptNavigatorRail";

describe("resolveRailGutterWidth", () => {
  test("hybrid touch mode widens the gutter to 44px", () => {
    expect(resolveRailGutterWidth(true, false)).toBe(44);
    expect(resolveRailGutterWidth(true, true)).toBe(44);
  });

  test("desktop keeps the narrow and standard widths", () => {
    expect(resolveRailGutterWidth(false, false)).toBe(28);
    expect(resolveRailGutterWidth(false, true)).toBe(12);
  });
});

describe("shouldConsumeGutterClick", () => {
  test("consumes (returns true) when a scrub just ended", () => {
    expect(shouldConsumeGutterClick(true)).toBe(true);
  });

  test("passes through (returns false) for a normal click", () => {
    expect(shouldConsumeGutterClick(false)).toBe(false);
  });
});
