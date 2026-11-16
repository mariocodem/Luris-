# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Abogados y abogadas litigantes** en Colombia, independientes o en despachos, que llevan desde
  unos pocos hasta cientos de procesos judiciales a la vez. Su trabajo diario es enterarse a
  tiempo de cada actuación (autos, fijaciones en estado, audiencias) para no vencer términos.
- **Asistentes y dependientes judiciales** que hacen el seguimiento operativo de los procesos que
  les asignan.
- **Administradores del despacho** que gestionan cuentas, roles y credenciales.
- **Operador de LURIS (superadmin)** que crea y suspende despachos; nunca ve procesos.

## Product Purpose

LURIS centraliza en un solo lugar la consulta y el seguimiento de procesos judiciales que hoy
están repartidos en cinco portales oficiales (CPNU de la Rama Judicial, SPOA, SAMAI, SIUGJ y
Tyba). Detecta actuaciones nuevas, trae sus documentos y avisa por correo y WhatsApp. El éxito es
que ninguna actuación pase inadvertida y que revisar cientos de procesos deje de ser un trabajo
manual, portal por portal.

## Positioning

Una sola vista con las fechas **oficiales** de cada plataforma (fecha de actuación y de registro,
nunca la de detección), consulta masiva de hasta 400 procesos y respeto estricto de las reglas de
los portales (sin evadir CAPTCHAs: consulta asistida cuando no hay vía oficial).

## Operating Context

- _Inferido del CLAUDE.md, sin confirmar con el usuario:_ trabajo principal en el computador de la
  oficina, en sesiones largas revisando muchos procesos y resultados masivos; consultas rápidas
  desde el celular (juzgados, audiencias, desplazamientos). El diseño es mobile-first y se prueba
  en 360, 768, 1280 y 1920 px.
- Identificadores: radicado de 23 dígitos y NUNC de 21, siempre sin guiones, con botón
  "Copiar radicado" donde aparezcan.
- Fechas en formato colombiano (dd/mm/aaaa), zona horaria America/Bogota.

## Capabilities and Constraints

- Multi-despacho con roles: superadmin, administrador del despacho, abogado, asistente (§5 del
  CLAUDE.md). Permisos verificados en el servidor.
- Los errores nunca muestran códigos HTTP ni mensajes técnicos; siempre dicen qué pasó y qué hacer.
- Modo claro y oscuro con interruptor (claro / oscuro / sistema).
- Componentes base de shadcn/ui y 21st.dev adaptados a los tokens del proyecto.

## Brand Commitments

- Nombre: **LURIS**. No hay logo ni tipografía previos.
- Confirmado por el usuario: la interfaz debe ser **formal y elegante**, con **colores sobrios**
  porque está dirigida a abogados. Paleta base pedida: **blanco, azul rey y salmón**.
- Voz: español de Colombia, claro y respetuoso, sin jerga técnica.

## Evidence on Hand

No hay clientes, testimonios, cifras de uso ni capturas reales. No se deben inventar.

## Product Principles

1. La información judicial es la protagonista: la interfaz se aparta para que la fecha oficial, el
   radicado y la actuación se lean sin esfuerzo.
2. Confianza antes que novedad: precisión, consistencia y lenguaje humano en cada estado.
3. Nada se pierde en silencio: lo nuevo, lo pendiente y lo fallido siempre se ve y se explica.
4. Rápido de escanear: cientos de procesos deben poder revisarse sin fatiga.

## Accessibility & Inclusion

WCAG 2.2 AA: contraste, foco visible, navegación por teclado, `aria-live` para el progreso de las
consultas y las confirmaciones.
