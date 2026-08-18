import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "INFOBRAS — Follow the Sol",
  description: "Obras públicas del Perú: avance, paralización y desviación de costo, con evidencia trazable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
