# Notificaciones (Fase 11)

LURIS avisa por **correo** y por **WhatsApp** de las actuaciones nuevas, y por correo (o WhatsApp)
cuando termina una consulta masiva. Esta página explica cómo funciona, cómo configurarlo y qué
límites tiene.

## Qué se avisa

- **Actuaciones nuevas**: las que LURIS detecta después de la primera consulta de un proceso. Lo
  que trae la primera consulta es la historia del proceso y **no se avisa**. Cada aviso trae el
  proceso (alias y radicado), la plataforma (con «Tyba, vía la Rama Judicial» cuando corresponde),
  la **fecha de actuación y la fecha de registro oficiales** de la plataforma (nunca la fecha en que
  LURIS la detectó), la descripción, si tiene documentos y el enlace a LURIS.
- **Consulta masiva terminada** (§7): cuántos procesos quedaron listos, con problemas y esperando
  confirmación, y el enlace a los resultados. Se avisa una sola vez por consulta.

## A quién

- Las personas **activas asignadas** al proceso (responsable y apoyo). Si el proceso no tiene a
  nadie asignado, a las **administradoras** del despacho.
- Cada persona elige en **Notificaciones**: canales (correo, WhatsApp) y frecuencia (**de
  inmediato** o **resumen diario**). Por defecto: correo de inmediato. WhatsApp solo se activa con
  número y consentimiento expreso (queda la fecha del consentimiento); al desactivarlo se retira.
- Agrupación: en «de inmediato», las actuaciones de un mismo proceso que llegan juntas van en un
  solo aviso; en resumen diario, un solo aviso con todos los procesos, a la hora
  `NOTIFICACIONES_HORA_RESUMEN` (7:00 de Bogotá por defecto).

## Cómo funciona

1. Al guardar una consulta (automática o asistida), `guardarConsulta` programa los avisos
   (`programarNotificaciones`): una fila `Notificacion` por actuación, persona y canal activo. La
   clave única (actuación, persona, canal) hace la operación **idempotente**: repetirla no duplica
   nada, y por eso nunca se envía dos veces la misma actuación por el mismo canal.
2. El **despachador** (`despacharNotificaciones`, en el worker) corre cada minuto y apenas se
   programa un aviso. Toma los avisos vencidos y los **arrienda** (suma un intento y los posterga
   10 minutos para que otro despachador no los tome); los agrupa, los envía por su canal y deja cada
   uno **enviado**, **reprogramado** (fallo pasajero: espera de 1, 2, 4, 8 minutos…, tope de una
   hora) o **fallido** (definitivo, o tras 5 intentos).
3. Si el worker se cae a mitad de un envío, el aviso vuelve a estar disponible al vencer el
   arriendo. Es la única situación en la que un aviso podría salir dos veces (envío a medias): se
   prefiere eso a perderlo.
4. La persona ve sus avisos recientes en **Notificaciones**, con las dos fechas oficiales y cómo
   quedó cada uno, sin códigos técnicos.

La arquitectura sigue los puertos del §9: `Notificador` (un adaptador por canal) y
`EnviadorDeCorreos`. Agregar un canal es agregar un adaptador; los casos de uso no cambian.

## Correo

- Plantillas con **React Email** (`infrastructure/email/plantillas/aviso.tsx`), con colores sobrios
  del sistema de diseño, y versión de texto plano.
- Transporte `CORREO_TRANSPORTE`: `archivo` (desarrollo: cada correo se guarda como `.html` en
  `CORREO_DIRECTORIO`) o `smtp` (**obligatorio en producción**). Variables `SMTP_HOST`,
  `SMTP_PUERTO` (587 por defecto, con STARTTLS; 465 usa TLS implícito), `SMTP_SEGURO`,
  `SMTP_USUARIO` y `SMTP_CLAVE`, y `CORREO_REMITENTE`.
- Los fallos de SMTP se clasifican por su código (no por su texto, que puede traer direcciones):
  conexión o 4xx → se reintenta; usuario inexistente (550, 551, 553) → definitivo; error de
  autenticación → canal no disponible (se reintenta cuando se corrija la configuración).
- Nunca se registra el contenido ni el destinatario de un correo.

## WhatsApp (Baileys, no oficial)

> **Advertencia.** La conexión usa [Baileys](https://github.com/WhiskeySockets/Baileys), una
> librería de código abierto que **no es la API oficial de Meta**: puede incumplir los términos de
> uso de WhatsApp y el número puede ser bloqueado. Usa un **número dedicado**, un ritmo bajo y solo
> con personas que dieron su consentimiento. La pantalla de vinculación y las preferencias lo
> muestran siempre.

- **Dónde corre**: dentro del proceso `worker` (sin contenedor adicional). Cada despacho tiene su
  propia sesión.
- **Vincular** (administrador del despacho, Ajustes → WhatsApp del despacho): la web pide al worker
  que empiece; el worker genera el QR y lo guarda **cifrado**; la pantalla lo dibuja (SVG, sin
  imágenes externas) y lo renueva sola; se escanea con el WhatsApp del número dedicado. Si nadie lo
  escanea en 3 minutos, se cancela.
- **Sesión**: las credenciales y las claves de Signal se guardan **cifradas** (AES-256-GCM, con
  `CREDENCIALES_CLAVE`, un contexto distinto por despacho) en `sesiones_whatsapp`; nunca en
  archivos ni en claro. Sin esa clave, LURIS no acepta vincular. El worker reconecta las sesiones al
  iniciar y, si la conexión cae, reintenta con espera creciente (tope 5 minutos). Si WhatsApp cierra
  la sesión desde la cuenta, se borra todo y hay que vincular de nuevo.
- **Envío**: de a uno y con pausa (`WHATSAPP_MENSAJES_POR_MINUTO`, 6 por defecto, más una pausa
  variable), solo a números que tienen WhatsApp. Sin conexión, los avisos esperan y se reintentan.
- **Reemplazo por la API oficial (WhatsApp Cloud)**: todo lo de Baileys queda detrás de
  `FabricaDeSocket` y `Notificador`. Basta otra implementación de `gestor-de-whatsapp.ts` /
  `socket-baileys.ts`; nada fuera de `notificaciones/infrastructure/whatsapp/` cambia.
- **Versión**: se usa `@whiskeysockets/baileys` 7.0.0-rc14, la etiqueta `latest` de npm. Es un
  _release candidate_; la línea 6.x (`legacy`, 6.7.24) depende de un paquete traído de GitHub
  (`git+https`), que complica la instalación en Docker. WhatsApp cambia su protocolo a menudo: si
  la conexión deja de funcionar, lo primero es actualizar Baileys.
- Baileys se carga con `import()` solo en el worker y está en `serverExternalPackages`: la web no
  lo carga.

## Qué se probó y qué no

- **Probado de punta a punta** (e2e): una actuación nueva detectada por el worker genera
  **exactamente un correo** con las fechas oficiales (13/11/2026 y 14/11/2026 de la CPNU
  simulada), sin duplicarse al volver a consultar; la persona lo ve en Notificaciones; la consulta
  masiva terminada se avisa una vez; las preferencias se validan junto a cada campo; solo el
  administrador ve y gestiona WhatsApp.
- **Probado con una sesión simulada** (unitarias): el gestor de WhatsApp (QR y sesión cifrados,
  conexión, envío con pausa, reconexión, cierre de sesión desde la cuenta, números sin WhatsApp) y
  el despachador (agrupación, reintentos, canal desactivado, idempotencia). Un aviso de actuación
  genera exactamente un envío por correo y uno por WhatsApp.
- **No probado contra WhatsApp real**: no hay forma de hacerlo sin un número dedicado, y las
  pruebas nunca se conectan a sus servidores. **Antes de usarlo en producción, vincula un número de
  prueba y verifica un envío real.** Tampoco se probó contra un servidor SMTP real (se prueba la
  clasificación de errores y la construcción del mensaje; el envío en las pruebas usa el
  transporte de archivo).

## Pendiente a propósito

- Cancelar un envío de resumen ya programado al cambiar de frecuencia: los avisos pendientes se
  envían con la frecuencia vigente al despacharlos.
- Respuesta a los mensajes de WhatsApp («SALIR»): LURIS no lee mensajes entrantes; cada aviso
  indica dónde cambiar las preferencias.
