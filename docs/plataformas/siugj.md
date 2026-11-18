# SIUGJ — Sistema Integrado de Gestión Judicial (Rama Judicial)

Spike de la Fase 8 (17/11/2026). Se leyó solo el portal público, **sin iniciar sesión** y sin
enviar formularios. No se contó con una cuenta de usuario externo, así que lo que hay después del
ingreso quedó **provisional** (ver abajo). La implementación está en
`src/modules/plataformas/infrastructure/siugj/`.

## Qué es y qué procesos tiene

- Portal: `https://siugj.ramajudicial.gov.co/principalPortal/` (PHP con jQuery y ExtJS; el
  ingreso y las ventanas usan JavaScript, por eso LURIS usa un navegador automatizado).
- Empezó por la **jurisdicción ordinaria laboral** (Ley 2452 de 2025): Sala de Casación Laboral
  de la Corte Suprema, juzgados laborales del circuito y juzgados municipales de pequeñas causas.
  El portal anuncia 745 despachos activos (una noticia de abril de 2026 decía 638).
- LURIS consulta SIUGJ solo para los procesos con especialidad laboral en el radicado (dígitos 8
  y 9 = `05`, `esDeLaEspecialidadLaboral`). Se ampliará cuando SIUGJ sume especialidades.
- No se encontró API pública, servicio de interoperabilidad ni manual de usuario externo en línea.
- La consulta pública (`consultarProceso.php`) busca por nombre exacto, documento o CUP; no por
  radicado, y no muestra actuaciones.

## Ingreso de usuarios externos (CONFIRMADO)

En `index.php`, el formulario tiene `#txtUsuario`, `#txtPasswd` y un botón de envío. La función
`autenticar()` (script `modulosEspeciales_SIUGJ/Scripts/index.js.php`) cifra usuario y contraseña
en el navegador y los envía por AJAX a `../paginasFunciones/funciones.php` (`funcion=8`). La
respuesta tiene la forma `x|código|…`:

| Código | Significado                                                                                                                         | Qué hace LURIS                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| `1`    | Ingreso correcto: va a `inicio.php`                                                                                                 | Guarda la sesión cifrada y consulta         |
| `2`    | **Pide el código de acceso** (segundo factor): ventana «Ingrese el Código de Acceso» (`#txtCodigoAcceso`), con opción de reenviarlo | Espera a que la persona lo escriba en LURIS |
| `3`    | «Cuenta Bloqueada» (en `#lblErr1`)                                                                                                  | CREDENCIALES_INVALIDAS                      |
| `4`    | «Cuenta Inactiva»                                                                                                                   | CREDENCIALES_INVALIDAS                      |
| otros  | Errores de directorio activo / IP (usuarios internos)                                                                               | RESPUESTA_INESPERADA                        |

El **reCAPTCHA** de la página protege la recuperación de contraseña (`recuperarDatosAcceso`), no
el ingreso. Si algún día protegiera el ingreso, LURIS no lo resolvería (§6): el adaptador
respondería «requiere intervención».

## Código de acceso (segundo factor)

LURIS **nunca lee el correo ni evade el factor**. Cuando SIUGJ pide el código:

1. El worker deja el ingreso abierto en memoria (`SIUGJ_MINUTOS_PARA_CODIGO`, 10 por defecto) y
   marca la credencial «esperando código». Mientras espera, ninguna consulta vuelve a ingresar
   (se le enviarían códigos repetidos a la persona).
2. La persona ve el aviso en «Pendientes» y en Ajustes → Plataformas, y escribe el código que le
   llegó. Viaja cifrado por la cola (AES-256-GCM) y se audita la acción, nunca el código.
3. El worker lo entrega a SIUGJ. Si entra, guarda la sesión cifrada y vuelve a encolar las
   consultas laborales del despacho. Un código equivocado deja la credencial esperando otro; si
   el ingreso venció, la próxima consulta pide un código nuevo.

La sesión se reutiliza (§6: no iniciar sesión en cada consulta), así que el código solo se pide
cuando la sesión de SIUGJ vence.

## Qué cuenta se usa para cada proceso

La personal del abogado responsable, luego las personales de las demás personas asignadas (con
la membresía activa) y, por último, la del despacho. Sin ninguna, la consulta termina en
`SIN_CREDENCIAL`, con un mensaje que dice dónde registrarla.

## Después del ingreso (PROVISIONAL)

No se pudo ver sin cuenta: cómo se busca un expediente, cómo se presentan sus actuaciones (fecha
de actuación y de registro) y documentos, y qué dice el portal cuando la cuenta no tiene acceso.
Está modelado en `mapa-del-portal.ts` sobre el portal SIUGJ simulado de las pruebas
(`tests/apoyo/siugj-simulado.ts`). **Antes de activar SIUGJ en producción** hay que completar el
spike con una cuenta real:

1. Iniciar sesión con la cuenta (la persona misma, en un navegador) y abrir un expediente propio,
   uno ajeno (sin acceso) y uno inexistente.
2. Anotar la URL de consulta, la estructura de los datos, actuaciones y documentos, y el texto de
   «sin acceso».
3. Ajustar solo `mapa-del-portal.ts` (y el simulado, para que las pruebas lo reflejen). El resto
   del adaptador, los casos de uso y la interfaz no cambian.
4. Confirmar si las actuaciones de SIUGJ también llegan por la CPNU. Si llegan, marcar el
   resultado de SIUGJ como `soloDatos` (como SAMAI) para no duplicarlas.

## Ritmo y uso responsable (§6)

- `SIUGJ_SOLICITUDES_POR_MINUTO` = 6 por defecto, concurrencia 1 y un solo navegador por worker.
- User-Agent identificable de LURIS. Consentimiento explícito al guardar la credencial, que se
  puede borrar en cualquier momento.
- El usuario, la contraseña, la sesión y el código nunca se registran en el log.
- Navegador: `SIUGJ_NAVEGADOR=chromium` en Docker (Fase 13, con el Chromium de Playwright);
  en desarrollo puede usarse el del equipo (`msedge` o `chrome`).
