function arg(name: string): string | undefined { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; }

async function main(): Promise<void> {
  const base = (process.env.RADAR_EJECUCION_API_URL ?? "http://127.0.0.1:4000").replace(/\/+$/, "");
  const params = new URLSearchParams({ anio: arg("--anio") ?? "2026", departamento: arg("--departamento") ?? "LA LIBERTAD" });
  const sectors = arg("--sectores"); if (sectors) params.set("sectores", sectors);
  const response = await fetch(`${base}/api/sectores/movimiento-presupuestal?${params}`);
  if (!response.ok) throw new Error(`La API devolvió HTTP ${response.status}: ${await response.text()}`);
  const data = await response.json() as { narrativa: string[]; universos: unknown[]; sectores: unknown[]; cortesUsados: string[]; limitacion: string };
  if (process.argv.includes("--json")) { console.log(JSON.stringify(data, null, 2)); return; }
  console.log("ALSOL | Cómo se mueve el presupuesto");
  for (const paragraph of data.narrativa) console.log(`\n${paragraph}`);
  console.log("\nSectores con mayor PIM dentro de cada universo:"); console.table(data.sectores);
  console.log(`Cortes usados: ${data.cortesUsados.join(", ") || "no publicados"}`);
  console.log(data.limitacion);
}

main().catch((error) => { console.error("No se pudo explicar el movimiento presupuestal:", error instanceof Error ? error.message : error); process.exitCode = 1; });
