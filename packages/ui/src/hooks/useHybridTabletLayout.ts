import { useSyncExternalStore } from "react";
import {
  getTabletLayoutSnapshot,
  subscribeTabletLayout,
} from "@/lib/tabletLayoutStore";
import { isMobileSurfaceRuntime } from "@/lib/runtimeSurface";
import { useUIStore } from "@/stores/useUIStore";

export type HybridTabletLayout = {
  isHybridTablet: boolean;
};

export const computeIsHybridTablet = (
  isMobileSurface: boolean,
  hybridEnabled: boolean,
  enabled: boolean,
  roomyForPanels: boolean,
): boolean => isMobileSurface && hybridEnabled && enabled && roomyForPanels;

export function useHybridTabletLayout(): HybridTabletLayout {
  const { enabled, roomyForPanels } = useSyncExternalStore(
    subscribeTabletLayout,
    getTabletLayoutSnapshot,
    getTabletLayoutSnapshot,
  );
  const hybridEnabled = useUIStore((state) => state.hybridTabletUIEnabled);
  const isMobileSurface = isMobileSurfaceRuntime();
  const isHybridTablet = computeIsHybridTablet(isMobileSurface, hybridEnabled, enabled, roomyForPanels);
  return { isHybridTablet };
}
