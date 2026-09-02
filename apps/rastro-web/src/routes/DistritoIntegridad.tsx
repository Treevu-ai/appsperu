import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getRadarEjecucionInfrastructureIntegrity,
  type InfrastructureIntegrityResponse,
} from "../lib/api-client.js";
import { AppUnavailableError } from "../lib/types.js";

// Mismo compromiso documentado en Distrito.tsx: el endpoint de origen filtra
// por departamento, no por distrito exacto. Se mantiene acá por consistencia.
const UBIGEO_DEPARTAMENTO: Record<string, string> = {
  "01": "AMAZONAS", "02": "ANCASH", "03": "APURIMAC", "04": "AREQUIPA", "05": "AYACUCHO",
  "06": "CAJAMARCA", "07": "CALLAO", "08": "CUSCO", "09": "HUANCAVELICA", "10": "HUANUCO",
  "11": "ICA", "12": "JUNIN", "13": "LA LIBERTAD", "14": "LAMBAYEQUE", "15": "LIMA",
  "16": "LORETO", "17": "MADRE DE DIOS", "18": "MOQUEGUA", "19": "PASCO", "20": "PIURA",
  "21": "PUNO", "22": "SAN MARTIN", "23": "TACNA", "24": "TUMBES", "25": "UCAYALI",
};

const CONTROL_LABELS: Record<string, string> = {
  conCierre: "Cierre o recepción",
  conOperador: "Operador asignado",
  conMantenimiento: "Evidencia de mantenimiento",
  conDisponibilidad: "Observación de disponibilidad",
  conIndicadorServicio: "Indicador de servicio",
};

export function DistritoIntegridad() {
  const { ubigeo = "" } = useParams();
  const valid = /^\d{6}$/.test(ubigeo);

  const [data, setData] = useState<InfrastructureIntegrityResponse | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!valid) {
      setLoading(false);
      setErrorMessage("UBIGEO inválido. Debe tener exactamente 6 dígitos.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErrorMessage(null);
    setErrorStatus(null);
    setData(null);
    (async () => {
      try {
        const deptoPrefix = ubigeo.slice(0, 2);
        const deptoNombre = UBIGEO_DEPARTAMENTO[deptoPrefix] ?? null;
        if (!deptoNombre) throw new Error(`Prefijo departamental ${deptoPrefix} no reconocido.`);
        const res = await getRadarEjecucionInfrastructureIntegrity({ departamento: deptoNombre, estricto: true });
        if (!cancelled) setData(res);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AppUnavailableError) {
          // El backend responde 409 con el mismo body cuando estricto=true
          // y falta evidencia — el mensaje trae el HTTP body truncado a 200
          // caracteres (comportamiento del cliente compartido, no de esta
          // página). Es lo mismo que pide el criterio: código + texto.
          setErrorStatus(err.status ?? null);
          setErrorMessage(err.message);
        } else {
          setErrorMessage((err as Error).message);
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
        <h1 className="font-serif text-3xl text-fg">Integridad de infraestructura</h1>
        <p className="text-danger mt-4">{errorMessage ?? "UBIGEO inválido."}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">LECTOR AUDITORÍA · UBIGEO {ubigeo} · estricto=true</p>
      <h1 className="font-serif text-3xl text-fg mt-2">Integridad de infraestructura (alcance departamental)</h1>
      <p className="text-fg-soft mt-2 max-w-3xl">
        Cadena documental mínima (cierre, operador, disponibilidad) por departamento. No es un score de calidad —
        solo presencia o ausencia de evidencia. Ver{" "}
        <Link to="/docs/integridad" className="text-accent underline-offset-2 hover:underline">
          qué cuenta como evidencia mínima
        </Link>
        .
      </p>

      {loading ? <p className="text-muted mt-6">Consultando API…</p> : null}

      {!loading && errorMessage ? (
        <div className="mt-8 card border-danger/30">
          <p className="text-danger font-mono text-sm">
            {errorStatus ? `HTTP ${errorStatus}` : "Error"}
          </p>
          <p className="text-fg-soft text-sm mt-2 whitespace-pre-wrap">{errorMessage}</p>
        </div>
      ) : null}

      {!loading && data ? (
        // Nota: el ticket original (AL3-10) hablaba de "INTEGRIDAD_COMPLETA";
        // el backend real usa "CADENA_MINIMA_DOCUMENTADA" — se muestra el
        // valor real de la API, no el nombre que el ticket anticipó.
        <div className="mt-8 card">
          <div className="flex items-center gap-3">
            <h2 className="text-fg font-semibold">{data.estado}</h2>
            <span
              className={`px-2 py-0.5 rounded border text-xs font-mono uppercase ${
                data.estado === "CADENA_MINIMA_DOCUMENTADA"
                  ? "bg-accent/10 text-accent border-accent/30"
                  : "bg-danger/10 text-danger border-danger/30"
              }`}
            >
              {data.estado}
            </span>
          </div>

          {data.bloqueo ? <p className="text-danger text-sm mt-3">{data.bloqueo}</p> : null}

          <table className="mt-6 w-full text-sm">
            <thead className="text-xs text-muted text-left">
              <tr>
                <th className="py-2 pr-3">Control</th>
                <th className="py-2 pr-3 text-right">Con evidencia</th>
                <th className="py-2 pr-3 text-right">Total activos</th>
                <th className="py-2 pr-3 text-right">Falta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {(["conCierre", "conOperador", "conMantenimiento", "conDisponibilidad", "conIndicadorServicio"] as const).map(
                (key) => {
                  const conEvidencia = data.controles[key];
                  const total = data.controles.activos;
                  const falta = total - conEvidencia;
                  return (
                    <tr key={key}>
                      <td className="py-2 pr-3 text-fg">{CONTROL_LABELS[key]}</td>
                      <td className="py-2 pr-3 text-right mono-num text-fg">{conEvidencia}</td>
                      <td className="py-2 pr-3 text-right mono-num text-fg-soft">{total}</td>
                      <td className={`py-2 pr-3 text-right mono-num ${falta > 0 ? "text-danger" : "text-fg-soft"}`}>
                        {falta}
                      </td>
                    </tr>
                  );
                },
              )}
            </tbody>
          </table>

          <p className="text-xs text-muted mt-4">
            Activos materializados: {data.controles.activos} · Familias: {data.controles.familiasMaterializadas} ·
            Pendientes de revisión: {data.controles.pendientesRevision}
          </p>
          <p className="text-xs text-muted mt-3">{data.cautela}</p>
        </div>
      ) : null}
    </div>
  );
}
