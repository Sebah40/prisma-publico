"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  {
    label: "AUDITORÍA",
    items: [
      { href: "/presupuesto", label: "Gasto Público", key: "GAS" },
      { href: "/patrones", label: "Patrones de Contratación", key: "PAT" },
      { href: "/nexo", label: "Nexo de Poder", key: "NEX" },
      { href: "/novedades", label: "Novedades Diarias", key: "NOV" },
    ],
  },
  {
    label: "DATOS",
    items: [
      { href: "/identidades", label: "Identidades", key: "IDN" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex w-56 shrink-0 flex-col bg-negro text-gris-400 select-none">
      {/* Header */}
      <div className="border-b border-border px-4 py-3">
        <Link href="/" className="block text-gris-200 no-underline hover:no-underline">
          <span className="font-data text-xs tracking-widest text-cobalto">
            PRISMA
          </span>
          <span className="font-data text-xs tracking-widest text-gris-400">
            {" "}PÚBLICO
          </span>
          <div className="mt-0.5 text-[10px] text-muted">
            v0.1.0 — auditoría de datos
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map((section) => (
          <div key={section.label} className="mb-1">
            <div className="px-4 py-1.5 text-[10px] font-medium tracking-wider text-muted">
              {section.label}
            </div>
            {section.items.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-1.5 text-xs no-underline hover:no-underline transition-colors ${
                    active
                      ? "bg-grafito text-gris-200 border-l-2 border-l-cobalto"
                      : "text-gris-400 hover:bg-grafito hover:text-gris-200"
                  }`}
                >
                  <span className={`font-data text-[10px] ${active ? "text-cobalto" : "text-muted"}`}>
                    {item.key}
                  </span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-4 py-2 text-[10px] text-muted">
        <div>datos.gob.ar + presupuestoabierto</div>
        <div className="mt-0.5">
          <span className="inline-block h-1.5 w-1.5 bg-ok" /> conectado
        </div>
      </div>
    </aside>
  );
}
