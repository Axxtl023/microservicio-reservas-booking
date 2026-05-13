import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { PrismaService } from './common/prisma/prisma.service';

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

// ─── API ───────────────────────────────────────────────────────────────────────
import { CategoriasController } from './api/controllers/v1/CategoriasController';
import { ProveedoresController } from './api/controllers/v1/ProveedoresController';
import { CarritoController } from './api/controllers/v1/CarritoController';
import { ReservasController } from './api/controllers/v1/ReservasController';
import { AuditoriaController } from './api/controllers/v1/AuditoriaController';

@Module({
  imports: [
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
    AuditoriaService,
    { provide: IAUDITORIA_SERVICE, useExisting: AuditoriaService },

    // ── Auth ──────────────────────────────────────────────────────────────────
    JwtStrategy,

    // ── Global Interceptors ───────────────────────────────────────────────────
    { provide: APP_INTERCEPTOR, useClass: AuditoriaInterceptor },
  ],
})
export class AppModule {}
