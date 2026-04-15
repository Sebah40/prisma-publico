-- Prisma Público — Schema completo
-- Ejecutar en Supabase SQL Editor

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE situacion_bcra AS ENUM (
  'normal',
  'riesgo_bajo',
  'riesgo_medio',
  'riesgo_alto',
  'irrecuperable',
  'sin_datos'
);

CREATE TYPE alerta_tipo AS ENUM ('NORMAL', 'BOOST', 'HALT', 'RECT');

-- ============================================================
-- MÓDULO 0: ENTIDADES (proveedores + organismos)
-- ============================================================

CREATE TABLE entidades (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cuit            TEXT NOT NULL UNIQUE,
  razon_social    TEXT NOT NULL,
  tipo_personeria TEXT NOT NULL CHECK (tipo_personeria IN ('fisica', 'juridica', 'otro')),
  localidad       TEXT,
  provincia       TEXT,
  codigo_postal   TEXT,
  rubros          TEXT[] DEFAULT '{}',
  situacion_bcra  situacion_bcra DEFAULT 'sin_datos',
  fecha_inscripcion_sipro DATE,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_entidades_cuit ON entidades (cuit);
CREATE INDEX idx_entidades_provincia ON entidades (provincia);

-- ============================================================
-- MÓDULO 1: MOTOR DIFERENCIAL (SITIF-Delta)
-- ============================================================

-- Registro de cada ejecución de ingesta (audit trail)
CREATE TABLE ingestas_log (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha           DATE NOT NULL,
  endpoint        TEXT NOT NULL,
  filas_recibidas INT NOT NULL DEFAULT 0,
  filas_insertadas INT NOT NULL DEFAULT 0,
  novedades_generadas INT NOT NULL DEFAULT 0,
  duracion_ms     INT,
  error           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Snapshots diarios INMUTABLES — el corazón de Prisma.
-- Una vez insertado, este dato NO se modifica ni se borra.
-- Si el gobierno corrige mañana, la evidencia de hoy queda.
CREATE TABLE presupuesto_diario (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha                   DATE NOT NULL,
  ejercicio               INT NOT NULL,
  jurisdiccion_id         INT NOT NULL,
  jurisdiccion_desc       TEXT NOT NULL,
  entidad_id              INT,
  entidad_desc            TEXT,
  programa_id             INT NOT NULL,
  programa_desc           TEXT NOT NULL,
  credito_presupuestado   NUMERIC(18,2) NOT NULL DEFAULT 0,
  credito_vigente         NUMERIC(18,2) NOT NULL DEFAULT 0,
  credito_devengado       NUMERIC(18,2) NOT NULL DEFAULT 0,
  credito_pagado          NUMERIC(18,2) NOT NULL DEFAULT 0,
  created_at              TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas del motor diferencial
CREATE INDEX idx_pd_fecha ON presupuesto_diario (fecha);
CREATE INDEX idx_pd_programa ON presupuesto_diario (jurisdiccion_id, programa_id);
CREATE INDEX idx_pd_ejercicio ON presupuesto_diario (ejercicio);

-- Unicidad: un programa, una fecha, un registro. Inmutable.
CREATE UNIQUE INDEX idx_pd_unico ON presupuesto_diario (
  fecha, ejercicio, jurisdiccion_id,
  COALESCE(entidad_id, 0), programa_id
);

-- Novedades: lo que el motor detectó como movimiento
CREATE TABLE novedades (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fecha                   DATE NOT NULL,
  ejercicio               INT NOT NULL,
  jurisdiccion_id         INT NOT NULL,
  jurisdiccion_desc       TEXT NOT NULL,
  programa_id             INT NOT NULL,
  programa_desc           TEXT NOT NULL,
  tipo                    alerta_tipo NOT NULL,
  titulo                  TEXT NOT NULL,
  detalle                 TEXT,

  -- Valores de HOY
  vigente_hoy             NUMERIC(18,2),
  presupuestado_hoy       NUMERIC(18,2),
  devengado_hoy           NUMERIC(18,2),
  pagado_hoy              NUMERIC(18,2),

  -- Valores de AYER (null si es primer snapshot)
  vigente_ayer            NUMERIC(18,2),
  devengado_ayer          NUMERIC(18,2),
  pagado_ayer             NUMERIC(18,2),

  -- Deltas calculados
  delta_vigente           NUMERIC(18,2),
  delta_devengado         NUMERIC(18,2),
  delta_pagado            NUMERIC(18,2),

  -- Métricas derivadas
  ratio_vigente_presupuestado NUMERIC(8,4),  -- Cv/Cp
  ratio_pago              NUMERIC(8,4),       -- pagado/devengado
  magnitud                NUMERIC(18,2),      -- para ordenar por importancia

  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_novedades_fecha ON novedades (fecha);
CREATE INDEX idx_novedades_tipo ON novedades (tipo);
CREATE INDEX idx_novedades_magnitud ON novedades (fecha, magnitud DESC);

-- ============================================================
-- UTILIDADES
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_entidades_updated_at
  BEFORE UPDATE ON entidades
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS: Presupuesto diario es de solo lectura pública
-- (ajustar según necesidades de auth)
-- ============================================================

ALTER TABLE presupuesto_diario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "presupuesto_diario_read" ON presupuesto_diario
  FOR SELECT USING (true);

ALTER TABLE novedades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "novedades_read" ON novedades
  FOR SELECT USING (true);
