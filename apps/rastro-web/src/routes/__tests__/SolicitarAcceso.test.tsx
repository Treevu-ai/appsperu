// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { server } from "../../test/setup.js";
import { SolicitarAcceso } from "../SolicitarAcceso.js";

// Bajo la suite completa (17 archivos, pool "threads") los tests que tipean
// el formulario dos veces (revisar → confirmar/editar) pueden superar el
// testTimeout global de 15s por contención de CPU, no por lentitud propia
// del componente — ver vite.config.ts. Se sube el límite solo en este
// archivo en vez de tocar la config global.
vi.setConfig({ testTimeout: 30_000 });

function renderForm() {
  return render(
    <MemoryRouter>
      <SolicitarAcceso />
    </MemoryRouter>,
  );
}

async function llenarFormularioValido(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre completo"), "Ricardo Cuba");
  await user.type(screen.getByLabelText("Correo"), "ricardo@example.com");
  await user.type(screen.getByLabelText("Teléfono"), "+51 999 999 999");
  await user.type(
    screen.getByLabelText("Motivo de la solicitud"),
    "Necesito consultar contratos públicos de La Libertad para un reportaje de investigación periodística.",
  );
}

describe("SolicitarAcceso", () => {
  it("no deja avanzar a revisar con el motivo demasiado corto", async () => {
    const user = userEvent.setup();
    renderForm();
    await user.type(screen.getByLabelText("Nombre completo"), "Ricardo Cuba");
    await user.type(screen.getByLabelText("Correo"), "ricardo@example.com");
    await user.type(screen.getByLabelText("Teléfono"), "+51 999 999 999");
    await user.type(screen.getByLabelText("Motivo de la solicitud"), "muy corto");
    await user.click(screen.getByRole("button", { name: "Revisar solicitud" }));

    expect(screen.getByText(/al menos 20 caracteres/)).toBeInTheDocument();
    expect(screen.queryByText("Confirmar y enviar")).not.toBeInTheDocument();
  });

  it("muestra el resumen editable en el paso de revisión con los datos ingresados", async () => {
    const user = userEvent.setup();
    renderForm();
    await llenarFormularioValido(user);
    await user.click(screen.getByRole("button", { name: "Revisar solicitud" }));

    expect(screen.getByText("Ricardo Cuba")).toBeInTheDocument();
    expect(screen.getByText("ricardo@example.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar y enviar" })).toBeInTheDocument();
  });

  it("al confirmar, envía el POST y muestra la confirmación con el correo indicado", async () => {
    server.use(
      http.post("*/api/solicitud-acceso", () => HttpResponse.json({ ok: true }, { status: 201 })),
    );
    const user = userEvent.setup();
    renderForm();
    await llenarFormularioValido(user);
    await user.click(screen.getByRole("button", { name: "Revisar solicitud" }));
    await user.click(screen.getByRole("button", { name: "Confirmar y enviar" }));

    expect(await screen.findByText("Ya recibimos tu solicitud.")).toBeInTheDocument();
    expect(screen.getByText("ricardo@example.com")).toBeInTheDocument();
  });

  it("si el backend rechaza con 400, muestra el error y se queda en el paso de revisión", async () => {
    server.use(
      http.post("*/api/solicitud-acceso", () =>
        HttpResponse.json({ ok: false, error: "El correo no es válido." }, { status: 400 }),
      ),
    );
    const user = userEvent.setup();
    renderForm();
    await llenarFormularioValido(user);
    await user.click(screen.getByRole("button", { name: "Revisar solicitud" }));
    await user.click(screen.getByRole("button", { name: "Confirmar y enviar" }));

    expect(await screen.findByText("El correo no es válido.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar y enviar" })).toBeInTheDocument();
  });

  it("si el backend responde 429, muestra el mensaje de rate limit", async () => {
    server.use(
      http.post(
        "*/api/solicitud-acceso",
        () => new HttpResponse(null, { status: 429, headers: { "Retry-After": "30" } }),
      ),
    );
    const user = userEvent.setup();
    renderForm();
    await llenarFormularioValido(user);
    await user.click(screen.getByRole("button", { name: "Revisar solicitud" }));
    await user.click(screen.getByRole("button", { name: "Confirmar y enviar" }));

    await waitFor(() => expect(screen.getByText(/Demasiadas solicitudes/)).toBeInTheDocument());
  });

  it("el botón Editar vuelve al formulario con los datos conservados", async () => {
    const user = userEvent.setup();
    renderForm();
    await llenarFormularioValido(user);
    await user.click(screen.getByRole("button", { name: "Revisar solicitud" }));
    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Ricardo Cuba");
  });
});
