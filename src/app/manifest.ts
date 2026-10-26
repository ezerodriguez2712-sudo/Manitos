import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Manitos",
    short_name: "Manitos",
    description: "Profesionales para tu casa en Córdoba",
    start_url: "/panel",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#e8590c",
    lang: "es-AR",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
