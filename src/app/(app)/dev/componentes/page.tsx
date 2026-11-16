import { FolderOpen, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Button } from '@/shared/ui/components/button';
import { Campo, Selector } from '@/shared/ui/components/campo';
import { Encabezado, TituloDeSeccion } from '@/shared/ui/components/encabezado';
import { EstadoVacio } from '@/shared/ui/components/estado-vacio';
import { RadicadoCopiable } from '@/shared/ui/components/radicado-copiable';
import { SelloDeFecha } from '@/shared/ui/components/sello-de-fecha';
import { BotonesDeAviso } from './botones-de-aviso';

export const metadata: Metadata = { title: 'Componentes', robots: { index: false } };

/**
 * Catálogo de componentes SOLO para desarrollo: revisar el sistema de diseño en los 4 anchos y
 * los 2 temas. En producción no existe. Los datos son de ejemplo y así se rotulan.
 */
const ACTUACIONES_DE_EJEMPLO = [
  {
    alias: 'Restitución de inmueble arrendado',
    actuacion: 'Auto admite demanda · 1 documento',
    radicado: '11001310300120230012300',
    plataforma: 'Rama Judicial',
    actuacionEn: '2026-11-10',
    registroEn: '2026-11-13',
    nueva: true,
  },
  {
    alias: 'Ordinario laboral — reintegro',
    actuacion: 'Fijación en estado No. 142',
    radicado: '05001310500220240004500',
    plataforma: 'Rama Judicial',
    actuacionEn: '2026-11-13',
    registroEn: '2026-11-13',
    nueva: true,
  },
  {
    alias: 'Nulidad y restablecimiento del derecho',
    actuacion: 'Al despacho para fallo',
    radicado: '11001333502020230015600',
    plataforma: 'SAMAI',
    actuacionEn: '2026-11-05',
    registroEn: '2026-11-06',
    nueva: false,
  },
] as const;

export default function PaginaDeComponentes() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <>
      <Encabezado
        titulo="Componentes"
        descripcion="Catálogo del sistema de diseño de LURIS para desarrollo. Los datos de esta página son de ejemplo."
        acciones={
          <>
            <Button variant="outline">Secundaria</Button>
            <Button>
              <Plus aria-hidden />
              Acción principal
            </Button>
          </>
        }
      />

      <section aria-labelledby="t-sello" className="flex flex-col gap-3">
        <TituloDeSeccion id="t-sello">Sello de fecha oficial y radicado</TituloDeSeccion>
        <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border bg-card p-5">
          <SelloDeFecha etiqueta="Registro" fecha="2026-11-13" estampar />
          <SelloDeFecha etiqueta="Actuación" fecha="2026-11-10" />
          <RadicadoCopiable valor="11001-31-03-001-2023-00123-00" />
          <RadicadoCopiable valor="110016000049202300123" tipo="nunc" />
        </div>
      </section>

      <section aria-labelledby="t-tabla" className="flex flex-col gap-3">
        <TituloDeSeccion id="t-tabla" detalle="Datos de ejemplo">
          Actuaciones recientes
        </TituloDeSeccion>

        {/* Escritorio: tabla. Las columnas nunca se mueven; lo nuevo solo cambia el estilo de la fila. */}
        <div className="hidden overflow-hidden rounded-xl border border-border bg-card lg:block">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-5 py-3">
                  Proceso
                </th>
                <th scope="col" className="px-5 py-3">
                  Radicado
                </th>
                <th scope="col" className="px-5 py-3">
                  Plataforma
                </th>
                <th scope="col" className="px-5 py-3">
                  Fecha oficial
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ACTUACIONES_DE_EJEMPLO.map((fila) => (
                <tr key={fila.radicado} className={fila.nueva ? 'bg-nuevo-suave/60' : ''}>
                  <td className="px-5 py-4">
                    <p className="font-semibold">{fila.alias}</p>
                    <p className="text-muted-foreground">
                      {fila.nueva ? (
                        <span className="font-semibold text-nuevo-texto">Nueva · </span>
                      ) : null}
                      {fila.actuacion}
                    </p>
                  </td>
                  <td className="px-5 py-4">
                    <RadicadoCopiable valor={fila.radicado} />
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{fila.plataforma}</td>
                  <td className="px-5 py-4">
                    <SelloDeFecha
                      etiqueta="Registro"
                      fecha={fila.registroEn}
                      estampar={fila.nueva}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Móvil y tableta: tarjetas (§11). */}
        <ul className="grid gap-3 md:grid-cols-2 lg:hidden">
          {ACTUACIONES_DE_EJEMPLO.map((fila) => (
            <li
              key={fila.radicado}
              className={
                fila.nueva
                  ? 'flex flex-col gap-3 rounded-xl border border-nuevo/50 bg-card p-4'
                  : 'flex flex-col gap-3 rounded-xl border border-border bg-card p-4'
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{fila.alias}</p>
                  <p className="text-sm text-muted-foreground">
                    {fila.nueva ? (
                      <span className="font-semibold text-nuevo-texto">Nueva · </span>
                    ) : null}
                    {fila.actuacion}
                  </p>
                </div>
                <SelloDeFecha etiqueta="Registro" fecha={fila.registroEn} estampar={fila.nueva} />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                <RadicadoCopiable valor={fila.radicado} />
                <span className="text-xs text-muted-foreground">{fila.plataforma}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="t-botones" className="flex flex-col gap-3">
        <TituloDeSeccion id="t-botones">Botones y avisos</TituloDeSeccion>
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap gap-2">
            <Button>Principal</Button>
            <Button variant="outline">Contorno</Button>
            <Button variant="secondary">Secundario</Button>
            <Button variant="ghost">Discreto</Button>
            <Button
              variant="ghost"
              className="text-destructive hover:bg-error-suave hover:text-destructive"
            >
              Destructivo
            </Button>
            <Button disabled>Deshabilitado</Button>
          </div>
          <BotonesDeAviso />
        </div>
      </section>

      <section aria-labelledby="t-campos" className="flex flex-col gap-3">
        <TituloDeSeccion id="t-campos">Campos</TituloDeSeccion>
        <div className="grid gap-4 rounded-xl border border-border bg-card p-5 md:grid-cols-3">
          <Campo etiqueta="Correo electrónico" placeholder="nombre@despacho.com" />
          <Campo
            etiqueta="Radicado"
            defaultValue="1100131030012023"
            errores={['El radicado debe tener 23 números; este tiene 16.']}
          />
          <Selector etiqueta="Rol" defaultValue="abogado">
            <option value="administrador">Administrador</option>
            <option value="abogado">Abogado</option>
            <option value="asistente">Asistente</option>
          </Selector>
        </div>
      </section>

      <EstadoVacio
        icono={FolderOpen}
        titulo="Todavía no hay procesos registrados"
        descripcion="Estado vacío: dice qué aparecerá aquí y cuál es el siguiente paso."
        accion={<Button variant="outline">Registrar un proceso</Button>}
      />
    </>
  );
}
