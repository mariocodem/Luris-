-- El QR se cifra con su propia versión de clave (los datos de la sesión pueden ser de otra).
ALTER TABLE "sesiones_whatsapp" ADD COLUMN "qr_version_clave" INTEGER;
