-- CreateTable
CREATE TABLE "sesiones" (
    "id" UUID NOT NULL,
    "token" VARCHAR(255) NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "direccion_ip" VARCHAR(45),
    "agente_de_usuario" VARCHAR(1000),
    "usuario_id" UUID NOT NULL,
    "despacho_activo_id" UUID,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sesiones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas" (
    "id" UUID NOT NULL,
    "id_en_proveedor" VARCHAR(255) NOT NULL,
    "proveedor" VARCHAR(50) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_de_acceso" TEXT,
    "token_de_renovacion" TEXT,
    "token_de_identidad" TEXT,
    "acceso_expira_en" TIMESTAMPTZ(3),
    "renovacion_expira_en" TIMESTAMPTZ(3),
    "alcance" TEXT,
    "contrasena_hash" TEXT,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verificaciones" (
    "id" UUID NOT NULL,
    "identificador" VARCHAR(255) NOT NULL,
    "valor" TEXT NOT NULL,
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "verificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitaciones" (
    "id" UUID NOT NULL,
    "despacho_id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "rol" VARCHAR(20) NOT NULL,
    "estado" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "expira_en" TIMESTAMPTZ(3) NOT NULL,
    "invitado_por_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "aceptada_en" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sesiones_token_key" ON "sesiones"("token");

-- CreateIndex
CREATE INDEX "sesiones_usuario_id_idx" ON "sesiones"("usuario_id");

-- CreateIndex
CREATE INDEX "sesiones_despacho_activo_id_idx" ON "sesiones"("despacho_activo_id");

-- CreateIndex
CREATE INDEX "cuentas_usuario_id_idx" ON "cuentas"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_proveedor_id_en_proveedor_key" ON "cuentas"("proveedor", "id_en_proveedor");

-- CreateIndex
CREATE INDEX "verificaciones_identificador_idx" ON "verificaciones"("identificador");

-- CreateIndex
CREATE UNIQUE INDEX "invitaciones_token_hash_key" ON "invitaciones"("token_hash");

-- CreateIndex
CREATE INDEX "invitaciones_despacho_id_estado_idx" ON "invitaciones"("despacho_id", "estado");

-- CreateIndex
CREATE INDEX "invitaciones_email_idx" ON "invitaciones"("email");

-- CreateIndex
CREATE UNIQUE INDEX "invitaciones_id_despacho_id_key" ON "invitaciones"("id", "despacho_id");

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sesiones" ADD CONSTRAINT "sesiones_despacho_activo_id_fkey" FOREIGN KEY ("despacho_activo_id") REFERENCES "despachos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_despacho_id_fkey" FOREIGN KEY ("despacho_id") REFERENCES "despachos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_invitado_por_id_fkey" FOREIGN KEY ("invitado_por_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Restricciones CHECK e índices parciales (no representables en schema.prisma) ──

-- Invitaciones: email en minúsculas, roles del §5 y estados del plugin de organizaciones.
ALTER TABLE "invitaciones"
  ADD CONSTRAINT "invitaciones_email_minusculas" CHECK ("email" = lower("email")),
  ADD CONSTRAINT "invitaciones_rol_valido" CHECK ("rol" IN ('administrador', 'abogado', 'asistente')),
  ADD CONSTRAINT "invitaciones_estado_valido" CHECK ("estado" IN ('pending', 'accepted', 'canceled', 'rejected')),
  ADD CONSTRAINT "invitaciones_token_hash_formato" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "invitaciones_aceptada_coherente" CHECK (("estado" = 'accepted') = ("aceptada_en" IS NOT NULL));

-- Una sola invitación pendiente por persona y despacho (reenviar reemplaza la anterior).
CREATE UNIQUE INDEX "invitaciones_pendiente_unica" ON "invitaciones"("despacho_id", "email")
  WHERE "estado" = 'pending';

-- Cuentas: en LURIS solo existe el acceso con correo y contraseña.
ALTER TABLE "cuentas"
  ADD CONSTRAINT "cuentas_proveedor_valido" CHECK ("proveedor" IN ('credential'));
