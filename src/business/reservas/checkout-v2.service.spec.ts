import { BadRequestException, GatewayTimeoutException } from '@nestjs/common';

// reservas.service loads gRPC clients (uuid v14 ESM + ProviderType enum) at module
// level. Mocking it here cuts the entire import chain so checkout-v2.service can be
// tested in isolation. CheckoutSagaException is re-implemented faithfully.
jest.mock('./reservas.service', () => ({
  CheckoutSagaException: class CheckoutSagaException extends Error {
    constructor(
      public readonly statusCode: number,
      public readonly reservaStatus: string,
      public readonly reservaId: string,
      message: string,
    ) {
      super(message);
      this.name = 'CheckoutSagaException';
    }
  },
}));

import { CheckoutV2Service } from './checkout-v2.service';

// ── Factories ─────────────────────────────────────────────────────────────────

const makeUow = (overrides: Record<string, unknown> = {}) => ({
  carritosRepository: {
    findById: jest.fn(),
  },
  proveedoresRepository: {
    findById: jest.fn(),
  },
  reservasRepository: {
    updateEstado: jest.fn().mockResolvedValue(undefined),
    findById: jest.fn(),
  },
  convertirCarritoAReservaGrpcAtomic: jest.fn(),
  ...overrides,
});

const makePrisma = () => ({
  $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(makeTx())),
  detalles_reserva: { findMany: jest.fn() },
});

const makeTx = () => ({
  saga_state: { create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  event_outbox: { create: jest.fn().mockResolvedValue({}) },
});

const makeSaga = (overrides: Record<string, unknown> = {}) => ({
  createTx: jest.fn().mockResolvedValue({ id: 'saga-1', current_step: 'CREATING_REMOTE_RESERVATIONS', context: {} }),
  waitForTerminalState: jest.fn().mockResolvedValue({ id: 'saga-1', current_step: 'COMPLETED', context: {} }),
  ...overrides,
});

const makePublishers = () => ({
  sagaStarted: jest.fn().mockResolvedValue(undefined),
  createReservation: jest.fn().mockResolvedValue('cmd-1'),
});

const makeCarrito = (items: unknown[] = [makeCartItem()]) => ({
  id: 'cart-1',
  estado: 'ACTIVO',
  id_cliente: 'client-1',
  total: 90,
  items_carrito: items,
});

const makeCartItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  id_producto_externo: 'prod-ext-1',
  id_proveedor: 'prov-1',
  cantidad: 1,
  precio_unitario: 90,
  metadata: {
    agenciaId: 'agencia-1',
    fechaInicio: '2026-07-01T10:00:00.000Z',
    fechaFin: '2026-07-05T10:00:00.000Z',
  },
  ...overrides,
});

const makeProvider = (tipo = 'VEHICLE') => ({ id: 'prov-1', tipo, nombre: 'RentCar-Steven', activo: true });

const makeReservaEntity = (detalles: unknown[] = [{ id: 'det-1' }]) => ({
  id: 'res-1',
  detalles_reserva: detalles,
});

const makeCheckoutInput = (overrides: Record<string, unknown> = {}) => ({
  idCarrito: 'cart-1',
  idCliente: 'client-1',
  metodoPagoId: 'mp-1',
  currency: 'USD',
  ...overrides,
});

// ── Helper to instantiate with overridden deps ─────────────────────────────────

function buildService(
  uowOverrides: Record<string, unknown> = {},
  sagaOverrides: Record<string, unknown> = {},
) {
  const uow = makeUow(uowOverrides);
  const prisma = makePrisma();
  const saga = makeSaga(sagaOverrides);
  const publishers = makePublishers();

  const service = new CheckoutV2Service(uow as any, prisma as any, saga as any, publishers as any);
  return { service, uow, prisma, saga, publishers };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CheckoutV2Service', () => {

  describe('execute — input validation', () => {
    it('throws BadRequestException when cart not found', async () => {
      const { service, uow } = buildService();
      uow.carritosRepository.findById.mockResolvedValue(null);
      await expect(service.execute(makeCheckoutInput())).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when cart estado is not ACTIVO', async () => {
      const { service, uow } = buildService();
      uow.carritosRepository.findById.mockResolvedValue(makeCarrito().valueOf ? makeCarrito() : makeCarrito());
      uow.carritosRepository.findById.mockResolvedValue({ ...makeCarrito(), estado: 'CERRADO' });
      await expect(service.execute(makeCheckoutInput())).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when cart belongs to a different client', async () => {
      const { service, uow } = buildService();
      uow.carritosRepository.findById.mockResolvedValue({ ...makeCarrito(), id_cliente: 'otro-cliente' });
      await expect(service.execute(makeCheckoutInput())).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when cart has no valid items', async () => {
      const { service, uow } = buildService();
      uow.carritosRepository.findById.mockResolvedValue(makeCarrito([
        { id: 'item-empty', id_producto_externo: null, id_proveedor: 'prov-1', cantidad: 1, precio_unitario: 0 },
      ]));
      await expect(service.execute(makeCheckoutInput())).rejects.toThrow(BadRequestException);
    });
  });

  describe('execute — saga timeout and failure', () => {
    beforeEach(() => {
      // Set a very short timeout so tests don't hang
      process.env.SAGA_STEP_TIMEOUT_S = '0';
    });
    afterEach(() => {
      delete process.env.SAGA_STEP_TIMEOUT_S;
    });

    it('throws GatewayTimeoutException when saga does not reach terminal state in time', async () => {
      const { service, uow, saga } = buildService(
        {},
        { waitForTerminalState: jest.fn().mockResolvedValue(null) },
      );
      uow.carritosRepository.findById.mockResolvedValue(makeCarrito());
      uow.convertirCarritoAReservaGrpcAtomic.mockResolvedValue(makeReservaEntity());
      uow.proveedoresRepository.findById.mockResolvedValue(makeProvider());

      await expect(service.execute(makeCheckoutInput())).rejects.toThrow(GatewayTimeoutException);
    });

    it('throws when saga reaches FAILED state', async () => {
      const { service, uow } = buildService(
        {},
        {
          waitForTerminalState: jest.fn().mockResolvedValue({
            id: 'saga-1', current_step: 'FAILED', last_error: 'payment rejected', context: {},
          }),
        },
      );
      uow.carritosRepository.findById.mockResolvedValue(makeCarrito());
      uow.convertirCarritoAReservaGrpcAtomic.mockResolvedValue(makeReservaEntity());
      uow.proveedoresRepository.findById.mockResolvedValue(makeProvider());

      await expect(service.execute(makeCheckoutInput())).rejects.toThrow('payment rejected');
    });
  });

  describe('execute — happy path', () => {
    it('returns reserva + factura when saga completes successfully', async () => {
      const { service, uow } = buildService(
        {},
        {
          waitForTerminalState: jest.fn().mockResolvedValue({
            id: 'saga-1',
            current_step: 'COMPLETED',
            context: { invoice: { idFactura: 'fact-1', numeroFactura: 'F-001', totalCents: 9000 } },
          }),
        },
      );
      uow.carritosRepository.findById.mockResolvedValue(makeCarrito());
      uow.convertirCarritoAReservaGrpcAtomic.mockResolvedValue(makeReservaEntity());
      uow.proveedoresRepository.findById.mockResolvedValue(makeProvider());
      uow.reservasRepository.findById.mockResolvedValue({
        id: 'res-1', status: 'CONFIRMADA', detalles_reserva: [], id_cliente: 'client-1', total: 90,
      });

      const result = await service.execute(makeCheckoutInput());
      expect(result.reserva).toBeDefined();
      expect(result.factura.idFactura).toBe('fact-1');
      expect(result.factura.numeroFactura).toBe('F-001');
      expect(uow.reservasRepository.updateEstado).toHaveBeenCalledWith('res-1', 'CONFIRMADA');
    });

    it('publishes one createReservation command per cart item', async () => {
      const { service, uow, publishers } = buildService();
      const items = [makeCartItem({ id: 'item-a' }), makeCartItem({ id: 'item-b', id_proveedor: 'prov-2' })];
      uow.carritosRepository.findById.mockResolvedValue(makeCarrito(items));
      uow.convertirCarritoAReservaGrpcAtomic.mockResolvedValue(
        makeReservaEntity([{ id: 'det-a' }, { id: 'det-b' }]),
      );
      uow.proveedoresRepository.findById.mockResolvedValue(makeProvider());
      uow.reservasRepository.findById.mockResolvedValue({
        id: 'res-1', status: 'CONFIRMADA', detalles_reserva: [], id_cliente: 'client-1', total: 180,
      });

      await service.execute(makeCheckoutInput());
      expect(publishers.createReservation).toHaveBeenCalledTimes(2);
    });
  });

  // ── buildMetadata (via cast to any) ───────────────────────────────────────────

  describe('buildMetadata', () => {
    let service: CheckoutV2Service;
    const input = makeCheckoutInput();

    beforeEach(() => {
      ({ service } = buildService());
    });

    const callBuild = (item: Record<string, unknown>, type: string) =>
      (service as any).buildMetadata(item, type, input);

    describe('VEHICLE', () => {
      it('returns correct shape with dates from metadata', () => {
        const item = makeCartItem();
        const result = callBuild(item, 'VEHICLE');
        expect(result).toMatchObject({
          vehiculoId: 'prod-ext-1',
          clienteId: 'client-1',
          agenciaId: 'agencia-1',
          fechaInicio: '2026-07-01T10:00:00.000Z',
          fechaFin: '2026-07-05T10:00:00.000Z',
        });
      });

      it('throws BadRequestException when fechaInicio is missing', () => {
        const item = makeCartItem({ metadata: { fechaFin: '2026-07-05T10:00:00.000Z' } });
        expect(() => callBuild(item, 'VEHICLE')).toThrow(BadRequestException);
      });

      it('throws BadRequestException when fechaFin is missing', () => {
        const item = makeCartItem({ metadata: { fechaInicio: '2026-07-01T10:00:00.000Z' } });
        expect(() => callBuild(item, 'VEHICLE')).toThrow(BadRequestException);
      });

      it('throws when metadata is entirely absent', () => {
        const item = makeCartItem({ metadata: {} });
        expect(() => callBuild(item, 'VEHICLE')).toThrow(BadRequestException);
      });
    });

    describe('HOTEL', () => {
      const hotelItem = makeCartItem({
        id_producto_externo: 'aloj-1',
        metadata: {
          alojamientoId: 'aloj-1',
          habitacionId: 'hab-101',
          fechaInicio: '2026-08-01T14:00:00.000Z',
          fechaFin: '2026-08-05T11:00:00.000Z',
        },
      });

      it('returns correct shape', () => {
        const result = callBuild(hotelItem, 'HOTEL');
        expect(result).toMatchObject({
          alojamientoId: 'aloj-1',
          habitacionId: 'hab-101',
          fechaInicio: '2026-08-01T14:00:00.000Z',
          fechaFin: '2026-08-05T11:00:00.000Z',
          clienteId: 'client-1',
        });
      });

      it('throws when habitacionId is missing', () => {
        const bad = makeCartItem({ metadata: { alojamientoId: 'a', fechaInicio: 'f', fechaFin: 'f' } });
        expect(() => callBuild(bad, 'HOTEL')).toThrow(BadRequestException);
      });

      it('throws when fechas are missing', () => {
        const bad = makeCartItem({ metadata: { alojamientoId: 'a', habitacionId: 'h' } });
        expect(() => callBuild(bad, 'HOTEL')).toThrow(BadRequestException);
      });
    });

    describe('FLIGHT', () => {
      const flightItem = makeCartItem({
        metadata: {
          flightClassId: 'class-eco-1',
          passengers: [{ firstName: 'Ana', lastName: 'Garcia', documentNumber: '12345678' }],
        },
      });

      it('returns correct shape', () => {
        const result = callBuild(flightItem, 'FLIGHT');
        expect(result).toMatchObject({
          flightClassId: 'class-eco-1',
          passengers: expect.arrayContaining([expect.objectContaining({ firstName: 'Ana' })]),
        });
      });

      it('throws when flightClassId is missing', () => {
        const bad = makeCartItem({ metadata: { passengers: [{ firstName: 'Ana' }] } });
        expect(() => callBuild(bad, 'FLIGHT')).toThrow(BadRequestException);
      });

      it('throws when passengers array is empty', () => {
        const bad = makeCartItem({ metadata: { flightClassId: 'cls-1', passengers: [] } });
        expect(() => callBuild(bad, 'FLIGHT')).toThrow(BadRequestException);
      });

      it('throws when passengers is missing', () => {
        const bad = makeCartItem({ metadata: { flightClassId: 'cls-1' } });
        expect(() => callBuild(bad, 'FLIGHT')).toThrow(BadRequestException);
      });
    });

    describe('TOUR (ATTRACTION)', () => {
      const tourItem = makeCartItem({
        metadata: {
          slotId: 'slot-1',
          attractionId: 'attr-1',
          productOptionId: 'opt-1',
          contactName: 'Juan Perez',
          contactEmail: 'juan@mail.com',
          passengers: [{ firstName: 'Juan', lastName: 'Perez', documentNumber: '99999' }],
        },
      });

      it('returns correct shape with all required fields', () => {
        const result = callBuild(tourItem, 'TOUR');
        expect(result).toMatchObject({
          slotId: 'slot-1',
          attractionId: 'attr-1',
          productOptionId: 'opt-1',
          contactName: 'Juan Perez',
          contactEmail: 'juan@mail.com',
          passengers: expect.any(Array),
        });
      });

      it('throws when slotId is missing', () => {
        const bad = makeCartItem({ metadata: { ...tourItem.metadata as object, slotId: undefined } });
        expect(() => callBuild(bad, 'TOUR')).toThrow(BadRequestException);
      });

      it('throws when contactEmail is missing', () => {
        const bad = makeCartItem({ metadata: { ...tourItem.metadata as object, contactEmail: undefined } });
        expect(() => callBuild(bad, 'TOUR')).toThrow(BadRequestException);
      });

      it('throws when passengers is empty', () => {
        const bad = makeCartItem({ metadata: { ...tourItem.metadata as object, passengers: [] } });
        expect(() => callBuild(bad, 'TOUR')).toThrow(BadRequestException);
      });
    });

    describe('unsupported type', () => {
      it('throws BadRequestException for unknown providerType', () => {
        expect(() => callBuild(makeCartItem(), 'BOAT')).toThrow(BadRequestException);
      });
    });
  });

  // ── decimalToCents ─────────────────────────────────────────────────────────────

  describe('decimalToCents', () => {
    let service: CheckoutV2Service;
    beforeEach(() => { ({ service } = buildService()); });

    const toCents = (v: unknown) => (service as any).decimalToCents(v);

    it('converts integer correctly', () => expect(toCents(90)).toBe(9000));
    it('converts decimal correctly', () => expect(toCents(90.5)).toBe(9050));
    it('rounds via Math.round (JS float: 1.005*100 = 100.499... → 100)', () => expect(toCents(1.005)).toBe(100));
    it('converts string numbers', () => expect(toCents('45.99')).toBe(4599));
    it('handles zero', () => expect(toCents(0)).toBe(0));
  });
});
