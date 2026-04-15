export interface Database {
  public: {
    Tables: {
      entidades: {
        Row: Entidad;
        Insert: EntidadInsert;
        Update: Partial<EntidadInsert>;
        Relationships: [];
      };
      presupuesto_diario: {
        Row: PresupuestoDiario;
        Insert: PresupuestoDiarioInsert;
        Update: Partial<PresupuestoDiarioInsert>;
        Relationships: [];
      };
      novedades: {
        Row: Novedad;
        Insert: NovedadInsert;
        Update: Partial<NovedadInsert>;
        Relationships: [];
      };
      ingestas_log: {
        Row: IngestaLog;
        Insert: IngestaLogInsert;
        Update: Partial<IngestaLogInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      situacion_bcra: SituacionBCRA;
      alerta_tipo: AlertaTipo;
    };
  };
}

// --- Enums ---

export type SituacionBCRA =
  | "normal"
  | "riesgo_bajo"
  | "riesgo_medio"
  | "riesgo_alto"
  | "irrecuperable"
  | "sin_datos";

export type AlertaTipo = "NORMAL" | "BOOST" | "HALT" | "RECT";

// --- Entidades ---

export interface Entidad {
  id: number;
  cuit: string;
  razon_social: string;
  tipo_personeria: "fisica" | "juridica" | "otro";
  localidad: string | null;
  provincia: string | null;
  codigo_postal: string | null;
  rubros: string[];
  situacion_bcra: SituacionBCRA;
  fecha_inscripcion_sipro: string | null;
  created_at: string;
  updated_at: string;
}

export type EntidadInsert = Omit<Entidad, "id" | "created_at" | "updated_at">;

// --- Presupuesto Diario (INMUTABLE) ---

export interface PresupuestoDiario {
  id: number;
  fecha: string;
  ejercicio: number;
  jurisdiccion_id: number;
  jurisdiccion_desc: string;
  entidad_id: number | null;
  entidad_desc: string | null;
  programa_id: number;
  programa_desc: string;
  credito_presupuestado: number;
  credito_vigente: number;
  credito_devengado: number;
  credito_pagado: number;
  created_at: string;
}

export type PresupuestoDiarioInsert = Omit<
  PresupuestoDiario,
  "id" | "created_at"
>;

// --- Novedades (INMUTABLE) ---

export interface Novedad {
  id: number;
  fecha: string;
  ejercicio: number;
  jurisdiccion_id: number;
  jurisdiccion_desc: string;
  programa_id: number;
  programa_desc: string;
  tipo: AlertaTipo;
  titulo: string;
  detalle: string | null;
  vigente_hoy: number | null;
  presupuestado_hoy: number | null;
  devengado_hoy: number | null;
  pagado_hoy: number | null;
  vigente_ayer: number | null;
  devengado_ayer: number | null;
  pagado_ayer: number | null;
  delta_vigente: number | null;
  delta_devengado: number | null;
  delta_pagado: number | null;
  ratio_vigente_presupuestado: number | null;
  ratio_pago: number | null;
  magnitud: number | null;
  created_at: string;
}

export type NovedadInsert = Omit<Novedad, "id" | "created_at">;

// --- Ingestas Log ---

export interface IngestaLog {
  id: number;
  fecha: string;
  endpoint: string;
  filas_recibidas: number;
  filas_insertadas: number;
  novedades_generadas: number;
  duracion_ms: number | null;
  error: string | null;
  created_at: string;
}

export type IngestaLogInsert = Omit<IngestaLog, "id" | "created_at">;
