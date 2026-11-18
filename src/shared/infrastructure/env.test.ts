import { describe, expect, it } from 'vitest';
import { parsearEnv } from './env';

const BASE = {
  DATABASE_URL: 'postgresql://luris:luris@localhost:5432/luris',
  BETTER_AUTH_SECRET: 'secreto-de-pruebas-con-mas-de-32-caracteres',
};

describe('parsearEnv', () => {
  it('acepta una configuración mínima y aplica valores por defecto', () => {
    const resultado = parsearEnv(BASE);

    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.value).toMatchObject({
      NODE_ENV: 'development',
      APP_URL: 'http://localhost:3000',
      LOG_LEVEL: 'info',
      LOG_FORMAT: 'pretty',
      INVITACION_HORAS_VIGENCIA: 72,
      RECUPERACION_MINUTOS_VIGENCIA: 60,
      CORREO_TRANSPORTE: 'archivo',
    });
  });

  it('usa logs JSON fuera de desarrollo si no se indica formato', () => {
    const resultado = parsearEnv({ ...BASE, NODE_ENV: 'test' });
    expect(resultado.ok && resultado.value.LOG_FORMAT).toBe('json');
  });

  it('respeta el formato de log indicado', () => {
    const resultado = parsearEnv({ ...BASE, NODE_ENV: 'test', LOG_FORMAT: 'pretty' });
    expect(resultado.ok && resultado.value.LOG_FORMAT).toBe('pretty');
  });

  it('exige DATABASE_URL y el secreto de sesiones', () => {
    const resultado = parsearEnv({});
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.problemas).toHaveLength(2);
    expect(resultado.error.problemas.join('\n')).toMatch(/^DATABASE_URL:/m);
    expect(resultado.error.problemas.join('\n')).toMatch(/^BETTER_AUTH_SECRET:/m);
  });

  it('rechaza un secreto de sesiones corto', () => {
    expect(parsearEnv({ ...BASE, BETTER_AUTH_SECRET: 'corto' }).ok).toBe(false);
  });

  it('no permite guardar correos en archivos en producción (contienen enlaces de acceso)', () => {
    const resultado = parsearEnv({ ...BASE, NODE_ENV: 'production' });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.error.problemas[0]).toMatch(/^CORREO_TRANSPORTE:/);
  });

  it('trata una variable vacía como ausente', () => {
    expect(parsearEnv({ ...BASE, DATABASE_URL: '' }).ok).toBe(false);
    expect(parsearEnv({ ...BASE, LOG_LEVEL: '' }).ok).toBe(true);
  });

  it('rechaza una DATABASE_URL que no es de PostgreSQL', () => {
    const resultado = parsearEnv({ ...BASE, DATABASE_URL: 'mysql://root@localhost/luris' });
    expect(resultado.ok).toBe(false);
  });

  it('no incluye los valores de las variables en los problemas (pueden ser secretos)', () => {
    const secreto = 'mysql://admin:SuperSecreta123@db/luris';
    const resultado = parsearEnv({
      DATABASE_URL: secreto,
      LOG_LEVEL: 'verboso',
      BETTER_AUTH_SECRET: 'OtroSecreto',
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    const texto = resultado.error.problemas.join('\n');
    expect(texto).not.toContain('SuperSecreta123');
    expect(texto).not.toContain('OtroSecreto');
    expect(texto).toMatch(/LOG_LEVEL/);
  });

  it('trae valores conservadores para las plataformas y un User-Agent identificable', () => {
    const resultado = parsearEnv(BASE);
    expect(resultado.ok && resultado.value).toMatchObject({
      CPNU_SOLICITUDES_POR_MINUTO: 20,
      CPNU_PAUSA_POR_BLOQUEO_MINUTOS: 10,
      SINCRONIZACION_CRON: '0 6,13,19 * * *',
      SPOA_DIAS_ENTRE_CONFIRMACIONES: 7,
      ALMACEN_DIRECTORIO: 'storage/documentos',
      PLATAFORMAS_USER_AGENT:
        'LURIS/0.1 (seguimiento de procesos judiciales; +http://localhost:3000)',
    });
  });

  it('acepta un cron de 5 campos u «off», y rechaza lo demás', () => {
    expect(parsearEnv({ ...BASE, SINCRONIZACION_CRON: 'off' }).ok).toBe(true);
    expect(parsearEnv({ ...BASE, SINCRONIZACION_CRON: '*/30 7-19 * * 1-5' }).ok).toBe(true);
    expect(parsearEnv({ ...BASE, SINCRONIZACION_CRON: 'cada hora' }).ok).toBe(false);
  });

  it('el servicio oficial del SPOA exige URL y credencial juntas', () => {
    const soloUrl = parsearEnv({ ...BASE, SPOA_INTEROPERABILIDAD_URL: 'https://spoa.test/api' });
    expect(soloUrl.ok).toBe(false);
    expect(!soloUrl.ok && soloUrl.error.problemas.join(' ')).toContain(
      'SPOA_INTEROPERABILIDAD_TOKEN',
    );
    const ambas = parsearEnv({
      ...BASE,
      SPOA_INTEROPERABILIDAD_URL: 'https://spoa.test/api',
      SPOA_INTEROPERABILIDAD_TOKEN: 'credencial-de-prueba-larga',
    });
    expect(ambas.ok).toBe(true);
    // Solo por HTTPS: la credencial nunca viaja en claro.
    expect(
      parsearEnv({
        ...BASE,
        SPOA_INTEROPERABILIDAD_URL: 'http://spoa.test/api',
        SPOA_INTEROPERABILIDAD_TOKEN: 'credencial-de-prueba-larga',
      }).ok,
    ).toBe(false);
  });

  it('la clave de credenciales debe ser de 32 bytes en base64, y es opcional', () => {
    expect(parsearEnv(BASE).ok).toBe(true);
    expect(
      parsearEnv({ ...BASE, CREDENCIALES_CLAVE: Buffer.alloc(32, 7).toString('base64') }).ok,
    ).toBe(true);
    const corta = parsearEnv({
      ...BASE,
      CREDENCIALES_CLAVE: Buffer.alloc(16, 7).toString('base64'),
    });
    expect(corta.ok).toBe(false);
    expect(!corta.ok && corta.error.problemas.join(' ')).toContain('CREDENCIALES_CLAVE');
    // Nunca se repite el valor en el mensaje (es un secreto).
    expect(!corta.ok && corta.error.problemas.join(' ')).not.toContain(
      Buffer.alloc(16, 7).toString('base64'),
    );
  });

  describe('correo y notificaciones (Fase 11)', () => {
    it('en producción acepta el transporte SMTP con su servidor', () => {
      const r = parsearEnv({
        ...BASE,
        NODE_ENV: 'production',
        CORREO_TRANSPORTE: 'smtp',
        SMTP_HOST: 'smtp.ejemplo.com',
        SMTP_USUARIO: 'luris',
        SMTP_CLAVE: 'clave',
      });
      expect(r.ok).toBe(true);
      expect(r.ok && r.value).toMatchObject({ SMTP_PUERTO: 587, SMTP_HOST: 'smtp.ejemplo.com' });
    });

    it('el transporte SMTP exige el servidor', () => {
      const r = parsearEnv({ ...BASE, CORREO_TRANSPORTE: 'smtp' });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.problemas[0]).toMatch(/^SMTP_HOST:/);
    });

    it('el usuario y la clave del SMTP van juntos', () => {
      const r = parsearEnv({
        ...BASE,
        CORREO_TRANSPORTE: 'smtp',
        SMTP_HOST: 'smtp.ejemplo.com',
        SMTP_USUARIO: 'luris',
      });
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.problemas[0]).toMatch(/^SMTP_CLAVE:/);
    });

    it('lee SMTP_SEGURO como booleano y valida el puerto', () => {
      const r = parsearEnv({
        ...BASE,
        CORREO_TRANSPORTE: 'smtp',
        SMTP_HOST: 'smtp.ejemplo.com',
        SMTP_PUERTO: '465',
        SMTP_SEGURO: 'true',
      });
      expect(r.ok && r.value).toMatchObject({ SMTP_PUERTO: 465, SMTP_SEGURO: true });
      expect(parsearEnv({ ...BASE, SMTP_PUERTO: '70000' }).ok).toBe(false);
    });

    it('tiene valores por defecto para el resumen diario y el ritmo de WhatsApp', () => {
      const r = parsearEnv(BASE);
      expect(r.ok && r.value).toMatchObject({
        NOTIFICACIONES_HORA_RESUMEN: 7,
        WHATSAPP_MENSAJES_POR_MINUTO: 6,
      });
      expect(parsearEnv({ ...BASE, NOTIFICACIONES_HORA_RESUMEN: '24' }).ok).toBe(false);
      expect(parsearEnv({ ...BASE, WHATSAPP_MENSAJES_POR_MINUTO: '100' }).ok).toBe(false);
    });
  });
});
