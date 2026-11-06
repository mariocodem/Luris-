-- CreateEnum
CREATE TYPE "estado_despacho" AS ENUM ('ACTIVO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "codigo_plataforma" AS ENUM ('RAMA_CPNU', 'SPOA', 'SAMAI', 'SIUGJ', 'TYBA');

-- CreateEnum
CREATE TYPE "tipo_identificador" AS ENUM ('RADICADO', 'NUNC');

-- CreateEnum
CREATE TYPE "estado_consulta" AS ENUM ('EXITOSA', 'NO_ENCONTRADO', 'PLATAFORMA_NO_DISPONIBLE', 'CREDENCIALES_INVALIDAS', 'REQUIERE_INTERVENCION', 'LIMITE_DE_CONSULTAS', 'RESPUESTA_INESPERADA');

-- CreateEnum
CREATE TYPE "tipo_asignacion" AS ENUM ('RESPONSABLE', 'ASIGNADO');

-- CreateEnum
CREATE TYPE "alcance_credencial" AS ENUM ('DESPACHO', 'PERSONAL');

-- CreateEnum
CREATE TYPE "estado_documento" AS ENUM ('PENDIENTE', 'DESCARGADO', 'NO_DISPONIBLE');

-- CreateEnum
CREATE TYPE "estado_consulta_masiva" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "estado_item_consulta_masiva" AS ENUM ('PENDIENTE', 'EN_PROCESO', 'COMPLETADO', 'FALLIDO', 'PENDIENTE_CONFIRMACION');

-- CreateEnum
CREATE TYPE "canal_notificacion" AS ENUM ('CORREO', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "frecuencia_notificacion" AS ENUM ('INMEDIATA', 'RESUMEN_DIARIO');

-- CreateEnum
CREATE TYPE "estado_notificacion" AS ENUM ('PENDIENTE', 'ENVIADA', 'FALLIDA');

-- CreateTable
CREATE TABLE "despachos" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "nit" VARCHAR(15),
    "plan" VARCHAR(50) NOT NULL DEFAULT 'ESTANDAR',
    "estado" "estado_despacho" NOT NULL DEFAULT 'ACTIVO',
    "logo" TEXT,
    "metadata" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "despachos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nombre" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "email_verificado" BOOLEAN NOT NULL DEFAULT false,
    "imagen" TEXT,
    "es_superadmin" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresias" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "rol" VARCHAR(20) NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "membresias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procesos" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "radicado" VARCHAR(23),
    "nunc" VARCHAR(21),
    "alias" VARCHAR(200),
    "cliente" VARCHAR(300),
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "procesos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignaciones_proceso" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "membresia_id" UUID NOT NULL,
    "tipo" "tipo_asignacion" NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignaciones_proceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiquetas" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "nombre" VARCHAR(50) NOT NULL,
    "color" VARCHAR(20),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etiquetas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etiquetas_proceso" (
    "despacho_id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "etiqueta_id" UUID NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etiquetas_proceso_pkey" PRIMARY KEY ("proceso_id","etiqueta_id")
);

-- CreateTable
CREATE TABLE "procesos_plataforma" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "plataforma" "codigo_plataforma" NOT NULL,
    "id_externo" VARCHAR(100),
    "datos_proceso" JSONB,
    "ultima_sincronizacion_en" TIMESTAMPTZ(3),
    "estado_ultima_consulta" "estado_consulta",
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "procesos_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actuaciones" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "proceso_plataforma_id" UUID NOT NULL,
    "id_externo" VARCHAR(100),
    "clave_deduplicacion" VARCHAR(100) NOT NULL,
    "fecha_actuacion" DATE NOT NULL,
    "fecha_registro" DATE,
    "descripcion" TEXT NOT NULL,
    "anotacion" TEXT,
    "tiene_documentos" BOOLEAN NOT NULL DEFAULT false,
    "detectada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "actuaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "actuacion_id" UUID NOT NULL,
    "nombre" VARCHAR(300) NOT NULL,
    "url_origen" TEXT,
    "estado" "estado_documento" NOT NULL DEFAULT 'PENDIENTE',
    "tipo_mime" VARCHAR(100),
    "tamano_bytes" INTEGER,
    "sha256" CHAR(64),
    "ruta_almacenamiento" TEXT,
    "descargado_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credenciales_plataforma" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "membresia_id" UUID NOT NULL,
    "plataforma" "codigo_plataforma" NOT NULL,
    "alcance" "alcance_credencial" NOT NULL,
    "usuario" VARCHAR(200) NOT NULL,
    "secreto_cifrado" BYTEA NOT NULL,
    "version_clave" INTEGER NOT NULL DEFAULT 1,
    "consentimiento_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credenciales_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultas_masivas" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "creada_por_id" UUID NOT NULL,
    "estado" "estado_consulta_masiva" NOT NULL DEFAULT 'PENDIENTE',
    "total_items" INTEGER NOT NULL,
    "iniciada_en" TIMESTAMPTZ(3),
    "finalizada_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "consultas_masivas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items_consulta_masiva" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "consulta_masiva_id" UUID NOT NULL,
    "tipo_identificador" "tipo_identificador" NOT NULL,
    "identificador" VARCHAR(23) NOT NULL,
    "plataforma" "codigo_plataforma" NOT NULL,
    "estado" "estado_item_consulta_masiva" NOT NULL DEFAULT 'PENDIENTE',
    "resultado" "estado_consulta",
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "resumen" JSONB,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "items_consulta_masiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "preferencias_notificacion" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "membresia_id" UUID NOT NULL,
    "correo_activo" BOOLEAN NOT NULL DEFAULT true,
    "whatsapp_activo" BOOLEAN NOT NULL DEFAULT false,
    "numero_whatsapp" VARCHAR(15),
    "consentimiento_whatsapp_en" TIMESTAMPTZ(3),
    "frecuencia" "frecuencia_notificacion" NOT NULL DEFAULT 'INMEDIATA',
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "preferencias_notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "membresia_id" UUID NOT NULL,
    "actuacion_id" UUID NOT NULL,
    "canal" "canal_notificacion" NOT NULL,
    "estado" "estado_notificacion" NOT NULL DEFAULT 'PENDIENTE',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "codigo_error" VARCHAR(100),
    "programada_para" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviada_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registros_auditoria" (
    "id" UUID NOT NULL,
    "despacho_id" UUID,
    "actor_id" UUID,
    "accion" VARCHAR(100) NOT NULL,
    "entidad" VARCHAR(100),
    "entidad_id" VARCHAR(100),
    "datos" JSONB,
    "ip" VARCHAR(45),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registros_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "despachos_slug_key" ON "despachos"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "despachos_nit_key" ON "despachos"("nit");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "membresias_usuario_id_idx" ON "membresias"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "membresias_despacho_id_usuario_id_key" ON "membresias"("despacho_id", "usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "membresias_id_despacho_id_key" ON "membresias"("id", "despacho_id");

-- CreateIndex
CREATE INDEX "procesos_despacho_id_activo_idx" ON "procesos"("despacho_id", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "procesos_despacho_id_radicado_key" ON "procesos"("despacho_id", "radicado");

-- CreateIndex
CREATE UNIQUE INDEX "procesos_despacho_id_nunc_key" ON "procesos"("despacho_id", "nunc");

-- CreateIndex
CREATE UNIQUE INDEX "procesos_id_despacho_id_key" ON "procesos"("id", "despacho_id");

-- CreateIndex
CREATE INDEX "asignaciones_proceso_membresia_id_tipo_idx" ON "asignaciones_proceso"("membresia_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "asignaciones_proceso_proceso_id_membresia_id_key" ON "asignaciones_proceso"("proceso_id", "membresia_id");

-- CreateIndex
CREATE UNIQUE INDEX "asignaciones_proceso_un_responsable" ON "asignaciones_proceso"("proceso_id") WHERE (tipo = 'RESPONSABLE');

-- CreateIndex
CREATE UNIQUE INDEX "etiquetas_despacho_id_nombre_key" ON "etiquetas"("despacho_id", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "etiquetas_id_despacho_id_key" ON "etiquetas"("id", "despacho_id");

-- CreateIndex
CREATE INDEX "etiquetas_proceso_etiqueta_id_idx" ON "etiquetas_proceso"("etiqueta_id");

-- CreateIndex
CREATE INDEX "procesos_plataforma_despacho_id_plataforma_idx" ON "procesos_plataforma"("despacho_id", "plataforma");

-- CreateIndex
CREATE UNIQUE INDEX "procesos_plataforma_proceso_id_plataforma_key" ON "procesos_plataforma"("proceso_id", "plataforma");

-- CreateIndex
CREATE UNIQUE INDEX "procesos_plataforma_id_despacho_id_key" ON "procesos_plataforma"("id", "despacho_id");

-- CreateIndex
CREATE INDEX "actuaciones_proceso_plataforma_id_fecha_actuacion_idx" ON "actuaciones"("proceso_plataforma_id", "fecha_actuacion" DESC);

-- CreateIndex
CREATE INDEX "actuaciones_despacho_id_fecha_actuacion_idx" ON "actuaciones"("despacho_id", "fecha_actuacion" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "actuaciones_proceso_plataforma_id_clave_deduplicacion_key" ON "actuaciones"("proceso_plataforma_id", "clave_deduplicacion");

-- CreateIndex
CREATE UNIQUE INDEX "actuaciones_id_despacho_id_key" ON "actuaciones"("id", "despacho_id");

-- CreateIndex
CREATE INDEX "documentos_actuacion_id_idx" ON "documentos"("actuacion_id");

-- CreateIndex
CREATE INDEX "documentos_despacho_id_sha256_idx" ON "documentos"("despacho_id", "sha256");

-- CreateIndex
CREATE INDEX "credenciales_plataforma_despacho_id_plataforma_idx" ON "credenciales_plataforma"("despacho_id", "plataforma");

-- CreateIndex
CREATE UNIQUE INDEX "credenciales_una_por_despacho" ON "credenciales_plataforma"("despacho_id", "plataforma") WHERE (alcance = 'DESPACHO');

-- CreateIndex
CREATE UNIQUE INDEX "credenciales_una_personal" ON "credenciales_plataforma"("membresia_id", "plataforma") WHERE (alcance = 'PERSONAL');

-- CreateIndex
CREATE INDEX "consultas_masivas_despacho_id_creado_en_idx" ON "consultas_masivas"("despacho_id", "creado_en" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "consultas_masivas_id_despacho_id_key" ON "consultas_masivas"("id", "despacho_id");

-- CreateIndex
CREATE INDEX "items_consulta_masiva_consulta_masiva_id_estado_idx" ON "items_consulta_masiva"("consulta_masiva_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "items_consulta_masiva_consulta_masiva_id_identificador_plat_key" ON "items_consulta_masiva"("consulta_masiva_id", "identificador", "plataforma");

-- CreateIndex
CREATE UNIQUE INDEX "preferencias_notificacion_membresia_id_despacho_id_key" ON "preferencias_notificacion"("membresia_id", "despacho_id");

-- CreateIndex
CREATE INDEX "notificaciones_estado_programada_para_idx" ON "notificaciones"("estado", "programada_para");

-- CreateIndex
CREATE INDEX "notificaciones_membresia_id_idx" ON "notificaciones"("membresia_id");

-- CreateIndex
CREATE UNIQUE INDEX "notificaciones_actuacion_id_membresia_id_canal_key" ON "notificaciones"("actuacion_id", "membresia_id", "canal");

-- CreateIndex
CREATE INDEX "registros_auditoria_despacho_id_creado_en_idx" ON "registros_auditoria"("despacho_id", "creado_en" DESC);

-- CreateIndex
CREATE INDEX "registros_auditoria_actor_id_idx" ON "registros_auditoria"("actor_id");

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_despacho_id_fkey" FOREIGN KEY ("despacho_id") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresias" ADD CONSTRAINT "membresias_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procesos" ADD CONSTRAINT "procesos_despacho_id_fkey" FOREIGN KEY ("despacho_id") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_proceso" ADD CONSTRAINT "asignaciones_proceso_proceso_id_despacho_id_fkey" FOREIGN KEY ("proceso_id", "despacho_id") REFERENCES "procesos"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_proceso" ADD CONSTRAINT "asignaciones_proceso_membresia_id_despacho_id_fkey" FOREIGN KEY ("membresia_id", "despacho_id") REFERENCES "membresias"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas" ADD CONSTRAINT "etiquetas_despacho_id_fkey" FOREIGN KEY ("despacho_id") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas_proceso" ADD CONSTRAINT "etiquetas_proceso_proceso_id_despacho_id_fkey" FOREIGN KEY ("proceso_id", "despacho_id") REFERENCES "procesos"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etiquetas_proceso" ADD CONSTRAINT "etiquetas_proceso_etiqueta_id_despacho_id_fkey" FOREIGN KEY ("etiqueta_id", "despacho_id") REFERENCES "etiquetas"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "procesos_plataforma" ADD CONSTRAINT "procesos_plataforma_proceso_id_despacho_id_fkey" FOREIGN KEY ("proceso_id", "despacho_id") REFERENCES "procesos"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actuaciones" ADD CONSTRAINT "actuaciones_proceso_plataforma_id_despacho_id_fkey" FOREIGN KEY ("proceso_plataforma_id", "despacho_id") REFERENCES "procesos_plataforma"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_actuacion_id_despacho_id_fkey" FOREIGN KEY ("actuacion_id", "despacho_id") REFERENCES "actuaciones"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credenciales_plataforma" ADD CONSTRAINT "credenciales_plataforma_membresia_id_despacho_id_fkey" FOREIGN KEY ("membresia_id", "despacho_id") REFERENCES "membresias"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultas_masivas" ADD CONSTRAINT "consultas_masivas_creada_por_id_despacho_id_fkey" FOREIGN KEY ("creada_por_id", "despacho_id") REFERENCES "membresias"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items_consulta_masiva" ADD CONSTRAINT "items_consulta_masiva_consulta_masiva_id_despacho_id_fkey" FOREIGN KEY ("consulta_masiva_id", "despacho_id") REFERENCES "consultas_masivas"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preferencias_notificacion" ADD CONSTRAINT "preferencias_notificacion_membresia_id_despacho_id_fkey" FOREIGN KEY ("membresia_id", "despacho_id") REFERENCES "membresias"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_membresia_id_despacho_id_fkey" FOREIGN KEY ("membresia_id", "despacho_id") REFERENCES "membresias"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_actuacion_id_despacho_id_fkey" FOREIGN KEY ("actuacion_id", "despacho_id") REFERENCES "actuaciones"("id", "despacho_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_auditoria" ADD CONSTRAINT "registros_auditoria_despacho_id_fkey" FOREIGN KEY ("despacho_id") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registros_auditoria" ADD CONSTRAINT "registros_auditoria_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Restricciones CHECK (no representables en schema.prisma) ─────────────────
-- Prisma Migrate no las elimina en migraciones posteriores. Mantener alineadas con el dominio.

-- Despachos: NIT solo dígitos; slug en minúsculas con guiones.
ALTER TABLE "despachos"
  ADD CONSTRAINT "despachos_nit_solo_digitos" CHECK ("nit" ~ '^[0-9]+$'),
  ADD CONSTRAINT "despachos_slug_formato" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- Usuarios: el email se guarda en minúsculas (unicidad sin distinguir mayúsculas).
ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_email_minusculas" CHECK ("email" = lower("email"));

-- Membresías: roles del §5 (ver src/modules/usuarios/domain/rol-de-despacho.ts).
ALTER TABLE "membresias"
  ADD CONSTRAINT "membresias_rol_valido" CHECK ("rol" IN ('administrador', 'abogado', 'asistente'));

-- Procesos: radicado de 23 dígitos y NUNC de 21, sin guiones ni espacios; al menos uno.
ALTER TABLE "procesos"
  ADD CONSTRAINT "procesos_radicado_formato" CHECK ("radicado" ~ '^[0-9]{23}$'),
  ADD CONSTRAINT "procesos_nunc_formato" CHECK ("nunc" ~ '^[0-9]{21}$'),
  ADD CONSTRAINT "procesos_requiere_identificador" CHECK ("radicado" IS NOT NULL OR "nunc" IS NOT NULL);

-- Documentos: hash SHA-256 en hexadecimal; un documento descargado tiene todos sus datos.
ALTER TABLE "documentos"
  ADD CONSTRAINT "documentos_sha256_formato" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "documentos_tamano_no_negativo" CHECK ("tamano_bytes" >= 0),
  ADD CONSTRAINT "documentos_descargado_completo" CHECK (
    "estado" <> 'DESCARGADO'
    OR ("sha256" IS NOT NULL AND "ruta_almacenamiento" IS NOT NULL
        AND "tipo_mime" IS NOT NULL AND "tamano_bytes" IS NOT NULL AND "descargado_en" IS NOT NULL)
  );

-- Credenciales: versión de clave positiva y secreto no vacío.
ALTER TABLE "credenciales_plataforma"
  ADD CONSTRAINT "credenciales_version_clave_positiva" CHECK ("version_clave" >= 1),
  ADD CONSTRAINT "credenciales_secreto_no_vacio" CHECK (octet_length("secreto_cifrado") > 0);

-- Consulta masiva: entre 1 y 400 ítems por lote (§7).
ALTER TABLE "consultas_masivas"
  ADD CONSTRAINT "consultas_masivas_total_items_rango" CHECK ("total_items" BETWEEN 1 AND 400);

ALTER TABLE "items_consulta_masiva"
  ADD CONSTRAINT "items_consulta_masiva_identificador_formato" CHECK (
    ("tipo_identificador" = 'RADICADO' AND "identificador" ~ '^[0-9]{23}$')
    OR ("tipo_identificador" = 'NUNC' AND "identificador" ~ '^[0-9]{21}$')
  ),
  ADD CONSTRAINT "items_consulta_masiva_intentos_no_negativos" CHECK ("intentos" >= 0);

-- Preferencias: WhatsApp solo con número y consentimiento registrados (§9).
ALTER TABLE "preferencias_notificacion"
  ADD CONSTRAINT "preferencias_numero_whatsapp_formato" CHECK ("numero_whatsapp" ~ '^[0-9]{8,15}$'),
  ADD CONSTRAINT "preferencias_whatsapp_requiere_consentimiento" CHECK (
    NOT "whatsapp_activo"
    OR ("numero_whatsapp" IS NOT NULL AND "consentimiento_whatsapp_en" IS NOT NULL)
  );

ALTER TABLE "notificaciones"
  ADD CONSTRAINT "notificaciones_intentos_no_negativos" CHECK ("intentos" >= 0);
