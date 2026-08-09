export type ContextPanelWidthInput = {
  embeddedWidth: number | undefined;
  manualWidth: number | undefined;
  widthFraction: number;
  fallbackBase: number;
  clamp: (width: number) => number;
};

export const resolveContextPanelWidth = (input: ContextPanelWidthInput): number => {
  const { embeddedWidth, manualWidth, widthFraction, fallbackBase, clamp } = input;
  if (embeddedWidth !== undefined) {
    return embeddedWidth;
  }
  return clamp(manualWidth ?? Math.round(widthFraction * fallbackBase));
};
