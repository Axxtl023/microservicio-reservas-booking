-- ════════════════════════════════════════════════════════════════════
-- FASE 1.5 — items_carrito.metadata (JSON por-item)
-- ════════════════════════════════════════════════════════════════════
-- Cada item del carrito persiste sus parámetros de reserva en JSON
-- (fechaInicio/Fin y agenciaId para VEHICLE; passengers/seats para
-- FLIGHT en el futuro; habitaciones/check-in para HOTEL; etc).
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE "items_carrito" ADD COLUMN "metadata" JSONB;
