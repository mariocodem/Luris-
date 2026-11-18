import { describe, expect, it } from 'vitest';
import {
  aCsv,
  ENCABEZADOS_DE_EXPORTACION,
  filasDeExportacion,
  nombreDeArchivoDeExportacion,
} from './exportacion-de-consulta-masiva';
import type { ItemDeConsultaMasiva } from './puertos';

const item = (parcial: Partial<ItemDeConsultaMasiva> = {}): ItemDeConsultaMasiva => ({
  id: 'i1',
  tipo: 'RADICADO',
  identificador: '00001400300120210034300',
  procesoId: 'p1',
  alias: 'Ejecutivo; "Bancolombia"',
  cliente: null,
  plataforma: 'RAMA_CPNU',
  estado: 'COMPLETADO',
  resultado: 'EXITOSA',
  resumen: { mensaje: 'Hay una actuación nueva en la Rama Judicial.', nuevas: 1, total: 74 },
  actualizadoEn: new Date('2026-11-18T20:30:00Z'),
  ...parcial,
});

describe('exportación de la consulta masiva', () => {
  it('una fila por ítem, con el radicado como texto y sin perder ceros', () => {
    const [fila] = filasDeExportacion([item()]);
    expect(fila).toEqual([
      '00001400300120210034300',
      'Radicado',
      'Ejecutivo; "Bancolombia"',
      '',
      'Rama Judicial (CPNU)',
      'Listo',
      'Hay una actuación nueva en la Rama Judicial.',
      '1',
      '18/11/2026, 3:30 p. m.',
    ]);
    expect(fila).toHaveLength(ENCABEZADOS_DE_EXPORTACION.length);
  });

  it('lo asistido explica que espera a la persona', () => {
    const [fila] = filasDeExportacion([
      item({ tipo: 'NUNC', plataforma: 'SPOA', estado: 'PENDIENTE_CONFIRMACION', resumen: null }),
    ]);
    expect(fila?.[5]).toBe('Espera tu confirmación');
    expect(fila?.[6]).toContain('Pendientes de tu confirmación');
  });

  it('el CSV usa «;», BOM y CRLF, y cita lo que lo necesita', () => {
    const csv = aCsv(filasDeExportacion([item()]));
    expect(csv.startsWith('\uFEFFRadicado o NUNC;Tipo;')).toBe(true);
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv).toContain('"Ejecutivo; ""Bancolombia"""');
  });

  it('el CSV neutraliza lo que Excel tomaría por una fórmula', () => {
    const csv = aCsv(
      filasDeExportacion([item({ alias: '=HYPERLINK("http://x")', cliente: '+57 300' })]),
    );
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain(";'+57 300;");
    expect(csv).not.toMatch(/;=HYPERLINK/);
  });

  it('el nombre del archivo lleva el día en hora de Bogotá', () => {
    expect(nombreDeArchivoDeExportacion(new Date('2026-11-19T03:00:00Z'), 'xlsx')).toBe(
      'consulta-masiva-luris-2026-11-18.xlsx',
    );
  });
});
