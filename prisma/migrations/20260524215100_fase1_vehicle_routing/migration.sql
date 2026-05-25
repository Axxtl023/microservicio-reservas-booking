-- ════════════════════════════════════════════════════════════════════
-- FASE 1 — Multi-provider routing (scope: VEHICLE)
-- ════════════════════════════════════════════════════════════════════
-- 1. proveedores agrega `tipo` (VEHICLE/FLIGHT/HOTEL/ATTRACTION)
-- 2. items_carrito agrega `id_proveedor` (nullable + FK)
-- 3. Seed: 5 proveedores VEHICLE (UrbanCar, RentCar, RentWheels, DriveX, ZenithDrive)
-- 4. Expirar carritos activos viejos (A1: limpieza)
-- ════════════════════════════════════════════════════════════════════

-- ── 1. proveedores.tipo ─────────────────────────────────────────────
ALTER TABLE "proveedores" ADD COLUMN "tipo" VARCHAR(20);

-- Backfill: marcar existentes como VEHICLE por default
-- (en producción había proveedores VEHICLE únicamente hasta este punto)
UPDATE "proveedores" SET "tipo" = 'VEHICLE' WHERE "tipo" IS NULL;

ALTER TABLE "proveedores" ALTER COLUMN "tipo" SET NOT NULL;
ALTER TABLE "proveedores" ADD CONSTRAINT "proveedores_tipo_check"
  CHECK ("tipo" IN ('VEHICLE', 'FLIGHT', 'HOTEL', 'ATTRACTION'));

-- ── 2. items_carrito.id_proveedor + FK ─────────────────────────────
ALTER TABLE "items_carrito" ADD COLUMN "id_proveedor" UUID;
ALTER TABLE "items_carrito" ADD CONSTRAINT "items_carrito_id_proveedor_fkey"
  FOREIGN KEY ("id_proveedor") REFERENCES "proveedores"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE INDEX "items_carrito_id_proveedor_idx" ON "items_carrito"("id_proveedor");

-- ── 3. Seed: 5 proveedores VEHICLE (UPSERT por id) ─────────────────
INSERT INTO "proveedores" ("id", "nombre", "tipo", "url_api_base", "activo", "created_at") VALUES
  ('11111111-0001-4000-8000-000000000001', 'UrbanCar-Emily',     'VEHICLE', 'https://operaciones-service.ambitioushill-8cbf622c.eastus2.azurecontainerapps.io/api/v1/emilypamela', true, NOW()),
  ('22222222-0002-4000-8000-000000000002', 'RentCar-Steven',     'VEHICLE', 'https://rentcar-ec-frontend.whiteisland-027d7f3d.canadacentral.azurecontainerapps.io/api/v1/stevenariel', true, NOW()),
  ('33333333-0003-4000-8000-000000000003', 'RentWheels-Gustavo', 'VEHICLE', 'https://bus-service.politebay-268e19e8.eastus.azurecontainerapps.io/api/v1/gustavobenalcazar/booking', true, NOW()),
  ('44444444-0004-4000-8000-000000000004', 'DriveX-Paula',       'VEHICLE', 'https://ca-alquiler.calmmeadow-17e9f7de.eastus.azurecontainerapps.io/api/v1/paula-pozo', true, NOW()),
  ('55555555-0005-4000-8000-000000000005', 'ZenithDrive-Mateo',  'VEHICLE', 'https://nginx-frontend.ambitiousforest-4fd0ab3a.eastus.azurecontainerapps.io/api', true, NOW())
ON CONFLICT ("id") DO UPDATE SET
  "nombre"       = EXCLUDED."nombre",
  "tipo"         = EXCLUDED."tipo",
  "url_api_base" = EXCLUDED."url_api_base",
  "activo"       = EXCLUDED."activo";

-- ── 4. Expirar carritos activos viejos (A1) ────────────────────────
-- Razón: los items existentes no tienen id_proveedor poblado, por lo
-- tanto no podrían enrutar en checkout. Limpieza preventiva.
UPDATE "carritos" SET "estado" = 'EXPIRADO' WHERE "estado" = 'ACTIVO';
