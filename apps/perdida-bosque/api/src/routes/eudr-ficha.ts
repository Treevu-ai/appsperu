import { Router } from "express";
import { z } from "zod";
import { evaluarFichaEudr, type FichaEvidenciaEudr } from "../lib/ficha-evidencia.js";
import { asyncHandler } from "../lib/async-handler.js";
import { parseQuery } from "../lib/validate-query.js";

export const eudrFichaRouter = Router();

const QuerySchema = z.object({
  ruc: z.string().regex(/^\d{11}$/, "El RUC debe tener 11 dígitos"),
});

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function renderHtml(f: FichaEvidenciaEudr): string {
  const filasParcelas = f.parcelas
    .map((p) => {
      const d = p.deforestacion;
      const estadoDeforestacion = d.cumpleCorteEudr
        ? `<span style="color:#2a7a2a">Sin pérdida post-corte</span>`
        : `<span style="color:#b00">Pérdida post-corte: ${d.perdidaPostCorteHa.toFixed(2)} ha</span>`;
      const geo = p.geolocalizacionCumpleArt9
        ? `<span style="color:#2a7a2a">Válida (art. 9.1.d)</span>`
        : `<span style="color:#b00">No cumple el umbral de geolocalización</span>`;
      return `<tr>
        <td>${escapeHtml(p.codigoParcela)}</td>
        <td>${p.areaHa.toFixed(2)} ha</td>
        <td>${geo}</td>
        <td>${estadoDeforestacion}</td>
        <td>${escapeHtml(d.resueltoCon)}</td>
      </tr>`;
    })
    .join("\n");

  const filasSanciones = f.legalidad.sancionesAmbientalesOefa
    .slice(0, 10)
    .map(
      (s) =>
        `<tr><td>${escapeHtml(s.expediente)}</td><td>${s.fecha ?? "-"}</td><td>${escapeHtml(s.detalle ?? "")}</td></tr>`
    )
    .join("\n");

  const filasInhabilitaciones = f.legalidad.inhabilitacionesOsce
    .slice(0, 10)
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.resolucion)}</td><td>${i.desde ?? "-"} — ${i.hasta ?? "-"}</td><td>${i.vigente ? "VIGENTE" : "NO VIGENTE"}</td></tr>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Ficha de evidencia EUDR — ${escapeHtml(f.ruc)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 860px; margin: 2rem auto; color: #1a1a1a; }
  h1 { font-size: 1.4rem; border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
  h2 { font-size: 1.05rem; margin-top: 2rem; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.5rem; }
  th, td { border: 1px solid #ccc; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.9rem; }
  th { background: #f2f2f2; }
  .veredicto { padding: 1rem; border: 2px solid; margin-top: 1rem; }
  .veredicto.ok { border-color: #2a7a2a; background: #eaf6ea; }
  .veredicto.revisar { border-color: #b00; background: #fbeaea; }
  .aclaracion { font-size: 0.8rem; color: #666; margin-top: 2rem; border-top: 1px solid #ccc; padding-top: 0.5rem; }
  @media print { body { margin: 0.5rem; } }
</style>
</head>
<body>
  <h1>Ficha de evidencia EUDR — Reglamento (UE) 2023/1115</h1>
  <p><strong>RUC:</strong> ${escapeHtml(f.ruc)} &nbsp; <strong>Razón social:</strong> ${escapeHtml(f.razonSocial ?? "No encontrado en padrón SUNAT")}</p>
  <p><strong>Generado:</strong> ${f.fechaGeneracion} &nbsp; <strong>Corte de deforestación:</strong> ${f.corte}</p>

  <div class="veredicto ${f.veredicto.listoParaDeclaracionDds ? "ok" : "revisar"}">
    <strong>${f.veredicto.listoParaDeclaracionDds ? "LISTO para respaldar una declaración de diligencia debida (DDS)" : "REQUIERE REVISIÓN antes de declarar"}</strong><br>
    ${f.veredicto.totalParcelas} parcela(s) — ${f.veredicto.parcelasConGeolocalizacionValida} con geolocalización válida — ${f.veredicto.parcelasConPerdidaPostCorte} con pérdida post-corte — legalidad: ${f.legalidad.nivel}
  </div>

  <h2>Parcelas</h2>
  <table>
    <thead><tr><th>Código</th><th>Área</th><th>Geolocalización</th><th>Deforestación</th><th>Resuelto con</th></tr></thead>
    <tbody>${filasParcelas || '<tr><td colspan="5">Sin parcelas registradas</td></tr>'}</tbody>
  </table>

  <h2>Sanciones ambientales OEFA</h2>
  <table>
    <thead><tr><th>Expediente</th><th>Fecha</th><th>Detalle</th></tr></thead>
    <tbody>${filasSanciones || '<tr><td colspan="3">Sin hallazgos</td></tr>'}</tbody>
  </table>

  <h2>Inhabilitaciones OSCE</h2>
  <table>
    <thead><tr><th>Resolución</th><th>Vigencia</th><th>Estado</th></tr></thead>
    <tbody>${filasInhabilitaciones || '<tr><td colspan="3">Sin hallazgos</td></tr>'}</tbody>
  </table>

  <p class="aclaracion">
    Esta ficha es una señal de riesgo construida a partir de fuentes públicas (Geobosques/MINAM,
    Global Forest Watch — Hansen/GLAD, OEFA, OSCE) y de los datos que la propia organización
    declaró en Rastro. No es una certificación de legalidad ni un documento oficial del
    Reglamento (UE) 2023/1115 — la ausencia de hallazgos no prueba cumplimiento, solo que no
    hay un hallazgo público registrado en estas fuentes a la fecha de generación.
  </p>
</body>
</html>`;
}

/**
 * Ficha de evidencia EUDR de una organización: geolocalización + deforestación
 * por parcela, y riesgo de legalidad del titular — compuesto en un solo
 * documento, no JSON crudo por partes. `?formato=html` para la versión
 * imprimible (el navegador la convierte a PDF con "Imprimir → Guardar como PDF",
 * sin agregar una librería de PDF al proyecto).
 */
eudrFichaRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = parseQuery(QuerySchema, req.query, res);
    if (!parsed) return;

    const ficha = await evaluarFichaEudr(parsed.ruc);

    if (req.query.formato === "html") {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(renderHtml(ficha));
      return;
    }

    res.json(ficha);
  })
);
