'use client';

import { PantallaDeError } from '@/shared/ui/pantalla-de-error';

export default function ErrorDeRuta({ error, retry }: { error: unknown; retry: () => void }) {
  return <PantallaDeError error={error} retry={retry} />;
}
