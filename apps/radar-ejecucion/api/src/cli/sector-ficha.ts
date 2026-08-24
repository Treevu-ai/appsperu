function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function endpoint(): string {
  const mode = required("--modo");
  const base = (process.env.RADAR_EJECUCION_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
  const params = new URLSearchParams({ anio: arg("--anio") ?? "2026", departamento: arg("--departamento") ?? "LA LIBERTAD" });
  if (mode === "inventario") { params.set("limit", arg("--limite") ?? "100"); return `${base}/api/sectores/inventory?${params}`; }
  if (mode === "sector") return `${base}/api/sectores/${encodeURIComponent(required("--sector"))}/ficha?${params}`;
  if (mode === "entidad") return `${base}/api/sectores/entidades/${encodeURIComponent(required("--entity-code"))}/ficha?${params}`;
  if (mode === "comparativo") {
    const sectors = required("--sectores"); params.set("sectores", sectors);
    return `${base}/api/sectores/comparativo?${params}`;
  }
  throw new Error("--modo debe ser inventario, sector, entidad o comparativo.");
}

async function main(): Promise<void> {
  const response = await fetch(endpoint());
  if (!response.ok) throw new Error(`La API devolvió HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json() as Record<string, unknown>;
  if (process.argv.includes("--json")) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log("ALSOL | Ficha sectorial");
  if (Array.isArray(data.resultados)) console.table(data.resultados);
  else if (Array.isArray(data.entidades)) console.table(data.entidades);
  else if (data.entidad) console.table([data.entidad]);
  console.log(data.limitation ?? "Revise las fuentes, cortes y vínculos antes de interpretar los montos.");
}

main().catch((error) => { console.error("No se pudo generar la ficha sectorial:", error instanceof Error ? error.message : error); process.exitCode = 1; });
