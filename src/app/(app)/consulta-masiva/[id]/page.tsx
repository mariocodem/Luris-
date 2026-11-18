import { Download } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  FILTROS_DE_RESULTADOS,
  ResultadosDeConsultaMasiva,
  type FiltroDeResultados,
} from '@/modules/plataformas/ui/resultados-de-consulta-masiva';
import { MarcaDeEstadoDeLote } from '@/modules/plataformas/ui/marcas-de-consulta-masiva';
import { ProgresoDeConsultaMasiva } from '@/modules/plataformas/ui/progreso-de-consulta-masiva';
import { EnlaceDeRegreso } from '@/modules/procesos/ui/enlace-de-regreso';
import { formatearDiaYHora } from '@/shared/domain/fechas';
import { Button } from '@/shared/ui/components/button';
import { Encabezado } from '@/shared/ui/components/encabezado';
import { casosDeUso } from '../../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../../_servidor/sesion';
import { avanceDeConsultaMasivaAccion, reintentarConsultaMasivaAccion } from '../acciones';

export const metadata: Metadata = { title: 'Consulta masiva' };

// Depende de la sesión y del avance en cada petición.
export const instant = false;

const ACCIONES = {
  avance: avanceDeConsultaMasivaAccion,
  reintentar: reintentarConsultaMasivaAccion,
};

function leerFiltro(valor: string | string[] | undefined): FiltroDeResultados {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  return FILTROS_DE_RESULTADOS.find((f) => f === texto) ?? 'todos';
}

export default async function PaginaDeUnaConsultaMasiva({
  params,
  searchParams,
}: PageProps<'/consulta-masiva/[id]'>) {
  const sesion = await sesionDeLaPeticion();
  const [{ id }, { ver }] = await Promise.all([params, searchParams]);
  const consulta = await casosDeUso().obtenerConsultaMasiva(sesion, id);
  if (!consulta.ok) {
    if (consulta.error.codigo === 'NO_ENCONTRADO') notFound();
    return <Encabezado titulo="Consulta masiva" descripcion={consulta.error.mensajeUsuario} />;
  }
  const { lote, conteo, items } = consulta.value;

  return (
    <div className="flex max-w-6xl flex-col gap-8">
      <EnlaceDeRegreso href="/consulta-masiva" texto="Consulta masiva" />
      <Encabezado
        titulo={
          <>
            {lote.totalProcesos === 1 ? '1 proceso' : `${lote.totalProcesos} procesos`}{' '}
            <MarcaDeEstadoDeLote estado={lote.estado} />
          </>
        }
        descripcion={`Iniciada el ${formatearDiaYHora(lote.creadoEn)} por ${lote.creadaPorNombre}${
          lote.finalizadaEn ? ` · terminó el ${formatearDiaYHora(lote.finalizadaEn)}` : ''
        }`}
        acciones={
          <>
            <Button variant="outline" asChild>
              <a href={`/consulta-masiva/${lote.id}/exportar?formato=xlsx`} download>
                <Download aria-hidden />
                Exportar a Excel
              </a>
            </Button>
            <Button variant="ghost" asChild>
              <a href={`/consulta-masiva/${lote.id}/exportar?formato=csv`} download>
                CSV
              </a>
            </Button>
          </>
        }
      />
      <ProgresoDeConsultaMasiva
        id={lote.id}
        inicial={{ estado: lote.estado, conteo }}
        acciones={ACCIONES}
      />
      {conteo.porConfirmar > 0 ? (
        <p className="text-sm text-muted-foreground">
          {conteo.porConfirmar === 1
            ? '1 consulta espera que resuelvas la verificación de la plataforma. '
            : `${conteo.porConfirmar} consultas esperan que resuelvas la verificación de la plataforma. `}
          <Link href="/pendientes" className="text-primary underline-offset-4 hover:underline">
            Ir a Pendientes de tu confirmación
          </Link>
          .
        </p>
      ) : null}
      <ResultadosDeConsultaMasiva
        loteId={lote.id}
        items={items}
        conteo={conteo}
        filtro={leerFiltro(ver)}
        acciones={ACCIONES}
      />
    </div>
  );
}
