import { describe, expect, it } from 'vitest';
import { esExpedienteDeTyba, etiquetaDeOrigen, URL_DE_DESCARGA_DE_TYBA } from './tyba';

describe('esExpedienteDeTyba', () => {
  it('reconoce la ubicación que la CPNU da a los expedientes de Justicia XXI Web', () => {
    expect(esExpedienteDeTyba('Software: Justicia XXI Web')).toBe(true);
    expect(esExpedienteDeTyba('  software:  justicia xxi web ')).toBe(true);
  });

  it('no confunde las ubicaciones físicas del sistema anterior ni los datos ausentes', () => {
    expect(esExpedienteDeTyba('Secretaria - Estado')).toBe(false);
    expect(esExpedienteDeTyba('Archivo')).toBe(false);
    expect(esExpedienteDeTyba('Software: Justicia XXI')).toBe(false);
    expect(esExpedienteDeTyba('')).toBe(false);
    expect(esExpedienteDeTyba(null)).toBe(false);
  });
});

describe('etiquetaDeOrigen', () => {
  it('dice que Tyba llega por la Rama Judicial y nombra la plataforma en los demás casos', () => {
    expect(etiquetaDeOrigen('RAMA_CPNU', 'TYBA')).toBe('Tyba, vía la Rama Judicial');
    expect(etiquetaDeOrigen('RAMA_CPNU', null)).toBe('Rama Judicial (CPNU)');
    expect(etiquetaDeOrigen('SIUGJ', null)).toBe('SIUGJ');
  });
});

describe('descarga de Tyba', () => {
  it('apunta al portal oficial por HTTPS', () => {
    const url = new URL(URL_DE_DESCARGA_DE_TYBA);
    expect(url.protocol).toBe('https:');
    expect(url.host).toBe('procesojudicial.ramajudicial.gov.co');
  });
});
