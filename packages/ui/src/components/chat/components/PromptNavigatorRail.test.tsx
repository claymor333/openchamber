import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test } from "bun:test";
import { PromptNavigatorRail } from "./PromptNavigatorRail";

// The rail reads the isHybridTablet PROP (defaulted false), not the store
// flag — touch mode is driven by the parent (ChatContainer) passing the hook
// result down.

const turnIds = ["a", "b", "c"];
const previewsByTurnId = new Map([
  ["a", [{ type: "text", text: "first" }]],
  ["b", [{ type: "text", text: "second" }]],
  ["c", [{ type: "text", text: "third" }]],
]);

function renderRail(overrides: Partial<Parameters<typeof PromptNavigatorRail>[0]> = {}) {
  return render(
    <PromptNavigatorRail
      turnIds={turnIds}
      previewsByTurnId={previewsByTurnId}
      activeTurnId="b"
      onSelectTurn={() => {}}
      canLoadEarlier={false}
      isLoadingOlder={false}
      onLoadEarlier={() => {}}
      {...overrides}
    />
  );
}

describe("PromptNavigatorRail touch mode", () => {
  test("gutter pointerdown does not crash without hybrid", () => {
    renderRail();
    const gutter = screen.getByRole("listbox");
    act(() => {
      fireEvent.pointerDown(gutter, { pointerId: 1, clientY: 12 });
      fireEvent.pointerMove(gutter, { pointerId: 1, clientY: 24 });
      fireEvent.pointerUp(gutter, { pointerId: 1, clientY: 24 });
    });
    expect(gutter).toBeTruthy();
  });

  test("hybrid touch gutter uses the widened hit target", () => {
    renderRail({ isHybridTablet: true });
    const gutter = screen.getByRole("listbox");
    expect(gutter).toHaveStyle({ width: "44px" });
  });
});
