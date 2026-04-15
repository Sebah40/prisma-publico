/**
 * Shared utilities for mobile-friendly canvas charts.
 * Detects narrow screens and scales sizes up.
 */

export function getCanvasScale(canvasWidth: number) {
  const mobile = canvasWidth < 500;
  return {
    mobile,
    pointRadius: mobile ? 6 : 3,
    fontSize: mobile ? 12 : 9,
    fontSizeSm: mobile ? 11 : 8,
    fontSizeLg: mobile ? 14 : 10,
    labelFont: mobile ? "12px system-ui, sans-serif" : "9px monospace",
    labelFontSm: mobile ? "11px system-ui, sans-serif" : "8px monospace",
    labelFontLg: mobile ? "14px system-ui, sans-serif" : "10px monospace",
    labelFontBold: mobile ? "bold 12px system-ui, sans-serif" : "bold 8px monospace",
    padding: { left: mobile ? 60 : 80, right: mobile ? 15 : 20, top: mobile ? 15 : 10, bottom: mobile ? 40 : 30 },
    lineWidth: mobile ? 2 : 1,
    touchRadius: mobile ? 20 : 10,
  };
}
