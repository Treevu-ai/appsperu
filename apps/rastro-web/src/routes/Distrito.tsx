import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getCeplanGeoTerritory,
  getInfobrasPublicWorks,
  getRadarEjecucionInfrastructureAssets,
  type InfrastructureAssetsResponse,
  type PublicWork,
  type PublicWorksResponse,
  type Territory,
} from "../lib/api-client.js";
import { AppUnavailableError } from "../lib/types.js";
import { CoverageBadge } from "../components/CoverageBadge.js";
import { NumberWithMetadata, metaNumber } from "../components/NumberWithMetadata.js";

export function Distrito() {
  const { ubigeo = "" } = useParams();
  const valid = /^\d{6}$/.test(ubigeo);

  const [data, setData] = useState<PublicWorksResponse | null>(null);
  const [territorio, setTerritorio] = useState<Territory | null>(null);
  const [assets, setAssets] = useState<InfrastructureAssetsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!valid) {
      setLoading(false);
      setError("UBIGEO inválido. Debe tener exactamente 6 dígitos.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        // Por ahora infobras_public_works y radar_ejecucion_infrastructure_assets
        // solo filtran por departamento en el backend (no por distrito — ver
        // AL3-09 en docs/TICKETS_Rastro_Capa_Lectura_v1.md). Resolvemos el
        // distrito exacto vía ceplan_geo_territories (que sí conoce el UBIGEO
        // completo) y filtramos el resultado en el cliente contra ese nombre.
        const deptoPrefix = ubigeo.slice(0, 2);
        const deptoNombre = UBIGEO_DEPARTAMENTO[deptoPrefix] ?? null;
        if (!deptoNombre) {
          throw new Error(`Prefijo departamental ${deptoPrefix} no reconocido.`);
        }
        const [territorioRes, worksRes, assetsRes] = await Promise.allSettled([
          getCeplanGeoTerritory({ ubigeo }),
          getInfobrasPublicWorks({ departamento: deptoNombre }),
          getRadarEjecucionInfrastructureAssets({ departamento: deptoNombre }),
        ]);
        if (cancelled) return;
        if (territorioRes.status === "fulfilled") setTerritorio(territorioRes.value);
        if (worksRes.status === "fulfilled") setData(worksRes.value);
        if (assetsRes.status === "fulfilled") setAssets(assetsRes.value);
        if (worksRes.status === "rejected" && assetsRes.status === "rejected") {
          throw worksRes.reason;
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof AppUnavailableError ? err.message : (err as Error).message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ubigeo, valid]);

  const distritoNombre = territorio?.distrito ?? null;

  const obrasDelDistrito = useMemo(() => {
    if (!data) return [];
    if (!distritoNombre) return data.resultados;
    return data.resultados.filter((w) => w.distrito?.toUpperCase() === distritoNombre.toUpperCase());
  }, [data, distritoNombre]);

  // El endpoint no trae un resumen embebido (a diferencia de otras APIs del
  // proyecto) — se computa acá desde las mismas filas ya fetcheadas, sin una
  // segunda llamada a GET /api/public-works/resumen.
  const resumenObras = useMemo(() => {
    const total = obrasDelDistrito.length;
    if (total === 0) return null;
    const paralizadas = obrasDelDistrito.filter((w) => w.existeParalizacion).length;
    const conAvance = obrasDelDistrito.filter((w) => w.avanceFisicoRealPct != null).length;
    return {
      paralizadasPct: Math.round((paralizadas / total) * 1000) / 10,
      conAvanceFisicoPct: Math.round((conAvance / total) * 1000) / 10,
    };
  }, [obrasDelDistrito]);

  const activosDelDistrito = useMemo(() => {
    if (!assets) return [];
    if (!distritoNombre) return assets.resultados;
    return assets.resultados.filter((a) => a.territorio.distrito?.toUpperCase() === distritoNombre.toUpperCase());
  }, [assets, distritoNombre]);

  if (!valid) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="font-serif text-3xl text-fg">Distrito</h1>
        <p className="text-danger mt-4">{error ?? "UBIGEO inválido."}</p>
        <p className="text-muted text-sm mt-2">Formato esperado: 6 dígitos.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">LECTOR AUDITORÍA · UBIGEO {ubigeo}</p>
      <h1 className="font-serif text-3xl text-fg mt-2">
        {distritoNombre ? `Obras y activos — ${distritoNombre}` : "Obras y activos (alcance departamental)"}
      </h1>
      <p className="text-fg-soft mt-2 max-w-3xl">
        {distritoNombre ? (
          <>
            INFOBRAS y radar-ejecucion traen el universo del departamento; esta vista lo filtra a las filas cuyo
            campo <code className="text-fg-soft">distrito</code> coincide exactamente con{" "}
            <strong className="text-fg">{distritoNombre}</strong> (resuelto desde el UBIGEO vía ceplan-geo). Sin
            coordenadas: INFOBRAS no las publica.
          </>
        ) : (
          <>
            No se pudo resolver el distrito exacto para este UBIGEO (ceplan-geo no disponible o territorio no
            encontrado) — se muestra el universo completo del departamento sin filtrar. Sin coordenadas: INFOBRAS no
            las publica.
          </>
        )}
      </p>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        <Link to={`/distrito/${ubigeo}/integridad`} className="text-accent text-sm underline-offset-2 hover:underline">
          Ver integridad de infraestructura →
        </Link>
        <Link to="/auditoria/entidades-infobras" className="text-accent text-sm underline-offset-2 hover:underline">
          Ver entidades cruzadas MEF↔INFOBRAS →
        </Link>
      </p>

      {loading ? <p className="text-muted mt-6">Consultando API…</p> : null}
      {!loading && error ? (
        <p className="text-danger mt-6">{error}</p>
      ) : null}

      {!loading && data ? (
        <div className="mt-8 card overflow-x-auto">
          <div className="flex items-center gap-3">
            <h2 className="text-fg font-semibold">
              {obrasDelDistrito.length} obras{distritoNombre ? " en el distrito" : " en el departamento"}
            </h2>
            <CoverageBadge cobertura="NO_APLICA" />
          </div>
          <p className="text-xs text-muted mt-1">
            El endpoint no declara fecha de corte, matcher ni cobertura para esta consulta.
          </p>
          {resumenObras ? (
            <p className="text-xs text-muted mt-1">
              Paralizadas:{" "}
              <NumberWithMetadata
                data={metaNumber(resumenObras.paralizadasPct, "infobras / infobras_public_works", "sin corte declarado por la fuente", "NO_APLICA")}
                format={(n) => `${n.toFixed(1)}%`}
              />{" "}
              · Con avance físico reportado:{" "}
              <NumberWithMetadata
                data={metaNumber(resumenObras.conAvanceFisicoPct, "infobras / infobras_public_works", "sin corte declarado por la fuente", "NO_APLICA")}
                format={(n) => `${n.toFixed(1)}%`}
              />
            </p>
          ) : null}

          <table className="mt-6 w-full text-sm">
            <thead className="text-xs text-muted text-left">
              <tr>
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Obra</th>
                <th className="py-2 pr-3">Entidad</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3 text-right">Avance físico</th>
                <th className="py-2 pr-3 text-right">Cost Drift</th>
                <th className="py-2 pr-3 text-right">Gap físico-financiero</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {obrasDelDistrito.slice(0, 50).map((w: PublicWork) => (
                <tr key={w.codigoInfobras}>
                  <td className="py-2 pr-3 mono-num text-fg-soft">{w.codigoInfobras}</td>
                  <td className="py-2 pr-3 text-fg">{w.nombreObra}</td>
                  <td className="py-2 pr-3 text-fg-soft">{w.entidadNombre}</td>
                  <td className="py-2 pr-3">
                    {w.existeParalizacion ? (
                      <span className="text-danger" title={w.causalParalizacion ?? undefined}>
                        PARALIZADA
                      </span>
                    ) : (
                      <span className="text-fg-soft">{w.estadoEjecucion}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-fg">
                    {w.avanceFisicoRealPct != null ? (
                      <NumberWithMetadata
                        data={metaNumber(w.avanceFisicoRealPct, "infobras / infobras_public_works", "sin corte declarado por la fuente", "NO_APLICA")}
                        format={(n) => `${n.toFixed(1)}%`}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-fg" title="(Costo actualizado − Monto viable) / Monto viable">
                    {w.costDriftPct != null ? (
                      <NumberWithMetadata
                        data={metaNumber(w.costDriftPct, "infobras / infobras_public_works (signals.costDriftPct)", "sin corte declarado por la fuente", "NO_APLICA")}
                        format={(n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}%`}
                        className={w.costDriftPct > 0 ? "text-warn" : undefined}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-fg" title="Avance físico real − Ejecución financiera. No implica causalidad.">
                    {w.gapFisicoFinanciero != null ? (
                      <NumberWithMetadata
                        data={metaNumber(w.gapFisicoFinanciero, "infobras / infobras_public_works (signals.gapFisicoFinanciero)", "sin corte declarado por la fuente", "NO_APLICA")}
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
          {obrasDelDistrito.length > 50 ? (
            <p className="text-xs text-muted mt-3">Mostrando primeras 50 de {obrasDelDistrito.length} obras.</p>
          ) : null}
        </div>
      ) : null}

      {!loading && assets ? (
        <div className="mt-8 card overflow-x-auto">
          <div className="flex items-center gap-3">
            <h2 className="text-fg font-semibold">
              {activosDelDistrito.length} activos de infraestructura{distritoNombre ? " en el distrito" : " en el departamento"}
            </h2>
          </div>
          <p className="text-xs text-muted mt-1">{assets.cautela}</p>

          {activosDelDistrito.length === 0 ? (
            <p className="text-fg-soft text-sm mt-4">Sin activos materializados para este alcance.</p>
          ) : (
            <table className="mt-6 w-full text-sm">
              <thead className="text-xs text-muted text-left">
                <tr>
                  <th className="py-2 pr-3">Activo</th>
                  <th className="py-2 pr-3">Familia</th>
                  <th className="py-2 pr-3">CUI</th>
                  <th className="py-2 pr-3">Cierre</th>
                  <th className="py-2 pr-3">Operador</th>
                  <th className="py-2 pr-3">Mantenimiento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {activosDelDistrito.slice(0, 50).map((a) => (
                  <tr key={a.id}>
                    <td className="py-2 pr-3 text-fg">{a.activo}</td>
                    <td className="py-2 pr-3 text-fg-soft">{a.familia}</td>
                    <td className="py-2 pr-3 mono-num text-fg-soft">{a.identidad.cui ?? "—"}</td>
                    <td className="py-2 pr-3 text-xs text-fg-soft">{a.etapas.cierre}</td>
                    <td className="py-2 pr-3 text-xs text-fg-soft">{a.etapas.operador}</td>
                    <td className="py-2 pr-3 text-xs text-fg-soft">{a.etapas.mantenimiento}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {activosDelDistrito.length > 50 ? (
            <p className="text-xs text-muted mt-3">Mostrando primeros 50 de {activosDelDistrito.length} activos.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Mapeo mínimo prefijo-2-dígitos → nombre de departamento (INEI 2017).
// Para una cobertura completa, se debe obtener del endpoint ceplan-geo.
const UBIGEO_DEPARTAMENTO: Record<string, string> = {
  "01": "AMAZONAS",
  "02": "ANCASH",
  "03": "APURIMAC",
  "04": "AREQUIPA",
  "05": "AYACUCHO",
  "06": "CAJAMARCA",
  "07": "CALLAO",
  "08": "CUSCO",
  "09": "HUANCAVELICA",
  "10": "HUANUCO",
  "11": "ICA",
  "12": "JUNIN",
  "13": "LA LIBERTAD",
  "14": "LAMBAYEQUE",
  "15": "LIMA",
  "16": "LORETO",
  "17": "MADRE DE DIOS",
  "18": "MOQUEGUA",
  "19": "PASCO",
  "20": "PIURA",
  "21": "PUNO",
  "22": "SAN MARTIN",
  "23": "TACNA",
  "24": "TUMBES",
  "25": "UCAYALI",
};
