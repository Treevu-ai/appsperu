import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CEPLAN Estratégico — Follow the Sol",
  description: "Indicadores de gestión estratégica del Estado peruano (CEPLAN/ObservaPerú).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
