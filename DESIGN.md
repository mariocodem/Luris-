---
name: LURIS
description: Seguimiento judicial para despachos en Colombia, con la fecha que cada plataforma registró.
colors:
  background: "#f5f6f8"
  foreground: "#1b2233"
  card: "#ffffff"
  muted: "#eef0f3"
  muted-foreground: "#565f71"
  border: "#e2e5eb"
  input: "#868fa1"
  primary: "#2b4a94"
  primary-foreground: "#ffffff"
  secondary: "#eaeef7"
  secondary-foreground: "#1f3266"
  accent: "#eef1f7"
  sello: "#2b4a94"
  nuevo: "#c9876f"
  nuevo-suave: "#f7ece7"
  nuevo-texto: "#8a4a35"
  destructive: "#b42318"
  error-suave: "#fbecea"
  exito: "#2f6b4f"
  exito-suave: "#e8f2ec"
  alerta: "#85570b"
  alerta-suave: "#f8f0e0"
  sidebar: "#16233f"
  sidebar-foreground: "#eef1f7"
  sidebar-muted: "#aab4c9"
  sidebar-primary: "#d9a08b"
  sidebar-accent: "rgb(255 255 255 / 0.07)"
  sidebar-border: "rgb(255 255 255 / 0.1)"
typography:
  display:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.625
  body-sm:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.43
  label-sello:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.65625rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.12em"
  cifras:
    fontFamily: "Public Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    letterSpacing: "0.01em"
    fontFeature: "tabular-nums lining-nums"
  marca:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.16em"
rounded:
  sello: "3px"
  sm: "4.8px"
  md: "6.4px"
  lg: "8px"
  xl: "11.2px"
  hoja: "16px"
  full: "9999px"
spacing:
  gutter-movil: "16px"
  gutter-tableta: "24px"
  gutter-escritorio: "40px"
  seccion: "32px"
  bloque: "12px"
  tarjeta: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-outline-hover:
    backgroundColor: "{colors.muted}"
  button-secondary:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.secondary-foreground}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-ghost:
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.muted}"
  button-ghost-destructive:
    textColor: "{colors.destructive}"
    rounded: "{rounded.lg}"
    padding: "0 14px"
    height: "36px"
  button-ghost-destructive-hover:
    backgroundColor: "{colors.error-suave}"
  input:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "40px"
  card:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.xl}"
    padding: "{spacing.tarjeta}"
  sello-de-fecha:
    textColor: "{colors.sello}"
    typography: "{typography.cifras}"
    rounded: "{rounded.sello}"
    padding: "4px 10px"
  radicado-copiable:
    textColor: "{colors.foreground}"
    typography: "{typography.cifras}"
  radicado-copiable-boton:
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.md}"
    size: "32px"
  fila-nueva:
    backgroundColor: "{colors.nuevo-suave}"
    textColor: "{colors.nuevo-texto}"
  nav-lateral:
    backgroundColor: "{colors.sidebar}"
    textColor: "{colors.sidebar-muted}"
    width: "256px"
  nav-lateral-item-activo:
    backgroundColor: "{colors.sidebar-accent}"
    textColor: "{colors.sidebar-foreground}"
    rounded: "{rounded.md}"
    height: "40px"
  nav-inferior-item-activo:
    textColor: "{colors.primary}"
    height: "64px"
---

# Design System: LURIS

## Overview

**Creative North Star: "Sello de radicación"**

LURIS se presenta como la ventanilla de un juzgado bien llevada: papel blanco, grises fríos, una estructura en azul marino profundo y, sobre cada actuación, el sello fechador que dice cuándo la plataforma oficial la registró. La fecha oficial es la prueba, y el sistema entero está organizado para que esa prueba se lea primero. La jerarquía se construye por aparato (sello de doble filete, cifras tabulares, fila resaltada) y no por tamaño: los títulos son sobrios, las tablas densas y estables, y el color se raciona.

El tono es formal y elegante, corporativo y nunca estridente. Los colores se apagaron a pedido del usuario: el azul rey es un azul tinta (#2B4A94), el salmón es empolvado y aparece solo donde algo es nuevo. Rechaza explícitamente el panel SaaS de tarjetas de métricas genéricas donde todas las fechas pesan igual, y los colores "chillones".

La densidad es de herramienta de trabajo: quien revisa cientos de procesos necesita filas con columnas fijas, radicados copiables con un clic y fechas que se alinean. El movimiento es mínimo: el sello se "estampa" una vez al aparecer y todo lo demás cambia de color sin desplazarse.

**Key Characteristics:**
- Papel blanco y grises fríos con estructura en azul marino; ningún color saturado.
- Sello de fecha oficial de doble filete azul como única marca visual del sistema.
- Salmón empolvado reservado a lo nuevo y al indicador activo de la barra lateral.
- Títulos en serif de texto (Source Serif 4); interfaz en sans humanista (Public Sans); cifras tabulares en radicados y fechas.
- Superficies planas con filete de 1 px; sombra solo en capas flotantes.
- Claro y oscuro con los mismos roles; todos los pares de texto ≥4,5:1 y bordes de campo ≥3:1 en ambos temas.

## Colors

Paleta sobria de papel, tinta y marino, con un azul rey apagado para actuar y un salmón empolvado para avisar. Los valores del frontmatter son los del tema claro (`:root` en `src/app/globals.css`); el tema oscuro redefine los mismos roles en `.dark` (ver el sidecar), y ningún componente usa hex directos: siempre el token.

### Primary
- **Azul tinta de ventanilla** (primary): acciones principales, foco (`ring`), cursor de texto, selección, enlaces y el destino activo de la navegación inferior. Una acción principal por zona.
- **Azul de sello** (sello): el filete y las cifras del sello de fecha oficial. Comparte valor con primary en claro, pero en oscuro es un azul más claro y propio; es un rol distinto y no se intercambia.

### Secondary
- **Salmón empolvado** (nuevo): borde de la tarjeta de una actuación nueva. Su versión suave (nuevo-suave) tiñe la fila nueva en la tabla y su versión texto (nuevo-texto) escribe la palabra "Nueva".
- **Salmón sobre marino** (sidebar-primary): la barra vertical de 2 px que marca el destino activo en la barra lateral y el anillo de foco sobre marino (sidebar-ring).

### Tertiary
- **Marino estructural** (sidebar): la barra lateral de escritorio y el panel de marca de las pantallas de acceso. En oscuro se conserva, más claro y más azul que el suelo.

### Neutral
- **Gris papel** (background): el suelo de la aplicación y el fondo de los campos.
- **Blanco de folio** (card / popover): tarjetas, tablas, menús y la columna del formulario de acceso.
- **Tinta** (foreground): todo el texto principal.
- **Gris lápiz** (muted-foreground): descripciones, columnas secundarias, ayudas de campo.
- **Gris archivador** (muted, accent): fondos de hover, cabecera de tabla, grupo del selector de tema.
- **Filete** (border): bordes de tarjetas, divisores de filas y de barras.
- **Borde de campo** (input): contorno de campos y selectores, medido ≥3:1 contra el fondo.
- **Estados**: destructive / error-suave para errores y acciones destructivas; exito / exito-suave para confirmaciones (el ✓ de "Radicado copiado"); alerta / alerta-suave para advertencias.

### Named Rules
**The Salmón Solo Para Lo Nuevo Rule.** El salmón (nuevo, nuevo-suave, nuevo-texto, sidebar-primary) solo marca una actuación nueva o el destino activo de la barra lateral. Nunca un botón, una insignia decorativa, un gráfico ni un título.

**The Sello Es Prueba Rule.** El azul de sello y el doble filete se usan exclusivamente para fechas oficiales de la plataforma (fecha de registro, fecha de actuación). Nunca para la fecha de detección de LURIS, nunca como adorno.

**The Marino Es Estructura Rule.** El marino (sidebar) solo viste estructura: la barra lateral y el panel de marca del acceso. El contenido vive sobre papel.

## Typography

**Display Font:** Source Serif 4 (con ui-serif, Georgia, serif), pesos 500 y 600
**Body Font:** Public Sans (con ui-sans-serif, system-ui, sans-serif)
**Label/Mono Font:** Public Sans con cifras tabulares (utilidad `.cifras`); monoespaciada del sistema solo para el código de ayuda.

**Character:** Una serif de texto con tamaño óptico da el tono formal de expediente sin caer en una display decorativa; la sans de servicio público es sobria y legible en tamaños pequeños. Las cifras tabulares hacen que radicados y fechas se alineen como en un libro radicador.

### Hierarchy
- **Display** (Source Serif 4 500, 2rem, 1.2): la frase de marca en el panel marino del acceso. Solo ahí.
- **Headline** (Source Serif 4 600, 1.75rem en móvil / 2rem desde 640 px, 1.25, -0.01em): el título de cada página y de las pantallas de acceso. Los títulos de estado vacío usan la misma familia a 1.25rem.
- **Title** (Public Sans 600, 1rem, -0.005em): títulos de sección dentro de la página, con un detalle opcional a la derecha en gris lápiz. Sans, no serif.
- **Body** (Public Sans 400, 0.9375rem, 1.625): descripciones de página y de estado vacío, máximo 68ch.
- **Body-sm** (Public Sans 400, 0.875rem): celdas de tabla, tarjetas, ayudas y errores de campo.
- **Label** (Public Sans 500, 0.875rem): etiquetas de campo y botones. La navegación lateral usa 0.9375rem; la inferior 0.6875rem 500.
- **Label-sello** (Public Sans 600, 0.65625rem, 0.12em, mayúsculas): la palabra "REGISTRO" o "ACTUACIÓN" dentro del sello. Las cabeceras de tabla usan 0.75rem 600, 0.06em, mayúsculas.
- **Marca** (Source Serif 4 600, espaciado 0.14–0.18em): el logotipo tipográfico LURIS (1.125rem en la barra móvil, 1.5rem en la lateral, 1.875rem en el acceso).

### Named Rules
**The Cifras Tabulares Rule.** Todo radicado, NUNC y fecha lleva `tabular-nums lining-nums` con 0.01em de espaciado, sin guiones, sin espacios y sin cortes de línea.

**The Serif Con Mesura Rule.** La serif es para títulos de página, títulos de estado vacío, la marca y la frase del acceso. Secciones, tablas y controles van en sans.

## Layout

Mobile-first con un cambio de estructura en 1024 px. Desde 1024 px: barra lateral marina fija de 256 px (alto completo, pegajosa) con marca y despacho arriba, navegación, y al pie el selector de tema y el menú de la persona; el contenido a la derecha en una columna de máximo 1152 px (max-w-6xl) centrada. Por debajo de 1024 px: barra superior translúcida de 56 px con la marca, el despacho y las iniciales de la persona (que abren su menú y el selector de tema), y barra inferior fija de 64 px con hasta 4 destinos principales más "Más", que abre una hoja inferior con el resto, el tema y "Cerrar sesión". Con un solo destino la barra inferior no se muestra y el relleno inferior del contenido baja de 112 px a 48 px.

Márgenes laterales del contenido: 16 px en móvil, 24 px desde 640 px, 40 px desde 1024 px. Las secciones de una página se separan 32 px; un título de sección y su contenido, 12 px. Tarjetas con 20 px de relleno (16 px en tarjetas de lista móvil); filas de tabla con 16 px vertical y 20 px horizontal.

Las tablas de procesos y actuaciones se vuelven tarjetas por debajo de 1024 px (una columna en móvil, dos desde 768 px). Las acciones del encabezado de página van a la derecha del título en escritorio y debajo en móvil. Las pantallas de acceso: panel marino al 42% (máx. 576 px) a la izquierda y formulario de máximo 384 px sobre blanco; en móvil, una sola columna con la marca arriba.

**The Columnas Fijas Rule.** Las columnas de una tabla nunca se reordenan ni se ocultan según el estado: lo nuevo solo cambia el estilo de la fila (fondo nuevo-suave, prefijo "Nueva ·", sello que se estampa).

## Elevation & Depth

Sistema plano con filetes. Las superficies se separan por tono (gris papel bajo blanco de folio) y por bordes de 1 px; las tarjetas no llevan sombra. La sombra queda para lo que flota sobre el contenido y para el segmento activo del selector de tema. Las barras móviles usan material translúcido (fondo al 85–90% con desenfoque y saturación), que pasa a sólido con `prefers-reduced-transparency` o `prefers-contrast: more`.

### Shadow Vocabulary
- **elevado** (`box-shadow: 0 1px 2px rgb(15 21 36 / 0.06), 0 4px 12px rgb(15 21 36 / 0.06)`): el segmento activo del selector de tema sobre su grupo gris.
- **flotante** (`box-shadow: 0 2px 6px rgb(15 21 36 / 0.08), 0 12px 32px rgb(15 21 36 / 0.12)`): avisos (toasts). En oscuro ambas sombras se oscurecen con negro puro (ver sidecar).

### Named Rules
**The Plano Con Filete Rule.** En reposo, todo es plano y se separa con un filete de 1 px. La sombra se gana flotando, no decorando.

## Shapes

Esquinas suavemente redondeadas a partir de un radio base de 8 px: botones, campos y avisos de formulario a 8 px; ítems de navegación y botón de copiar a 6.4 px; tarjetas, tablas y estados vacíos a 11.2 px; la hoja inferior móvil a 16 px en sus esquinas superiores; iniciales y emblemas de estado vacío en círculo. El sello es la excepción deliberada: casi recto (3 px) con un filete de 1.5 px y un segundo filete al 60% separado 2 px, como un sello de goma. Los estados vacíos usan borde discontinuo; todo lo demás, borde continuo.

## Components

### Buttons
Contenidos y seguros, sin brillo.
- **Shape:** esquinas de 8 px; alto 36 px (40 px en la variante grande de formularios), relleno horizontal 14 px, texto Label.
- **Primary:** fondo azul tinta, texto blanco, sombra mínima (`shadow-xs`). Hover al 90% de opacidad; al presionar baja 1 px.
- **Hover / Focus:** foco con borde `ring` y halo de 3 px al 50%; además el contorno global de 2 px con 2 px de separación.
- **Contorno / Secundario / Discreto:** contorno en filete sobre papel con hover gris archivador; secundario en azul muy claro con texto marino; discreto sin fondo hasta el hover.
- **Destructivo:** texto rojo sobre fondo rojo al 10% en el catálogo; en pantallas reales, las acciones destructivas ("Desactivar", "Cerrar sesión") son botones discretos con texto destructive y hover error-suave.

**The Destructivo Aislado Rule.** Una acción destructiva es un botón discreto separado de las acciones frecuentes por espacio o un divisor; nunca un botón relleno, nunca junto a la acción principal.

### Cards / Containers
- **Corner Style:** 11.2 px.
- **Background:** blanco de folio sobre gris papel.
- **Shadow Strategy:** ninguna (ver The Plano Con Filete Rule).
- **Border:** filete de 1 px; una tarjeta de actuación nueva cambia el filete a salmón al 50%.
- **Internal Padding:** 20 px (16 px en tarjetas de lista móvil, con divisor antes de la línea del radicado).

### Inputs / Fields
- **Style:** alto 40 px, esquinas de 8 px, borde input (≥3:1), fondo gris papel, texto 16 px en móvil (evita el zoom de iOS) y 14 px desde 640 px. Etiqueta arriba en Label, ayuda debajo en gris lápiz.
- **Focus:** borde ring con halo de 3 px al 50%.
- **Error / Disabled:** borde destructive con halo rojo al 20% y la lista de errores en texto destructive justo debajo, enlazada con `aria-describedby`; deshabilitado al 50% de opacidad. El aviso general del formulario es una caja de 8 px con borde y fondo destructivos suaves, con "Código de ayuda" en monoespaciada.

### Navigation
- **Barra lateral (≥1024 px):** marino, marca en serif espaciada, despacho debajo en sidebar-muted. Ítems de 40 px con ícono de 18 px y texto 0.9375rem en sidebar-muted; hover con velo blanco al 7%; activo con el mismo velo, texto blanco seminegrita y una barra salmón de 2 px a la izquierda. Al pie, el selector de tema (Claro / Oscuro / Sistema, grupo de radio) y la persona con iniciales.
- **Barra superior móvil:** translúcida, 56 px, marca y despacho a la izquierda, iniciales de 44 px de área táctil a la derecha.
- **Barra inferior móvil:** translúcida, 64 px más el área segura, hasta 4 destinos más "Más". Activo en azul tinta con trazo de ícono 2.25 (inactivo 1.75); al presionar escala 0.97.

### Sello de fecha oficial (firma)
La marca del sistema. Caja casi recta de doble filete en azul de sello: arriba la etiqueta "REGISTRO" o "ACTUACIÓN" en Label-sello, debajo la fecha dd/mm/aaaa (zona America/Bogota) en cifras tabulares 14 px seminegrita, dentro de un `<time>` con la fecha ISO. Cuando la actuación es recién detectada se estampa una vez: escala de 1.04 a 1 en 160 ms con la curva de salida, sin desvanecer, y nada bajo `prefers-reduced-motion`.

### Radicado copiable (firma)
Radicado (23 dígitos) o NUNC (21) en cifras tabulares 14 px, sin guiones, sin cortes de línea y seleccionable de un clic, seguido de un botón de copiar de 32 px (28 px desde 640 px) en gris lápiz con tooltip. Al copiar: el ícono pasa a ✓ en verde éxito por 2 s, aparece el aviso "Radicado copiado" (o "NUNC copiado") con los dígitos, y una región `aria-live` lo anuncia. Si el portapapeles falla, el aviso de error explica cómo copiarlo a mano.

### Estado vacío
Caja de borde discontinuo sobre blanco, alineada a la izquierda en móvil y centrada desde 640 px: emblema circular azul claro con ícono de 20 px, título en serif 1.25rem, descripción que dice qué aparecerá ahí y la acción para empezar.

### Avisos (toasts)
Abajo a la derecha (24 px) en escritorio y por encima de la barra inferior (88 px) en móvil. Superficie popover con filete, esquinas de 8 px y sombra flotante; ícono de 16 px coloreado por estado (exito, primary, alerta, destructive).

## Do's and Don'ts

### Do:
- **Do** mostrar toda fecha de registro y de actuación con el sello de fecha oficial, en dd/mm/aaaa y zona America/Bogota.
- **Do** mostrar cada radicado y NUNC como dígitos continuos en cifras tabulares, sin cortes de línea, con su botón de copiar al lado.
- **Do** marcar lo nuevo cambiando el estilo de la fila (nuevo-suave, prefijo "Nueva ·" en nuevo-texto, borde salmón en tarjeta), nunca moviendo columnas.
- **Do** usar los tokens de rol (`primary`, `sello`, `nuevo`, `sidebar`…) en vez de valores directos, para que el tema oscuro funcione sin cambios.
- **Do** mantener todo par de texto en ≥4,5:1 y todo borde de campo en ≥3:1, en claro y en oscuro.
- **Do** aislar las acciones destructivas como botones discretos separados por espacio o un divisor.
- **Do** convertir tablas en tarjetas por debajo de 1024 px y respetar el área segura en las barras móviles.

### Don't:
- **Don't** usar el sello ni el doble filete azul como adorno, como insignia o para la fecha en que LURIS detectó algo.
- **Don't** usar el salmón para botones, insignias, gráficos, títulos o cualquier cosa que no sea lo nuevo o el destino activo de la barra lateral.
- **Don't** introducir colores saturados o "chillones"; la paleta es papel, tinta, marino, azul tinta y salmón empolvado.
- **Don't** construir paneles de tarjetas de métricas genéricas donde todas las fechas pesan igual.
- **Don't** poner etiquetas en mayúsculas espaciadas sobre los títulos (eyebrows); las mayúsculas pequeñas viven solo en la etiqueta del sello y en las cabeceras de tabla.
- **Don't** dar sombra a tarjetas en reposo; la sombra es para lo que flota.
- **Don't** colocar una acción destructiva rellena o pegada a la acción principal.
