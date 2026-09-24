import { describe, expect, it } from "vitest";
import { onRequestPost } from "../api/solicitud-acceso.js";

function inMemoryKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
    async list() {
      return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true };
    },
  };
}

const VALIDO = {
  nombre: "Ricardo Cuba",
  correo: "ricardo@example.com",
  telefono: "+51 999 999 999",
  motivo: "Necesito consultar contratos públicos de La Libertad para un reportaje de investigación periodística.",
  tipoUso: "prensa",
  frecuenciaUso: "ocasional",
};

function makeContext(body: unknown, env: Partial<PagesEnv> = {}): PagesEventContext {
  return {
    request: new Request("https://rastro.fyi/api/solicitud-acceso", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    env: { RATE_LIMIT: inMemoryKv(), ACCESS_REQUESTS: inMemoryKv(), ...env },
    params: {},
    waitUntil: () => {},
  };
}

function spyKv(): { kv: KVNamespace; store: Map<string, string>; puts: KVNamespacePutOptions[] } {
  const store = new Map<string, string>();
  const puts: KVNamespacePutOptions[] = [];
  return {
    store,
    puts,
    kv: {
      async get(key) {
        return store.has(key) ? store.get(key)! : null;
      },
      async put(key, value, options) {
        store.set(key, value);
        puts.push(options ?? {});
      },
      async delete(key) {
        store.delete(key);
      },
      async list() {
        return { keys: [...store.keys()].map((name) => ({ name })), list_complete: true };
      },
    },
  };
}

describe("POST /api/solicitud-acceso", () => {
  it("guarda una solicitud válida en ACCESS_REQUESTS y responde 201", async () => {
    const { kv, store } = spyKv();
    const res = await onRequestPost(makeContext(VALIDO, { ACCESS_REQUESTS: kv }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(store.size).toBe(1);
  });

  it("persiste nombre, correo, teléfono y motivo tal como se enviaron", async () => {
    const { kv, store } = spyKv();
    await onRequestPost(makeContext(VALIDO, { ACCESS_REQUESTS: kv }));
    const saved = JSON.parse([...store.values()][0]);
    expect(saved).toMatchObject(VALIDO);
    expect(saved.creadoEn).toEqual(expect.any(String));
  });

  it("guarda con expirationTtl de 90 días — no persiste PII indefinidamente", async () => {
    const { kv, puts } = spyKv();
    await onRequestPost(makeContext(VALIDO, { ACCESS_REQUESTS: kv }));
    expect(puts).toHaveLength(1);
    expect(puts[0].expirationTtl).toBe(90 * 24 * 60 * 60);
  });

  it("rechaza correo inválido con 400 y no persiste nada", async () => {
    const accessRequests = inMemoryKv();
    const res = await onRequestPost(makeContext({ ...VALIDO, correo: "no-es-un-correo" }, { ACCESS_REQUESTS: accessRequests }));
    expect(res.status).toBe(400);
  });

  it("rechaza motivo demasiado corto", async () => {
    const res = await onRequestPost(makeContext({ ...VALIDO, motivo: "muy corto" }));
    expect(res.status).toBe(400);
  });

  it("rechaza tipoUso fuera del enum permitido", async () => {
    const res = await onRequestPost(makeContext({ ...VALIDO, tipoUso: "otro" }));
    expect(res.status).toBe(400);
  });

  it("rechaza frecuenciaUso fuera del enum permitido", async () => {
    const res = await onRequestPost(makeContext({ ...VALIDO, frecuenciaUso: "diaria" }));
    expect(res.status).toBe(400);
  });

  it("rechaza solicitud sin tipoUso", async () => {
    const { tipoUso, ...sinTipoUso } = VALIDO;
    const res = await onRequestPost(makeContext(sinTipoUso));
    expect(res.status).toBe(400);
  });

  it("rechaza nombre vacío", async () => {
    const res = await onRequestPost(makeContext({ ...VALIDO, nombre: "" }));
    expect(res.status).toBe(400);
  });

  it("rechaza teléfono con letras", async () => {
    const res = await onRequestPost(makeContext({ ...VALIDO, telefono: "llamame porfa" }));
    expect(res.status).toBe(400);
  });

  it("rechaza teléfono con el charset permitido pero sin dígitos suficientes", async () => {
    const res = await onRequestPost(makeContext({ ...VALIDO, telefono: "------" }));
    expect(res.status).toBe(400);
  });

  it("rechaza JSON inválido con 400", async () => {
    const context = makeContext(VALIDO);
    context.request = new Request("https://rastro.fyi/api/solicitud-acceso", { method: "POST", body: "{no-json" });
    const res = await onRequestPost(context);
    expect(res.status).toBe(400);
  });

  it("honeypot lleno responde 200 sin persistir nada (no delata al bot)", async () => {
    const accessRequests = inMemoryKv();
    const res = await onRequestPost(
      makeContext({ ...VALIDO, campoTrampa: "soy-un-bot" }, { ACCESS_REQUESTS: accessRequests }),
    );
    const body = (await res.json()) as { ok: boolean };
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("aplica rate limit por IP (3/min) y devuelve 429 al superarlo", async () => {
    const rateLimit = inMemoryKv();
    const accessRequests = inMemoryKv();
    for (let i = 0; i < 3; i += 1) {
      const res = await onRequestPost(makeContext(VALIDO, { RATE_LIMIT: rateLimit, ACCESS_REQUESTS: accessRequests }));
      expect(res.status).toBe(201);
    }
    const blocked = await onRequestPost(makeContext(VALIDO, { RATE_LIMIT: rateLimit, ACCESS_REQUESTS: accessRequests }));
    expect(blocked.status).toBe(429);
  });
});
