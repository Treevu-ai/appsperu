import { describe, expect, it } from "vitest";
import {
  MCP_DATABASE_NAME,
  connectionStringFor,
  databaseNameFor,
  getMcpPool,
  getPoolForApp,
  withDatabase,
} from "../db/neon-env.js";
import { APP_KEYS } from "../apps.js";

const BASE = "postgresql://rastro:p%40ss@ep-cool-rain.us-east-2.aws.neon.tech/postgres?sslmode=require&channel_binding=require";

describe("databaseNameFor", () => {
  it("deriva el nombre de la base del AppKey", () => {
    expect(databaseNameFor("radar-ejecucion")).toBe("radar_ejecucion");
    expect(databaseNameFor("senace-cartera-proyectos")).toBe("senace_cartera_proyectos");
  });

  it("produce nombres válidos de Postgres para todas las apps del catálogo", () => {
    for (const app of APP_KEYS) {
      expect(databaseNameFor(app)).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("withDatabase", () => {
  it("sustituye solo el nombre de la base", () => {
    const result = withDatabase(BASE, "radar_ejecucion");
    expect(result).toContain("/radar_ejecucion?");
    expect(result).toContain("sslmode=require");
    expect(result).toContain("channel_binding=require");
    expect(result).toContain("ep-cool-rain.us-east-2.aws.neon.tech");
  });

  it("no deja sufijo de la base anterior", () => {
    expect(withDatabase(withDatabase(BASE, "infobras"), "mimp")).not.toContain("infobras");
  });
});

describe("connectionStringFor", () => {
  it("devuelve null sin secret", () => {
    expect(connectionStringFor({}, "mimp")).toBeNull();
    expect(connectionStringFor({ NEON_DATABASE_URL: "" }, "mimp")).toBeNull();
  });

  it("devuelve null ante un secret malformado, sin lanzar", () => {
    expect(connectionStringFor({ NEON_DATABASE_URL: "no-es-una-url" }, "mimp")).toBeNull();
  });

  it("apunta a la base pedida", () => {
    const url = connectionStringFor({ NEON_DATABASE_URL: BASE }, "identidad_fiscal");
    expect(url).toContain("/identidad_fiscal?");
  });
});

describe("pools", () => {
  it("crea pool de app y de auth con bases distintas", () => {
    const env = { NEON_DATABASE_URL: BASE };
    expect(getPoolForApp(env, "infobras")).not.toBeNull();
    expect(getMcpPool(env)).not.toBeNull();
  });

  it("no crea pools sin secret", () => {
    expect(getPoolForApp({}, "infobras")).toBeNull();
    expect(getMcpPool({})).toBeNull();
  });

  it("la base de auth se llama mcp y no colisiona con una app", () => {
    expect(MCP_DATABASE_NAME).toBe("mcp");
    expect(APP_KEYS.map(databaseNameFor)).not.toContain(MCP_DATABASE_NAME);
  });
});
