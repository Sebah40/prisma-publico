"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatPesos } from "@/lib/format";
import type { TimelineAcumulacionRow } from "@/lib/insights";

const C = {
  bg: "#131313", grid: "#2d2d2d", label: "#666666",
  mint: "#3cffd0",
};

const LINE_COLORS = [
  "#3cffd0", "#5200ff", "#ff4d4d", "#ffaa00", "#00aaff",
];

function positionTip(tip: HTMLDivElement, e: React.MouseEvent, rect: DOMRect) {
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const tipW = 240;
  tip.style.display = "block";
  tip.style.top = `${my - 10}px`;
  tip.style.left = (rect.width - mx < tipW + 20) ? `${mx - tipW - 12}px` : `${mx + 12}px`;
}

export function TimelineAcumulacion({ data }: { data: TimelineAcumulacionRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const P = { top: 15, right: 20, bottom: 35, left: 65 };
    const pW = W - P.left - P.right, pH = H - P.top - P.bottom;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Group by provider
    const grouped = new Map<string, { month: string; acumulado: number }[]>();
    for (const d of data) {
      if (!grouped.has(d.proveedor)) grouped.set(d.proveedor, []);
      grouped.get(d.proveedor)!.push({ month: d.month, acumulado: d.acumulado });
    }

    const allMonths = [...new Set(data.map(d => d.month))].sort();
    const maxAcum = Math.max(...data.map(d => d.acumulado), 1);

    const sx = (month: string) => P.left + (allMonths.indexOf(month) / Math.max(allMonths.length - 1, 1)) * pW;
    const sy = (v: number) => H - P.bottom - (v / maxAcum) * pH;

    // Grid
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.left, P.top);
    ctx.lineTo(P.left, H - P.bottom);
    ctx.lineTo(W - P.right, H - P.bottom);
    ctx.stroke();

    // Y labels
    ctx.fillStyle = C.label;
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      const v = maxAcum * frac;
      const y = sy(v);
      ctx.fillText(formatPesos(v), P.left - 5, y + 3);
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.moveTo(P.left, y);
      ctx.lineTo(W - P.right, y);
      ctx.stroke();
    }

    // X labels (years)
    ctx.textAlign = "center";
    const seenYears = new Set<string>();
    allMonths.forEach((m) => {
      const year = m.slice(0, 4);
      if (!seenYears.has(year) && m.endsWith("-01")) {
        seenYears.add(year);
        ctx.fillText(year, sx(m), H - P.bottom + 14);
      }
    });

    // Axis title
    ctx.fillStyle = C.label;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("MONTO ACUMULADO \u2192", W / 2, H - 3);

    // Draw lines
    const provNames = [...grouped.keys()];
    let colorIdx = 0;
    for (const [prov, points] of grouped) {
      const sorted = points.sort((a, b) => a.month.localeCompare(b.month));
      const isAvg = prov === "PROMEDIO";
      ctx.strokeStyle = isAvg ? "#555555" : (LINE_COLORS[colorIdx % LINE_COLORS.length]);
      ctx.lineWidth = isAvg ? 2 : 1.5;
      if (isAvg) {
        ctx.setLineDash([4, 4]);
      }

      ctx.beginPath();
      sorted.forEach((pt, i) => {
        const x = sx(pt.month);
        const y = sy(pt.acumulado);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // End label
      if (sorted.length > 0) {
        const last = sorted[sorted.length - 1];
        const lx = sx(last.month);
        const ly = sy(last.acumulado);
        ctx.fillStyle = isAvg ? "#555555" : (LINE_COLORS[colorIdx % LINE_COLORS.length]);
        ctx.font = "8px monospace";
        ctx.textAlign = "left";
        const shortName = prov.length > 15 ? prov.substring(0, 15) + "\u2026" : prov;
        if (lx + 5 < W - P.right - 10) {
          ctx.fillText(shortName, lx + 4, ly - 4);
        }
      }

      if (!isAvg) colorIdx++;
    }
  }, [data]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="h-[340px] sm:h-72 w-full cursor-crosshair"
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          const tip = tooltipRef.current;
          if (!rect || !tip) return;
          const mx = e.clientX - rect.left;

          // Find closest month
          const allMonths = [...new Set(data.map(d => d.month))].sort();
          if (allMonths.length === 0) return;
          const PL = 65, PR = 20, pW = rect.width - PL - PR;
          const frac = (mx - PL) / pW;
          const idx = Math.round(frac * (allMonths.length - 1));
          if (idx < 0 || idx >= allMonths.length) { tip.style.display = "none"; return; }
          const month = allMonths[idx];
          const monthData = data.filter(d => d.month === month);

          if (monthData.length > 0) {
            positionTip(tip, e, rect);
            tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${month}</div>${monthData.sort((a, b) => b.acumulado - a.acumulado).map(d => `<div class="text-gray-300">${d.proveedor.substring(0, 25)}: ${formatPesos(d.acumulado)}</div>`).join("")}</div>`;
          } else {
            tip.style.display = "none";
          }
        }}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = "none"; }}
        onClick={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
          const mx = e.clientX - rect.left;
          const months = [...new Set(data.map(d => d.month))].sort();
          if (months.length === 0) return;
          const P = { left: 60, right: 60 };
          const pW = rect.width - P.left - P.right;
          const t = (mx - P.left) / pW;
          const idx = Math.round(t * (months.length - 1));
          if (idx >= 0 && idx < months.length) {
            router.push(`/explorar/mes?mes=${months[idx]}`);
          }
        }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-[#1a1a1a] text-white px-2 py-1" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pt-1 text-xs sm:text-[9px] text-text-secondary">
        <span>Cada linea = monto acumulado de un proveedor</span>
        <span><span className="mr-1 inline-block h-0.5 w-4 border-t border-dashed border-gray-500" />Promedio</span>
        <span className="ml-auto">Top 5 proveedores por monto total</span>
      </div>
    </div>
  );
}
