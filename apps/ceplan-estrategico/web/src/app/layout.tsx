import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CEPLAN Estratégico - Follow the Sol",
  description: "Planificación estratégica del Estado peruano",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
