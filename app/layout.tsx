import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { DisclaimerModal } from "@/components/disclaimer-modal";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Prisma Público",
  description: "Seguimiento del gasto público argentino",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-canvas text-text-primary">
        <DisclaimerModal />
        {/* Masthead */}
        <header className="border-b border-border">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4">
            <Link href="/" className="no-underline hover:no-underline">
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                PRISMA
              </span>
              <span className="text-2xl sm:text-3xl font-black tracking-tight text-mint">
                {" "}PÚBLICO
              </span>
            </Link>
            <p className="mt-0.5 font-data text-xs sm:text-[11px] uppercase tracking-[0.2em] text-text-secondary">
              Seguimiento del gasto público argentino
            </p>
          </div>
          {/* Nav */}
          <nav className="mx-auto max-w-7xl px-4 sm:px-6 pb-3 flex flex-wrap gap-x-5 gap-y-2 sm:gap-x-6">
            {[
              { href: "/", label: "INICIO" },
              { href: "/presupuesto", label: "GASTO PÚBLICO" },
              { href: "/patrones", label: "CONTRATACIONES" },
              { href: "/nexo", label: "FINANCIAMIENTO" },
              { href: "/identidades", label: "PROVEEDORES" },
              { href: "/novedades", label: "CAMBIOS DIARIOS" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="shrink-0 font-data text-xs sm:text-[11px] uppercase tracking-[0.15em] text-text-secondary no-underline hover:text-mint hover:no-underline transition-colors py-2"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </header>

        <main className="mx-auto max-w-7xl">{children}</main>

        <footer className="border-t border-border mt-16 py-6">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 space-y-2">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 text-xs sm:text-[10px] text-text-secondary font-data uppercase tracking-wider">
              <span>Fuentes oficiales · Datos públicos · Sin afiliación política</span>
              <span>IPC: INDEC (abr 2016–feb 2026)</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-1 sm:gap-4 text-xs sm:text-[10px] text-text-muted">
              <a href="https://www.presupuestoabierto.gob.ar/api/" target="_blank" rel="noopener noreferrer" className="hover:text-mint py-1">Presupuesto Abierto (Min. Economía)</a>
              <a href="https://comprar.gob.ar" target="_blank" rel="noopener noreferrer" className="hover:text-mint py-1">COMPR.AR (Jefatura de Gabinete)</a>
              <a href="https://www.electoral.gob.ar/nuevo/paginas/cne/informes.php" target="_blank" rel="noopener noreferrer" className="hover:text-mint py-1">CNE (Cámara Nacional Electoral)</a>
              <a href="https://apis.datos.gob.ar/series/api/" target="_blank" rel="noopener noreferrer" className="hover:text-mint py-1">IPC (INDEC)</a>
            </div>
            <div className="text-[10px] sm:text-[9px] text-text-muted">
              Los datos mostrados son de acceso público (Ley 27.275). La coincidencia entre datos no implica causalidad ni irregularidad.
            </div>
            <div className="pt-2 border-t border-border text-xs sm:text-[10px] text-text-muted">
              Hecho por Sebastián Haoys ·{" "}
              <a href="https://firstcommit.io" target="_blank" rel="noopener noreferrer" className="hover:text-mint py-1">
                firstcommit.io
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
