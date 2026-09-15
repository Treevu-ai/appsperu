import type { SectorFichaResponse } from "../../lib/api-client.js";
import {
  GAP_FISICO_FINANCIERO_UMBRAL_PP,
  normalizeSectorObras,
  summarizeSectorObras,
} from "../../lib/sector-ficha.js";
import type { Cobertura } from "../../lib/types.js";
import { NumberWithMetadata, metaNumber } from "../../components/NumberWithMetadata.js";

const FUENTE = "radar-ejecucion / radar_ejecucion_sector_ficha";
const CONTRATACIONES_LIMITE = 10;

const INVERSION_ESTADO_LABEL: Record<SectorFichaResponse["inversiones"]["estado"], string> = {
  VINCULO_OFICIAL: "Vínculo oficial CUI ↔ entidad",
  SIN_VINCULO_OFICIAL: "Sin CUI con vínculo oficial",
};

const OBRA_ESTADO_LABEL: Record<
  "CUI_EXACTO" | "SIN_CUI_CON_VINCULO_OFICIAL" | "INFOBRAS_NO_CONFIGURADO",
  string
> = {
  CUI_EXACTO: "Obra por CUI exacto",
  SIN_CUI_CON_VINCULO_OFICIAL: "Sin CUI con vínculo oficial",
  INFOBRAS_NO_CONFIGURADO: "INFOBRAS no configurado en este entorno",
};

const CONTRATACION_ESTADO_LABEL: Record<SectorFichaResponse["contrataciones"]["estado"], string> = {
  IDENTIDAD_MEF_COMPRAS_VERIFICADA: "Identidad MEF ↔ compras verificada",
  SIN_VINCULO_MEF_COMPRAS_VERIFICADO: "Sin vínculo MEF ↔ compras verificado",
  SIN_ENTIDADES_VERIFICADAS: "Sin entidades verificadas en el sector",
  COMPRAS_NO_CONFIGURADO: "Compras públicas no configurado en este entorno",
};

export function SectorFichaSections({
  data,
  corte,
  cobertura,
  matcher,
}: {
  data: SectorFichaResponse;
  corte: string;
  cobertura: Cobertura;
  matcher: string;
}) {
  const obras = normalizeSectorObras(data.obras);

  return (
    <div className="mt-10 space-y-8 border-t border-line pt-8">
      <InversionesSection
        inversiones={data.inversiones}
        limitation={data.limitation}
        corte={corte}
        cobertura={cobertura}
        matcher={matcher}
      />
      <ObrasSection obras={obras} corte={corte} cobertura={cobertura} matcher={matcher} />
      <ContratacionesSection
        contrataciones={data.contrataciones}
        corte={corte}
        cobertura={cobertura}
        matcher={matcher}
      />
    </div>
  );
}

function LinkEstadoBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono uppercase bg-ink-800 text-fg-soft border-line">
      {label}
    </span>
  );
}

function InversionesSection({
  inversiones,
  limitation,
  corte,
  cobertura,
  matcher,
}: {
  inversiones: SectorFichaResponse["inversiones"];
  limitation: string;
  corte: string;
  cobertura: Cobertura;
  matcher: string;
}) {
  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-fg font-semibold">Inversiones (CUI)</h3>
        <LinkEstadoBadge label={INVERSION_ESTADO_LABEL[inversiones.estado]} />
      </div>
      {inversiones.resultados.length === 0 ? (
        <p className="text-sm text-fg-soft mt-3">{limitation}</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-xs text-muted text-left">
              <tr>
                <th className="py-2 pr-3 whitespace-nowrap">CUI</th>
                <th className="py-2 pr-3">Actividad</th>
                <th className="py-2 pr-3 whitespace-nowrap">Entidad</th>
                <th className="py-2 pr-3 text-right whitespace-nowrap">PIM</th>
                <th className="py-2 pr-3 text-right whitespace-nowrap">Devengado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {inversiones.resultados.map((row) => (
                <tr key={row.cui}>
                  <td className="py-2 pr-3 mono-num text-fg">{row.cui}</td>
                  <td className="py-2 pr-3 text-fg-soft max-w-md truncate" title={row.actividad}>
                    {row.actividad}
                  </td>
                  <td className="py-2 pr-3 mono-num text-fg-soft whitespace-nowrap">{row.entityCode}</td>
                  <td className="py-2 pr-3 text-right text-fg">
                    {row.pim != null ? (
                      <NumberWithMetadata
                        data={metaNumber(row.pim, FUENTE, corte, cobertura, matcher, "CUI vía project_evidence_links")}
                        suffix="S/"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-fg">
                    {row.devengado != null ? (
                      <NumberWithMetadata
                        data={metaNumber(row.devengado, FUENTE, corte, cobertura, matcher, "CUI vía project_evidence_links")}
                        suffix="S/"
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ObrasSection({
  obras,
  corte,
  cobertura,
  matcher,
}: {
  obras: ReturnType<typeof normalizeSectorObras>;
  corte: string;
  cobertura: Cobertura;
  matcher: string;
}) {
  const estado = obras.estado as keyof typeof OBRA_ESTADO_LABEL;
  const label = OBRA_ESTADO_LABEL[estado] ?? obras.estado;
  const resumen =
    obras.estado === "CUI_EXACTO" && obras.resultados.length > 0
      ? summarizeSectorObras(obras.resultados)
      : null;

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-fg font-semibold">Obras (INFOBRAS vía CUI)</h3>
        <LinkEstadoBadge label={label} />
      </div>
      {resumen ? (
        <p className="text-xs text-muted mt-2">
          Paralizadas: {resumen.paralizadas} · Gap |físico − financiero| &gt; {GAP_FISICO_FINANCIERO_UMBRAL_PP} pp:{" "}
          {resumen.conGapAlto}
        </p>
      ) : null}
      {obras.estado !== "CUI_EXACTO" || obras.resultados.length === 0 ? (
        <p className="text-sm text-fg-soft mt-3">
          {obras.estado === "INFOBRAS_NO_CONFIGURADO"
            ? "INFOBRAS no está configurado — no se puede cruzar obra por CUI en este entorno."
            : obras.estado === "SIN_CUI_CON_VINCULO_OFICIAL"
              ? "No hay obras materializadas para los CUI con vínculo oficial de este sector."
              : "Sin obras en el cruce CUI exacto para este sector."}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm min-w-[960px]">
            <thead className="text-xs text-muted text-left">
              <tr>
                <th className="py-2 pr-3 whitespace-nowrap">CUI</th>
                <th className="py-2 pr-3">Obra</th>
                <th className="py-2 pr-3 whitespace-nowrap">Estado</th>
                <th className="py-2 pr-3 text-right whitespace-nowrap">Días paral.</th>
                <th className="py-2 pr-3 text-right whitespace-nowrap">Avance físico</th>
                <th className="py-2 pr-3 text-right whitespace-nowrap">Cost Drift</th>
                <th className="py-2 pr-3 text-right whitespace-nowrap">Gap físico-financiero</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {obras.resultados.map((row) => (
                <tr key={row.codigoInfobras}>
                  <td className="py-2 pr-3 mono-num text-fg-soft whitespace-nowrap">{row.cui ?? "—"}</td>
                  <td className="py-2 pr-3 text-fg max-w-xs truncate" title={row.nombre}>
                    {row.nombre}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {row.existeParalizacion ? (
                      <span className="text-danger font-medium">PARALIZADA</span>
                    ) : (
                      <span className="text-fg-soft">{row.estadoEjecucion ?? "—"}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-fg" title="Días en paralización según INFOBRAS">
                    {row.existeParalizacion && row.diasParalizado != null ? (
                      <NumberWithMetadata
                        data={metaNumber(
                          row.diasParalizado,
                          FUENTE,
                          corte,
                          cobertura,
                          matcher,
                          "INFOBRAS vía CUI exacto",
                        )}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-fg">
                    {row.avanceFisicoRealPct != null ? (
                      <NumberWithMetadata
                        data={metaNumber(
                          row.avanceFisicoRealPct,
                          FUENTE,
                          corte,
                          cobertura,
                          matcher,
                          "INFOBRAS vía CUI exacto",
                        )}
                        format={(n) => `${n.toFixed(1)}%`}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className="py-2 pr-3 text-right text-fg"
                    title="(Costo actualizado − Monto viable) / Monto viable"
                  >
                    {row.costDriftPct != null ? (
                      <NumberWithMetadata
                        data={metaNumber(
                          row.costDriftPct,
                          FUENTE,
                          corte,
                          cobertura,
                          matcher,
                          "INFOBRAS vía CUI exacto (costDriftPct)",
                        )}
                        format={(n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`}
                        className={row.costDriftPct > 0 ? "text-warn" : undefined}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td
                    className="py-2 pr-3 text-right text-fg"
                    title="Avance físico real − Ejecución financiera. No implica causalidad."
                  >
                    {row.gapFisicoFinanciero != null ? (
                      <NumberWithMetadata
                        data={metaNumber(
                          row.gapFisicoFinanciero,
                          FUENTE,
                          corte,
                          cobertura,
                          matcher,
                          "INFOBRAS vía CUI exacto (gapFisicoFinanciero)",
                        )}
                        format={(n) => `${n > 0 ? "+" : ""}${n.toFixed(1)} pp`}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ContratacionesSection({
  contrataciones,
  corte,
  cobertura,
  matcher,
}: {
  contrataciones: SectorFichaResponse["contrataciones"];
  corte: string;
  cobertura: Cobertura;
  matcher: string;
}) {
  const filas = contrataciones.resultados.slice(0, CONTRATACIONES_LIMITE);

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-fg font-semibold">Contrataciones</h3>
        <LinkEstadoBadge label={CONTRATACION_ESTADO_LABEL[contrataciones.estado]} />
      </div>
      {filas.length === 0 ? (
        <p className="text-sm text-fg-soft mt-3">
          {contrataciones.estado === "COMPRAS_NO_CONFIGURADO"
            ? "Compras públicas no está configurado — no se puede cruzar contrato por identidad MEF."
            : contrataciones.estado === "SIN_ENTIDADES_VERIFICADAS"
              ? "No hay entidades verificadas en el registro sectorial para cruzar contratos."
              : "Sin contratos menores cruzados por identidad MEF ↔ compras verificada."}
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-xs text-muted text-left">
                <tr>
                  <th className="py-2 pr-3">Objeto</th>
                  <th className="py-2 pr-3">Entidad compradora</th>
                  <th className="py-2 pr-3 text-right whitespace-nowrap">Monto</th>
                  <th className="py-2 pr-3 whitespace-nowrap">Publicación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {filas.map((row) => (
                  <tr key={row.contractingId}>
                    <td className="py-2 pr-3 text-fg-soft max-w-md truncate" title={row.objeto ?? undefined}>
                      {row.objeto ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-fg max-w-xs truncate" title={row.entidadCompradora ?? undefined}>
                      {row.entidadCompradora ?? "—"}
                    </td>
                    <td className="py-2 pr-3 text-right text-fg">
                      {row.montoAdjudicado != null ? (
                        <NumberWithMetadata
                          data={metaNumber(
                            row.montoAdjudicado,
                            FUENTE,
                            corte,
                            cobertura,
                            matcher,
                            "minor_contracts vía identidad MEF",
                          )}
                          suffix="S/"
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-2 pr-3 text-fg-soft whitespace-nowrap">{row.publicationDate ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {contrataciones.resultados.length > CONTRATACIONES_LIMITE ? (
            <p className="text-xs text-muted mt-2">
              Mostrando {CONTRATACIONES_LIMITE} de {contrataciones.resultados.length} contratos.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
