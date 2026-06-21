import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../common/prisma/prisma.service';

// Ver nota en outbox.service.ts sobre el typing de tx.
type TxClient = any; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface CachedHttpResponse {
  statusCode: number;
  body: unknown;
}

/**
 * Idempotencia HTTP capa 1 — única de este repo.
 *
 * El cliente HTTP puede mandar `Idempotency-Key` header (opcional). Si el
 * mismo key llega 2 veces para el mismo endpoint, la 2ª vez devolvemos la
 * respuesta cacheada sin re-procesar. Protege contra retries del FE / browser.
 *
 * Es la "front door": NO reemplaza a la idempotencia de la saga (capa 2),
 * solo evita duplicación a nivel de request HTTP.
 */
@Injectable()
export class IdempotencyHttpService {
  private readonly logger = new Logger(IdempotencyHttpService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Busca una respuesta cacheada. Null si no existe.
   */
  async find(key: string, endpoint: string): Promise<CachedHttpResponse | null> {
    const row = await this.prisma.idempotency_keys.findUnique({
      where: { key },
    });
    if (!row) return null;
    if (row.endpoint !== endpoint) {
      // Mismo key pero distinto endpoint → no devolver, es un error del cliente
      this.logger.warn(
        `[idempotency-http] Key ${key} usado para ${endpoint} pero ya existe para ${row.endpoint}`,
      );
      return null;
    }
    return {
      statusCode: row.status_code,
      body: row.response,
    };
  }

  /**
   * Persiste la respuesta. Llamar dentro de la misma transacción que el
   * resto del checkout (saga.create + outbox.save) para que sea atómico.
   */
  async saveTx(
    tx: TxClient,
    key: string,
    endpoint: string,
    response: CachedHttpResponse,
  ): Promise<void> {
    await tx.idempotency_keys.create({
      data: {
        key,
        endpoint,
        response: response.body as object,
        status_code: response.statusCode,
      },
    });
  }

  /**
   * Limpieza semanal: borra keys >7 días (suficiente para retries de FE).
   */
  @Cron(CronExpression.EVERY_WEEK)
  async cleanupOldKeys(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const { count } = await this.prisma.idempotency_keys.deleteMany({
      where: { created_at: { lt: cutoff } },
    });
    if (count > 0) {
      this.logger.log(`[idempotency-http] Limpieza: ${count} keys eliminados (>7 días)`);
    }
  }
}
