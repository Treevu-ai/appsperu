import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compras públicas — Follow the Sol",
  description: "Procesos de contratación pública del Perú, con evidencia trazable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
