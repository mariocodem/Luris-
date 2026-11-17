import { describe, expect, it } from 'vitest';
import { detectarTipoDeArchivo, nombreDeDescarga, tipoPorMime } from './tipo-de-archivo';

const bytes = (...valores: number[]) => new Uint8Array(valores);
const texto = (contenido: string) => new TextEncoder().encode(contenido);

describe('detectarTipoDeArchivo', () => {
  it('reconoce PDF por su firma, aunque el nombre diga otra cosa', () => {
    expect(detectarTipoDeArchivo(texto('%PDF-1.7\n...'), 'auto.doc')?.mime).toBe('application/pdf');
  });

  it('acepta PDF con bytes basura antes de la firma (dentro del primer KB)', () => {
    expect(detectarTipoDeArchivo(texto(`\n\n%PDF-1.4`), 'x')?.mime).toBe('application/pdf');
  });

  it('reconoce imágenes PNG, JPEG y TIFF', () => {
    expect(
      detectarTipoDeArchivo(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), 'x')?.extension,
    ).toBe('png');
    expect(detectarTipoDeArchivo(bytes(0xff, 0xd8, 0xff, 0xe0), 'x')?.extension).toBe('jpg');
    expect(detectarTipoDeArchivo(bytes(0x49, 0x49, 0x2a, 0x00), 'x')?.extension).toBe('tif');
  });

  it('distingue .doc y .xls (contenedor OLE) por el nombre', () => {
    const ole = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0);
    expect(detectarTipoDeArchivo(ole, 'AUTO.DOC')?.extension).toBe('doc');
    expect(detectarTipoDeArchivo(ole, 'liquidacion.xls')?.extension).toBe('xls');
  });

  it('reconoce Word y Excel modernos, pero no un ZIP cualquiera', () => {
    const zip = (entrada: string) =>
      new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...texto(`....[Content_Types].xml....${entrada}`)]);
    expect(detectarTipoDeArchivo(zip('word/document.xml'), 'memorial.docx')?.extension).toBe(
      'docx',
    );
    expect(detectarTipoDeArchivo(zip('xl/workbook.xml'), 'liquidacion.xlsx')?.extension).toBe(
      'xlsx',
    );
    const zipComun = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...texto('fotos/1.jpg')]);
    expect(detectarTipoDeArchivo(zipComun, 'anexos.zip')).toBeNull();
  });

  it('rechaza HTML, ejecutables y archivos vacíos', () => {
    expect(detectarTipoDeArchivo(texto('<!doctype html><script>'), 'auto.pdf')).toBeNull();
    expect(detectarTipoDeArchivo(bytes(0x4d, 0x5a, 0x90, 0x00), 'auto.pdf')).toBeNull();
    expect(detectarTipoDeArchivo(new Uint8Array(), 'auto.pdf')).toBeNull();
  });

  it('solo PDF e imágenes comunes se ven en línea', () => {
    expect(tipoPorMime('application/pdf')?.visibleEnLinea).toBe(true);
    expect(tipoPorMime('image/png')?.visibleEnLinea).toBe(true);
    expect(tipoPorMime('application/msword')?.visibleEnLinea).toBe(false);
    expect(tipoPorMime('text/html')).toBeNull();
  });
});

describe('nombreDeDescarga', () => {
  const pdf = tipoPorMime('application/pdf');
  if (!pdf) throw new Error('falta el tipo PDF');

  it('conserva el nombre de la plataforma y agrega la extensión del tipo real', () => {
    expect(nombreDeDescarga('44AGREGARMEMORIAL.pdf', pdf)).toBe('44AGREGARMEMORIAL.pdf');
    expect(nombreDeDescarga('Auto admite demanda', pdf)).toBe('Auto admite demanda.pdf');
    expect(nombreDeDescarga('auto.DOC', pdf)).toBe('auto.DOC.pdf');
  });

  it('quita caracteres que rompen rutas o cabeceras', () => {
    expect(nombreDeDescarga('../../etc/"passwd"\n', pdf)).toBe('.. .. etc passwd.pdf');
    expect(nombreDeDescarga('   ', pdf)).toBe('documento.pdf');
  });
});
