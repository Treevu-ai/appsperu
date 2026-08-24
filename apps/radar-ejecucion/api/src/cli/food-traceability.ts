type Json = Record<string, unknown>;

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function baseUrl(): string {
  return (process.env.RADAR_EJECUCION_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
}

function action(): "lotes" | "cobertura" | "proveedor" | "integridad" | "evidencia-pendiente" {
  const value = arg("--accion") ?? "lotes";
  if (["lotes", "cobertura", "proveedor", "integridad", "evidencia-pendiente"].includes(value)) return value as ReturnType<typeof action>;
  throw new Error("Acción inválida. Use: lotes, cobertura, proveedor, integridad o evidencia-pendiente.");
}

function endpoint(): string {
  const selected = action();
  const params = new URLSearchParams({ periodo: arg("--periodo") ?? "2025" });
  const status = arg("--estado");
  const province = arg("--provincia");
  const district = arg("--distrito");
  if (status) params.set("estado", status);
  if (province) params.set("provincia", province);
  if (district) params.set("distrito", district);
  if (selected === "integridad" && process.argv.includes("--estricto")) params.set("estricto", "true");
  const supplier = selected === "proveedor" ? `/${encodeURIComponent(arg("--ruc") ?? "")}` : "";
  if (selected === "proveedor" && !/^\d{11}$/.test(arg("--ruc") ?? "")) throw new Error("Para --accion proveedor se requiere --ruc de 11 dígitos.");
  return `${baseUrl()}/api/servicios-cuidados/alimentacion/${selected}${supplier}?${params}`;
}

function printLots(data: Json) {
  const rows = Array.isArray(data.resultados) ? data.resultados as Json[] : [];
  console.table(rows.map((row) => ({
    lote: row.id, comité: row.comite, item: row.item, contrato: row.contrato,
    proveedor_publicado: row.proveedorPublicado ?? "No publicado", ruc: row.ruc ?? "No publicado",
    entrega_referida: row.entregaReferidaNumero ?? "No", estado: row.estadoLote,
  })));
  console.log(`Cautela: ${data.cautela ?? ""}`);
}

function printCoverage(data: Json) {
  const period = (data.periodo ?? {}) as Json;
  console.table([{ colegios_publicados: period.colegiosPublicados ?? "No publicado", colegios_documentados: data.colegiosDocumentados ?? 0, entregas_con_acta: data.entregasConActaDocumentada ?? 0, estado: data.estadoCobertura }]);
  const rows = Array.isArray(data.resultados) ? data.resultados as Json[] : [];
  if (rows.length) console.table(rows);
  console.log(`Límite: ${data.limitacion ?? ""}`);
}

function printIntegrity(data: Json) {
  const controls = (data.controles ?? {}) as Json;
  console.table([controls]);
  console.log(`Estado: ${data.estado ?? ""}`);
  console.log(`Bloqueo: ${data.bloqueo ?? ""}`);
}

async function main() {
  const selected = action();
  const response = await fetch(endpoint());
  const data = await response.json() as Json;
  if (!response.ok && response.status !== 409) throw new Error(`La API devolvió HTTP ${response.status}: ${JSON.stringify(data)}`);
  if (process.argv.includes("--json")) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log(`ALSOL | Alimentación escolar | ${selected}`);
  if (selected === "lotes") printLots(data);
  else if (selected === "cobertura") printCoverage(data);
  else if (selected === "integridad") printIntegrity(data);
  else if (selected === "evidencia-pendiente") console.table((data.resultados ?? []) as Json[]);
  else console.table((data.lotes ?? []) as Json[]);
  if (response.status === 409) process.exitCode = 2;
}

main().catch((error) => {
  console.error("No se pudo consultar la trazabilidad alimentaria:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
