"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatPesos } from "@/lib/format";
import type { AntesVsDespuesRow } from "@/lib/insights";

const C = {
  bg: "#131313", grid: "#2d2d2d", label: "#666666",
  mint: "#3cffd0", gray: "rgba(150, 150, 150, 0.5)", red: "#ff4d4d",
};

function positionTip(tip: HTMLDivElement, e: React.MouseEvent, rect: DOMRect) {
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const tipW = 250;
  tip.style.display = "block";
  tip.style.top = `${my - 10}px`;
  tip.style.left = (rect.width - mx < tipW + 20) ? `${mx - tipW - 12}px` : `${mx + 12}px`;
}

export function AntesVsDespues({ data }: { data: AntesVsDespuesRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<{ y: number; h: number; d: AntesVsDespuesRow }[]>([]);
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
    const P = { top: 10, right: 20, bottom: 25, left: 180 };
    const pW = W - P.left - P.right, pH = H - P.top - P.bottom;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Log scale — all values > 0
    const allVals = data.flatMap(d => [d.montoAntes, d.montoDespues]).filter(v => v > 0);
    const logMin = allVals.length > 0 ? Math.floor(Math.log10(Math.min(...allVals))) : 0;
    const logMax = allVals.length > 0 ? Math.ceil(Math.log10(Math.max(...allVals))) : 1;
    const logRange = logMax - logMin || 1;

    const sx = (v: number) => {
      if (v <= 0) return P.left;
      const t = (Math.log10(v) - logMin) / logRange;
      return P.left + t * pW;
    };

    // Axis
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.left, P.top);
    ctx.lineTo(P.left, H - P.bottom);
    ctx.stroke();

    // X labels (powers of 10)
    ctx.fillStyle = C.label;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const labels: Record<number, string> = { 3: "$1K", 4: "$10K", 5: "$100K", 6: "$1M", 7: "$10M", 8: "$100M", 9: "$1B", 10: "$10B" };
    for (let exp = logMin; exp <= logMax; exp++) {
      const x = sx(Math.pow(10, exp));
      if (labels[exp]) ctx.fillText(labels[exp], x, H - P.bottom + 14);
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.moveTo(x, P.top);
      ctx.lineTo(x, H - P.bottom);
      ctx.stroke();
    }

    // Rows
    const rowH = Math.min(24, pH / data.length);
    const barH = (rowH - 4) / 2;
    const rows: typeof rowsRef.current = [];

    data.forEach((d, i) => {
      const y = P.top + i * rowH;
      rows.push({ y, h: rowH, d });

      // Label
      ctx.fillStyle = C.label;
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      const label = d.nombre.length > 25 ? d.nombre.substring(0, 25) + "\u2026" : d.nombre;
      ctx.fillText(label, P.left - 8, y + rowH / 2 + 3);

      // "Before" bar (gray)
      const wBefore = sx(d.montoAntes) - P.left;
      ctx.fillStyle = C.gray;
      ctx.fillRect(P.left, y + 1, Math.max(wBefore, 0), barH);

      // "After" bar (mint or red if much higher)
      const wAfter = sx(d.montoDespues) - P.left;
      const multiplier = d.montoAntes > 0 ? d.montoDespues / d.montoAntes : (d.montoDespues > 0 ? 999 : 0);
      ctx.fillStyle = multiplier > 10 ? "rgba(255, 77, 77, 0.6)" : "rgba(60, 255, 208, 0.5)";
      ctx.fillRect(P.left, y + 1 + barH + 2, Math.max(wAfter, 0), barH);

      // Multiplier label
      if (multiplier > 1 && d.montoDespues > 0) {
        ctx.fillStyle = multiplier > 10 ? C.red : C.mint;
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "left";
        const labelX = P.left + Math.max(wAfter, wBefore) + 4;
        if (labelX < W - P.right - 30) {
          ctx.fillText(`${multiplier > 999 ? "\u221E" : multiplier.toFixed(0)}x`, labelX, y + rowH / 2 + 3);
        }
      }
    });
    rowsRef.current = rows;
  }, [data]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  const height = Math.max(200, data.length * 24 + 35);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="w-full cursor-crosshair" style={{ height: `${Math.min(height, 500)}px` }}
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
            const mult = found.d.montoAntes > 0 ? (found.d.montoDespues / found.d.montoAntes).toFixed(0) : "\u221E";
            tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${found.d.nombre}</div><div class="text-gray-400">Dono a: ${found.d.partido}</div><div class="text-gray-300">Antes de donar: ${formatPesos(found.d.montoAntes)}</div><div class="text-gray-300">Despues de donar: ${formatPesos(found.d.montoDespues)}</div><div class="${Number(mult) > 10 ? "text-red-400" : "text-gray-300"}">Multiplicador: ${mult}x</div><div class="text-gray-500 mt-1">Click para ver ficha</div></div>`;
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
          const my = e.clientY - rect.top;
          for (const r of rowsRef.current) {
            if (my >= r.y && my <= r.y + r.h) { router.push(`/identidades/${r.d.cuit}`); return; }
          }
        }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-[#1a1a1a] text-white px-2 py-1" />
      <div className="flex gap-4 px-2 pt-1 text-xs sm:text-[9px] text-text-secondary">
        <span><span className="mr-1 inline-block h-2 w-3" style={{ background: C.gray }} />Antes de donar</span>
        <span><span className="mr-1 inline-block h-2 w-3" style={{ background: "rgba(60, 255, 208, 0.5)" }} />Despues de donar</span>
        <span><span className="mr-1 inline-block h-2 w-3" style={{ background: "rgba(255, 77, 77, 0.6)" }} />&gt;10x aumento</span>
      </div>
    </div>
  );
}
