import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.js";
import { Buscar } from "./routes/Buscar.js";
import { Distrito } from "./routes/Distrito.js";
import { DocsApi } from "./routes/DocsApi.js";
import { Estado } from "./routes/Estado.js";
import { LaLibertadLayout } from "./routes/gore/LaLibertadLayout.js";
import { LaLibertadFicha } from "./routes/gore/LaLibertadFicha.js";
import { LaLibertadComparativo } from "./routes/gore/LaLibertadComparativo.js";
import { LaLibertadBenchmark } from "./routes/gore/LaLibertadBenchmark.js";
import { Home } from "./routes/Home.js";
import { Proveedor } from "./routes/Proveedor.js";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="gore/la-libertad" element={<LaLibertadLayout />}>
          <Route index element={<Navigate to="ficha" replace />} />
          <Route path="ficha" element={<LaLibertadFicha />} />
          <Route path="comparativo" element={<LaLibertadComparativo />} />
          <Route path="benchmark" element={<LaLibertadBenchmark />} />
        </Route>
        <Route path="proveedor/:ruc" element={<Proveedor />} />
        <Route path="distrito/:ubigeo" element={<Distrito />} />
        <Route path="estado" element={<Estado />} />
        <Route path="docs/api" element={<DocsApi />} />
        <Route path="buscar" element={<Buscar />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24 text-center">
      <h1 className="font-serif text-5xl text-fg">404</h1>
      <p className="mt-4 text-fg-soft">No encontramos esa ruta.</p>
      <a href="/" className="btn-ghost mt-8 inline-flex">
        Volver al inicio
      </a>
    </div>
  );
}
