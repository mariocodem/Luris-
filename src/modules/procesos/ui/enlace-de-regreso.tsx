import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';

/** Enlace discreto para volver a la página anterior en la jerarquía (p. ej. a la lista). */
export function EnlaceDeRegreso({
  href,
  texto,
}: {
  readonly href: string;
  readonly texto: string;
}) {
  return (
    <Link
      href={href}
      className="-ml-1 inline-flex items-center gap-1 self-start rounded-md px-1 py-0.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
    >
      <ChevronLeft className="size-4" aria-hidden />
      {texto}
    </Link>
  );
}
