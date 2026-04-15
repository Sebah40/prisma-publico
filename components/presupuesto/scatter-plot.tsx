"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ProgramaConMetricas } from "@/lib/queries";
import { getOutlierTags } from "@/lib/outliers";
import { formatARSCompact } from "@/lib/format";

/**
 * Scatter plot: X = log(vigente), Y = ejecución %.
 * Los outliers son los puntos abajo-derecha (mucha plata, poca ejecución).
 * Canvas puro, estética industrial.
 */
export function ScatterPlot({ data }: { data: ProgramaConMetricas[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pointsRef = useRef<
    { x: number; y: number; p: ProgramaConMetricas }[]
  >([]);

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

    const W = rect.width;
    const H = rect.height;
    const PAD = { top: 10, right: 20, bottom: 30, left: 55 };
    const plotW = W - PAD.left - PAD.right;
    const plotH = H - PAD.top - PAD.bottom;

    // Background
    ctx.fillStyle = "#131313";
    ctx.fillRect(0, 0, W, H);

    // Axes
    ctx.strokeStyle = "#2d2d2d";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, H - PAD.bottom);
    ctx.lineTo(W - PAD.right, H - PAD.bottom);
    ctx.stroke();

    // Scale: X = log(vigente), Y = ejecución %
    const vigentes = data.map((d) => d.credito_vigente).filter((v) => v > 0);
    const maxLogV = Math.log10(Math.max(...vigentes, 1));
    const minLogV = Math.log10(Math.min(...vigentes, 1));

    function scaleX(vigente: number): number {
      if (vigente <= 0) return PAD.left;
      const logV = Math.log10(vigente);
      const t = (logV - minLogV) / (maxLogV - minLogV || 1);
      return PAD.left + t * plotW;
    }

    function scaleY(ejec: number): number {
      const t = Math.min(ejec, 100) / 100;
      return H - PAD.bottom - t * plotH;
    }

    // Grid lines and Y labels
    ctx.fillStyle = "#666666";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    for (const pct of [0, 25, 50, 75, 100]) {
      const y = scaleY(pct);
      ctx.fillText(`${pct}%`, PAD.left - 5, y + 3);
      ctx.strokeStyle = "#2d2d2d";
      ctx.beginPath();
      ctx.moveTo(PAD.left, y);
      ctx.lineTo(W - PAD.right, y);
      ctx.stroke();
    }

    // X labels
    ctx.textAlign = "center";
    ctx.fillStyle = "#666666";
    for (const exp of [2, 3, 4, 5, 6, 7]) {
      if (exp < minLogV || exp > maxLogV) continue;
      const x = scaleX(Math.pow(10, exp));
      const labels: Record<number, string> = {
        2: "$100", 3: "$1K", 4: "$10K", 5: "$100K", 6: "$1M", 7: "$10M",
      };
      ctx.fillText(labels[exp] ?? "", x, H - PAD.bottom + 14);
    }

    // Axis labels
    ctx.fillStyle = "#666666";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText("VIGENTE →", W / 2, H - 3);
    ctx.save();
    ctx.translate(10, H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("EJECUCIÓN % →", 0, 0);
    ctx.restore();

    // Danger zone highlight (bottom-right = high budget, low execution)
    ctx.fillStyle = "rgba(204, 51, 51, 0.05)";
    const dangerX = scaleX(Math.pow(10, 4));
    const dangerY = scaleY(10);
    ctx.fillRect(dangerX, dangerY, W - PAD.right - dangerX, H - PAD.bottom - dangerY);

    // Points
    const points: { x: number; y: number; p: ProgramaConMetricas }[] = [];

    for (const p of data) {
      if (p.credito_vigente <= 0) continue;
      const x = scaleX(p.credito_vigente);
      const y = scaleY(p.ejecucion_pct);
      points.push({ x, y, p });

      const tags = getOutlierTags(p);
      const isOutlier = tags.length > 0;

      ctx.beginPath();
      ctx.arc(x, y, isOutlier ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = isOutlier
        ? tags.includes("Caja muerta") || tags.includes("Plata quieta")
          ? "#CC3333"
          : tags.includes("Decreto")
            ? "#0047AB"
            : "#8A8A8A"
        : "rgba(138, 138, 138, 0.3)";
      ctx.fill();
    }

    pointsRef.current = points;
  }, [data]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const tooltip = tooltipRef.current;
    if (!canvas || !tooltip) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let closest: (typeof pointsRef.current)[0] | null = null;
    let minDist = 15;

    for (const pt of pointsRef.current) {
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < minDist) {
        minDist = d;
        closest = pt;
      }
    }

    if (closest) {
      const tags = getOutlierTags(closest.p);
      const mx = e.clientX - rect.left;
      const tipW = 220;
      tooltip.style.display = "block";
      tooltip.style.top = `${e.clientY - rect.top - 10}px`;
      tooltip.style.left = (rect.width - mx < tipW + 20)
        ? `${mx - tipW - 12}px`
        : `${mx + 12}px`;
      tooltip.innerHTML = `<div class="font-data text-[10px]">
        <div class="text-white font-medium">${closest.p.programa_desc}</div>
        <div class="text-gray-400">JUR ${closest.p.jurisdiccion_id} · PRG ${closest.p.programa_id}</div>
        <div class="text-gray-300">Vigente: ${formatARSCompact(closest.p.credito_vigente)}</div>
        <div class="text-gray-300">Ejecución: ${closest.p.ejecucion_pct.toFixed(1)}%</div>
        ${tags.length > 0 ? `<div class="text-red-400 mt-0.5">${tags.join(" · ")}</div>` : ""}
      </div>`;
      canvas.style.cursor = "pointer";
    } else {
      tooltip.style.display = "none";
      canvas.style.cursor = "crosshair";
    }
  }

  function handleClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const pt of pointsRef.current) {
      if (Math.hypot(pt.x - mx, pt.y - my) < 15) {
        const slug = `${pt.p.jurisdiccion_id}-${pt.p.entidad_id ?? 0}-${pt.p.programa_id}`;
        router.push(`/presupuesto/${slug}`);
        return;
      }
    }
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="h-64 w-full cursor-crosshair"
        onMouseMove={handleMouseMove}
        onMouseLeave={() => {
          if (tooltipRef.current) tooltipRef.current.style.display = "none";
        }}
        onClick={handleClick}
      />
      <div
        ref={tooltipRef}
        className="pointer-events-none absolute z-50 hidden border border-gray-700 bg-gray-900 text-white px-2 py-1"
      />
      {/* Legend */}
      <div className="flex gap-4 px-2 pt-1 text-[9px] text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 bg-alerta" />Baja ejecución / Sin pagos</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-cobalto" />Aumento por decreto</span>
        <span><span className="mr-1 inline-block h-2 w-2 bg-gris-600 opacity-30" />Normal</span>
        <span className="ml-auto">Click en un punto para abrir dossier</span>
      </div>
    </div>
  );
}
