type Json = Record<string, unknown>;

function arg(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }
function base(): string { return (process.env.RADAR_EJECUCION_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, ""); }

function action(): "activos" | "ficha" | "operacion" | "mantenimiento" | "integridad" | "evidencia" {
  const value = arg("--accion") ?? "activos";
  if (["activos", "ficha", "operacion", "mantenimiento", "integridad", "evidencia"].includes(value)) return value as ReturnType<typeof action>;
  throw new Error("Acción inválida: activos, ficha, operacion, mantenimiento, integridad o evidencia.");
}
function endpoint(): string {
  const selected = action(); const params = new URLSearchParams();
  const department = arg("--departamento"); const sector = arg("--sector"); const year = arg("--anio");
  if (department) params.set("departamento", department); if (sector) params.set("sector", sector.toUpperCase()); if (year) params.set("anio", year);
  if (selected === "integridad" && process.argv.includes("--estricto")) params.set("estricto", "true");
  const assetId = arg("--activo");
  if (["ficha", "operacion", "mantenimiento"].includes(selected) && !assetId) throw new Error(`--activo es obligatorio para ${selected}.`);
  const path = selected === "activos" ? "/activos" : selected === "ficha" ? `/activos/${encodeURIComponent(assetId!)}` : selected === "operacion" ? `/activos/${encodeURIComponent(assetId!)}/operacion` : selected === "mantenimiento" ? `/activos/${encodeURIComponent(assetId!)}/mantenimiento` : selected === "integridad" ? "/integridad" : "/evidencia-pendiente";
  return `${base()}/api/infraestructura${path}?${params}`;
}

function printAssets(data: Json) {
  const rows = Array.isArray(data.resultados) ? data.resultados as Json[] : [];
  console.table(rows.map((row) => {
    const territory = (row.territorio ?? {}) as Json; const identity = (row.identidad ?? {}) as Json; const stages = (row.etapas ?? {}) as Json;
    return { activo: row.activo, familia: row.familia, cui: identity.cui ?? "No publicado", territorio: [territory.provincia, territory.distrito].filter(Boolean).join(" / ") || "No publicado", cierre: stages.cierre, operador: stages.operador, disponibilidad: stages.disponibilidad };
  }));
  console.log(`Cautela: ${data.cautela ?? ""}`);
}
function printIntegrity(data: Json) { console.table([data.controles as Json]); console.log(`Estado: ${data.estado}`); if (data.bloqueo) console.log(`Bloqueo: ${data.bloqueo}`); }

async function main() {
  const selected = action(); const response = await fetch(endpoint()); const data = await response.json() as Json;
  if (!response.ok && response.status !== 409) throw new Error(`La API devolvió HTTP ${response.status}: ${JSON.stringify(data)}`);
  if (process.argv.includes("--json")) { console.log(JSON.stringify(data, null, 2)); if (response.status === 409) process.exitCode = 2; return; }
  console.log(`ALSOL | Infraestructura que funciona | ${selected}`);
  if (selected === "activos") printAssets(data);
  else if (selected === "integridad") printIntegrity(data);
  else if (selected === "evidencia") console.table((data.resultados ?? []) as Json[]);
  else console.log(JSON.stringify(data, null, 2));
  if (response.status === 409) process.exitCode = 2;
}
main().catch((error) => { console.error("No se pudo consultar infraestructura:", error instanceof Error ? error.message : error); process.exitCode = 1; });
