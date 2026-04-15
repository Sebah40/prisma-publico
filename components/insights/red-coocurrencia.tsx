"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { CoocurrenciaRow } from "@/lib/insights";

const C = {
  bg: "#131313", grid: "#2d2d2d", label: "#666666",
  mint: "#3cffd0", red: "#ff4d4d",
};

function positionTip(tip: HTMLDivElement, e: React.MouseEvent, rect: DOMRect) {
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const tipW = 260;
  tip.style.display = "block";
  tip.style.top = `${my - 10}px`;
  tip.style.left = (rect.width - mx < tipW + 20) ? `${mx - tipW - 12}px` : `${mx + 12}px`;
}

interface Node {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  edges: number;
}

interface Edge {
  source: string;
  target: string;
  organismo: string;
  weight: number;
}

export function RedCoocurrencia({ data }: { data: CoocurrenciaRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const router = useRouter();
  const animRef = useRef<number>(0);

  const init = useCallback(() => {
    // Build graph
    const nodeSet = new Set<string>();
    const edges: Edge[] = [];
    const edgeCounts = new Map<string, number>();

    for (const d of data) {
      nodeSet.add(d.prov1);
      nodeSet.add(d.prov2);
      // Aggregate edges between same pair
      const key = [d.prov1, d.prov2].sort().join("|");
      edgeCounts.set(key, (edgeCounts.get(key) || 0) + d.meses_compartidos);
      edges.push({
        source: d.prov1,
        target: d.prov2,
        organismo: d.organismo,
        weight: d.meses_compartidos,
      });
    }

    // Initialize nodes with random positions
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const W = rect.width, H = rect.height;
    const cx = W / 2, cy = H / 2;

    const nodes: Node[] = [...nodeSet].map((id) => {
      const angle = Math.random() * Math.PI * 2;
      const r = 50 + Math.random() * 80;
      return {
        id,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0,
        vy: 0,
        edges: edges.filter(e => e.source === id || e.target === id).length,
      };
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [data]);

  const simulate = useCallback(() => {
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

    const nodes = nodesRef.current;
    const edges = edgesRef.current;
    if (nodes.length === 0) return;

    const cx = W / 2, cy = H / 2;
    let iterations = 0;
    const maxIterations = 120;

    function step() {
      if (iterations >= maxIterations) {
        draw();
        return;
      }
      iterations++;

      const damping = 0.85;
      const repulsion = 3000;
      const attraction = 0.005;
      const centerPull = 0.01;

      // Reset forces
      for (const n of nodes) { n.vx = 0; n.vy = 0; }

      // Repulsion between all pairs
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = repulsion / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          nodes[i].vx += fx;
          nodes[i].vy += fy;
          nodes[j].vx -= fx;
          nodes[j].vy -= fy;
        }
      }

      // Attraction along edges
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      for (const e of edges) {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const force = attraction * dist * e.weight;
        const fx = (dx / (dist || 1)) * force;
        const fy = (dy / (dist || 1)) * force;
        s.vx += fx;
        s.vy += fy;
        t.vx -= fx;
        t.vy -= fy;
      }

      // Center pull
      for (const n of nodes) {
        n.vx += (cx - n.x) * centerPull;
        n.vy += (cy - n.y) * centerPull;
      }

      // Apply velocities
      for (const n of nodes) {
        n.vx *= damping;
        n.vy *= damping;
        n.x += n.vx;
        n.y += n.vy;
        // Clamp to bounds
        n.x = Math.max(40, Math.min(W - 40, n.x));
        n.y = Math.max(20, Math.min(H - 20, n.y));
      }

      draw();
      animRef.current = requestAnimationFrame(step);
    }

    function draw() {
      if (!ctx) return;
      ctx.fillStyle = C.bg;
      ctx.fillRect(0, 0, W, H);

      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const maxWeight = Math.max(...edges.map(e => e.weight), 1);

      // Draw edges
      for (const e of edges) {
        const s = nodeMap.get(e.source);
        const t = nodeMap.get(e.target);
        if (!s || !t) continue;
        const alpha = 0.1 + (e.weight / maxWeight) * 0.4;
        ctx.strokeStyle = `rgba(60, 255, 208, ${alpha})`;
        ctx.lineWidth = 0.5 + (e.weight / maxWeight) * 2;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }

      // Draw nodes
      const maxEdges = Math.max(...nodes.map(n => n.edges), 1);
      for (const n of nodes) {
        const r = 4 + (n.edges / maxEdges) * 8;
        const isHighEdge = n.edges > maxEdges * 0.7;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isHighEdge ? "rgba(255, 77, 77, 0.8)" : "rgba(60, 255, 208, 0.6)";
        ctx.fill();

        // Label for larger nodes
        if (r >= 6) {
          ctx.fillStyle = C.label;
          ctx.font = "7px monospace";
          ctx.textAlign = "center";
          const label = n.id.length > 18 ? n.id.substring(0, 18) + "\u2026" : n.id;
          ctx.fillText(label, n.x, n.y - r - 3);
        }
      }
    }

    step();
  }, []);

  useEffect(() => {
    if (data.length === 0) return;
    init();
    // Small delay to let layout settle before simulating
    const timeout = setTimeout(() => simulate(), 50);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(animRef.current);
    };
  }, [data, init, simulate]);

  // Re-simulate on resize
  useEffect(() => {
    const handleResize = () => {
      init();
      simulate();
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [init, simulate]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} className="w-full cursor-crosshair" style={{ height: "300px" }}
        onMouseMove={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect();
          const tip = tooltipRef.current;
          if (!rect || !tip) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;

          // Check nodes
          let foundNode: Node | null = null;
          const maxEdges = Math.max(...nodesRef.current.map(n => n.edges), 1);
          for (const n of nodesRef.current) {
            const r = 4 + (n.edges / maxEdges) * 8;
            if (Math.hypot(n.x - mx, n.y - my) < r + 5) { foundNode = n; break; }
          }

          if (foundNode) {
            positionTip(tip, e, rect);
            const nodeEdges = edgesRef.current.filter(edge => edge.source === foundNode!.id || edge.target === foundNode!.id);
            const partners = [...new Set(nodeEdges.map(edge => edge.source === foundNode!.id ? edge.target : edge.source))];
            const organisms = [...new Set(nodeEdges.map(edge => edge.organismo))];
            tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${foundNode.id}</div><div class="text-gray-300">${foundNode.edges} conexiones</div><div class="text-gray-400">Comparte organismos con:</div>${partners.slice(0, 4).map(p => `<div class="text-gray-300">\u2022 ${p.substring(0, 30)}</div>`).join("")}${partners.length > 4 ? `<div class="text-gray-500">+${partners.length - 4} mas</div>` : ""}<div class="text-gray-400 mt-1">Organismos: ${organisms.slice(0, 3).map(o => o.substring(0, 20)).join(", ")}${organisms.length > 3 ? "..." : ""}</div></div>`;
          } else {
            // Check edges
            let foundEdge: Edge | null = null;
            const nodeMap = new Map(nodesRef.current.map(n => [n.id, n]));
            for (const edge of edgesRef.current) {
              const s = nodeMap.get(edge.source);
              const t = nodeMap.get(edge.target);
              if (!s || !t) continue;
              // Point-to-line distance
              const dx = t.x - s.x;
              const dy = t.y - s.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len === 0) continue;
              const u = ((mx - s.x) * dx + (my - s.y) * dy) / (len * len);
              if (u < 0 || u > 1) continue;
              const px = s.x + u * dx;
              const py = s.y + u * dy;
              if (Math.hypot(px - mx, py - my) < 8) { foundEdge = edge; break; }
            }
            if (foundEdge) {
              positionTip(tip, e, rect);
              tip.innerHTML = `<div class="font-data text-[10px]"><div class="text-white font-medium">${foundEdge.source.substring(0, 25)}</div><div class="text-white">\u2194 ${foundEdge.target.substring(0, 25)}</div><div class="text-gray-300">Organismo: ${foundEdge.organismo.substring(0, 30)}</div><div class="text-gray-300">${foundEdge.weight} meses compartidos</div></div>`;
            } else {
              tip.style.display = "none";
            }
          }
        }}
        onMouseLeave={() => { if (tooltipRef.current) tooltipRef.current.style.display = "none"; }}
        onClick={(e) => {
          const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
          const mx = e.clientX - rect.left, my = e.clientY - rect.top;
          // Check nodes first
          for (const n of nodesRef.current) {
            if (Math.hypot(n.x - mx, n.y - my) < 15) {
              router.push(`/identidades?q=${encodeURIComponent(n.id)}`);
              return;
            }
          }
          // Check edges
          for (const ed of edgesRef.current) {
            const n1 = nodesRef.current.find(n => n.id === ed.source);
            const n2 = nodesRef.current.find(n => n.id === ed.target);
            if (!n1 || !n2) continue;
            const midX = (n1.x + n2.x) / 2, midY = (n1.y + n2.y) / 2;
            if (Math.hypot(midX - mx, midY - my) < 20) {
              router.push(`/explorar/cruce?organismo=${encodeURIComponent(ed.organismo)}`);
              return;
            }
          }
        }}
      />
      <div ref={tooltipRef} className="pointer-events-none absolute z-[9999] hidden border border-gray-700 bg-[#1a1a1a] text-white px-2 py-1" />
      <div className="flex gap-4 px-2 pt-1 text-xs sm:text-[9px] text-text-secondary">
        <span>Nodos = proveedores · Líneas = organismos compartidos en el mismo mes</span>
        <span><span className="mr-1 inline-block h-2 w-2" style={{ background: "#ff4d4d" }} />Muchas conexiones</span>
        <span className="ml-auto">Layout de fuerza (spring simulation)</span>
      </div>
    </div>
  );
}
