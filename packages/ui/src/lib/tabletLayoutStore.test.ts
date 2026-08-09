import { afterEach, describe, expect, test } from "bun:test";
import {
  __ocResetTabletLayout,
  getTabletLayout,
  getTabletLayoutSnapshot,
  subscribeTabletLayout,
} from "./tabletLayoutStore";

describe("tabletLayoutStore", () => {
  afterEach(() => {
    __ocResetTabletLayout();
  });

  test("snapshot returns the readTabletLayout shape", () => {
    const snap = getTabletLayoutSnapshot();
    expect(typeof snap.enabled).toBe("boolean");
    expect(typeof snap.roomyForPanels).toBe("boolean");
  });

  test("getTabletLayout matches the snapshot", () => {
    expect(getTabletLayout()).toEqual(getTabletLayoutSnapshot());
  });

  test("subscribe returns an unsubscribe function", () => {
    const unsub = subscribeTabletLayout(() => {});
    expect(typeof unsub).toBe("function");
    unsub();
  });
});
