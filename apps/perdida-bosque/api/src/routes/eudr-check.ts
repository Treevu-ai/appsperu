import { Router } from "express";
import { z } from "zod";
import { evaluarCorteEudr } from "../lib/gfw-client.js";
import { preFiltroGeobosques } from "../lib/geobosques-filter.js";
import { asyncHandler } from "../lib/async-handler.js";

export const eudrCheckRouter = Router();

const GeometrySchema = z.object({
  type: z.enum(["Polygon", "MultiPolygon"]),
  coordinates: z.array(z.any()),
});

const BodySchema = z.object({
  geometry: GeometrySchema,
});

/**
 * Due diligence EUDR real: dado el polígono exacto de una parcela, consulta
 * GFW (Hansen/GLAD, umd_tree_cover_loss) y responde si hubo pérdida de
 * bosque después del corte del art. 9(1)(d) (2020-12-31).
 *
 * No sirve para consultas masivas — cada llamada crea un geostore nuevo en
 * GFW. Para cruces masivos usar perdida_bosque_poligono (Geobosques) y
 * recurrir a esto solo para confirmar el año exacto en casos puntuales.
 */
eudrCheckRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Body inválido", detalle: parsed.error.flatten() });
      return;
    }

    const preFiltro = await preFiltroGeobosques(parsed.data.geometry);
    const resultado = await evaluarCorteEudr(parsed.data.geometry, preFiltro);

    res.json({
      ...resultado,
      corte: "2020-12-31",
      fuente:
        resultado.resueltoCon === "geobosques"
          ? { dataset: "Geobosques (MINAM) — sin pérdida detectada en la zona cubierta, no hizo falta consultar GFW" }
          : { dataset: "umd_tree_cover_loss (Hansen/GLAD, University of Maryland, vía GFW Data API)" },
    });
  })
);
