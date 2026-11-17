-- Fase 7: verificación de credenciales de plataformas y documentos subidos a mano.

-- AlterTable
ALTER TABLE "credenciales_plataforma" ADD COLUMN     "estado_verificacion" "estado_consulta",
ADD COLUMN     "verificada_en" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN     "subido_por_id" UUID;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_subido_por_id_despacho_id_fkey" FOREIGN KEY ("subido_por_id", "despacho_id") REFERENCES "membresias"("id", "despacho_id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- ─── Restricciones CHECK (no representables en schema.prisma) ─────────────────

-- La verificación de una credencial tiene fecha y resultado, o ninguno de los dos.
ALTER TABLE "credenciales_plataforma"
  ADD CONSTRAINT "credenciales_verificacion_completa" CHECK (
    ("verificada_en" IS NULL) = ("estado_verificacion" IS NULL)
  );

-- Un documento subido a mano ya está guardado (no se descarga de ninguna plataforma).
ALTER TABLE "documentos"
  ADD CONSTRAINT "documentos_subido_esta_guardado" CHECK (
    "subido_por_id" IS NULL OR "estado" = 'DESCARGADO'
  );
