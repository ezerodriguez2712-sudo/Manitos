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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://manitos-ten.vercel.app"),
  openGraph: {
    title: "Manitos · Profesionales para tu casa en Córdoba",
    description: "Pedí presupuestos a plomeros, electricistas, gasistas y más. Compará y elegí el que te conviene.",
    images: [{ url: "/og.png", width: 1200, height: 630 }],
    locale: "es_AR",
    type: "website",
  },
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
