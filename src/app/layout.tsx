import type { Metadata, Viewport } from "next";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/figtree";
import "./globals.css";

export const metadata: Metadata = {
  title: "Manitos · Profesionales para tu casa",
  description:
    "Pedí plomeros, electricistas y todo tipo de servicios en Córdoba. Recibí presupuestos y elegí el que más te convenga.",
  appleWebApp: { capable: true, title: "Manitos", statusBarStyle: "default" },
  icons: { icon: "/icono-192.png", apple: "/icono-192.png" },
};

export const viewport: Viewport = {
  themeColor: "#1f4fd1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
