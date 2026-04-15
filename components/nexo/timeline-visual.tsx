"use client";

import { useRef, useEffect, useCallback } from "react";
import { formatPesos } from "@/lib/format";

interface TimelineEvent {
  fecha: string;
  tipo: "aporte" | "contrato";
  monto: number;
  detalle: string;
}

/**
 * Visual timeline: vertical bars along a horizontal time axis.
 * Blue bars = aportes (CNE). Gray bars = contratos (COMPR.AR).
 * Height proportional to monto. Gaps in time are visible.
 */
export function TimelineVisual({ events }: { events: TimelineEvent[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<{ x: number; w: number; y: number; h: number; ev: TimelineEvent }[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || events.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    const P = { top: 10, right: 10, bottom: 25, left: 10 };
    const pW = W - P.left - P.right, pH = H - P.top - P.bottom;

    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);

    // Time scale
    const dates = events.map(e => new Date(e.fecha).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const span = maxDate - minDate || 1;

    const maxMonto = Math.max(...events.map(e => e.monto), 1);
    const barW = Math.max(pW / events.length * 0.6, 4);

    // Axis line
    ctx.strokeStyle = "#E0E0E0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.left, H - P.bottom);
    ctx.lineTo(W - P.right, H - P.bottom);
    ctx.stroke();

    // Year labels
    ctx.fillStyle = "#999999";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    const years = new Set(events.map(e => e.fecha.substring(0, 4)));
    for (const year of years) {
      const t = (new Date(parseInt(year), 6, 1).getTime() - minDate) / span;
      const x = P.left + t * pW;
      ctx.fillText(year, x, H - 6);
      ctx.strokeStyle = "#F0F0F0";
      ctx.beginPath();
      ctx.moveTo(x, P.top);
      ctx.lineTo(x, H - P.bottom);
      ctx.stroke();
    }

    // Bars
    const bars: typeof barsRef.current = [];
    for (const ev of events) {
      const t = (new Date(ev.fecha).getTime() - minDate) / span;
      const x = P.left + t * pW - barW / 2;
      const barH = (ev.monto / maxMonto) * pH * 0.9;
      const y = H - P.bottom - barH;

      ctx.fillStyle = ev.tipo === "aporte" ? "rgba(0, 71, 171, 0.7)" : "rgba(150, 150, 150, 0.4)";
      ctx.fillRect(x, y, barW, barH);

      // Aporte bars get a top accent
      if (ev.tipo === "aporte") {
        ctx.fillStyle = "#0047AB";
        ctx.fillRect(x, y, barW, 2);
      }

      bars.push({ x, w: barW, y, h: barH, ev });
    }
    barsRef.current = bars;
  }, [events]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  function handleMouse(e: React.MouseEvent) {
    const rect = canvasRef.current?.getBoundingClientRect();
    const tip = tooltipRef.current;
    if (!rect || !tip) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;

    let best: typeof barsRef.current[0] | null = null;
    for (const b of barsRef.current) {
      if (mx >= b.x && mx <= b.x + b.w + 4 && my >= b.y && my <= b.y + b.h) {
        best = b;
        break;
      }
    }

    if (best) {
      const spaceRight = rect.width - mx;
      tip.style.display = "block";
      tip.style.top = `${best.y - 10}px`;
      tip.style.left = spaceRight < 220 ? `${mx - 220}px` : `${mx + 10}px`;
      const label = best.ev.tipo === "aporte" ? "APORTE" : "CONTRATO";
      tip.innerHTML = `<div class="font-data text-[10px]">
        <div class="text-white font-medium">${best.ev.fecha}</div>
        <div class="text-gray-400">${label}</div>
        <div class="text-gray-300">${best.ev.detalle.substring(0, 50)}</div>
        <div class="text-gray-300">${formatPesos(best.ev.monto)}</div>
      </div>`;
    } else {
      tip.style.display = "none";
    }
  }

  if (events.length === 0) {
    return <div className="py-6 text-center text-[10px] text-muted">Sin datos de timeline</div>;
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="h-32 w-full"
        onMouseMove={handleMouse}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = "none"; }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-gray-900 text-white px-2 py-1" />
      <div className="flex gap-4 px-1 pt-1 text-[9px] text-muted">
        <span><span className="mr-1 inline-block h-2 w-3 bg-cobalto/70" />Aporte a campaña (CNE)</span>
        <span><span className="mr-1 inline-block h-2 w-3 bg-gris-600/40" />Contrato con el Estado (COMPR.AR)</span>
      </div>
    </div>
  );
}
