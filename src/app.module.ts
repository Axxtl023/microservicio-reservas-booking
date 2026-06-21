import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtAuthGuard } from './business/auth/guards/jwt-auth.guard';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { PrismaService } from './common/prisma/prisma.service';
import { EventBusModule } from './business/event-bus/event-bus.module';
import { TraceMiddleware } from './common/observability/trace.middleware';
import { HealthController } from './api/controllers/v1/HealthController';
import { MetricsController } from './api/controllers/v1/MetricsController';
import {
  IntegrationCreatedConsumer,
  IntegrationCreateFailedConsumer,
  IntegrationConfirmedConsumer,
  IntegrationConfirmFailedConsumer,
  IntegrationCancelledConsumer,
  IntegrationCancelFailedConsumer,
} from './business/event-bus/consumers/integration-consumers';
import {
  PaymentProcessedConsumer,
  PaymentFailedConsumer,
  PaymentRefundedConsumer,
  PaymentRefundFailedConsumer,
} from './business/event-bus/consumers/payment-consumers';
import {
  InvoiceIssuedConsumer,
  InvoiceFailedConsumer,
  InvoiceVoidedConsumer,
} from './business/event-bus/consumers/invoice-consumers';
import { CheckoutV2Service } from './business/reservas/checkout-v2.service';
import { CancelV2Service } from './business/reservas/cancel-v2.service';

// ─── Data Access ───────────────────────────────────────────────────────────────
import { CategoriasRepository } from './data-access/repositories/categorias.repository';
import { ICATEGORIAS_REPOSITORY } from './data-access/repositories/interfaces/i-categorias.repository';
import { ProveedoresRepository } from './data-access/repositories/proveedores.repository';
import { IPROVEEDORES_REPOSITORY } from './data-access/repositories/interfaces/i-proveedores.repository';
import { CarritosRepository } from './data-access/repositories/carritos.repository';
import { ICARRITOS_REPOSITORY } from './data-access/repositories/interfaces/i-carritos.repository';
import { ItemsCarritoRepository } from './data-access/repositories/items-carrito.repository';
import { IITEMS_CARRITO_REPOSITORY } from './data-access/repositories/interfaces/i-items-carrito.repository';
import { ReservasRepository } from './data-access/repositories/reservas.repository';
import { IRESERVAS_REPOSITORY } from './data-access/repositories/interfaces/i-reservas.repository';
import { DetallesReservaRepository } from './data-access/repositories/detalles-reserva.repository';
import { IDETALLES_RESERVA_REPOSITORY } from './data-access/repositories/interfaces/i-detalles-reserva.repository';
import { AuditoriaRepository } from './data-access/repositories/auditoria.repository';
import { IAUDITORIA_REPOSITORY } from './data-access/repositories/interfaces/i-auditoria.repository';

// ─── Data Management ───────────────────────────────────────────────────────────
import { UnitOfWork } from './data-management/unit-of-work';
import { IUNIT_OF_WORK } from './data-management/interfaces/i-unit-of-work';

// ─── Business ──────────────────────────────────────────────────────────────────
import { JwtStrategy } from './business/auth/strategies/jwt.strategy';
import { CategoriasService } from './business/catalogo/categorias.service';
import { ICATEGORIAS_SERVICE } from './business/catalogo/interfaces/i-categorias.service';
import { ProveedoresService } from './business/catalogo/proveedores.service';
import { IPROVEEDORES_SERVICE } from './business/catalogo/interfaces/i-proveedores.service';
import { CarritoService } from './business/carrito/carrito.service';
import { ICARRITO_SERVICE } from './business/carrito/interfaces/i-carrito.service';
import { ReservasService } from './business/reservas/reservas.service';
import { IRESERVAS_SERVICE } from './business/reservas/interfaces/i-reservas.service';
import { AuditoriaService } from './business/auditoria/auditoria.service';
import { IAUDITORIA_SERVICE } from './business/auditoria/interfaces/i-auditoria.service';
import { AuditoriaInterceptor } from './business/auditoria/interceptors/auditoria.interceptor';
import { DashboardService } from './business/dashboard/dashboard.service';
import { IDASHBOARD_SERVICE } from './business/dashboard/interfaces/i-dashboard.service';
import { GrpcClientsModule } from './business/grpc-clients/grpc-clients.module';

// ─── API ───────────────────────────────────────────────────────────────────────
import { CategoriasController } from './api/controllers/v1/CategoriasController';
import { ProveedoresController } from './api/controllers/v1/ProveedoresController';
import { CarritoController } from './api/controllers/v1/CarritoController';
import { ReservasController } from './api/controllers/v1/ReservasController';
import { AuditoriaController } from './api/controllers/v1/AuditoriaController';
import { DashboardController } from './api/controllers/v1/DashboardController';

@Module({
  imports: [
    GrpcClientsModule,
    EventBusModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '1h') as any },
      }),
    }),
  ],
  controllers: [
    CategoriasController,
    ProveedoresController,
    CarritoController,
    ReservasController,
    AuditoriaController,
    DashboardController,
    HealthController,
    MetricsController,
  ],
  providers: [
    PrismaService,

    // ── Repositories ──────────────────────────────────────────────────────────
    CategoriasRepository,
    { provide: ICATEGORIAS_REPOSITORY, useExisting: CategoriasRepository },
    ProveedoresRepository,
    { provide: IPROVEEDORES_REPOSITORY, useExisting: ProveedoresRepository },
    CarritosRepository,
    { provide: ICARRITOS_REPOSITORY, useExisting: CarritosRepository },
    ItemsCarritoRepository,
    { provide: IITEMS_CARRITO_REPOSITORY, useExisting: ItemsCarritoRepository },
    ReservasRepository,
    { provide: IRESERVAS_REPOSITORY, useExisting: ReservasRepository },
    DetallesReservaRepository,
    { provide: IDETALLES_RESERVA_REPOSITORY, useExisting: DetallesReservaRepository },
    AuditoriaRepository,
    { provide: IAUDITORIA_REPOSITORY, useExisting: AuditoriaRepository },

    // ── Data Management ───────────────────────────────────────────────────────
    UnitOfWork,
    { provide: IUNIT_OF_WORK, useExisting: UnitOfWork },

    // ── Business Services ─────────────────────────────────────────────────────
    CategoriasService,
    { provide: ICATEGORIAS_SERVICE, useExisting: CategoriasService },
    ProveedoresService,
    { provide: IPROVEEDORES_SERVICE, useExisting: ProveedoresService },
    CarritoService,
    { provide: ICARRITO_SERVICE, useExisting: CarritoService },
    ReservasService,
    { provide: IRESERVAS_SERVICE, useExisting: ReservasService },
    CheckoutV2Service,
    CancelV2Service,
    AuditoriaService,
    { provide: IAUDITORIA_SERVICE, useExisting: AuditoriaService },
    DashboardService,
    { provide: IDASHBOARD_SERVICE, useExisting: DashboardService },

    // ── Auth ──────────────────────────────────────────────────────────────────
    JwtStrategy,
    { provide: APP_GUARD, useClass: JwtAuthGuard },

    // ── Global Interceptors ───────────────────────────────────────────────────
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },

    // ── V2 EventBus consumers (13 total) ──────────────────────────────────────
    IntegrationCreatedConsumer,
    IntegrationCreateFailedConsumer,
    IntegrationConfirmedConsumer,
    IntegrationConfirmFailedConsumer,
    IntegrationCancelledConsumer,
    IntegrationCancelFailedConsumer,
    PaymentProcessedConsumer,
    PaymentFailedConsumer,
    PaymentRefundedConsumer,
    PaymentRefundFailedConsumer,
    InvoiceIssuedConsumer,
    InvoiceFailedConsumer,
    InvoiceVoidedConsumer,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware).forRoutes('*');
  }
}
