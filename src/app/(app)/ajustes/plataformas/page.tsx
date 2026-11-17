import { ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import {
  descripcionDeVerificacion,
  PLATAFORMAS_CON_CREDENCIALES,
  USO_DE_LA_CREDENCIAL,
} from '@/modules/plataformas/domain/credenciales';
import { NOMBRES_DE_PLATAFORMA } from '@/modules/plataformas/domain/plataforma';
import { EliminarCredencial, FormularioDeCredencial } from '@/modules/plataformas/ui/credenciales';
import { EnlaceDeRegreso } from '@/modules/procesos/ui/enlace-de-regreso';
import { alcanceDe } from '@/modules/usuarios/domain/permisos';
import { formatearDia, formatearDiaYHora } from '@/shared/domain/fechas';
import { Encabezado, TituloDeSeccion } from '@/shared/ui/components/encabezado';
import { casosDeUso } from '../../../_servidor/peticion';
import { sesionDeLaPeticion } from '../../../_servidor/sesion';
import { eliminarCredencialAccion, guardarCredencialAccion } from './acciones';

export const metadata: Metadata = { title: 'Plataformas' };

// Depende de la sesión en cada petición.
export const instant = false;

/**
 * Credenciales de plataformas (§4, §6): el abogado registra las suyas y el administrador, también
 * las del despacho. Se guardan cifradas, con consentimiento, y se pueden borrar.
 */
export default async function PaginaDePlataformas() {
  const sesion = await sesionDeLaPeticion();
  const casos = casosDeUso();
  const credenciales = await casos.listarCredenciales(sesion);
  const puedeDelDespacho =
    sesion.perfil !== 'superadmin' &&
    alcanceDe(sesion.perfil, 'CREDENCIALES_GESTIONAR') === 'TODOS';

  return (
    <>
      <div className="flex flex-col gap-4">
        <EnlaceDeRegreso href="/ajustes" texto="Ajustes" />
        <Encabezado
          titulo="Plataformas"
          descripcion="Algunas plataformas solo muestran ciertos documentos a una cuenta registrada. Si guardas tu usuario y contraseña, LURIS los consulta por ti."
        />
      </div>

      {!credenciales.ok ? (
        <p className="max-w-[60ch] text-pretty text-muted-foreground">
          {credenciales.error.mensajeUsuario}
        </p>
      ) : (
        <>
          <ul className="flex max-w-[68ch] flex-col gap-2 text-sm text-pretty text-muted-foreground">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden />
              Las contraseñas se guardan cifradas y nunca se muestran, ni siquiera a ti.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden />
              LURIS consulta a un ritmo bajo y nunca resuelve retos («No soy un robot») por ti.
            </li>
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-exito" aria-hidden />
              Puedes eliminarlas cuando quieras: desde ese momento LURIS deja de usarlas.
            </li>
          </ul>

          {casos.cifradoDeCredencialesConfigurado ? null : (
            <p className="max-w-[68ch] rounded-lg border border-alerta/40 bg-alerta-suave px-3 py-2 text-sm text-pretty">
              Todavía no se pueden guardar contraseñas: falta configurar el cifrado en el servidor.
              Avísale a quien administra LURIS.
            </p>
          )}

          {PLATAFORMAS_CON_CREDENCIALES.map((plataforma) => {
            const deLaPlataforma = credenciales.value.filter((c) => c.plataforma === plataforma);
            const propia = deLaPlataforma.find(
              (c) =>
                c.alcance === 'PERSONAL' &&
                sesion.perfil !== 'superadmin' &&
                c.membresiaId === sesion.membresiaId,
            );
            return (
              <section
                key={plataforma}
                aria-labelledby={`titulo-${plataforma}`}
                className="flex flex-col gap-3"
              >
                <TituloDeSeccion id={`titulo-${plataforma}`}>
                  {NOMBRES_DE_PLATAFORMA[plataforma]}
                </TituloDeSeccion>
                <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
                  <p className="max-w-[68ch] text-sm text-pretty text-muted-foreground">
                    {USO_DE_LA_CREDENCIAL[plataforma]}
                  </p>

                  {deLaPlataforma.length > 0 ? (
                    <ul className="flex flex-col divide-y divide-border border-y border-border">
                      {deLaPlataforma.map((c) => (
                        <li key={c.id} className="flex flex-col gap-1.5 py-3 text-sm">
                          <span className="font-medium">
                            {c.alcance === 'DESPACHO'
                              ? 'Del despacho'
                              : c.membresiaId === propia?.membresiaId
                                ? 'Tuya'
                                : c.titular}
                            {' · '}
                            <span className="font-normal">usuario {c.usuario}</span>
                          </span>
                          <span className="text-muted-foreground">
                            Guardada el{' '}
                            <span className="cifras">{formatearDia(c.actualizadoEn)}</span>
                            {c.alcance === 'DESPACHO' ? ` por ${c.titular}` : ''}
                          </span>
                          <span
                            className={
                              c.estadoVerificacion === 'EXITOSA'
                                ? 'text-exito'
                                : 'text-muted-foreground'
                            }
                          >
                            {descripcionDeVerificacion(c.estadoVerificacion)}
                            {c.verificadaEn ? (
                              <>
                                {' · '}
                                <span className="cifras">{formatearDiaYHora(c.verificadaEn)}</span>
                              </>
                            ) : null}
                          </span>
                          <EliminarCredencial
                            id={c.id}
                            descripcion={`la credencial de ${NOMBRES_DE_PLATAFORMA[plataforma]}${c.alcance === 'DESPACHO' ? ' del despacho' : ''}`}
                            accion={eliminarCredencialAccion}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <FormularioDeCredencial
                    plataforma={plataforma}
                    puedeDelDespacho={puedeDelDespacho}
                    reemplaza={propia !== undefined}
                    accion={guardarCredencialAccion}
                  />
                </div>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
