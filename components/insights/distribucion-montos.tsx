"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatPesos } from "@/lib/format";
import type { DistribucionMontosRow } from "@/lib/insights";

const C = {
  bg: "#131313", grid: "#2d2d2d", label: "#666666",
  mint: "#3cffd0", red: "#ff4d4d",
};

function positionTip(tip: HTMLDivElement, e: React.MouseEvent, rect: DOMRect) {
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const tipW = 220;
  tip.style.display = "block";
  tip.style.top = `${my - 10}px`;
  tip.style.left = (rect.width - mx < tipW + 20) ? `${mx - tipW - 12}px` : `${mx + 12}px`;
}

export function DistribucionMontos({ data }: { data: DistribucionMontosRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const binsRef = useRef<{ x: number; w: number; y: number; h: number; items: DistribucionMontosRow[]; rangeMin: number; rangeMax: number }[]>([]);
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
    const P = { top: 15, right: 20, bottom: 35, left: 55 };
    const pW = W - P.left - P.right, pH = H - P.top - P.bottom;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Log-scale histogram
    const vals = data.map(d => d.montoPromedio).filter(v => v > 0);
    if (vals.length === 0) return;
    const logMin = Math.floor(Math.log10(Math.min(...vals)));
    const logMax = Math.ceil(Math.log10(Math.max(...vals)));
    const numBins = Math.min(40, Math.max(10, (logMax - logMin) * 8));
    const binWidth = (logMax - logMin) / numBins;

    // Build bins
    const bins: { lo: number; hi: number; items: DistribucionMontosRow[] }[] = [];
    for (let i = 0; i < numBins; i++) {
      bins.push({ lo: logMin + i * binWidth, hi: logMin + (i + 1) * binWidth, items: [] });
    }
    for (const d of data) {
      if (d.montoPromedio <= 0) continue;
      const logV = Math.log10(d.montoPromedio);
      const idx = Math.min(numBins - 1, Math.max(0, Math.floor((logV - logMin) / binWidth)));
      bins[idx].items.push(d);
    }

    const maxCount = Math.max(...bins.map(b => b.items.length), 1);

    // Axes
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.left, P.top);
    ctx.lineTo(P.left, H - P.bottom);
    ctx.lineTo(W - P.right, H - P.bottom);
    ctx.stroke();

    // X labels (log scale)
    ctx.fillStyle = C.label;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const xLabels: Record<number, string> = { 3: "$1K", 4: "$10K", 5: "$100K", 6: "$1M", 7: "$10M", 8: "$100M", 9: "$1B", 10: "$10B" };
    for (let exp = Math.ceil(logMin); exp <= logMax; exp++) {
      if (!xLabels[exp]) continue;
      const x = P.left + ((exp - logMin) / (logMax - logMin)) * pW;
      ctx.fillText(xLabels[exp], x, H - P.bottom + 14);
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.moveTo(x, P.top);
      ctx.lineTo(x, H - P.bottom);
      ctx.stroke();
    }

    // Axis titles
    ctx.fillStyle = C.label;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("MONTO PROMEDIO POR CONTRATO (escala log) \u2192", W / 2, H - 3);
    ctx.save();
    ctx.translate(12, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("CANTIDAD DE PROVEEDORES \u2192", 0, 0);
    ctx.restore();

    // Y labels
    ctx.textAlign = "right";
    for (const v of [0, Math.round(maxCount / 2), maxCount]) {
      const y = H - P.bottom - (v / maxCount) * pH;
      ctx.fillText(String(v), P.left - 5, y + 3);
    }

    // Bars
    const barPx = pW / numBins;
    const rects: typeof binsRef.current = [];
    const p90 = vals.sort((a, b) => a - b)[Math.floor(vals.length * 0.95)] || 0;

    bins.forEach((bin, i) => {
      const x = P.left + i * barPx;
      const h = (bin.items.length / maxCount) * pH;
      const y = H - P.bottom - h;
      const isOutlier = Math.pow(10, bin.lo) >= p90;
      ctx.fillStyle = isOutlier ? "rgba(255, 77, 77, 0.6)" : "rgba(60, 255, 208, 0.4)";
      ctx.fillRect(x, y, barPx, h);
      if (bin.items.length > 0) {
        rects.push({ x, w: barPx, y, h, items: bin.items, rangeMin: Math.pow(10, bin.lo), rangeMax: Math.pow(10, bin.hi) });
      }
    });
    binsRef.current = rects;
  }, [data]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="h-[320px] sm:h-64 w-full cursor-crosshair"
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          const tip = tooltipRef.current;
          if (!rect || !tip) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          let found: typeof binsRef.current[0] | null = null;
          for (const b of binsRef.current) {
            if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h) { found = b; break; }
          }
          if (found) {
            positionTip(tip, e, rect);
            const top3 = found.items.sort((a, b) => b.montoPromedio - a.montoPromedio).slice(0, 3);
            tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${found.items.length} proveedores</div>${top3.map(d => `<div class="text-gray-300">${d.nombre.substring(0, 30)} \u2014 ${formatPesos(d.montoPromedio)}</div>`).join("")}<div class="text-gray-500 mt-1">Click para ver el primero</div></div>`;
            canvasRef.current!.style.cursor = "pointer";
          } else {
            tip.style.display = "none";
            canvasRef.current!.style.cursor = "crosshair";
          }
        }}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = "none"; }}
        onClick={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          for (const b of binsRef.current) {
            if (mx >= b.x && mx <= b.x + b.w && my >= b.y && my <= b.y + b.h && b.items.length > 0) {
              router.push(`/explorar/rango?min=${Math.floor(b.rangeMin)}&max=${Math.ceil(b.rangeMax)}`);
              return;
            }
          }
        }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-[#1a1a1a] text-white px-2 py-1" />
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pt-1 text-xs sm:text-[9px] text-text-secondary">
        <span><span className="mr-1 inline-block h-2 w-3" style={{ background: "rgba(60, 255, 208, 0.4)" }} />Mayoria</span>
        <span><span className="mr-1 inline-block h-2 w-3" style={{ background: "rgba(255, 77, 77, 0.6)" }} />Top 5% (outliers)</span>
        <span className="ml-auto">Escala logaritmica en X</span>
      </div>
    </div>
  );
}
