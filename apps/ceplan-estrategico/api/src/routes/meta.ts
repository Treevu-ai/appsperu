import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { probeAplicativoCeplan } from "../lib/aplicativo-probe.js";
import { pool } from "../db/pool.js";

export const metaRouter = Router();

metaRouter.get(
  "/aplicativo",
  asyncHandler(async (_req, res) => {
    const probe = await probeAplicativoCeplan();
    const [indicators, objectives, actions, poiActivities, physicalTargets] = await Promise.all([
      pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM strategic_indicators"),
      pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM strategic_objectives"),
      pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM strategic_actions"),
      pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM poi_activities"),
      pool.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM physical_targets"),
    ]);

    res.json({
      ...probe,
      tablas: {
        strategic_indicators: Number(indicators.rows[0]?.count ?? 0),
        strategic_objectives: Number(objectives.rows[0]?.count ?? 0),
        strategic_actions: Number(actions.rows[0]?.count ?? 0),
        poi_activities: Number(poiActivities.rows[0]?.count ?? 0),
        physical_targets: Number(physicalTargets.rows[0]?.count ?? 0),
      },
    });
  })
);
