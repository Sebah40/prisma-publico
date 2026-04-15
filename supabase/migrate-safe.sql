-- Prisma Público — Migración SEGURA
-- Solo crea objetos nuevos. No toca nada existente.

-- Enums (solo si no existen)
DO $$ BEGIN
  CREATE TYPE situacion_bcra AS ENUM (
    'normal', 'riesgo_bajo', 'riesgo_medio',
    'riesgo_alto', 'irrecuperable', 'sin_datos'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE alerta_tipo AS ENUM ('NORMAL', 'BOOST', 'HALT', 'RECT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Entidades
CREATE TABLE IF NOT EXISTS entidades (
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

CREATE INDEX IF NOT EXISTS idx_entidades_cuit ON entidades (cuit);
CREATE INDEX IF NOT EXISTS idx_entidades_provincia ON entidades (provincia);

-- Presupuesto diario (inmutable)
CREATE TABLE IF NOT EXISTS presupuesto_diario (
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

CREATE INDEX IF NOT EXISTS idx_pd_fecha ON presupuesto_diario (fecha);
CREATE INDEX IF NOT EXISTS idx_pd_programa ON presupuesto_diario (jurisdiccion_id, programa_id);
CREATE INDEX IF NOT EXISTS idx_pd_ejercicio ON presupuesto_diario (ejercicio);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pd_unico ON presupuesto_diario (
  fecha, ejercicio, jurisdiccion_id,
  COALESCE(entidad_id, 0), programa_id
);

-- Novedades (inmutable)
CREATE TABLE IF NOT EXISTS novedades (
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
  vigente_hoy             NUMERIC(18,2),
  presupuestado_hoy       NUMERIC(18,2),
  devengado_hoy           NUMERIC(18,2),
  pagado_hoy              NUMERIC(18,2),
  vigente_ayer            NUMERIC(18,2),
  devengado_ayer          NUMERIC(18,2),
  pagado_ayer             NUMERIC(18,2),
  delta_vigente           NUMERIC(18,2),
  delta_devengado         NUMERIC(18,2),
  delta_pagado            NUMERIC(18,2),
  ratio_vigente_presupuestado NUMERIC(8,4),
  ratio_pago              NUMERIC(8,4),
  magnitud                NUMERIC(18,2),
  created_at              TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_novedades_fecha ON novedades (fecha);
CREATE INDEX IF NOT EXISTS idx_novedades_tipo ON novedades (tipo);
CREATE INDEX IF NOT EXISTS idx_novedades_magnitud ON novedades (fecha, magnitud DESC);

-- Log de ingestas
CREATE TABLE IF NOT EXISTS ingestas_log (
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

-- RLS (solo si las tablas son nuevas, no falla si ya existe)
DO $$ BEGIN
  ALTER TABLE presupuesto_diario ENABLE ROW LEVEL SECURITY;
  ALTER TABLE novedades ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "presupuesto_diario_read" ON presupuesto_diario FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "novedades_read" ON novedades FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Trigger updated_at (solo si no existe)
CREATE OR REPLACE FUNCTION pp_update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_entidades_updated_at
    BEFORE UPDATE ON entidades
    FOR EACH ROW EXECUTE FUNCTION pp_update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
