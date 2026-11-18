/**
 * Mide cuánto tarda LURIS en consultar radicados en la CPNU REAL (Fase 10, §7), de a uno y con el
 * mismo ritmo y los mismos reintentos que usa el worker, para decidir la concurrencia y calcular
 * cuánto tardaría un lote de 400.
 *
 * Es de solo lectura (consultas públicas), pero pega contra el portal oficial: úsalo con pocos
 * radicados reales (2 a 5) y no lo automatices. No guarda nada en la base de datos.
 *
 *   pnpm medir:cpnu radicados.txt                 (un radicado por línea; también 23 dígitos con guiones)
 *   pnpm medir:cpnu radicados.txt --por-minuto=20 (ritmo; por defecto CPNU_SOLICITUDES_POR_MINUTO o 20)
 */
import { readFileSync } from 'node:fs';
import { crearClienteHttp } from '@/modules/plataformas/infrastructure/http/cliente-http';
import { crearLimitadorDeRitmo } from '@/modules/plataformas/infrastructure/http/limitador-de-ritmo';
import { crearPlataformaCpnu } from '@/modules/plataformas/infrastructure/rama-cpnu/adaptador-cpnu';
import { leerIdentificadores } from '@/modules/plataformas/domain/consulta-masiva';
import type { Logger } from '@/shared/domain/logger';

const URL_BASE =
  process.env.CPNU_URL_BASE ?? 'https://consultaprocesos.ramajudicial.gov.co:448/api/v2';
const MAXIMO_DE_RADICADOS = 10;

const silencioso: Logger = {
  debug() {},
  info() {},
  warn: (mensaje, contexto) => console.warn(`  aviso: ${mensaje}`, contexto ?? ''),
  error: (mensaje, contexto) => console.error(`  error: ${mensaje}`, contexto ?? ''),
  child: () => silencioso,
};

function argumento(nombre: string): string | undefined {
  return process.argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];
}

async function main(): Promise<void> {
  const archivo = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!archivo) {
    console.error('Uso: pnpm medir:cpnu <archivo con radicados> [--por-minuto=20]');
    process.exit(1);
  }
  const radicados = leerIdentificadores(readFileSync(archivo, 'utf8'))
    .validos.filter((v) => v.tipo === 'RADICADO')
    .map((v) => v.valor);
  if (radicados.length === 0 || radicados.length > MAXIMO_DE_RADICADOS) {
    console.error(`El archivo debe tener entre 1 y ${MAXIMO_DE_RADICADOS} radicados (23 números).`);
    process.exit(1);
  }
  const porMinuto = Number(
    argumento('por-minuto') ?? process.env.CPNU_SOLICITUDES_POR_MINUTO ?? 20,
  );

  let solicitudes = 0;
  const fetchContado: typeof fetch = (entrada, opciones) => {
    solicitudes += 1;
    return fetch(entrada, opciones);
  };
  const http = crearClienteHttp({
    userAgent: 'LURIS/0.1 (medición de rendimiento; seguimiento de procesos judiciales)',
    tiempoLimiteMs: 60_000,
    reintentos: 2,
    esperaBaseMs: 1000,
    pausaPorBloqueoMs: 10 * 60_000,
    limitador: crearLimitadorDeRitmo({ solicitudesPorMinuto: porMinuto }),
    logger: silencioso,
    fetch: fetchContado,
  });
  const cpnu = crearPlataformaCpnu({ urlBase: URL_BASE, http, logger: silencioso });

  console.log(`CPNU: ${URL_BASE}`);
  console.log(
    `Ritmo: ${porMinuto} solicitudes por minuto · ${radicados.length} radicados, de a uno\n`,
  );
  const segundos: number[] = [];
  let totalSolicitudes = 0;
  for (const radicado of radicados) {
    const antes = solicitudes;
    const inicio = performance.now();
    const resultado = await cpnu.consultar(radicado, {});
    const duracion = (performance.now() - inicio) / 1000;
    const pedidas = solicitudes - antes;
    totalSolicitudes += pedidas;
    segundos.push(duracion);
    console.log(
      `${radicado}  ${duracion.toFixed(1).padStart(6)} s  ${String(pedidas).padStart(2)} solicitudes  ` +
        (resultado.ok
          ? `${resultado.value.actuaciones.length} actuaciones`
          : `sin resultado (${resultado.error.codigo})`),
    );
  }

  const media = segundos.reduce((a, b) => a + b, 0) / segundos.length;
  const porConsulta = totalSolicitudes / radicados.length;
  console.log(
    `\nPromedio: ${media.toFixed(1)} s y ${porConsulta.toFixed(1)} solicitudes por radicado.`,
  );
  const minutosPorLimite = (400 * porConsulta) / porMinuto;
  console.log(
    `Un lote de 400 así pediría ~${Math.round(400 * porConsulta)} solicitudes: al ritmo de ${porMinuto}/min, ` +
      `al menos ~${Math.round(minutosPorLimite)} min (el ritmo manda; con 2 consultas en paralelo ` +
      `el tiempo de cada una se solapa, pero el límite por minuto no se supera).`,
  );
}

main().catch((error: unknown) => {
  console.error('La medición no pudo terminar:', error instanceof Error ? error.message : error);
  process.exit(1);
});
