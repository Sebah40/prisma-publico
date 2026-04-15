"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatPesos } from "@/lib/format";

// Canvas colors for dark theme
const C = {
  bg: "#131313",
  grid: "#2d2d2d",
  axis: "#3a3a3a",
  label: "#666666",
  mint: "#3cffd0",
  mintFade: "rgba(60, 255, 208, 0.15)",
  violet: "#5200ff",
  red: "#ff4d4d",
  dot: "rgba(60, 255, 208, 0.5)",
  dotHigh: "#ff4d4d",
  bar: "rgba(60, 255, 208, 0.4)",
  barDirecta: "rgba(255, 77, 77, 0.5)",
};

/** Position tooltip avoiding right edge */
function positionTip(tip: HTMLDivElement, e: React.MouseEvent, rect: DOMRect) {
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const tipW = 220;
  tip.style.display = "block";
  tip.style.top = `${my - 10}px`;
  tip.style.left = (rect.width - mx < tipW + 20) ? `${mx - tipW - 12}px` : `${mx + 12}px`;
}

// === 1. Scatter: Contratos vs Monto Promedio ===

interface ScatterPoint {
  cuit: string;
  nombre: string;
  contratos: number;
  montoPromedio: number;
  total: number;
}

export function ScatterContratosVsMonto({ data }: { data: ScatterPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<{ x: number; y: number; d: ScatterPoint }[]>([]);
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

    // Both axes log scale
    const xs = data.map(d => d.contratos).filter(v => v > 0);
    const ys = data.map(d => d.montoPromedio).filter(v => v > 0);
    const xMin = Math.log10(Math.min(...xs)), xMax = Math.log10(Math.max(...xs));
    const yMin = Math.log10(Math.min(...ys)), yMax = Math.log10(Math.max(...ys));

    const sx = (v: number) => v <= 0 ? P.left : P.left + ((Math.log10(v) - xMin) / (xMax - xMin || 1)) * pW;
    const sy = (v: number) => v <= 0 ? H - P.bottom : H - P.bottom - ((Math.log10(v) - yMin) / (yMax - yMin || 1)) * pH;

    // Grid
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P.left, P.top); ctx.lineTo(P.left, H - P.bottom); ctx.lineTo(W - P.right, H - P.bottom); ctx.stroke();

    // Y labels
    ctx.fillStyle = C.label; ctx.font = "9px monospace"; ctx.textAlign = "right";
    const labels: Record<number, string> = { 3: "$1K", 4: "$10K", 5: "$100K", 6: "$1M", 7: "$10M", 8: "$100M", 9: "$1B", 10: "$10B" };
    for (let exp = Math.ceil(yMin); exp <= yMax; exp++) {
      if (!labels[exp]) continue;
      const y = sy(Math.pow(10, exp));
      ctx.fillText(labels[exp], P.left - 5, y + 3);
      ctx.strokeStyle = C.grid; ctx.beginPath(); ctx.moveTo(P.left, y); ctx.lineTo(W - P.right, y); ctx.stroke();
    }

    // X labels
    ctx.textAlign = "center";
    for (const v of [1, 2, 5, 10, 20, 50, 100, 200, 500]) {
      if (Math.log10(v) < xMin || Math.log10(v) > xMax) continue;
      ctx.fillText(String(v), sx(v), H - P.bottom + 14);
    }

    // Axis titles
    ctx.fillStyle = C.label; ctx.font = "9px monospace"; ctx.textAlign = "center";
    ctx.fillText("CANTIDAD DE CONTRATOS →", W / 2, H - 3);
    ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("MONTO PROMEDIO POR CONTRATO →", 0, 0); ctx.restore();

    // Points
    const pts: typeof pointsRef.current = [];
    for (const d of data) {
      if (d.contratos <= 0 || d.montoPromedio <= 0) continue;
      const x = sx(d.contratos), y = sy(d.montoPromedio);
      pts.push({ x, y, d });
      const big = d.montoPromedio > Math.pow(10, yMax - 0.5) && d.contratos <= 3;
      ctx.beginPath(); ctx.arc(x, y, big ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = big ? C.dotHigh : C.dot; ctx.fill();
    }
    pointsRef.current = pts;
  }, [data]);

  useEffect(() => { draw(); window.addEventListener("resize", draw); return () => window.removeEventListener("resize", draw); }, [draw]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="h-72 w-full cursor-crosshair"
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect(); const tip = tooltipRef.current;
          if (!rect || !tip) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          let best: typeof pointsRef.current[0] | null = null; let minD = 20;
          for (const p of pointsRef.current) { const d = Math.hypot(p.x - mx, p.y - my); if (d < minD) { minD = d; best = p; } }
          if (best) {
            positionTip(tip, e, rect);
            tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${best.d.nombre}</div><div class="text-gray-400">${best.d.cuit}</div><div class="text-gray-300">${best.d.contratos} contratos · Promedio: ${formatPesos(best.d.montoPromedio)}</div><div class="text-gray-300">Total: ${formatPesos(best.d.total)}</div><div class="text-gray-500 mt-1">Click para ver ficha</div></div>`;
            canvasRef.current!.style.cursor = "pointer";
          } else { tip.style.display = "none"; canvasRef.current!.style.cursor = "crosshair"; }
        }}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = "none"; }}
        onClick={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          for (const p of pointsRef.current) { if (Math.hypot(p.x - mx, p.y - my) < 20) { router.push(`/identidades/${p.d.cuit}`); return; } }
        }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-gray-900 text-white px-2 py-1" />
      <div className="flex gap-4 px-2 pt-1 text-[9px] text-text-secondary">
        <span><span className="mr-1 inline-block h-2 w-2 bg-red" />Pocos contratos, monto alto</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-mint opacity-50" />Resto</span>
        <span className="ml-auto">Ambos ejes en escala logarítmica · Click para ver ficha</span>
      </div>
    </div>
  );
}

// === 2. Bubble: Jurisdicciones ===

interface BubblePoint {
  safId: number;
  saf: string;
  proveedores: number;
  monto: number;
  pctDirecta: number;
  contratos: number;
}

export function BubbleJurisdicciones({ data }: { data: BubblePoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const bubblesRef = useRef<{ cx: number; cy: number; r: number; d: BubblePoint }[]>([]);
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
    const P = { top: 15, right: 20, bottom: 35, left: 60 };
    const pW = W - P.left - P.right, pH = H - P.top - P.bottom;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    // Log scale for both axes
    const xs = data.map(d => d.proveedores).filter(v => v > 0);
    const ys = data.map(d => d.monto).filter(v => v > 0);
    const xMin = Math.log10(Math.min(...xs)), xMax = Math.log10(Math.max(...xs));
    const yMin = Math.log10(Math.min(...ys)), yMax = Math.log10(Math.max(...ys));

    const sx = (v: number) => v <= 0 ? P.left : P.left + ((Math.log10(v) - xMin) / (xMax - xMin || 1)) * pW;
    const sy = (v: number) => v <= 0 ? H - P.bottom : H - P.bottom - ((Math.log10(v) - yMin) / (yMax - yMin || 1)) * pH;
    const sr = (pct: number) => 6 + (pct / 100) * 18;

    // Axes
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P.left, P.top); ctx.lineTo(P.left, H - P.bottom); ctx.lineTo(W - P.right, H - P.bottom); ctx.stroke();

    ctx.fillStyle = C.label; ctx.font = "9px monospace"; ctx.textAlign = "center";
    ctx.fillText("PROVEEDORES ÚNICOS →", W / 2, H - 3);
    ctx.save(); ctx.translate(12, H / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("MONTO TOTAL →", 0, 0); ctx.restore();

    // X labels
    for (const v of [1, 2, 5, 10, 20, 50, 100]) {
      if (Math.log10(v) < xMin || Math.log10(v) > xMax) continue;
      ctx.fillText(String(v), sx(v), H - P.bottom + 14);
    }

    // Bubbles
    const bubbles: typeof bubblesRef.current = [];
    for (const d of data) {
      if (d.proveedores <= 0 || d.monto <= 0) continue;
      const cx = sx(d.proveedores), cy = sy(d.monto), r = sr(d.pctDirecta);
      bubbles.push({ cx, cy, r, d });
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      const alpha = 0.2 + (d.pctDirecta / 100) * 0.5;
      ctx.fillStyle = d.pctDirecta > 70 ? `rgba(255, 77, 77, ${alpha})` : `rgba(60, 255, 208, ${alpha})`;
      ctx.fill();
      ctx.strokeStyle = d.pctDirecta > 70 ? "#ff4d4d" : "#3cffd0";
      ctx.lineWidth = 1; ctx.stroke();
    }
    bubblesRef.current = bubbles;
  }, [data]);

  useEffect(() => { draw(); window.addEventListener("resize", draw); return () => window.removeEventListener("resize", draw); }, [draw]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="h-72 w-full cursor-crosshair"
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect(); const tip = tooltipRef.current;
          if (!rect || !tip) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          let best: typeof bubblesRef.current[0] | null = null;
          for (const b of bubblesRef.current) { if (Math.hypot(b.cx - mx, b.cy - my) < b.r + 5) { best = b; break; } }
          if (best) {
            positionTip(tip, e, rect);
            tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${best.d.saf}</div><div class="text-gray-300">${best.d.proveedores} proveedores · ${best.d.contratos} contratos</div><div class="text-gray-300">Monto: ${formatPesos(best.d.monto)}</div><div class="${best.d.pctDirecta > 70 ? 'text-red-400' : 'text-gray-300'}">${best.d.pctDirecta.toFixed(0)}% contratación directa</div><div class="text-gray-500 mt-1">Click para ver proveedores</div></div>`;
            canvasRef.current!.style.cursor = "pointer";
          } else { tip.style.display = "none"; canvasRef.current!.style.cursor = "crosshair"; }
        }}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = "none"; }}
        onClick={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          for (const b of bubblesRef.current) {
            if (Math.hypot(b.cx - mx, b.cy - my) < b.r + 5) {
              router.push(`/identidades?q=${encodeURIComponent(b.d.saf.split(' - ')[1] || b.d.saf)}`); return;
            }
          }
        }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-gray-900 text-white px-2 py-1" />
      <div className="flex gap-4 px-2 pt-1 text-[9px] text-text-secondary">
        <span>Tamaño = % contratación directa</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{background:"#ff4d4d"}} />{'>'} 70% directa</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{background:"#3cffd0"}} />Resto</span>
        <span className="ml-auto">Ambos ejes log · Click para ver proveedores</span>
      </div>
    </div>
  );
}

// === 3. Timeline: Contratos por mes ===

interface TimelinePoint {
  month: string;
  count: number;
  monto: number;
  directas: number;
}

export function TimelineContratos({ data }: { data: TimelinePoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

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
    const P = { top: 10, right: 10, bottom: 30, left: 40 };
    const pW = W - P.left - P.right, pH = H - P.top - P.bottom;

    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, W, H);

    if (data.length === 0) return;

    // Use sqrt scale for count to avoid extreme bars
    const maxCount = Math.max(...data.map(d => d.count), 1);
    const sqrtMax = Math.sqrt(maxCount);
    const barW = Math.max(pW / data.length - 1, 2);

    // Axis
    ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(P.left, H - P.bottom); ctx.lineTo(W - P.right, H - P.bottom); ctx.stroke();

    // Bars
    data.forEach((d, i) => {
      const x = P.left + (i / data.length) * pW;
      const h = (Math.sqrt(d.count) / sqrtMax) * pH;
      const hDir = (Math.sqrt(d.directas) / sqrtMax) * pH;

      // Total bar
      ctx.fillStyle = C.bar;
      ctx.fillRect(x, H - P.bottom - h, barW, h);

      // Directa overlay
      ctx.fillStyle = C.barDirecta;
      ctx.fillRect(x, H - P.bottom - hDir, barW, hDir);

      // Year labels
      if (d.month.endsWith("-01") || i === 0) {
        ctx.fillStyle = C.label; ctx.font = "9px monospace"; ctx.textAlign = "center";
        ctx.fillText(d.month.slice(0, 4), x + barW / 2, H - P.bottom + 14);
      }
    });

    // Y labels
    ctx.fillStyle = C.label; ctx.font = "9px monospace"; ctx.textAlign = "right";
    ctx.fillText(String(maxCount), P.left - 3, P.top + 10);
    ctx.fillText("0", P.left - 3, H - P.bottom);
  }, [data]);

  useEffect(() => { draw(); window.addEventListener("resize", draw); return () => window.removeEventListener("resize", draw); }, [draw]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="h-48 w-full"
        onMouseMove={(e) => {
          const canvas = canvasRef.current; const tip = tooltipRef.current;
          if (!canvas || !tip || data.length === 0) return;
          const rect = canvas.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const PL = 40, PR = 10, pW = rect.width - PL - PR;
          const idx = Math.floor(((mx - PL) / pW) * data.length);
          if (idx >= 0 && idx < data.length) {
            const d = data[idx];
            positionTip(tip, e, rect);
            tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${d.month}</div><div class="text-gray-300">${d.count} contratos · ${d.directas} directas</div><div class="text-gray-300">Monto: ${formatPesos(d.monto)}</div></div>`;
          } else { tip.style.display = "none"; }
        }}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = "none"; }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-gray-900 text-white px-2 py-1" />
      <div className="flex gap-4 px-2 pt-1 text-[9px] text-text-secondary">
        <span><span className="mr-1 inline-block h-2 w-3" style={{background:C.bar}} />Total contratos</span>
        <span><span className="mr-1 inline-block h-2 w-3" style={{background:C.barDirecta}} />Contratación directa</span>
        <span className="ml-auto">Escala raíz cuadrada para evitar que picos extremos aplasten el resto</span>
      </div>
    </div>
  );
}

// === 4. Dual bars: % directa por cantidad vs monto ===

interface DualBarItem {
  saf: string;
  pctDirectaCantidad: number;
  pctDirectaMonto: number;
}

export function DualBarDirecta({ data }: { data: DualBarItem[] }) {
  return (
    <div className="divide-y divide-border">
      {data.map((d) => {
        const gap = d.pctDirectaMonto - d.pctDirectaCantidad;
        const highlight = gap > 15;
        return (
          <div key={d.saf} className="flex items-center gap-3 px-4 py-1.5">
            <div className="w-48 shrink-0 text-[10px] text-text-primary truncate">{d.saf}</div>
            <div className="flex-1 space-y-0.5">
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-text-muted w-14 shrink-0">Cantidad:</span>
                <div className="h-2 flex-1 bg-surface">
                  <div className="h-full bg-mint/30" style={{ width: `${d.pctDirectaCantidad}%` }} />
                </div>
                <span className="font-data text-[9px] text-text-secondary w-8 text-right">{d.pctDirectaCantidad.toFixed(0)}%</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[8px] text-text-muted w-14 shrink-0">Monto:</span>
                <div className="h-2 flex-1 bg-surface">
                  <div className={`h-full ${highlight ? "bg-red" : "bg-mint"}`} style={{ width: `${d.pctDirectaMonto}%` }} />
                </div>
                <span className={`font-data text-[9px] w-8 text-right ${highlight ? "text-red" : "text-text-secondary"}`}>
                  {d.pctDirectaMonto.toFixed(0)}%
                </span>
              </div>
            </div>
            {highlight && <span className="text-[8px] text-red shrink-0">+{gap.toFixed(0)}%</span>}
          </div>
        );
      })}
    </div>
  );
}
