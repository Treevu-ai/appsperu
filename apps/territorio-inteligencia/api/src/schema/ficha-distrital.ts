import { z } from "zod";

/**
 * Ficha distrital de presión institucional.
 *
 * Une cuatro fuentes que comparten UBIGEO — SIDPOL (`police_reports`),
 * MIDIS (`cobertura_social`), RENIPRESS (`ipress`) y MTPE
 * (`empresas_privadas_distrito`) — para un solo distrito. Es **coincidencia
 * territorial**: que un distrito aparezca con denuncias altas y poca
 * cobertura no prueba ninguna relación causal entre las series.
 */
export const FichaDistritalQuerySchema = z.object({
  // UBIGEO distrital del INEI: 6 dígitos (2 depto + 2 provincia + 2 distrito).
  // Sin `.regex` el input vacío (`?ubigeo=`) cruzaría contra el UBIGEO vacío
  // de las cuatro bases y devolvería una ficha sin datos, no un 400.
  ubigeo: z
    .string()
    .regex(/^\d{6}$/, "ubigeo debe ser un UBIGEO distrital de 6 dígitos, ej. 130101"),
  anio: z
    .string()
    .regex(/^\d{4}$/, "anio debe ser un año de 4 dígitos")
    .describe("Año de las denuncias SIDPOL y del corte MTPE de empresas privadas."),
});

export type FichaDistritalQuery = z.infer<typeof FichaDistritalQuerySchema>;

/**
 * Un `null` acá significa **sin dato ese corte para ese distrito**, no cero.
 * Es la semántica de la fuente MIDIS (ver `apps/programas-sociales/api/src/db/
 * migrations/001_init.sql`): un distrito sin dato no es lo mismo que
 * cobertura 0. `columnasSinDato` las lista explícitamente para que ningún
 * consumidor las lea como cero por accidente.
 */
export type CoberturaSocialDistrito = {
  fechaCorte: string;
  programas: Record<string, number | null>;
  columnasSinDato: string[];
};

export type FichaDistritalData = {
  ubigeo: string;
  anio: number;
  /** Nombres territoriales; `null` si ninguna fuente publicó el distrito. */
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  denuncias: {
    /** `null` = la fuente no tiene registro para ese distrito/año, no cero. */
    total: number | null;
    porModalidad: { modalidad: string; cantidad: number }[];
    nota: string;
  };
  coberturaSocial: CoberturaSocialDistrito | null;
  establecimientosSalud: {
    total: number;
    activos: number;
    nota: string;
  } | null;
  empresasPrivadas: {
    anio: number;
    mes: number;
    numeroEmpresas: number | null;
    nota: string;
  } | null;
  advertencia: string;
};

export const NOTA_DENUNCIAS_SIDPOL =
  "Denuncias registradas ante la PNP (SIDPOL). Una denuncia es una imputación, no un hecho confirmado. " +
  "SIDPOL no publica homicidio ni sicariato a nivel distrital: la ausencia de esas modalidades acá no significa " +
  "ausencia de violencia letal (DQ-15).";

export const NOTA_ESTABLECIMIENTOS =
  "Conteo de establecimientos RENIPRESS por UBIGEO. Mide presencia de infraestructura, no calidad ni " +
  "capacidad de atención — RENIPRESS no publica camas ni personal por establecimiento en este dataset.";

export const NOTA_EMPRESAS_PRIVADAS =
  "Empresas privadas formales registradas ante el MTPE para el corte más reciente disponible. " +
  "Solo empleo formal: no incluye informales ni independientes, que son la mayoría en distritos rurales.";

export const ADVERTENCIA_FICHA =
  "Coincidencia territorial por UBIGEO entre cuatro fuentes independientes. No implica relación causal " +
  "entre denuncias, cobertura social, infraestructura de salud y empleo formal.";
