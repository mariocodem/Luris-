/**
 * Plantilla CSV de ejemplo para importar procesos. Usa punto y coma (Excel en español lo abre
 * en columnas) y marca BOM para que Excel lea bien las tildes. Datos ficticios.
 */
const PLANTILLA = [
  'Radicado;NUNC;Alias;Cliente;Etiquetas',
  '11001-31-03-001-2023-00123-00;;Restitución de inmueble;Inversiones El Prado S.A.S.;Civil, Urgente',
  ';11001-60-00049-2023-00123;Denuncia por estafa;Comercializadora Andina Ltda.;Penal',
  '05001-31-05-002-2024-00045-00;;Ordinario laboral;Jorge Pérez;Laboral',
].join('\r\n');

export function GET(): Response {
  return new Response(`﻿${PLANTILLA}\r\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="plantilla-procesos-luris.csv"',
    },
  });
}
