import { describe, expect, it } from "vitest";
import { onRequestDelete, onRequestGet } from "../api/admin/solicitudes.js";

const ADMIN_EMAIL = "acuba0103@gmail.com";

function inMemoryKv(seed: Record<string, { value: string; expiration?: number }> = {}): KVNamespace {
  const store = new Map(Object.entries(seed));
  return {
    async get(key) {
      return store.has(key) ? store.get(key)!.value : null;
    },
    async put(key, value) {
      store.set(key, { value });
    },
    async delete(key) {
      store.delete(key);
    },
    async list() {
      return {
        keys: [...store.entries()].map(([name, v]) => ({ name, expiration: v.expiration })),
        list_complete: true,
      };
    },
  };
}

function makeContext(
  method: string,
  url: string,
  env: Partial<PagesEnv>,
  headers: Record<string, string> = {},
): PagesEventContext {
  return {
    request: new Request(url, { method, headers }),
    env: { RATE_LIMIT: inMemoryKv(), ACCESS_REQUESTS: inMemoryKv(), ...env },
    params: {},
    waitUntil: () => {},
  };
}

const SOLICITUD_1 = {
  value: JSON.stringify({
    nombre: "Ricardo Cuba",
    correo: "ricardo@example.com",
    telefono: "+51 999 999 999",
    motivo: "Investigación periodística sobre contratos públicos.",
    ip: "1.2.3.4",
    creadoEn: "2026-09-20T10:00:00.000Z",
  }),
  expiration: 1234567890,
};

const SOLICITUD_2 = {
  value: JSON.stringify({
    nombre: "Otra Persona",
    correo: "otra@example.com",
    telefono: "+51 988 888 888",
    motivo: "Auditoría de obras paralizadas en la región.",
    ip: "5.6.7.8",
    creadoEn: "2026-09-22T10:00:00.000Z",
  }),
};

describe("GET /api/admin/solicitudes", () => {
  it("rechaza con 403 sin el header de Access", async () => {
    const kv = inMemoryKv({ "solicitud:1": SOLICITUD_1 });
    const res = await onRequestGet(makeContext("GET", "https://rastro.fyi/api/admin/solicitudes", { ACCESS_REQUESTS: kv }));
    expect(res.status).toBe(403);
  });

  it("rechaza con 403 si el email de Access no es el admin", async () => {
    const kv = inMemoryKv({ "solicitud:1": SOLICITUD_1 });
    const res = await onRequestGet(
      makeContext("GET", "https://rastro.fyi/api/admin/solicitudes", { ACCESS_REQUESTS: kv }, {
        "Cf-Access-Authenticated-User-Email": "otro@example.com",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("con el admin autenticado, devuelve las solicitudes ordenadas por más reciente primero", async () => {
    const kv = inMemoryKv({ "solicitud:1": SOLICITUD_1, "solicitud:2": SOLICITUD_2 });
    const res = await onRequestGet(
      makeContext("GET", "https://rastro.fyi/api/admin/solicitudes", { ACCESS_REQUESTS: kv }, {
        "Cf-Access-Authenticated-User-Email": ADMIN_EMAIL,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; total: number; items: { nombre: string; key: string }[] };
    expect(body.ok).toBe(true);
    expect(body.total).toBe(2);
    expect(body.items[0].nombre).toBe("Otra Persona"); // creadoEn más reciente
    expect(body.items[1].nombre).toBe("Ricardo Cuba");
  });
});

describe("DELETE /api/admin/solicitudes", () => {
  it("rechaza con 403 sin auth", async () => {
    const kv = inMemoryKv({ "solicitud:1": SOLICITUD_1 });
    const res = await onRequestDelete(
      makeContext("DELETE", "https://rastro.fyi/api/admin/solicitudes?key=solicitud:1", { ACCESS_REQUESTS: kv }),
    );
    expect(res.status).toBe(403);
  });

  it("rechaza con 400 si falta key o no tiene el prefijo esperado", async () => {
    const kv = inMemoryKv({ "solicitud:1": SOLICITUD_1 });
    const res = await onRequestDelete(
      makeContext("DELETE", "https://rastro.fyi/api/admin/solicitudes?key=otra-cosa", { ACCESS_REQUESTS: kv }, {
        "Cf-Access-Authenticated-User-Email": ADMIN_EMAIL,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("con admin autenticado y key válida, borra la solicitud", async () => {
    const kv = inMemoryKv({ "solicitud:1": SOLICITUD_1 });
    const res = await onRequestDelete(
      makeContext("DELETE", "https://rastro.fyi/api/admin/solicitudes?key=solicitud:1", { ACCESS_REQUESTS: kv }, {
        "Cf-Access-Authenticated-User-Email": ADMIN_EMAIL,
      }),
    );
    expect(res.status).toBe(200);
    expect(await kv.get("solicitud:1")).toBeNull();
  });
});
