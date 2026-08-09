import { beforeEach, describe, expect, test } from "bun:test";
import { useUIStore } from "./useUIStore";

describe("hybridTabletUIEnabled", () => {
  beforeEach(() => {
    useUIStore.setState({ hybridTabletUIEnabled: false });
  });

  test("defaults to false", () => {
    expect(useUIStore.getState().hybridTabletUIEnabled).toBe(false);
  });

  test("setter flips the flag", () => {
    useUIStore.getState().setHybridTabletUIEnabled(true);
    expect(useUIStore.getState().hybridTabletUIEnabled).toBe(true);
  });

  test("is included in the persist partialize output", () => {
    const partial = useUIStore.persist.getOptions().partialize?.(useUIStore.getState()) as Record<string, unknown>;
    expect(typeof partial.hybridTabletUIEnabled).toBe("boolean");
  });
});
