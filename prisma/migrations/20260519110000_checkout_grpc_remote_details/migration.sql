-- Migración idempotente — segura para correr múltiples veces sin romper.
-- Separamos en 2 statements: DROP NOT NULL es idempotente nativo en Postgres,
-- ADD COLUMN necesita IF NOT EXISTS para serlo.

ALTER TABLE "detalles_reserva" ALTER COLUMN "id_externo" DROP NOT NULL;

ALTER TABLE "detalles_reserva" ADD COLUMN IF NOT EXISTS "id_externo_codigo" VARCHAR(255);
