-- Fase 10 (consulta masiva): cada ítem apunta al proceso que se consulta, para ubicar sus
-- resultados cuando el worker termina la sincronización y para abrir su ficha.
ALTER TABLE "items_consulta_masiva" ADD COLUMN "proceso_id" UUID;

CREATE INDEX "items_consulta_masiva_despacho_id_proceso_id_plataforma_est_idx"
  ON "items_consulta_masiva"("despacho_id", "proceso_id", "plataforma", "estado");

ALTER TABLE "items_consulta_masiva"
  ADD CONSTRAINT "items_consulta_masiva_proceso_id_despacho_id_fkey"
  FOREIGN KEY ("proceso_id", "despacho_id") REFERENCES "procesos"("id", "despacho_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
