/**
 * Parser de la respuesta de `Consulta/GetNombreConsulta` del Padrón de
 * Productores Agrarios (MIDAGRI). El sistema no expone un flag booleano
 * de registro — hay que inferirlo del valor de `result`: nombre real si
 * está registrado, el literal "-" si no (mismo sentinel que usa SUNAT en
 * el resto del catálogo). Ver docs/data-contracts/midagri-padron-ppa.md.
 */

export interface AbpResult {
  result: string | null;
  success: boolean;
  error: unknown;
}

export interface PadronPpaConsulta {
  registrado: boolean;
  nombrePpa: string | null;
}

export function parseGetNombreConsulta(response: AbpResult): PadronPpaConsulta {
  const nombre = (response.result ?? "").trim();
  const registrado = nombre !== "" && nombre !== "-";
  return {
    registrado,
    nombrePpa: registrado ? nombre : null,
  };
}
