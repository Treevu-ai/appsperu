import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Radar de inversiones — Follow the Sol",
  description: "Proyectos de inversión pública del Perú, con evidencia trazable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
