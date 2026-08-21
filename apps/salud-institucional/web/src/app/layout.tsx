import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Salud institucional — Follow the Sol",
  description: "Score compuesto por entidad, cruzando ejecución, obras, inversiones, compras e identidad fiscal.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
