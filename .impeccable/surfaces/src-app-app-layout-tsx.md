---
version: 1
slug: "src-app-app-layout-tsx"
primary_target: "src/app/(app)/layout.tsx"
related_targets: ["src/app/(auth)/layout.tsx","src/app/(plataforma)/layout.tsx"]
---

# Shell del despacho (área autenticada de LURIS)

Modo: Operate. Audiencia: abogados, asistentes y administradores de despachos en Colombia, que
revisan cientos de procesos y necesitan ver de inmediato lo nuevo con su fecha oficial. Tarea:
navegar entre Inicio, Procesos, Consulta masiva, Notificaciones, Usuarios y Ajustes; leer
actuaciones; copiar radicados. Restricciones: paleta pedida por el usuario (blanco, azul rey,
salmón) en versión sobria y corporativa; modo claro y oscuro; mobile-first en 360/768/1280/1920.

## Direction contract

THESIS: La fecha oficial es la prueba y se presenta como el sello fechador de la ventanilla del
juzgado. Rechaza el panel SaaS de tarjetas de métricas genéricas donde todas las fechas pesan igual.

OWN-WORLD: Papel blanco y grises neutros fríos; barra lateral azul marino profundo (#16233F);
azul rey apagado (#2B4A94) solo para acciones primarias, foco y sellos; salmón empolvado (#C9876F)
solo para lo nuevo y el elemento activo. Títulos en serif de texto sobria, interfaz en sans
humanista, cifras tabulares en radicados y fechas. Sello: caja de doble filete azul con etiqueta
en versalitas ("REGISTRADO") y fecha dd/mm/aaaa.

STORY: Quien entra sabe qué cambió desde su última visita, cuándo lo registró la plataforma y en
qué proceso; copia el radicado con un clic y sigue.

FIRST VIEWPORT: Escritorio: barra lateral marina de 264 px con LURIS, despacho, navegación y la
persona al pie; a la derecha saludo con fecha, tres indicadores (nuevas en salmón, pendientes, al
día) y la tabla de actuaciones recientes con radicado copiable y sello de fecha. Móvil: barra
superior con el despacho y menú inferior de 4 destinos; la tabla se vuelve tarjetas.

FORM: Sello de radicación, posición 6 de 7 en la lista propia. seed:e0bafb099dd6dcd5. Aportes:
filas vivas con columnas fijas (tablero de estación); jerarquía por aparato, no por tamaño
(léxico); acciones destructivas aisladas por espacio (consola). Interacción firma: copiar
radicado con confirmación "Radicado copiado"; movimiento: el sello aparece con un leve
"estampado" (escala 1.04→1, 160 ms), nada bajo prefers-reduced-motion.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
