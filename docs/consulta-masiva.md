# Consulta masiva (Fase 10)

Consulta hasta **400 procesos** en una sola operación (§7). Esta página explica cómo funciona,
cómo se midió y qué ritmo conviene configurar.

## Cómo funciona

1. **Entrada** (`/consulta-masiva`): se pegan radicados (23 números) y NUNC (21) —uno o varios
   por línea, con o sin guiones, puntos o espacios— o se sube un Excel (`.xlsx`) o CSV. LURIS
   reconoce cada número por su longitud, descarta un encabezado sin números, quita repetidos y
   explica cada error junto a su línea («Debe tener 23 números…; este tiene 22»).
2. **Resumen previo**: «398 válidos, 2 con error», cuántos se registrarán, cuántos ya existen,
   cuántas consultas se harán y a qué plataformas. Nada se guarda hasta confirmar. Si la lista
   pasa de 400, el botón queda desactivado y dice cuántos sobran.
3. **Ejecución**: al confirmar, el caso de uso `iniciarConsultaMasiva` (servidor, con permisos):
   - registra los procesos que falten en el despacho (con quien consulta como responsable o
     asignado, igual que al importar) y excluye los archivados y los que la persona no puede
     ver (§5);
   - crea el lote y **un ítem por proceso y plataforma que le aplica**: CPNU para todo radicado,
     SAMAI (lo contencioso administrativo) y SIUGJ (laboral) según corresponda;
   - encola una sincronización por ítem en el orden de prioridad del §1 (CPNU antes que SAMAI…);
   - los **NUNC** (SPOA, con reto) no se consultan solos: el ítem queda «Espera tu confirmación»
     y se abre un pendiente en la bandeja «Pendientes de tu confirmación» (§6). Al confirmarlo
     ahí, el ítem pasa a «Listo».
4. **Avance** (`/consulta-masiva/[id]`): barra de progreso y conteo por estado, anunciados a los
   lectores de pantalla (`aria-live`). Se actualiza sola cada pocos segundos (más despacio si hay
   fallos de red o la pestaña está oculta) y muestra los resultados parciales. **Se puede cerrar
   la página**: la consulta sigue en el worker y el historial de `/consulta-masiva` permite
   retomarla.
5. **Resultados**: por radicado y plataforma, con filtros (listos, con problemas, esperan tu
   confirmación, en curso). Los fallos pasajeros (la plataforma no responde, pidió esperar) se
   reintentan solos con espera creciente; los permanentes («no encontrado», sin acceso…) quedan
   con un mensaje claro y el botón **Reintentar** (por ítem o todos a la vez).
6. **Exportar**: Excel (`.xlsx`, radicados como texto: sin notación científica ni ceros
   perdidos) o CSV (separador «;», BOM para las tildes, valores que Excel tomaría por fórmulas
   con apóstrofo delante). Toda exportación queda en la auditoría.

## Diseño

- **El worker hace el trabajo; la web solo encola.** No hay cola nueva: se reutilizan las colas de
  sincronización por plataforma (con su límite de concurrencia y de ritmo). Cuando una
  sincronización termina (o agota sus reintentos), el worker deja el resultado en los ítems que la
  esperaban (`registrarResultadoDeConsultaMasiva`) y completa los lotes que ya no tienen nada
  pendiente. Así, una consulta que ya estaba en cola (por «Consultar ahora», la programada u otro
  lote) sirve a todos los ítems que la esperan, sin consultar dos veces.
- **Notificar al terminar** (§7) llega con la Fase 11: hoy el aviso es en pantalla («La consulta
  masiva terminó») si la persona sigue en la página; si no, el lote queda terminado en el
  historial.
- **Quién ve qué**: cada persona ve sus consultas; el administrador, las de todo el despacho. Lo
  demás responde «no encontrada» (no revela que existe). Tablas con `despachoId` y aislamiento
  por despacho como el resto del sistema.

## Rendimiento

### Medición real contra la CPNU (17/11/2026)

`pnpm medir:cpnu archivo.txt` consulta radicados reales de a uno, con el mismo cliente HTTP, ritmo
(20 solicitudes por minuto) y reintentos del worker, y calcula el lote de 400. Se corrió con 2
radicados reales (consultas públicas de solo lectura):

| Proceso                   | Tiempo     | Solicitudes | Actuaciones |
| ------------------------- | ---------- | ----------- | ----------- |
| Ejecutivo civil municipal | 15,1 s     | 6           | 73          |
| Tutela                    | 9,0 s      | 3           | 9           |
| **Promedio**              | **12,1 s** | **4,5**     |             |

- Cada solicitud tarda ~2,7 s (la CPNU es lenta).
- Cada proceso pide 3 solicitudes como mínimo (búsqueda, detalle y actuaciones) y 1 más por cada
  página de actuaciones (hasta 20 actuaciones por página): los procesos con mucha historia cuestan más.
- **Un lote de 400 equivale a ~1.800 solicitudes. Al ritmo por defecto (20/min) son ~90 minutos.**
  Es una estimación con 2 procesos: la cifra real depende de cuántas actuaciones tengan los suyos.

### Concurrencia y ritmo

- Con ~2,7 s por solicitud, **un solo hilo ya haría ~22 solicitudes por minuto**, más que el
  límite; con `CPNU_CONCURRENCIA=2` (por defecto) el límite de `CPNU_SOLICITUDES_POR_MINUTO` es el
  que manda, y es lo que protege al portal. No se recomienda subir la concurrencia por encima de 2.
- Si el portal lo tolera, subir `CPNU_SOLICITUDES_POR_MINUTO` (por ejemplo a 30) acorta el lote en
  proporción; el límite máximo aceptado es 600. Hágalo de a poco y vigile los avisos de
  «Plataforma en pausa»: si la CPNU frena a LURIS (403/429), el worker deja de consultarla 10
  minutos (`CPNU_PAUSA_POR_BLOQUEO_MINUTOS`) y los ítems se reintentan solos.
- El primer lote de un despacho es el más lento (carga inicial con toda la historia); las
  consultas siguientes solo traen lo nuevo y cuestan 3 solicitudes por proceso con pocas páginas.

### Prueba de carga (fixtures)

`tests/e2e/volumen-masivo.spec.ts` ejecuta un lote de **400 procesos** de punta a punta contra la
CPNU simulada (web → cola → worker → ítems → lote → exportación), abandona la página a mitad de
camino y la retoma. Con los límites de las pruebas (600 solicitudes/min, concurrencia 2) terminó en
~207 s (≈0,5 s por ítem). Eso coincide con el intervalo de 1 s con que cada hilo del worker
revisa la cola (2 hilos ≈ 2 ítems por segundo), no con el límite de ritmo; es una inferencia, no
se perfiló. Contra la CPNU real este piso no importa: manda el límite por minuto. Además,
`tests/integracion/consulta-masiva.integracion.test.ts` verifica en PostgreSQL real el lote de 400
(creación, cierre al llegar el último ítem, reintentos, aislamiento entre despachos y el CHECK de
máximo 400).
