import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
  render,
} from 'react-email';
import { formatearFechaOficial } from '@/shared/domain/fechas';
import { etiquetaDeOrigen } from '@/modules/plataformas/domain/tyba';
import {
  asuntoDelAviso,
  enlaceDeLaConsultaMasiva,
  enlaceDeNotificaciones,
  enlaceDelProceso,
  nombreDelProcesoAvisado,
  type Aviso,
  type AvisoDeActuaciones,
  type AvisoDeConsultaMasiva,
  type ProcesoAvisado,
} from '../../../domain/aviso';

/** Plantillas de los avisos por correo (React Email). Colores sobrios del sistema de diseño. */
const COLOR = {
  fondo: '#f5f6f8',
  tarjeta: '#ffffff',
  texto: '#1b2233',
  suave: '#5a6478',
  borde: '#dfe3ea',
  primario: '#2b4a94',
  sello: '#a8573f',
} as const;

const estilos = {
  cuerpo: {
    backgroundColor: COLOR.fondo,
    color: COLOR.texto,
    fontFamily: "'Segoe UI', Helvetica, Arial, sans-serif",
    margin: 0,
    padding: '24px 0',
  },
  contenedor: {
    backgroundColor: COLOR.tarjeta,
    border: `1px solid ${COLOR.borde}`,
    borderRadius: '8px',
    maxWidth: '600px',
    padding: '28px 28px 20px',
  },
  marca: {
    color: COLOR.primario,
    fontFamily: "Georgia, 'Times New Roman', serif",
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '0.18em',
    margin: '0 0 20px',
  },
  titulo: { fontSize: '20px', lineHeight: '28px', margin: '0 0 8px', color: COLOR.texto },
  parrafo: { fontSize: '15px', lineHeight: '24px', margin: '0 0 12px', color: COLOR.texto },
  suave: { fontSize: '13px', lineHeight: '20px', margin: '0 0 8px', color: COLOR.suave },
  proceso: { fontSize: '17px', fontWeight: 700, margin: '20px 0 2px', color: COLOR.texto },
  radicado: {
    color: COLOR.suave,
    fontFamily: 'monospace',
    fontSize: '14px',
    margin: '0 0 8px',
  },
  actuacion: {
    borderLeft: `3px solid ${COLOR.primario}`,
    margin: '10px 0',
    padding: '2px 0 2px 12px',
  },
  descripcion: { fontSize: '15px', fontWeight: 600, margin: '0 0 2px', color: COLOR.texto },
  fechas: { fontSize: '14px', margin: '0', color: COLOR.sello },
  boton: {
    backgroundColor: COLOR.primario,
    borderRadius: '6px',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    padding: '10px 18px',
    textDecoration: 'none',
  },
  separador: { borderColor: COLOR.borde, margin: '20px 0 12px' },
} as const;

function Marco({
  vistaPrevia,
  children,
  pie,
}: {
  readonly vistaPrevia: string;
  readonly children: React.ReactNode;
  readonly pie: React.ReactNode;
}) {
  return (
    <Html lang="es-CO">
      <Head />
      <Preview>{vistaPrevia}</Preview>
      <Body style={estilos.cuerpo}>
        <Container style={estilos.contenedor}>
          <Text style={estilos.marca}>LURIS</Text>
          {children}
          <Hr style={estilos.separador} />
          {pie}
        </Container>
      </Body>
    </Html>
  );
}

function BloqueDeProceso({
  proceso,
  urlBase,
}: {
  readonly proceso: ProcesoAvisado;
  readonly urlBase: string;
}) {
  return (
    <Section>
      <Text style={estilos.proceso}>{nombreDelProcesoAvisado(proceso)}</Text>
      {proceso.radicado ? <Text style={estilos.radicado}>Radicado {proceso.radicado}</Text> : null}
      {proceso.nunc ? <Text style={estilos.radicado}>NUNC {proceso.nunc}</Text> : null}
      {proceso.actuaciones.map((actuacion) => (
        <Section key={actuacion.id} style={estilos.actuacion}>
          <Text style={estilos.descripcion}>{actuacion.descripcion}</Text>
          <Text style={estilos.suave}>
            {etiquetaDeOrigen(actuacion.plataforma, actuacion.origen)}
            {actuacion.tieneDocumentos ? ' · Tiene documentos adjuntos' : ''}
          </Text>
          <Text style={estilos.fechas}>
            Actuación: {formatearFechaOficial(actuacion.fechaActuacion)}
            {actuacion.fechaRegistro
              ? ` · Registro: ${formatearFechaOficial(actuacion.fechaRegistro)}`
              : ''}
          </Text>
        </Section>
      ))}
      <Button href={enlaceDelProceso(urlBase, proceso.procesoId)} style={estilos.boton}>
        Abrir en LURIS
      </Button>
    </Section>
  );
}

function Pie({ urlBase }: { readonly urlBase: string }) {
  return (
    <Text style={estilos.suave}>
      Las fechas son las que registró la plataforma judicial. Puedes cambiar cómo recibes estos
      avisos en{' '}
      <Link href={enlaceDeNotificaciones(urlBase)} style={{ color: COLOR.primario }}>
        Notificaciones
      </Link>
      .
    </Text>
  );
}

export function CorreoDeActuaciones({ aviso }: { readonly aviso: AvisoDeActuaciones }) {
  const resumen = aviso.modo === 'RESUMEN_DIARIO';
  return (
    <Marco vistaPrevia={asuntoDelAviso(aviso)} pie={<Pie urlBase={aviso.urlBase} />}>
      <Heading as="h1" style={estilos.titulo}>
        {resumen ? 'Tu resumen diario' : 'Actuaciones nuevas en tus procesos'}
      </Heading>
      <Text style={estilos.parrafo}>
        Hola {aviso.destinatario.nombre}, {resumen ? 'esto fue lo nuevo' : 'esto es lo nuevo'} en
        tus procesos:
      </Text>
      {aviso.procesos.map((proceso) => (
        <BloqueDeProceso key={proceso.procesoId} proceso={proceso} urlBase={aviso.urlBase} />
      ))}
    </Marco>
  );
}

export function CorreoDeConsultaMasiva({ aviso }: { readonly aviso: AvisoDeConsultaMasiva }) {
  return (
    <Marco vistaPrevia={asuntoDelAviso(aviso)} pie={<Pie urlBase={aviso.urlBase} />}>
      <Heading as="h1" style={estilos.titulo}>
        Terminó tu consulta masiva
      </Heading>
      <Text style={estilos.parrafo}>
        Hola {aviso.destinatario.nombre}, LURIS terminó de consultar tus {aviso.procesos}{' '}
        {aviso.procesos === 1 ? 'proceso' : 'procesos'}.
      </Text>
      <Text style={estilos.parrafo}>
        Listos: <strong>{aviso.listos}</strong>
        <br />
        Con problemas: <strong>{aviso.conProblemas}</strong>
        {aviso.porConfirmar > 0 ? (
          <>
            <br />
            Esperan tu confirmación: <strong>{aviso.porConfirmar}</strong>
          </>
        ) : null}
      </Text>
      <Button
        href={enlaceDeLaConsultaMasiva(aviso.urlBase, aviso.consultaId)}
        style={estilos.boton}
      >
        Ver resultados
      </Button>
    </Marco>
  );
}

/** HTML del aviso. El texto plano lo arma `textoDelAviso`, igual que el de WhatsApp. */
export async function renderizarAviso(aviso: Aviso): Promise<string> {
  return render(
    aviso.tipo === 'ACTUACIONES' ? (
      <CorreoDeActuaciones aviso={aviso} />
    ) : (
      <CorreoDeConsultaMasiva aviso={aviso} />
    ),
  );
}
