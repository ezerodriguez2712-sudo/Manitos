import Link from "next/link";
import { Logo } from "@/components/Encabezado";

export default function NoEncontrado() {
  return (
    <main className="contenedor grid min-h-dvh place-items-center py-12 text-center">
      <div>
        <div className="mx-auto w-fit">
          <Logo grande />
        </div>
        <h1 className="titulo mt-4">Esta página no existe</h1>
        <p className="mt-2 text-gris">Puede que el enlace esté mal escrito o que el pedido ya no esté disponible.</p>
        <Link href="/panel" className="btn mt-6">
          Ir a mis pedidos
        </Link>
      </div>
    </main>
  );
}
