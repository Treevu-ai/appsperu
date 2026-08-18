import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar de ejecución — Follow the Sol",
  description: "Ejecución presupuestal pública del Perú, con evidencia trazable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
