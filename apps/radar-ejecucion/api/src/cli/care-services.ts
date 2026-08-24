type Service = {
  id: string;
  tipo: string;
  servicio: string;
  entidadResponsable: string;
  periodo: string;
  infraestructura: { cui: string | null; estadoCui: string; estadoObra: string; obras: Array<{ nombre: string; distrito: string | null; estadoEjecucion: string | null }> };
  atencion: { estudiantesPublicados: number | null; institucionesPublicadas: number | null; comitesCompraPublicados: number | null; lotesPublicados: number | null; lotesAdjudicadosPublicados: number | null; estadoEvidenciaEntrega: string; entregasEvidenciadas: number };
  proveedores: { proveedoresConRucVinculadoOficialmente: number; estado: string };
  territorios: Array<{ provincia: string | null; distrito: string | null }>;
  limitacion: string;
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function endpoint(): string {
  const base = (process.env.RADAR_EJECUCION_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
  const serviceId = arg("--servicio");
  const params = new URLSearchParams({ departamento: arg("--departamento") ?? "LA LIBERTAD" });
  const type = arg("--tipo");
  if (type) params.set("tipo", type.toUpperCase());
  return `${base}/api/servicios-cuidados${serviceId ? `/${encodeURIComponent(serviceId)}` : ""}?${params}`;
}

function territory(service: Service): string {
  const places = service.territorios.map((item) => [item.provincia, item.distrito].filter(Boolean).join(" / ")).filter(Boolean);
  return places.length ? places.join(", ") : "Cobertura sin distrito publicado";
}

function attention(service: Service): string {
  if (service.tipo === "ALIMENTACION") {
    const lots = service.atencion.lotesPublicados === null ? "lotes no publicados" : `${service.atencion.lotesAdjudicadosPublicados ?? 0}/${service.atencion.lotesPublicados} lotes adjudicados`;
    return `${service.atencion.estudiantesPublicados ?? "sin cifra"} estudiantes | ${service.atencion.institucionesPublicadas ?? "sin cifra"} colegios | ${lots}`;
  }
  return service.infraestructura.cui ? `CUI ${service.infraestructura.cui} | obra: ${service.infraestructura.estadoObra}` : "CUI no publicado en la fuente";
}

async function main(): Promise<void> {
  const response = await fetch(endpoint());
  if (!response.ok) throw new Error(`La API devolvió HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json() as { resultados?: Service[] } & Service;
  if (process.argv.includes("--json")) { console.log(JSON.stringify(data, null, 2)); return; }
  const services = data.resultados ?? [data as Service];
  console.log("ALSOL | Servicios que cuidan");
  console.table(services.map((service) => ({
    tipo: service.tipo,
    servicio: service.servicio,
    entidad: service.entidadResponsable,
    "CUI / atención": attention(service),
    territorio: territory(service),
    "RUC proveedores": `${service.proveedores.proveedoresConRucVinculadoOficialmente} (${service.proveedores.estado})`,
    "entregas evidenciadas": `${service.atencion.entregasEvidenciadas} (${service.atencion.estadoEvidenciaEntrega})`,
  })));
  for (const service of services) console.log(`\n${service.id}: ${service.limitacion}`);
}

main().catch((error) => {
  console.error("No se pudo consultar el registro de servicios que cuidan:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
