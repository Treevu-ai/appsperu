type SeguimientoFila = {
  entidadResponsable: string;
  cui: string | null;
  cuiEstado: string;
  actividad: string;
  pim: number;
  devengado: number;
  distritoBeneficiado: string | null;
  distritoBeneficiadoEstado: string;
  alcanceTerritorial: { tipo: string; departamento?: string | null; provincia?: string | null; distrito?: string | null };
  pimCobertura: string;
};

type SeguimientoRespuesta = {
  filtros: { departamento: string; anio: number | null; busqueda: string | null };
  resultados: SeguimientoFila[];
  proyectosTerritoriales: Array<{
    entidadResponsable: string;
    cui: string;
    actividad: string;
    piaLegal: number | null;
    pim: number | null;
    devengado: number | null;
    distritoBeneficiado: string[];
    distritoBeneficiadoEstado: string;
    alertaConsistenciaTerritorial: string | null;
  }>;
};

function arg(nombre: string): string | undefined {
  const index = process.argv.indexOf(nombre);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function soles(valor: number): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(valor);
}

async function main(): Promise<void> {
  const baseUrl = (process.env.RADAR_EJECUCION_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
  const params = new URLSearchParams();
  const anio = arg("--anio");
  const busqueda = arg("--busqueda");
  const departamento = arg("--departamento");
  if (anio) params.set("anio", anio);
  if (busqueda) params.set("busqueda", busqueda);
  if (departamento) params.set("departamento", departamento);

  const response = await fetch(`${baseUrl}/api/lluvias/seguimiento?${params.toString()}`);
  if (!response.ok) throw new Error(`La API devolvió HTTP ${response.status}: ${await response.text()}`);
  const data = (await response.json()) as SeguimientoRespuesta;

  console.log(`ALSOL | Seguimiento ante lluvias — ${data.filtros.departamento}`);
  console.log(`Año: ${data.filtros.anio ?? "todos"} | búsqueda: ${data.filtros.busqueda ?? "sin filtro"} | filas: ${data.resultados.length}`);
  console.table(
    data.resultados.map((fila) => ({
      entidad: fila.entidadResponsable,
      "CUI / actividad": fila.cui ?? `CUI no publicado | ${fila.actividad}`,
      PIM: fila.pimCobertura === "ATRIBUIDO_A_LA_ACTIVIDAD_POR_FILA_MEF" ? soles(fila.pim) : "No atribuible",
      devengado: soles(fila.devengado),
      "distrito beneficiado": fila.distritoBeneficiado ?? `No publicado (${fila.distritoBeneficiadoEstado})`,
      alcance: fila.alcanceTerritorial.tipo === "DEPARTAMENTO_META"
        ? `Meta: ${fila.alcanceTerritorial.departamento}`
        : "Sede ejecutora; no prueba beneficio",
    }))
  );

  if (data.proyectosTerritoriales.length > 0) {
    console.log("\nProyectos territoriales con CUI verificado (no unidos automáticamente a las actividades MEF):");
    console.table(
      data.proyectosTerritoriales.map((proyecto) => ({
        "entidad responsable": proyecto.entidadResponsable,
        "CUI / actividad": `${proyecto.cui} | ${proyecto.actividad}`,
        "PIM - devengado": proyecto.pim === null || proyecto.devengado === null
          ? "No publicado en la fuente de proyecto"
          : `${soles(proyecto.pim)} | ${soles(proyecto.devengado)}`,
        "distrito beneficiado": proyecto.distritoBeneficiado.join(", "),
        "PIA legal": proyecto.piaLegal === null ? "No publicado" : soles(proyecto.piaLegal),
      }))
    );
    for (const proyecto of data.proyectosTerritoriales) {
      if (proyecto.alertaConsistenciaTerritorial) console.log(`Cautela CUI ${proyecto.cui}: ${proyecto.alertaConsistenciaTerritorial}`);
    }
  }
}

main().catch((error) => {
  console.error("No se pudo consultar el tablero de lluvias:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
