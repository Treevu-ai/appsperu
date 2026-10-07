import "dotenv/config";
import { Pool } from "pg";

const connectionString = process.env.GEO_INTERSECTIONS_DATABASE_URL;
if (!connectionString) {
  throw new Error("GEO_INTERSECTIONS_DATABASE_URL no está definida. Copia .env.example a .env.");
}

/** Pool hacia `geo-intersections` — única fuente con geometría PostGIS real de `forest_titles`. */
export const geoIntersectionsPool = new Pool({ connectionString });
