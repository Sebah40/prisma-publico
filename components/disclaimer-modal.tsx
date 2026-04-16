"use client";

import { useState, useEffect } from "react";

export function DisclaimerModal() {
  const [open, setOpen] = useState(false);
  const [authorOpen, setAuthorOpen] = useState(false);

  useEffect(() => {
    const accepted = sessionStorage.getItem("prisma-disclaimer-accepted");
    const authorSeen = sessionStorage.getItem("prisma-author-seen");
    if (!accepted) setOpen(true);
    else if (!authorSeen) setAuthorOpen(true);
  }, []);

  function accept() {
    sessionStorage.setItem("prisma-disclaimer-accepted", "1");
    setOpen(false);
    if (!sessionStorage.getItem("prisma-author-seen")) setAuthorOpen(true);
  }

  function closeAuthor() {
    sessionStorage.setItem("prisma-author-seen", "1");
    setAuthorOpen(false);
  }

  if (!open && !authorOpen) return null;

  if (authorOpen && !open) {
    return (
      <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/80">
        <div className="flex flex-col w-full sm:h-auto sm:max-w-md sm:mx-4 sm:border sm:border-border bg-canvas p-5 sm:p-6">
          <h2 className="text-lg font-bold text-white mb-3">Hecho por Sebastián Haoys</h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-4">
            Desarrollador full-stack argentino. Este proyecto es una herramienta abierta
            para visibilizar datos públicos del Estado.
          </p>
          <p className="text-sm text-text-secondary leading-relaxed mb-5">
            Si te interesa ver cómo fue construido paso a paso con IA,
            el proceso completo está publicado en{" "}
            <a href="https://firstcommit.io" target="_blank" rel="noopener noreferrer" className="text-mint underline">
              firstcommit.io
            </a>.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <a
              href="https://firstcommit.io"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 border border-mint px-4 py-3 sm:py-2.5 font-data text-[12px] uppercase tracking-widest text-mint text-center no-underline hover:bg-mint hover:text-canvas hover:no-underline transition-colors"
            >
              Ver en First Commit →
            </a>
            <button
              onClick={closeAuthor}
              className="flex-1 border border-border px-4 py-3 sm:py-2.5 font-data text-[12px] uppercase tracking-widest text-text-secondary hover:border-mint hover:text-mint transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-end sm:items-center justify-center bg-black/80">
      <div className="flex flex-col w-full h-full sm:h-auto sm:max-w-xl sm:mx-4 sm:border sm:border-border bg-canvas p-5 sm:p-6">
        <h2 className="text-lg font-bold text-white mb-4 shrink-0">Aviso Legal</h2>

        <div className="space-y-3 text-[13px] text-text-secondary leading-relaxed overflow-y-auto pr-2 flex-1 sm:max-h-[60vh]">
          <p>
            <strong className="text-white">Prisma Público</strong> es una herramienta de visualización
            de datos públicos del Estado argentino. No emite juicio, opinión ni acusación sobre
            ninguna persona física, jurídica, organismo o agrupación política.
          </p>

          <p>
            La coincidencia temporal o numérica entre datos de distintas fuentes
            <strong className="text-white"> no implica causalidad, irregularidad ni ilegalidad</strong>.
            Los patrones mostrados son el resultado de cruces automáticos que requieren
            investigación periodística y/o judicial para su interpretación.
          </p>

          <div>
            <p className="text-white font-medium mb-1">Fuentes de datos:</p>
            <ul className="space-y-1 text-[12px]">
              <li>
                <span className="text-mint">Presupuesto:</span>{" "}
                <a href="https://www.presupuestoabierto.gob.ar/api/" target="_blank" rel="noopener noreferrer" className="text-mint underline">
                  API de Presupuesto Abierto
                </a>
                {" "}— Subsecretaría de Presupuesto, Ministerio de Economía.
              </li>
              <li>
                <span className="text-mint">Contrataciones:</span>{" "}
                <a href="https://comprar.gob.ar" target="_blank" rel="noopener noreferrer" className="text-mint underline">
                  COMPR.AR
                </a>
                {" "}— Oficina Nacional de Contrataciones, Jefatura de Gabinete.
                Datos de 2015-2020 publicados en{" "}
                <a href="https://datos.gob.ar/dataset/jgm-sistema-contrataciones-electronicas" target="_blank" rel="noopener noreferrer" className="text-mint underline">
                  datos.gob.ar
                </a>. Datos de 2021-2026 obtenidos del portal público COMPR.AR.
              </li>
              <li>
                <span className="text-mint">Aportes de campaña:</span>{" "}
                <a href="https://www.electoral.gob.ar/nuevo/paginas/cne/informes.php" target="_blank" rel="noopener noreferrer" className="text-mint underline">
                  Cámara Nacional Electoral
                </a>
                {" "}— Informes de financiamiento político conforme Ley 26.215.
              </li>
              <li>
                <span className="text-mint">Índice de precios:</span>{" "}
                <a href="https://apis.datos.gob.ar/series/api/" target="_blank" rel="noopener noreferrer" className="text-mint underline">
                  API Series de Tiempo
                </a>
                {" "}— IPC Nivel General (INDEC), base diciembre 2016.
              </li>
            </ul>
          </div>

          <p>
            Todos los datos son de acceso público conforme la{" "}
            <strong className="text-white">Ley 27.275 de Acceso a la Información Pública</strong>.
            Los montos históricos se ajustan por inflación usando el IPC de INDEC
            (disponible desde abril 2016). Los montos previos a esa fecha se muestran
            sin ajuste.
          </p>

          <p>
            Los datos de personas físicas que figuran en esta plataforma provienen
            exclusivamente de registros públicos oficiales. El tratamiento se realiza
            conforme la <strong className="text-white">Ley 25.326 de Protección de Datos Personales</strong>,
            en ejercicio del derecho de acceso a la información pública.
          </p>

          <p className="text-text-muted text-[12px] sm:text-[11px]">
            Esta plataforma no está afiliada ni patrocinada por ningún organismo del Estado,
            partido político, medio de comunicación ni organización de la sociedad civil.
          </p>
        </div>

        <button
          onClick={accept}
          className="sticky bottom-0 mt-5 w-full border border-mint px-4 py-3.5 sm:py-2.5 font-data text-[12px] uppercase tracking-widest text-mint hover:bg-mint hover:text-canvas transition-colors bg-canvas shrink-0"
        >
          Entendido — Acceder a la plataforma
        </button>
      </div>
    </div>
  );
}
