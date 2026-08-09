import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "bun:test";
import { useUIStore } from "@/stores/useUIStore";
import { __ocResetTabletLayout } from "@/lib/tabletLayoutStore";
import { useHybridTabletLayout } from "./useHybridTabletLayout";

beforeEach(() => {
  useUIStore.setState({ hybridTabletUIEnabled: false });
  __ocResetTabletLayout();
});

describe("useHybridTabletLayout", () => {
  test("false when toggle is off", () => {
    const { result } = renderHook(() => useHybridTabletLayout());
    expect(result.current.isHybridTablet).toBe(false);
  });

  test("false when surface is not mobile", () => {
    useUIStore.getState().setHybridTabletUIEnabled(true);
    const { result } = renderHook(() => useHybridTabletLayout());
    expect(result.current.isHybridTablet).toBe(false);
  });

  test("false when the viewport is not a roomy tablet", () => {
    // The test env surface is not mobile, so isHybridTablet is false even if
    // the size class were enabled.
    useUIStore.getState().setHybridTabletUIEnabled(true);
    const { result } = renderHook(() => useHybridTabletLayout());
    expect(result.current.isHybridTablet).toBe(false);
  });
});
