-- Fase 8 (SIUGJ): estados de consulta nuevos y sesión reutilizable de las credenciales.

-- AlterEnum
ALTER TYPE "estado_consulta" ADD VALUE 'SIN_ACCESO';
ALTER TYPE "estado_consulta" ADD VALUE 'SIN_CREDENCIAL';

-- AlterTable
ALTER TABLE "credenciales_plataforma"
  ADD COLUMN "sesion_cifrada" BYTEA,
  ADD COLUMN "sesion_version_clave" INTEGER,
  ADD COLUMN "sesion_guardada_en" TIMESTAMPTZ(3),
  ADD COLUMN "codigo_solicitado_en" TIMESTAMPTZ(3);

-- La sesión cifrada siempre lleva la versión de la clave con que se cifró.
ALTER TABLE "credenciales_plataforma"
  ADD CONSTRAINT "credenciales_sesion_con_version"
  CHECK (("sesion_cifrada" IS NULL) = ("sesion_version_clave" IS NULL));
