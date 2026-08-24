type TerritorialRow = {
  province: string;
  district: string | null;
  contracts: number;
  totalAmount: number;
  averageAmount: number;
  suppliers: number;
  cr1: number;
  cr3: number;
};

import { pool } from "../db/pool.js";

type TerritorialResponse = {
  scope: { department: string; year: number; category: string; dateBasis: string };
  totals: { contracts: number; totalAmount: number; averageAmount: number; suppliers: number };
  byProvince: TerritorialRow[];
  byDistrict: TerritorialRow[];
  limitation: string;
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function soles(value: number): string {
  return new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN", maximumFractionDigits: 0 }).format(value);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function territorialAggregationQuery(level: "province" | "district", where: string): string {
  const keys = level === "province" ? "province" : "province, district";
  const district = level === "province" ? "NULL::text AS district" : "t.district";
  const join = level === "province" ? "pc.province = t.province" : "pc.province = t.province AND pc.district = t.district";
  return `
    WITH filtered AS (
      SELECT COALESCE(c.execution_province, 'NO PUBLICADA') AS province,
             COALESCE(c.execution_district, 'NO PUBLICADO') AS district,
             c.winning_supplier_id, c.awarded_amount
      FROM minor_contracts c JOIN municipalities m ON m.municipality_id = c.municipality_id
      ${where}
    ), territories AS (
      SELECT ${keys}, COUNT(*)::integer AS contracts, COALESCE(SUM(awarded_amount), 0) AS total_amount,
             COALESCE(AVG(awarded_amount), 0) AS average_amount,
             COUNT(DISTINCT winning_supplier_id)::integer AS supplier_count
      FROM filtered GROUP BY ${keys}
    ), supplier_spend AS (
      SELECT ${keys}, winning_supplier_id, SUM(awarded_amount) AS supplier_amount
      FROM filtered WHERE winning_supplier_id IS NOT NULL GROUP BY ${keys}, winning_supplier_id
    ), ranked AS (
      SELECT *, ROW_NUMBER() OVER (PARTITION BY ${keys} ORDER BY supplier_amount DESC, winning_supplier_id) AS position FROM supplier_spend
    ), concentration AS (
      SELECT ${keys}, MAX(supplier_amount) FILTER (WHERE position = 1) AS cr1_amount,
             SUM(supplier_amount) FILTER (WHERE position <= 3) AS cr3_amount FROM ranked GROUP BY ${keys}
    )
    SELECT t.province, ${district}, t.contracts, t.total_amount, t.average_amount, t.supplier_count,
           COALESCE(pc.cr1_amount / NULLIF(t.total_amount, 0), 0) AS cr1,
           COALESCE(pc.cr3_amount / NULLIF(t.total_amount, 0), 0) AS cr3
    FROM territories t LEFT JOIN concentration pc ON ${join}
    ORDER BY t.total_amount DESC, t.province, ${level === "province" ? "t.province" : "t.district"}`;
}

async function main(): Promise<void> {
  const year = Number(arg("--anio") ?? "2026");
  const dateBasis = arg("--base-fecha") ?? "source_year";
  if (!Number.isInteger(year) || year < 2020 || year > 2100) throw new Error("--anio debe ser un año entre 2020 y 2100.");
  if (dateBasis !== "source_year" && dateBasis !== "publication_year") throw new Error("--base-fecha debe ser source_year o publication_year.");
  const category = arg("--categoria");
  const limit = Number(arg("--limite") ?? "50");
  if (category && category !== "goods" && category !== "services") throw new Error("--categoria debe ser goods o services.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("--limite debe ser un entero entre 1 y 500.");
  const values: unknown[] = ["LA LIBERTAD"];
  const conditions = ["m.department = $1", "c.execution_department = $1"];
  if (category) { values.push(category); conditions.push(`c.category = $${values.length}`); }
  values.push(year);
  conditions.push(dateBasis === "source_year" ? `c.year = $${values.length}` : `EXTRACT(YEAR FROM c.publication_date) = $${values.length}`);
  const where = `WHERE ${conditions.join(" AND ")}`;
  const [total, provinces, districts] = await Promise.all([
    pool.query(`SELECT COUNT(*)::integer AS contracts, COALESCE(SUM(c.awarded_amount), 0) AS total_amount, COALESCE(AVG(c.awarded_amount), 0) AS average_amount, COUNT(DISTINCT c.winning_supplier_id)::integer AS supplier_count FROM minor_contracts c JOIN municipalities m ON m.municipality_id = c.municipality_id ${where}`, values),
    pool.query(territorialAggregationQuery("province", where), values),
    pool.query(territorialAggregationQuery("district", where), values),
  ]);
  const map = (row: Record<string, unknown>): TerritorialRow => ({ province: String(row.province), district: row.district === null ? null : String(row.district), contracts: Number(row.contracts), totalAmount: Number(row.total_amount), averageAmount: Number(row.average_amount), suppliers: Number(row.supplier_count), cr1: Number(row.cr1), cr3: Number(row.cr3) });
  const totals = total.rows[0] ?? { contracts: 0, total_amount: 0, average_amount: 0, supplier_count: 0 };
  const data: TerritorialResponse = {
    scope: { department: "LA LIBERTAD", year, category: category ?? "all", dateBasis },
    totals: { contracts: Number(totals.contracts), totalAmount: Number(totals.total_amount), averageAmount: Number(totals.average_amount), suppliers: Number(totals.supplier_count) },
    byProvince: provinces.rows.map(map), byDistrict: districts.rows.map(map),
    limitation: "Los agregados describen sólo el universo materializado. source_year y publication_year no son equivalentes; elija la base temporal según la pregunta analítica.",
  };

  console.log(`ALSOL | Contratos menores por territorio — ${data.scope.department}`);
  console.log(`Año: ${data.scope.year} | base temporal: ${data.scope.dateBasis} | categoría: ${data.scope.category}`);
  console.table([{
    contratos: data.totals.contracts,
    "monto adjudicado": soles(data.totals.totalAmount),
    "monto promedio": soles(data.totals.averageAmount),
    proveedores: data.totals.suppliers,
  }]);
  console.log(`\nProvincias (hasta ${limit}):`);
  console.table(data.byProvince.slice(0, limit).map((row) => ({
    provincia: row.province, contratos: row.contracts, "monto adjudicado": soles(row.totalAmount),
    proveedores: row.suppliers, "CR1 (descriptivo)": pct(row.cr1), "CR3 (descriptivo)": pct(row.cr3),
  })));
  console.log(`\nDistritos (hasta ${limit}):`);
  console.table(data.byDistrict.slice(0, limit).map((row) => ({
    provincia: row.province, distrito: row.district ?? "NO PUBLICADO", contratos: row.contracts,
    "monto adjudicado": soles(row.totalAmount), proveedores: row.suppliers,
    "CR1 (descriptivo)": pct(row.cr1), "CR3 (descriptivo)": pct(row.cr3),
  })));
  console.log(data.limitation);
}

main().catch((error) => {
  console.error("No se pudo generar el tablero territorial:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => pool.end());
