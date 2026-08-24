import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Evita que Next use C:\Users\acuba como raíz al detectar lockfiles fuera
  // del repo; además mantiene el trazado de producción acotado al workspace.
  outputFileTracingRoot: appRoot,
};

export default nextConfig;
