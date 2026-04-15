-- Módulo Aportes de Campaña — Migración SEGURA (IF NOT EXISTS)
-- Cruza donantes CNE con proveedores del Estado

-- Aportes de campaña (CNE)
CREATE TABLE IF NOT EXISTS aportes_campania (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuit_donante        TEXT NOT NULL,
  nombre_donante      TEXT NOT NULL,
  partido_politico    TEXT NOT NULL,
  agrupacion          TEXT,
  distrito            TEXT,
  eleccion_anio       INT NOT NULL,
  eleccion_tipo       TEXT,              -- PASO, General, Legislativa
  monto_aporte        NUMERIC(18,2) NOT NULL DEFAULT 0,
  tipo_aporte         TEXT DEFAULT 'efectivo', -- efectivo, especie
  fecha_aporte        DATE,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_aportes_cuit ON aportes_campania (cuit_donante);
CREATE INDEX IF NOT EXISTS idx_aportes_partido ON aportes_campania (partido_politico);
CREATE INDEX IF NOT EXISTS idx_aportes_anio ON aportes_campania (eleccion_anio);

-- Índice para el cruce con proveedores
CREATE INDEX IF NOT EXISTS idx_aportes_cruce ON aportes_campania (cuit_donante, eleccion_anio);

-- Tabla de índices de precios (para normalización)
CREATE TABLE IF NOT EXISTS indices_precios (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  periodo     TEXT NOT NULL UNIQUE,  -- "YYYY-MM"
  ipc_value   NUMERIC(12,4) NOT NULL,
  source      TEXT DEFAULT 'INDEC',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- RLS
DO $$ BEGIN
  ALTER TABLE aportes_campania ENABLE ROW LEVEL SECURITY;
  ALTER TABLE indices_precios ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN CREATE POLICY pp_aportes_read ON aportes_campania FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY pp_aportes_insert ON aportes_campania FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY pp_indices_read ON indices_precios FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY pp_indices_insert ON indices_precios FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
