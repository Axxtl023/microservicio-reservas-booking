-- Seed del proveedor PaleAtracctions (Paula Coronel) — ATTRACTION.
-- Faltaba en la tabla `proveedores`, por eso el FE (AtraccionCard.tsx) no
-- podía resolver `id_proveedor` al agregar al carrito y mostraba:
--   "No se pudo identificar el proveedor 'PaleAtracctions'"
--
-- Idempotente: si el UUID ya existe, actualiza los campos.

INSERT INTO "proveedores" ("id", "nombre", "tipo", "url_api_base", "activo", "created_at") VALUES
  (
    '78787878-0019-4000-8000-000000000019',
    'PaleAtracctions-Paula',
    'ATTRACTION',
    'https://atracciones-apigateway.onrender.com/api/v1/coronel_paula',
    true,
    NOW()
  )
ON CONFLICT ("id") DO UPDATE SET
  "nombre"       = EXCLUDED."nombre",
  "tipo"         = EXCLUDED."tipo",
  "url_api_base" = EXCLUDED."url_api_base",
  "activo"       = EXCLUDED."activo";
