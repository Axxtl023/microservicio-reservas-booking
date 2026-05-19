ALTER TABLE "detalles_reserva"
  ALTER COLUMN "id_externo" DROP NOT NULL,
  ADD COLUMN "id_externo_codigo" VARCHAR(255);
