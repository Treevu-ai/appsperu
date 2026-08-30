import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getInfobrasPublicWorks, type PublicWork, type PublicWorksResponse } from "../lib/api-client.js";
import { AppUnavailableError } from "../lib/types.js";
import { CoverageBadge } from "../components/CoverageBadge.js";
import { NumberWithMetadata, metaNumber } from "../components/NumberWithMetadata.js";

export function Distrito() {
  const { ubigeo = "" } = useParams();
  const valid = /^\d{6}$/.test(ubigeo);

  const [data, setData] = useState<PublicWorksResponse | null>(null);
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
        // Por ahora el endpoint de infobras filtra por departamento. Mapeamos
        // el UBIGEO (6 dígitos) → prefijo departamental (2 dígitos) → nombre.
        const deptoPrefix = ubigeo.slice(0, 2);
        const deptoNombre = UBIGEO_DEPARTAMENTO[deptoPrefix] ?? null;
        if (!deptoNombre) {
          throw new Error(`Prefijo departamental ${deptoPrefix} no reconocido.`);
        }
        const res = await getInfobrasPublicWorks({ departamento: deptoNombre });
        if (!cancelled) setData(res);
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
      <h1 className="font-serif text-3xl text-fg mt-2">Obras y activos del departamento</h1>
      <p className="text-fg-soft mt-2 max-w-3xl">
        INFOBRAS (Contraloría) para el departamento al que pertenece este distrito. Sin coordenadas: INFOBRAS no las
        publica.
      </p>

      {loading ? <p className="text-muted mt-6">Consultando API…</p> : null}
      {!loading && error ? (
        <p className="text-danger mt-6">{error}</p>
      ) : null}

      {!loading && data ? (
        <div className="mt-8 card overflow-x-auto">
          <div className="flex items-center gap-3">
            <h2 className="text-fg font-semibold">{data.items.length} obras</h2>
            <CoverageBadge cobertura={data.cobertura} />
            <span className="text-xs text-muted">corte: {data.corte}</span>
          </div>
          {data.resumen ? (
            <p className="text-xs text-muted mt-1">
              Paralizadas:{" "}
              <NumberWithMetadata
                data={metaNumber(
                  data.resumen.paralizadasPct,
                  "infobras / infobras_public_works",
                  data.corte,
                  data.cobertura,
                  data.matcher,
                )}
                format={(n) => `${n.toFixed(1)}%`}
              />{" "}
              · Con avance físico:{" "}
              <NumberWithMetadata
                data={metaNumber(
                  data.resumen.conAvanceFisicoPct,
                  "infobras / infobras_public_works",
                  data.corte,
                  data.cobertura,
                  data.matcher,
                )}
                format={(n) => `${n.toFixed(1)}%`}
              />
            </p>
          ) : null}

          <table className="mt-6 w-full text-sm">
            <thead className="text-xs text-muted text-left">
              <tr>
                <th className="py-2 pr-3">Código</th>
                <th className="py-2 pr-3">Descripción</th>
                <th className="py-2 pr-3">Entidad</th>
                <th className="py-2 pr-3">Estado</th>
                <th className="py-2 pr-3 text-right">Avance físico</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {data.items.slice(0, 50).map((w: PublicWork) => (
                <tr key={w.codigoInfobras}>
                  <td className="py-2 pr-3 mono-num text-fg-soft">{w.codigoInfobras}</td>
                  <td className="py-2 pr-3 text-fg">{w.descripcion}</td>
                  <td className="py-2 pr-3 text-fg-soft">{w.entidad}</td>
                  <td className="py-2 pr-3">
                    {w.paralizada ? (
                      <span className="text-danger">PARALIZADA</span>
                    ) : (
                      <span className="text-fg-soft">{w.estado}</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right text-fg">
                    {w.avanceFisicoPct != null ? (
                      <NumberWithMetadata
                        data={metaNumber(
                          w.avanceFisicoPct,
                          "infobras / infobras_public_works",
                          data.corte,
                          data.cobertura,
                          data.matcher,
                        )}
                        format={(n) => `${n.toFixed(1)}%`}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length > 50 ? (
            <p className="text-xs text-muted mt-3">Mostrando primeras 50 de {data.items.length} obras.</p>
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
