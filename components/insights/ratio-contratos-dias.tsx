"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { RatioContratosDiasRow } from "@/lib/insights";

const C = {
  bg: "#131313", grid: "#2d2d2d", label: "#666666",
  mint: "#3cffd0", red: "#ff4d4d",
};

function positionTip(tip: HTMLDivElement, e: React.MouseEvent, rect: DOMRect) {
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const tipW = 240;
  tip.style.display = "block";
  tip.style.top = `${my - 10}px`;
  tip.style.left = (rect.width - mx < tipW + 20) ? `${mx - tipW - 12}px` : `${mx + 12}px`;
}

export function RatioContratosDias({ data }: { data: RatioContratosDiasRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<{ x: number; y: number; d: RatioContratosDiasRow }[]>([]);
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

    // Log-log scales
    const xs = data.map(d => d.contratos).filter(v => v > 0);
    const ys = data.map(d => d.diasDistintos).filter(v => v > 0);
    if (xs.length === 0 || ys.length === 0) return;
    const xMin = Math.log10(Math.min(...xs));
    const xMax = Math.log10(Math.max(...xs));
    const yMin = Math.log10(Math.min(...ys));
    const yMax = Math.log10(Math.max(...ys));

    const sx = (v: number) => v <= 0 ? P.left : P.left + ((Math.log10(v) - xMin) / (xMax - xMin || 1)) * pW;
    const sy = (v: number) => v <= 0 ? H - P.bottom : H - P.bottom - ((Math.log10(v) - yMin) / (yMax - yMin || 1)) * pH;

    // Axes
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.left, P.top);
    ctx.lineTo(P.left, H - P.bottom);
    ctx.lineTo(W - P.right, H - P.bottom);
    ctx.stroke();

    // 1:1 diagonal (1 contrato per day)
    ctx.strokeStyle = "#3a3a3a";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const dMin = Math.max(xMin, yMin);
    const dMax = Math.min(xMax, yMax);
    ctx.moveTo(sx(Math.pow(10, dMin)), sy(Math.pow(10, dMin)));
    ctx.lineTo(sx(Math.pow(10, dMax)), sy(Math.pow(10, dMax)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = C.label;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("TOTAL CONTRATOS \u2192", W / 2, H - 3);
    ctx.save();
    ctx.translate(12, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("DIAS DISTINTOS \u2192", 0, 0);
    ctx.restore();

    // Scale labels
    ctx.textAlign = "center";
    for (const v of [5, 10, 20, 50, 100, 200, 500]) {
      if (Math.log10(v) < xMin || Math.log10(v) > xMax) continue;
      ctx.fillText(String(v), sx(v), H - P.bottom + 14);
    }
    ctx.textAlign = "right";
    for (const v of [5, 10, 20, 50, 100, 200, 500]) {
      if (Math.log10(v) < yMin || Math.log10(v) > yMax) continue;
      ctx.fillText(String(v), P.left - 5, sy(v) + 3);
    }

    // "1:1" label
    ctx.fillStyle = "#3a3a3a";
    ctx.font = "9px monospace";
    const midLog = (dMin + dMax) / 2;
    ctx.save();
    ctx.translate(sx(Math.pow(10, midLog)), sy(Math.pow(10, midLog)));
    ctx.rotate(-Math.PI / 4);
    ctx.fillText("1 contrato/dia", 0, -8);
    ctx.restore();

    // Points
    const pts: typeof pointsRef.current = [];
    for (const d of data) {
      if (d.contratos <= 0 || d.diasDistintos <= 0) continue;
      const x = sx(d.contratos);
      const y = sy(d.diasDistintos);
      pts.push({ x, y, d });
      // Below diagonal = fraccionamiento risk
      const ratio = d.contratos / d.diasDistintos;
      const isRisky = ratio > 3 || d.maxContratosEnUnDia > 5;
      ctx.beginPath();
      ctx.arc(x, y, isRisky ? 5 : 3, 0, Math.PI * 2);
      ctx.fillStyle = isRisky ? "rgba(255, 77, 77, 0.7)" : "rgba(60, 255, 208, 0.4)";
      ctx.fill();
    }
    pointsRef.current = pts;
  }, [data]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="h-64 w-full cursor-crosshair"
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          const tip = tooltipRef.current;
          if (!rect || !tip) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          let best: typeof pointsRef.current[0] | null = null;
          let minD = 15;
          for (const p of pointsRef.current) {
            const d = Math.hypot(p.x - mx, p.y - my);
            if (d < minD) { minD = d; best = p; }
          }
          if (best) {
            positionTip(tip, e, rect);
            const ratio = (best.d.contratos / best.d.diasDistintos).toFixed(1);
            tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${best.d.nombre}</div><div class="text-gray-400">${best.d.cuit}</div><div class="text-gray-300">${best.d.contratos} contratos en ${best.d.diasDistintos} dias</div><div class="text-gray-300">Max en 1 dia: ${best.d.maxContratosEnUnDia}</div><div class="${Number(ratio) > 3 ? "text-red-400" : "text-gray-300"}">Ratio: ${ratio} contratos/dia</div><div class="text-gray-500 mt-1">Click para ver ficha</div></div>`;
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
          for (const p of pointsRef.current) {
            if (Math.hypot(p.x - mx, p.y - my) < 15) { router.push(`/identidades/${p.d.cuit}`); return; }
          }
        }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-[#1a1a1a] text-white px-2 py-1" />
      <div className="flex gap-4 px-2 pt-1 text-[9px] text-text-secondary">
        <span><span className="mr-1 inline-block h-2 w-2" style={{ background: "#ff4d4d" }} />Más de 3 contratos por día en promedio</span>
        <span><span className="mr-1 inline-block h-2 w-2" style={{ background: "rgba(60, 255, 208, 0.5)" }} />Resto</span>
        <span className="ml-auto">Debajo de la diagonal = múltiples contratos el mismo día</span>
      </div>
    </div>
  );
}
