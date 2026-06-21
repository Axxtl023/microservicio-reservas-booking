import { Module, Global } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { EXCHANGES } from './event-types';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OutboxService } from './outbox/outbox.service';
import { OutboxPublisherService } from './outbox/outbox-publisher.service';
import { InboxService } from './inbox/inbox.service';
import { IdempotencyHttpService } from './idempotency/idempotency-http.service';
import { SagaService } from './saga/saga.service';
import { SagaTimeoutCron } from './saga/saga-timeout.cron';
import { CommandPublishers } from './publishers/command-publishers';
import { MetricsService } from '../../common/observability/metrics.service';

/**
 * Event Bus del orquestador.
 *
 * Declara TODOS los exchanges (propios + externos) porque este micro publica
 * a 3 exchanges externos (payments.commands, invoices.commands, integration.commands)
 * y consume de 3 (payments.events, invoices.events, integration.events).
 *
 * Los consumers se registran en sus propios módulos / app.module.
 */
@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    RabbitMQModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.RABBITMQ_URL ?? 'amqp://admin:admin@localhost:5672',
        connectionInitOptions: { wait: false },
        connectionManagerOptions: {
          heartbeatIntervalInSeconds: 15,
          reconnectTimeInSeconds: 5,
        },
        prefetchCount: Number(process.env.RABBITMQ_PREFETCH ?? 10),
        exchanges: [
          { name: EXCHANGES.RESERVAS_EVENTS,     type: 'topic', options: { durable: true } },
          { name: EXCHANGES.RESERVAS_DLX,        type: 'topic', options: { durable: true } },
          { name: EXCHANGES.PAYMENTS_COMMANDS,   type: 'topic', options: { durable: true } },
          { name: EXCHANGES.PAYMENTS_EVENTS,     type: 'topic', options: { durable: true } },
          { name: EXCHANGES.INVOICES_COMMANDS,   type: 'topic', options: { durable: true } },
          { name: EXCHANGES.INVOICES_EVENTS,     type: 'topic', options: { durable: true } },
          { name: EXCHANGES.INTEGRATION_COMMANDS, type: 'topic', options: { durable: true } },
          { name: EXCHANGES.INTEGRATION_EVENTS,   type: 'topic', options: { durable: true } },
        ],
      }),
    }),
  ],
  providers: [
    PrismaService,
    OutboxService,
    OutboxPublisherService,
    InboxService,
    IdempotencyHttpService,
    SagaService,
    SagaTimeoutCron,
    CommandPublishers,
    MetricsService,
  ],
  exports: [
    RabbitMQModule,
    PrismaService,
    OutboxService,
    InboxService,
    IdempotencyHttpService,
    SagaService,
    CommandPublishers,
    MetricsService,
  ],
})
export class EventBusModule {}
