import { z } from "zod";

/**
 * Ficha electoral por circunscripción (ERM 2026).
 *
 * Une cuatro fuentes por UBIGEO — candidatos ERM, autoridades electas del
 * JNE, RENAMU y sanciones del Tribunal de Contrataciones (estas últimas por
 * DNI exacto, nunca por nombre). Todas las uniones son exactas; ninguna es
 * difusa.
 */
export const FichaElectoralQuerySchema = z.object({
  // UBIGEO distrital del INEI. Para una candidatura municipal PROVINCIAL el
  // código que usa la fuente es el del distrito-capital de la provincia, no
  // un código provincial de 4 dígitos — por eso el formato es siempre de 6.
  ubigeo: z
    .string()
    .regex(/^\d{6}$/, "ubigeo debe ser un UBIGEO distrital de 6 dígitos, ej. 130101"),
});

export type FichaElectoralQuery = z.infer<typeof FichaElectoralQuerySchema>;

export type CandidatoFicha = {
  /** Enmascarado: solo los últimos 3 dígitos, mismo criterio que `/api/candidatos`. */
  dniEnmascarado: string;
  nombreCompleto: string;
  cargo: string;
  tipoEleccion: string;
  organizacionPolitica: string;
  organizacionEstado: string | null;
  estado: string;
  posicion: number | null;
  /** Declarado por el propio candidato en su hoja de vida, no una sentencia judicial verificada. */
  sentenciasDeclaradas: number | null;
};

export type SancionDirecta = {
  tipo: "INHABILITACION" | "MULTA";
  razonSocial: string;
  ruc: string;
  estado: string | null;
  resolucion: string;
  desde: string | Date | null;
  hasta: string | Date | null;
};

export type CandidatoConSancion = {
  dniEnmascarado: string;
  nombreCompleto: string;
  cargo: string;
  organizacionPolitica: string;
  sanciones: SancionDirecta[];
};

export type FichaElectoralData = {
  ubigeo: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  candidatos: {
    total: number;
    /** Solo los que la fuente marca `estado = 'INSCRITO'`. */
    inscritos: number;
    conSentenciasDeclaradas: number;
    porTipoYEleccion: { tipoEleccion: string; cargo: string; total: number }[];
    detalle: CandidatoFicha[];
  };
  autoridadesVigentes: {
    total: number;
    detalle: {
      nombreCompleto: string;
      cargo: string;
      organizacionPolitica: string;
      ambito: string | null;
      periodo: string | null;
    }[];
    /** `null` = el dataset JNE vigente aún no cubre este ámbito, no "no hay autoridad". */
    nota: string;
  };
  municipalidad: {
    idmunici: string;
    anio: number;
    /** '1' Provincial, '2' Distrital, '3' Centro Poblado. */
    tipomuni: string;
    tipo: string;
    tieneInternet: boolean | null;
    vehiculosOperativos: number;
    nota: string;
  } | null;
  candidatosConSancionDirecta: CandidatoConSancion[];
  /** Restricción sobre TODA la lista anterior, no sobre una fila en particular. */
  notaSanciones: string;
  advertencia: string;
};

export const NOTA_AUTORIDADES =
  "El recurso 'actual' de Autoridades Electas que publica el JNE en datosabiertos.gob.pe fue verificado " +
  "2026-09-06 cubriendo solo las autoridades nacionales recién proclamadas (Presidencia, Senado, Diputados, " +
  "Parlamento Andino). Un vacío acá NO significa que la circunscripción no tenga autoridad: significa que " +
  "el dataset vigente aún no la incluye. El recurso histórico 2014-2022, que sí cubre ámbitos municipales, " +
  "no se ingeró por riesgo de PII (trae DNI sin enmascarar).";

export const NOTA_SANCIONES =
  "Sanción administrativa del Tribunal de Contrataciones del Estado (inhabilitación o multa), cruzada por " +
  "DNI exacto. NO es una sentencia penal ni una condena, y una inhabilitación vigente no inhabilita " +
  "necesariamente la postulación: eso depende de la ley electoral aplicable, que esta ficha no evalúa.";

export const NOTA_MUNICIPALIDAD =
  "RENAMU (INEI) cubre identificación y equipamiento/conectividad institucional. El Módulo I, que mezcla " +
  "datos institucionales con PII del alcalde, se excluyó completo en la ingesta: por eso no hay nombre de " +
  "la máxima autoridad en esta ficha.";

export const ADVERTENCIA_FICHA_ELECTORAL =
  "Ficha de contexto por circunscripción. Reúne fuentes independientes sobre el mismo UBIGEO; no establece " +
  "ninguna relación causal entre una candidatura, una sanción y los datos institucionales de la municipalidad.";
