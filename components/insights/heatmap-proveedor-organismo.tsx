"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatPesos } from "@/lib/format";
import type { HeatmapRow } from "@/lib/insights";

const C = {
  bg: "#131313", grid: "#2d2d2d", label: "#666666",
  mint: "#3cffd0",
};

function positionTip(tip: HTMLDivElement, e: React.MouseEvent, rect: DOMRect) {
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const tipW = 240;
  tip.style.display = "block";
  tip.style.top = `${my - 10}px`;
  tip.style.left = (rect.width - mx < tipW + 20) ? `${mx - tipW - 12}px` : `${mx + 12}px`;
}

export function HeatmapProveedorOrganismo({ data }: { data: HeatmapRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef<{ x: number; y: number; w: number; h: number; d: HeatmapRow; cuit?: string }[]>([]);
  const router = useRouter();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Build matrix
    const proveedores = [...new Set(data.map(d => d.proveedor))];
    const organismos = [...new Set(data.map(d => d.organismo))];
    // Limit to top 12 organisms by total monto
    const orgTotals = new Map<string, number>();
    for (const d of data) {
      orgTotals.set(d.organismo, (orgTotals.get(d.organismo) || 0) + d.monto);
    }
    const topOrgs = [...orgTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(e => e[0]);
    const topProvs = proveedores.slice(0, 15);

    const matrix = new Map<string, number>();
    let maxMonto = 0;
    for (const d of data) {
      if (!topProvs.includes(d.proveedor) || !topOrgs.includes(d.organismo)) continue;
      const key = `${d.proveedor}|${d.organismo}`;
      matrix.set(key, (matrix.get(key) || 0) + d.monto);
      maxMonto = Math.max(maxMonto, matrix.get(key)!);
    }
    if (maxMonto === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const W = rect.width, H = rect.height;
    const P = { top: 180, right: 60, bottom: 10, left: 200 };
    const pW = W - P.left - P.right;
    const pH = H - P.top - P.bottom;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    const cellW = pW / topOrgs.length;
    const cellH = Math.min(18, pH / topProvs.length);

    // Column labels (organisms, rotated)
    ctx.fillStyle = C.label;
    ctx.font = "8px monospace";
    ctx.textAlign = "right";
    topOrgs.forEach((org, j) => {
      const x = P.left + j * cellW + cellW / 2;
      ctx.save();
      ctx.translate(x + 2, P.top - 8);
      ctx.rotate(-Math.PI / 3);
      ctx.textAlign = "left";
      const clean = org.replace(/^\d+\s*-\s*/, "");
      const label = clean;
      ctx.fillText(label, 0, 0);
      ctx.restore();
    });

    // Row labels (providers)
    ctx.textAlign = "right";
    const cells: typeof cellsRef.current = [];
    topProvs.forEach((prov, i) => {
      const y = P.top + i * cellH;
      ctx.fillStyle = C.label;
      ctx.font = "8px monospace";
      const label = prov;
      ctx.fillText(label, P.left - 5, y + cellH / 2 + 3);

      topOrgs.forEach((org, j) => {
        const x = P.left + j * cellW;
        const key = `${prov}|${org}`;
        const monto = matrix.get(key) || 0;

        if (monto > 0) {
          // Log-scale intensity
          const intensity = Math.log10(monto + 1) / Math.log10(maxMonto + 1);
          const r = Math.round(60 + (255 - 60) * intensity * 0.3);
          const g = Math.round(255 * intensity);
          const b = Math.round(208 * intensity);
          const a = 0.15 + intensity * 0.7;
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        } else {
          ctx.fillStyle = "#1a1a1a";
        }
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
        cells.push({ x: x + 1, y: y + 1, w: cellW - 2, h: cellH - 2, d: { proveedor: prov, organismo: org, monto } });
      });
    });
    cellsRef.current = cells;
  }, [data]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="w-full cursor-crosshair" style={{ height: "480px" }}
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          const tip = tooltipRef.current;
          if (!rect || !tip) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          let found: typeof cellsRef.current[0] | null = null;
          for (const c of cellsRef.current) {
            if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h) { found = c; break; }
          }
          if (found && found.d.monto > 0) {
            positionTip(tip, e, rect);
            tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${found.d.proveedor}</div><div class="text-gray-400">${found.d.organismo}</div><div class="text-gray-300">Monto: ${formatPesos(found.d.monto)}</div></div>`;
          } else {
            tip.style.display = "none";
          }
        }}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = "none"; }}
        onClick={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          for (const c of cellsRef.current) {
            if (mx >= c.x && mx <= c.x + c.w && my >= c.y && my <= c.y + c.h && c.d.monto > 0) {
              router.push(`/explorar/cruce?organismo=${encodeURIComponent(c.d.organismo)}`);
              return;
            }
          }
        }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-[#1a1a1a] text-white px-2 py-1" />
      <div className="flex gap-4 px-2 pt-1 text-xs sm:text-[9px] text-text-secondary">
        <span>Intensidad = monto total (escala log)</span>
        <span className="ml-auto">Top 15 proveedores × Top 12 organismos</span>
      </div>
    </div>
  );
}
