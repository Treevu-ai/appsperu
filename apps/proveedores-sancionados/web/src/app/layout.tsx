import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Proveedores sancionados — Follow the Sol",
  description: "Inhabilitaciones y multas del Tribunal de Contrataciones (RNP/OECE), cruzadas con compras públicas.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
