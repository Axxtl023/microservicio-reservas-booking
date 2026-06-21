import { Injectable } from '@nestjs/common';
import { EventEnvelope } from '../envelope';

// El typing de Prisma.TransactionClient no resuelve los modelos en este repo
// (mismo problema que en integracion). Usar `any` para tx es seguro porque
// el runtime sí expone los modelos correctamente.
type TxClient = any; // eslint-disable-line @typescript-eslint/no-explicit-any

@Injectable()
export class OutboxService {
  /**
   * Guarda un evento en event_outbox DENTRO de la transacción del caller.
   * Append-only — los registros nunca se borran (auditoría).
   */
  async save(
    tx: TxClient,
    exchange: string,
    routingKey: string,
    envelope: EventEnvelope,
  ): Promise<void> {
    const payload = envelope.payload as Record<string, unknown> | undefined;
    const aggregateId =
      (payload?.reservaId as string | undefined) ??
      (payload?.itemId as string | undefined) ??
      null;

    await tx.event_outbox.create({
      data: {
        event_id: envelope.eventId,
        event_type: envelope.eventType,
        exchange,
        routing_key: routingKey,
        payload: envelope as object,
        correlation_id: envelope.correlationId ?? null,
        aggregate_id: aggregateId,
      },
    });
  }
}
