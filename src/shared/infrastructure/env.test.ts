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
});
