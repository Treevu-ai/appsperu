import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Identidad fiscal — Follow the Sol",
  description: "Padrón RUC y cruces con proveedores y entidades del Estado, con evidencia trazable.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
