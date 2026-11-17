-- Fase 6: bandeja «Pendientes de tu confirmación» de las consultas asistidas (SPOA).

-- CreateEnum
CREATE TYPE "origen_pendiente" AS ENUM ('PROGRAMADA', 'MASIVA');

-- CreateTable
CREATE TABLE "pendientes_de_confirmacion" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "plataforma" "codigo_plataforma" NOT NULL,
    "origen" "origen_pendiente" NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resuelto_en" TIMESTAMPTZ(3),

    CONSTRAINT "pendientes_de_confirmacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pendientes_de_confirmacion_despacho_id_resuelto_en_idx" ON "pendientes_de_confirmacion"("despacho_id", "resuelto_en");

-- CreateIndex
CREATE UNIQUE INDEX "pendientes_uno_abierto" ON "pendientes_de_confirmacion"("proceso_id", "plataforma") WHERE (resuelto_en IS NULL);

-- AddForeignKey
ALTER TABLE "pendientes_de_confirmacion" ADD CONSTRAINT "pendientes_de_confirmacion_despacho_id_fkey" FOREIGN KEY ("despacho_id") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pendientes_de_confirmacion" ADD CONSTRAINT "pendientes_de_confirmacion_proceso_id_despacho_id_fkey" FOREIGN KEY ("proceso_id", "despacho_id") REFERENCES "procesos"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Restricciones CHECK (no representables en schema.prisma) ─────────────────

-- Un pendiente no se resuelve antes de crearse.
ALTER TABLE "pendientes_de_confirmacion"
  ADD CONSTRAINT "pendientes_resuelto_despues_de_creado" CHECK (
    "resuelto_en" IS NULL OR "resuelto_en" >= "creado_en"
  );
