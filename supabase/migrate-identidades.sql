-- Módulo de Identidades — Migración SEGURA (IF NOT EXISTS)
-- Cruza COMPR.AR (quién gana contratos) con Presupuesto (dónde va la plata)

-- ============================================================
-- PROVEEDORES: entidades que contratan con el Estado
-- ============================================================

CREATE TABLE IF NOT EXISTS proveedores (
  cuit                TEXT PRIMARY KEY,
  razon_social        TEXT NOT NULL,
  tipo_personeria     TEXT,
  localidad           TEXT,
  provincia           TEXT,
  codigo_postal       TEXT,
  rubros              TEXT[] DEFAULT '{}',
  fecha_inscripcion   DATE,
  -- Métricas calculadas (actualizadas por la ingesta)
  total_adjudicado    NUMERIC(18,2) DEFAULT 0,
  cantidad_contratos  INT DEFAULT 0,
  anios_activo        INT DEFAULT 0,
  jurisdicciones_distintas INT DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proveedores_razon ON proveedores (razon_social);
CREATE INDEX IF NOT EXISTS idx_proveedores_provincia ON proveedores (provincia);

-- ============================================================
-- ADJUDICACIONES HISTÓRICAS: 2015-2020, ~65K registros
-- ============================================================

CREATE TABLE IF NOT EXISTS adjudicaciones_historicas (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_procedimiento TEXT NOT NULL,
  saf_id              INT NOT NULL,
  saf_desc            TEXT,
  uoc_id              INT,
  uoc_desc            TEXT,
  tipo_procedimiento  TEXT,
  modalidad           TEXT,
  ejercicio           INT NOT NULL,
  fecha_adjudicacion  DATE,
  rubros              TEXT[] DEFAULT '{}',
  cuit_proveedor      TEXT NOT NULL REFERENCES proveedores(cuit),
  proveedor_desc      TEXT,
  documento_contractual TEXT,
  monto               NUMERIC(18,2) NOT NULL DEFAULT 0,
  moneda              TEXT DEFAULT 'ARS',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adj_cuit ON adjudicaciones_historicas (cuit_proveedor);
CREATE INDEX IF NOT EXISTS idx_adj_saf ON adjudicaciones_historicas (saf_id);
CREATE INDEX IF NOT EXISTS idx_adj_ejercicio ON adjudicaciones_historicas (ejercicio);
CREATE INDEX IF NOT EXISTS idx_adj_monto ON adjudicaciones_historicas (monto DESC);

-- Evitar duplicados en reingestas
CREATE UNIQUE INDEX IF NOT EXISTS idx_adj_unico ON adjudicaciones_historicas (
  numero_procedimiento, cuit_proveedor, documento_contractual
);

-- ============================================================
-- PUENTE: mapeo SAF → Jurisdicción (para cruzar con presupuesto)
-- ============================================================

CREATE TABLE IF NOT EXISTS map_saf_jurisdiccion (
  saf_id              INT PRIMARY KEY,
  saf_desc            TEXT,
  jurisdiccion_id     INT NOT NULL,
  jurisdiccion_desc   TEXT,
  notas               TEXT
);

-- ============================================================
-- RLS
-- ============================================================

DO $$ BEGIN
  ALTER TABLE proveedores ENABLE ROW LEVEL SECURITY;
  ALTER TABLE adjudicaciones_historicas ENABLE ROW LEVEL SECURITY;
  ALTER TABLE map_saf_jurisdiccion ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN CREATE POLICY pp_proveedores_read ON proveedores FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY pp_proveedores_insert ON proveedores FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY pp_proveedores_update ON proveedores FOR UPDATE USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY pp_adj_read ON adjudicaciones_historicas FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY pp_adj_insert ON adjudicaciones_historicas FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY pp_map_read ON map_saf_jurisdiccion FOR SELECT USING (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY pp_map_insert ON map_saf_jurisdiccion FOR INSERT WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- TRIGGER updated_at para proveedores
-- ============================================================

DO $$ BEGIN
  CREATE TRIGGER trg_proveedores_updated_at
    BEFORE UPDATE ON proveedores
    FOR EACH ROW EXECUTE FUNCTION pp_update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
