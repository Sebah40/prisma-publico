"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatPesos } from "@/lib/format";
import type { BoxPlotRow } from "@/lib/insights";

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

export function BoxPlotProcedimiento({ data }: { data: BoxPlotRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<{ y: number; h: number; d: BoxPlotRow }[]>([]);
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
    const P = { top: 10, right: 20, bottom: 30, left: 220 };
    const pW = W - P.left - P.right, pH = H - P.top - P.bottom;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Log scale for X — tight range, no wasted space
    const allVals = data.flatMap(d => [d.min, d.max, d.q1, d.q3, d.median]).filter(v => v > 0);
    if (allVals.length === 0) return;
    const logMin = Math.floor(Math.log10(Math.min(...allVals)));
    const logMax = Math.ceil(Math.log10(Math.max(...allVals)));

    const sx = (v: number) => {
      if (v <= 0) return P.left;
      return P.left + ((Math.log10(v) - logMin) / (logMax - logMin || 1)) * pW;
    };

    // Clip: nothing draws left of P.left
    ctx.save();
    ctx.beginPath();
    ctx.rect(P.left, 0, pW + P.right, H);
    ctx.clip();

    // Left axis
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.left, P.top);
    ctx.lineTo(P.left, H - P.bottom);
    ctx.stroke();

    // Grid lines — show full and half decades ($1K, $3K, $10K, $30K, etc.)
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    const xLabels: Record<number, string> = {
      2: "$100", 2.5: "$300", 3: "$1K", 3.5: "$3K",
      4: "$10K", 4.5: "$30K", 5: "$100K", 5.5: "$300K",
      6: "$1M", 6.5: "$3M", 7: "$10M", 7.5: "$30M",
      8: "$100M", 8.5: "$300M", 9: "$1B", 10: "$10B",
    };
    ctx.fillStyle = C.label;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    for (let exp = Math.floor(logMin * 2) / 2; exp <= logMax; exp += 0.5) {
      const key = Number(exp.toFixed(1));
      if (!xLabels[key]) continue;
      const x = sx(Math.pow(10, exp));
      if (x < P.left || x > W - P.right) continue;
      ctx.beginPath();
      ctx.moveTo(x, P.top);
      ctx.lineTo(x, H - P.bottom);
      ctx.stroke();
      // Full decades get bold grid, halves get lighter
      if (exp % 1 !== 0) {
        ctx.strokeStyle = "#1e1e1e";
      }
      ctx.fillText(xLabels[key], x, H - P.bottom + 14);
      ctx.strokeStyle = C.grid;
    }

    // Rows — first pass: labels (no clip)
    ctx.restore(); // restore from grid clip
    const gap = 4;
    const rowH = Math.min(30, (pH - gap * data.length) / data.length);
    const rows: typeof rowsRef.current = [];

    data.forEach((d, i) => {
      const y = P.top + i * (rowH + gap);
      rows.push({ y, h: rowH, d });

      ctx.fillStyle = C.label;
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(d.tipo, P.left - 8, y + rowH / 2 + 3);
    });
    rowsRef.current = rows;

    // Second pass: boxes and whiskers (clipped to chart area)
    ctx.save();
    ctx.beginPath();
    ctx.rect(P.left, 0, pW, H);
    ctx.clip();

    data.forEach((d, i) => {
      const y = P.top + i * (rowH + gap);
      const midY = y + rowH / 2;
      const boxH = rowH * 0.6;

      // Whisker line (min to max)
      ctx.strokeStyle = "rgba(60, 255, 208, 0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx(d.min), midY);
      ctx.lineTo(sx(d.max), midY);
      ctx.stroke();

      // Box (Q1 to Q3)
      const x1 = sx(d.q1);
      const x3 = sx(d.q3);
      ctx.fillStyle = "rgba(60, 255, 208, 0.2)";
      ctx.fillRect(x1, midY - boxH / 2, x3 - x1, boxH);
      ctx.strokeStyle = "rgba(60, 255, 208, 0.5)";
      ctx.strokeRect(x1, midY - boxH / 2, x3 - x1, boxH);

      // Median line
      ctx.strokeStyle = C.mint;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx(d.median), midY - boxH / 2);
      ctx.lineTo(sx(d.median), midY + boxH / 2);
      ctx.stroke();
      ctx.lineWidth = 1;

      // Whisker caps
      ctx.strokeStyle = "rgba(60, 255, 208, 0.4)";
      for (const v of [d.min, d.max]) {
        ctx.beginPath();
        ctx.moveTo(sx(v), midY - 3);
        ctx.lineTo(sx(v), midY + 3);
        ctx.stroke();
      }
    });
    ctx.restore();
  }, [data]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  const height = Math.max(200, data.length * 36 + 45);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="w-full cursor-crosshair" style={{ height: `${height}px` }}
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          const tip = tooltipRef.current;
          if (!rect || !tip) return;
          const my = e.clientY - rect.top;
          let found: typeof rowsRef.current[0] | null = null;
          for (const r of rowsRef.current) {
            if (my >= r.y && my <= r.y + r.h) { found = r; break; }
          }
          if (found) {
            positionTip(tip, e, rect);
            tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${found.d.tipo}</div><div class="text-gray-300">Mediana: ${formatPesos(found.d.median)}</div><div class="text-gray-300">Q1: ${formatPesos(found.d.q1)} \u2014 Q3: ${formatPesos(found.d.q3)}</div><div class="text-gray-300">Rango: ${formatPesos(found.d.min)} \u2014 ${formatPesos(found.d.max)}</div></div>`;
          } else {
            tip.style.display = "none";
          }
        }}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = "none"; }}
        onClick={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
          const my = e.clientY - rect.top;
          for (const r of rowsRef.current) {
            if (my >= r.y && my <= r.y + r.h) {
              router.push(`/explorar/procedimiento?tipo=${encodeURIComponent(r.d.tipo)}`);
              return;
            }
          }
        }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-[#1a1a1a] text-white px-2 py-1" />
      <div className="flex gap-4 px-2 pt-1 text-[9px] text-text-secondary">
        <span><span className="mr-1 inline-block h-2 w-2" style={{ background: C.mint }} />Mediana</span>
        <span>Caja = rango intercuartil (25%-75%) · Línea = mediana · Bigotes = 1.5× el rango</span>
        <span className="ml-auto">Escala logarítmica</span>
      </div>
    </div>
  );
}
