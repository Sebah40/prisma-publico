import { getPool } from "@/lib/db";
import { formatARSCompact, formatEjecucion } from "@/lib/format";
import type { AlertaTipo, Novedad, IngestaLog } from "@/lib/database.types";

const TIPO_STYLES: Record<AlertaTipo, { bg: string; text: string; border: string; label: string }> = {
  RECT: { bg: "bg-alerta/30", text: "text-alerta", border: "border-l-2 border-l-alerta", label: "RECT" },
  BOOST: { bg: "bg-cobalto/20", text: "text-cobalto-claro", border: "", label: "BOOST" },
  HALT: { bg: "bg-alerta/20", text: "text-alerta", border: "", label: "HALT" },
  NORMAL: { bg: "bg-muted/20", text: "text-muted", border: "", label: "NORMAL" },
};

export const revalidate = 1800;

export default async function NovedadesPage() {
  const hoy = new Date().toISOString().slice(0, 10);
  const pool = getPool();

  const { rows: fechaRows } = await pool.query(
    `SELECT fecha FROM novedades ORDER BY fecha DESC LIMIT 1`
  );
  const fecha = fechaRows[0]?.fecha ?? hoy;

  const [{ rows: novedades }, { rows: logRows }] = await Promise.all([
    pool.query(`SELECT * FROM novedades WHERE fecha = $1 ORDER BY magnitud DESC`, [fecha]),
    pool.query(`SELECT * FROM ingestas_log WHERE fecha = $1 ORDER BY created_at DESC LIMIT 1`, [fecha]),
  ]);

  const log = (logRows[0] as IngestaLog) ?? null;
  const items = novedades as Novedad[];
  const boostCount = items.filter((n) => n.tipo === "BOOST").length;
  const haltCount = items.filter((n) => n.tipo === "HALT").length;

  return (
    <div className="h-full">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border px-6 py-3 gap-1">
        <div>
          <h1 className="text-sm font-medium text-gris-200">Novedades</h1>
          <p className="text-[10px] text-muted">
            Motor diferencial — cambios detectados
          </p>
        </div>
        <div className="font-data text-right text-[10px]">
          <div className="text-gris-200">{fecha}</div>
          {log && (
            <div className="text-muted">
              {log.filas_insertadas} registros · {log.duracion_ms}ms
            </div>
          )}
        </div>
      </header>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border-b border-border">
        <MiniStat label="TOTAL" value={items.length} />
        <MiniStat
          label="BOOST"
          value={boostCount}
          accent="text-cobalto-claro"
        />
        <MiniStat label="HALT" value={haltCount} accent="text-alerta" />
        <MiniStat
          label="ÚLTIMA INGESTA"
          value={log ? `${log.duracion_ms}ms` : "—"}
        />
      </div>

      {/* Lista de novedades */}
      {items.length === 0 ? (
        <EmptyState fecha={fecha} />
      ) : (
        <div className="divide-y divide-border">
          {items.map((nov) => {
            const style = TIPO_STYLES[nov.tipo as AlertaTipo];
            return (
              <div key={nov.id} className="flex flex-col sm:flex-row gap-2 sm:gap-4 px-4 sm:px-6 py-3 hover:bg-grafito/30">
                {/* Badge tipo */}
                <div className="shrink-0 pt-0.5">
                  <span
                    className={`inline-block px-2 py-0.5 font-data text-xs font-medium ${style.bg} ${style.text}`}
                  >
                    {style.label}
                  </span>
                </div>

                {/* Contenido */}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-gris-200">
                    {nov.titulo}
                  </div>
                  <div className="mt-0.5 text-sm sm:text-[11px] text-gris-400">
                    {nov.detalle}
                  </div>
                  <div className="mt-1 flex gap-4 font-data text-xs text-muted">
                    <span>
                      JUR {nov.jurisdiccion_id} · {nov.jurisdiccion_desc}
                    </span>
                    <span>PRG {nov.programa_id}</span>
                  </div>
                </div>

                {/* Métricas */}
                <div className="shrink-0 text-right font-data text-sm sm:text-[11px]">
                  <div className="text-gris-200">
                    {nov.vigente_hoy != null
                      ? formatARSCompact(nov.vigente_hoy)
                      : "—"}
                  </div>
                  <div className="text-muted">vigente</div>
                  {nov.delta_vigente != null && nov.delta_vigente !== 0 && (
                    <div
                      className={
                        nov.delta_vigente > 0
                          ? "text-cobalto-claro"
                          : "text-alerta"
                      }
                    >
                      {nov.delta_vigente > 0 ? "+" : ""}
                      {formatARSCompact(nov.delta_vigente)}
                    </div>
                  )}
                  {nov.devengado_hoy != null && nov.vigente_hoy != null && (
                    <div className="mt-1 text-muted">
                      ejec: {formatEjecucion(nov.devengado_hoy, nov.vigente_hoy)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="border-r border-border px-4 py-2">
      <div className="text-xs sm:text-[10px] font-medium uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className={`font-data text-lg ${accent ?? "text-gris-200"}`}>
        {value}
      </div>
    </div>
  );
}

function EmptyState({ fecha, message }: { fecha: string; message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="font-data text-2xl text-muted">—</div>
      <div className="mt-2 text-xs text-gris-400">
        {message ?? `Sin novedades para ${fecha}`}
      </div>
      <div className="mt-1 text-[10px] text-muted">
        Ejecutá el Daily Pulse: POST /api/ingesta/pulse
      </div>
    </div>
  );
}
