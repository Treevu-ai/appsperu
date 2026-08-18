import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Sin esto, el DOM de un test queda montado para el siguiente test dentro
// del mismo archivo — RTL solo auto-registra este cleanup cuando detecta
// globals de test en `globalThis`, y este proyecto importa `describe/it`
// explícitamente desde "vitest" en vez de usar `test.globals`, así que
// nunca se detectaba. Bug real encontrado al escribir un test cuyo texto
// esperado ("sin dato") coincidía entre dos casos.
afterEach(() => {
  cleanup();
});
