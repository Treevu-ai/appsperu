/**
 * Página /docs/integridad (AL3-10) — explica qué cuenta como evidencia
 * mínima en la ficha de integridad de infraestructura, qué significa
 * "BLOQUEADO_POR_EVIDENCIA" y por qué no es un score.
 *
 * Contenido estático, alineado con
 * `apps/radar-ejecucion/api/src/routes/infrastructure.ts` (`/integridad`).
 */
import { Link } from "react-router-dom";

export function DocsIntegridad() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <p className="text-xs text-muted font-mono">DOCUMENTACIÓN</p>
      <h1 className="font-serif text-3xl text-fg mt-2">Integridad de infraestructura</h1>
      <p className="text-fg-soft mt-4">
        La ficha de integridad (<code className="mono-num text-fg">/distrito/{"{ubigeo}"}/integridad</code>) reporta
        si los activos de infraestructura materializados en Rastro tienen una cadena documental mínima: recepción o
        cierre, operador asignado, mantenimiento y disponibilidad registrados.
      </p>

      <section className="mt-8 space-y-4">
        <div>
          <h2 className="text-fg font-semibold">¿Qué cuenta como evidencia mínima?</h2>
          <ul className="mt-2 space-y-1 text-sm text-fg-soft list-disc list-inside">
            <li>
              <strong className="text-fg">Cierre o recepción</strong>: al menos un acta o documento de recepción/cierre
              registrado para el activo.
            </li>
            <li>
              <strong className="text-fg">Operador</strong>: al menos una asignación de operador documentada, con
              nombre y rol.
            </li>
            <li>
              <strong className="text-fg">Mantenimiento</strong>: al menos un registro de evidencia de mantenimiento
              (contrato, actividad presupuestal o similar).
            </li>
            <li>
              <strong className="text-fg">Disponibilidad</strong>: al menos una observación de estado operativo
              registrada.
            </li>
            <li>
              <strong className="text-fg">Indicador de servicio</strong>: al menos un indicador cuantitativo o textual
              del servicio que presta el activo.
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-fg font-semibold">¿Qué significa "BLOQUEADO_POR_EVIDENCIA"?</h2>
          <p className="text-sm text-fg-soft mt-2">
            Significa que no todos los activos materializados para ese departamento tienen cierre, operador y
            disponibilidad documentados simultáneamente. Con <code className="mono-num text-fg">estricto=true</code>,
            la API responde HTTP 409 en ese caso — es una señal para el consumidor (CI o esta UI) de que la evidencia
            todavía no alcanza el mínimo, no un error técnico.
          </p>
        </div>

        <div>
          <h2 className="text-fg font-semibold">¿Por qué no es un score?</h2>
          <p className="text-sm text-fg-soft mt-2">
            La ficha cuenta presencia o ausencia de documentos, no evalúa calidad, seguridad, impacto económico ni
            desempeño. Un activo con cadena documental completa puede tener mala calidad de servicio; uno con cadena
            incompleta puede estar funcionando bien pero sin que Rastro tenga evidencia materializada de eso. La
            ausencia de un documento es un vacío de evidencia, no una conclusión sobre el activo.
          </p>
        </div>
      </section>

      <p className="mt-10 text-sm">
        <Link to="/distrito/130101/integridad" className="text-accent underline-offset-2 hover:underline">
          Ver un ejemplo (La Libertad)
        </Link>
      </p>
    </div>
  );
}
