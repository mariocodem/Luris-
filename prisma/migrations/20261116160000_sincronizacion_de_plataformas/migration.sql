-- Fase 5: sincronización con las plataformas (CPNU) y documentos de las actuaciones.

-- DropIndex
DROP INDEX "documentos_actuacion_id_idx";

-- AlterTable
ALTER TABLE "actuaciones" ADD COLUMN     "carga_inicial" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "despacho_judicial" VARCHAR(200),
ADD COLUMN     "termino_inicia" DATE,
ADD COLUMN     "termino_vence" DATE;

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "fecha_carga" DATE,
ADD COLUMN     "id_externo" VARCHAR(100),
ADD COLUMN     "intentos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "ultimo_intento_en" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "procesos_plataforma" ADD COLUMN     "ultima_consulta_en" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "documentos_actuacion_id_id_externo_key" ON "documentos"("actuacion_id", "id_externo");

-- ─── Restricciones CHECK (no representables en schema.prisma) ─────────────────

-- Un término no vence antes de empezar; los intentos de descarga no son negativos.
ALTER TABLE "actuaciones"
  ADD CONSTRAINT "actuaciones_termino_coherente" CHECK (
    "termino_inicia" IS NULL OR "termino_vence" IS NULL OR "termino_vence" >= "termino_inicia"
  );

ALTER TABLE "documentos"
  ADD CONSTRAINT "documentos_intentos_no_negativos" CHECK ("intentos" >= 0);
