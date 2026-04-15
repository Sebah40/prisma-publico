"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { formatPesos } from "@/lib/format";
import type { NexoPoint } from "@/lib/nexo";

interface Props {
  data: NexoPoint[];
  onSelect: (cuit: string | null) => void;
  selected: string | null;
}

export function ScatterRetorno({ data, onSelect, selected }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const pointsRef = useRef<{ x: number; y: number; d: NexoPoint }[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const W = rect.width, H = rect.height;
    const P = { top: 15, right: 25, bottom: 40, left: 70 };
    const pW = W - P.left - P.right, pH = H - P.top - P.bottom;

    ctx.fillStyle = "#131313";
    ctx.fillRect(0, 0, W, H);

    if (data.length === 0) return;

    // Scales (log-log)
    const aportes = data.map(d => d.total_aportado_ajustado).filter(v => v > 0);
    const adjudicados = data.map(d => d.total_adjudicado_ajustado).filter(v => v > 0);
    const minLogA = Math.log10(Math.min(...aportes, 1));
    const maxLogA = Math.log10(Math.max(...aportes, 1));
    const minLogAdj = Math.log10(Math.min(...adjudicados, 1));
    const maxLogAdj = Math.log10(Math.max(...adjudicados, 1));

    const sx = (v: number) => {
      if (v <= 0) return P.left;
      const t = (Math.log10(v) - minLogA) / (maxLogA - minLogA || 1);
      return P.left + t * pW;
    };
    const sy = (v: number) => {
      if (v <= 0) return H - P.bottom;
      const t = (Math.log10(v) - minLogAdj) / (maxLogAdj - minLogAdj || 1);
      return H - P.bottom - t * pH;
    };

    // Grid
    ctx.strokeStyle = "#2d2d2d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(P.left, P.top);
    ctx.lineTo(P.left, H - P.bottom);
    ctx.lineTo(W - P.right, H - P.bottom);
    ctx.stroke();

    // Diagonal: 1:1 ratio line
    ctx.strokeStyle = "#2d2d2d";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    const minLog = Math.max(minLogA, minLogAdj);
    const maxLog = Math.min(maxLogA, maxLogAdj);
    ctx.moveTo(sx(Math.pow(10, minLog)), sy(Math.pow(10, minLog)));
    ctx.lineTo(sx(Math.pow(10, maxLog)), sy(Math.pow(10, maxLog)));
    ctx.stroke();
    ctx.setLineDash([]);

    // Axis labels
    ctx.fillStyle = "#666666";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("TOTAL APORTADO (pesos ajustados) →", W / 2, H - 8);
    ctx.save();
    ctx.translate(14, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("TOTAL ADJUDICADO (pesos ajustados) →", 0, 0);
    ctx.restore();

    // Scale labels
    ctx.textAlign = "right";
    ctx.font = "9px monospace";
    for (let exp = Math.ceil(minLogAdj); exp <= maxLogAdj; exp++) {
      const labels: Record<number, string> = { 3: "$1K", 4: "$10K", 5: "$100K", 6: "$1M", 7: "$10M", 8: "$100M", 9: "$1B", 10: "$10B", 11: "$100B" };
      if (labels[exp]) {
        const y = sy(Math.pow(10, exp));
        ctx.fillText(labels[exp], P.left - 5, y + 3);
        ctx.strokeStyle = "#2d2d2d";
        ctx.beginPath(); ctx.moveTo(P.left, y); ctx.lineTo(W - P.right, y); ctx.stroke();
      }
    }
    ctx.textAlign = "center";
    for (let exp = Math.ceil(minLogA); exp <= maxLogA; exp++) {
      const labels: Record<number, string> = { 3: "$1K", 4: "$10K", 5: "$100K", 6: "$1M", 7: "$10M", 8: "$100M" };
      if (labels[exp]) {
        const x = sx(Math.pow(10, exp));
        ctx.fillText(labels[exp], x, H - P.bottom + 14);
      }
    }

    // "1:1" label on diagonal
    ctx.fillStyle = "#3a3a3a";
    ctx.font = "9px monospace";
    const midLog = (minLog + maxLog) / 2;
    ctx.save();
    ctx.translate(sx(Math.pow(10, midLog)), sy(Math.pow(10, midLog)));
    ctx.rotate(-Math.PI / 4);
    ctx.fillText("ratio 1:1", 0, -8);
    ctx.restore();

    // Points
    const pts: typeof pointsRef.current = [];
    for (const d of data) {
      if (d.total_aportado_ajustado <= 0 || d.total_adjudicado_ajustado <= 0) continue;
      const x = sx(d.total_aportado_ajustado);
      const y = sy(d.total_adjudicado_ajustado);
      pts.push({ x, y, d });

      const isSelected = d.cuit === selected;
      const r = isSelected ? 8 : d.ratio > 100 ? 6 : 4;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);

      if (isSelected) {
        ctx.fillStyle = "#3cffd0";
        ctx.fill();
        ctx.strokeStyle = "#309875";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      } else {
        const alpha = d.ratio > 100 ? 0.8 : 0.4;
        ctx.fillStyle = d.ratio > 100 ? `rgba(255, 77, 77, ${alpha})` : `rgba(60, 255, 208, ${alpha})`;
        ctx.fill();
      }
    }
    pointsRef.current = pts;
  }, [data, selected]);

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
    let best: typeof pointsRef.current[0] | null = null;
    let minD = 20;
    for (const p of pointsRef.current) {
      const d = Math.hypot(p.x - mx, p.y - my);
      if (d < minD) { minD = d; best = p; }
    }
    if (best) {
      const spaceRight = rect.width - mx;
      tip.style.display = "block";
      tip.style.top = `${my - 10}px`;
      tip.style.left = spaceRight < 240 ? `${mx - 240}px` : `${mx + 14}px`;
      tip.innerHTML = `<div class="font-data text-[10px]">
        <div class="text-white font-medium">${best.d.nombre}</div>
        <div class="text-gray-400">${best.d.cuit}</div>
        <div class="text-gray-300">Aportado: ${formatPesos(best.d.total_aportado_ajustado)}</div>
        <div class="text-gray-300">Adjudicado: ${formatPesos(best.d.total_adjudicado_ajustado)}</div>
        <div class="text-gray-300">Ratio: ${best.d.ratio.toFixed(0)}x · ${best.d.contratos} contratos</div>
        <div class="text-gray-400">${best.d.partidos.slice(0, 2).join(", ")}</div>
        <div class="text-gray-500 mt-1">Click para investigar</div>
      </div>`;
      canvasRef.current!.style.cursor = "pointer";
    } else {
      tip.style.display = "none";
      canvasRef.current!.style.cursor = "crosshair";
    }
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="h-80 w-full cursor-crosshair"
        onMouseMove={handleMouse}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = "none"; }}
        onClick={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          for (const p of pointsRef.current) {
            if (Math.hypot(p.x - mx, p.y - my) < 20) {
              onSelect(p.d.cuit === selected ? null : p.d.cuit);
              return;
            }
          }
          onSelect(null);
        }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-gray-900 text-white px-2 py-1" />
      <div className="flex gap-4 px-2 pt-1 text-[9px] text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 bg-alerta" />Ratio {'>'} 100x</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-cobalto opacity-50" />Ratio {'<'} 100x</span>
        <span className="text-muted">— — Línea 1:1 (aportó = recibió)</span>
        <span className="ml-auto">Arriba de la línea = recibió más de lo que aportó</span>
      </div>
    </div>
  );
}
