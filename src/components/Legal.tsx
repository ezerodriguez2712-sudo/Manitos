import Link from "next/link";
import { Logo } from "@/components/Encabezado";
import { CONFIG } from "@/lib/config";

export function PaginaLegal({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <>
      <header className="bg-marca text-white">
        <div className="contenedor flex h-14 items-center">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <span className="font-titulo text-xl font-extrabold tracking-tight">Manitos</span>
          </Link>
        </div>
        <div className="cinta-metrica h-2" aria-hidden />
      </header>
      <main className="contenedor py-8">
        <article className="tarjeta legal p-6">
          <h1 className="titulo">{titulo}</h1>
          <p className="mt-1 text-sm text-gris">Última actualización: {CONFIG.actualizado}</p>
          <div className="mt-6 space-y-4 leading-relaxed [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
            {children}
          </div>
        </article>
        <PieLegal />
      </main>
    </>
  );
}

export function PieLegal({ claro = false }: { claro?: boolean }) {
  return (
    <p className={`mt-8 text-center text-xs ${claro ? "text-white/60" : "text-gris"}`}>
      © {new Date().getFullYear()} Manitos · {CONFIG.ciudad}
      <br />
      <Link href="/terminos" className="underline">Términos y condiciones</Link>
      {"  ·  "}
      <Link href="/privacidad" className="underline">Privacidad</Link>
    </p>
  );
}
