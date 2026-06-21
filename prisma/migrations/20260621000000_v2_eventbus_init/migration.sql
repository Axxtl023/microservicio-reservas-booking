-- V2 EventBus init (microservicio-reservas-booking).
-- Idempotente — segura para correr múltiples veces.
-- Convive con las tablas existentes (carritos, reservas, etc.) en la misma BD Supabase.

-- ── Outbox: eventos pendientes de publicar a RabbitMQ ──────────────────────
CREATE TABLE IF NOT EXISTS "event_outbox" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_id"       UUID NOT NULL,
    "event_type"     VARCHAR(100) NOT NULL,
    "exchange"       VARCHAR(100) NOT NULL,
    "routing_key"    VARCHAR(100) NOT NULL,
    "payload"        JSONB NOT NULL,
    "correlation_id" UUID,
    "aggregate_id"   VARCHAR(100),
    "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "published_at"   TIMESTAMPTZ(6),
    "attempts"       INTEGER NOT NULL DEFAULT 0,
    "last_error"     TEXT,
    CONSTRAINT "event_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_outbox_event_id_key" ON "event_outbox"("event_id");
CREATE INDEX IF NOT EXISTS "idx_event_outbox_unpublished" ON "event_outbox"("created_at") WHERE "published_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_event_outbox_correlation" ON "event_outbox"("correlation_id");
CREATE INDEX IF NOT EXISTS "idx_event_outbox_aggregate" ON "event_outbox"("aggregate_id");

-- ── Inbox: mensajes ya procesados (idempotencia capa 4) ────────────────────
CREATE TABLE IF NOT EXISTS "processed_messages" (
    "event_id"     UUID NOT NULL,
    "event_type"   VARCHAR(100) NOT NULL,
    "processed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "processed_messages_pkey" PRIMARY KEY ("event_id")
);

-- ── Saga state: máquina de estados del checkout/cancelación ────────────────
CREATE TABLE IF NOT EXISTS "saga_state" (
    "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
    "reserva_id"          UUID NOT NULL,
    "saga_type"           VARCHAR(30) NOT NULL,
    "current_step"        VARCHAR(50) NOT NULL,
    "total_items"         INTEGER NOT NULL DEFAULT 0,
    "items_created"       INTEGER NOT NULL DEFAULT 0,
    "items_confirmed"     INTEGER NOT NULL DEFAULT 0,
    "items_cancelled"     INTEGER NOT NULL DEFAULT 0,
    "pending_command_id"  UUID,
    "payment_id"          UUID,
    "invoice_id"          UUID,
    "last_error"          TEXT,
    "context"             JSONB,
    "correlation_id"      UUID NOT NULL,
    "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "completed_at"        TIMESTAMPTZ(6),
    CONSTRAINT "saga_state_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "saga_state_reserva_id_key" ON "saga_state"("reserva_id");
CREATE INDEX IF NOT EXISTS "idx_saga_state_step" ON "saga_state"("current_step");
CREATE INDEX IF NOT EXISTS "idx_saga_state_updated" ON "saga_state"("updated_at");
CREATE INDEX IF NOT EXISTS "idx_saga_state_pending_cmd" ON "saga_state"("pending_command_id");

-- ── Idempotency keys: cache HTTP de Idempotency-Key header (capa 1) ────────
CREATE TABLE IF NOT EXISTS "idempotency_keys" (
    "key"         VARCHAR(255) NOT NULL,
    "endpoint"    VARCHAR(100) NOT NULL,
    "response"    JSONB NOT NULL,
    "status_code" INTEGER NOT NULL,
    "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "idx_idempotency_keys_created" ON "idempotency_keys"("created_at");
