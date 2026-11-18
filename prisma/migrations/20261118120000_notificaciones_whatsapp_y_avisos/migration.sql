-- Fase 11 (notificaciones): sesión de WhatsApp del despacho y aviso al terminar una consulta masiva.
CREATE TYPE "estado_sesion_whatsapp" AS ENUM ('SIN_VINCULAR', 'VINCULANDO', 'CONECTADA', 'DESCONECTADA');

CREATE TABLE "sesiones_whatsapp" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "estado" "estado_sesion_whatsapp" NOT NULL DEFAULT 'SIN_VINCULAR',
    "datos_cifrados" BYTEA,
    "version_clave" INTEGER,
    "qr_cifrado" BYTEA,
    "qr_generado_en" TIMESTAMPTZ(3),
    "numero" VARCHAR(15),
    "vinculacion_solicitada_en" TIMESTAMPTZ(3),
    "conectada_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sesiones_whatsapp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sesiones_whatsapp_despacho_id_key" ON "sesiones_whatsapp"("despacho_id");

ALTER TABLE "sesiones_whatsapp" ADD CONSTRAINT "sesiones_whatsapp_despacho_id_fkey"
  FOREIGN KEY ("despacho_id") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Los datos y la clave de cifrado van juntos; el número solo existe con una sesión vinculada.
ALTER TABLE "sesiones_whatsapp" ADD CONSTRAINT "sesiones_whatsapp_datos_con_version"
  CHECK (("datos_cifrados" IS NULL) = ("version_clave" IS NULL));

ALTER TABLE "consultas_masivas" ADD COLUMN "notificada_en" TIMESTAMPTZ(3);

-- Las consultas masivas que ya terminaron antes de esta fase no se avisan.
UPDATE "consultas_masivas" SET "notificada_en" = COALESCE("finalizada_en", CURRENT_TIMESTAMP)
  WHERE "estado" = 'COMPLETADA';
