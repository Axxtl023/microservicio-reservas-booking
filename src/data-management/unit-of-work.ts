import { Injectable, Inject, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import type { IUnitOfWork, AddItemAtomicData } from './interfaces/i-unit-of-work';
import type { ICategoriasRepository } from '../data-access/repositories/interfaces/i-categorias.repository';
import { ICATEGORIAS_REPOSITORY } from '../data-access/repositories/interfaces/i-categorias.repository';
import type { IProveedoresRepository } from '../data-access/repositories/interfaces/i-proveedores.repository';
import { IPROVEEDORES_REPOSITORY } from '../data-access/repositories/interfaces/i-proveedores.repository';
import type { ICarritosRepository, CarritoConItems } from '../data-access/repositories/interfaces/i-carritos.repository';
import { ICARRITOS_REPOSITORY, INCLUDE_ITEMS_CARRITO } from '../data-access/repositories/interfaces/i-carritos.repository';
import type { IItemsCarritoRepository } from '../data-access/repositories/interfaces/i-items-carrito.repository';
import { IITEMS_CARRITO_REPOSITORY } from '../data-access/repositories/interfaces/i-items-carrito.repository';
import type { IReservasRepository, ReservaConDetalles } from '../data-access/repositories/interfaces/i-reservas.repository';
import { IRESERVAS_REPOSITORY, INCLUDE_DETALLES_PROVEEDOR } from '../data-access/repositories/interfaces/i-reservas.repository';
import type { IDetallesReservaRepository } from '../data-access/repositories/interfaces/i-detalles-reserva.repository';
import { IDETALLES_RESERVA_REPOSITORY } from '../data-access/repositories/interfaces/i-detalles-reserva.repository';
import type { IAuditoriaRepository } from '../data-access/repositories/interfaces/i-auditoria.repository';
import { IAUDITORIA_REPOSITORY } from '../data-access/repositories/interfaces/i-auditoria.repository';

@Injectable()
export class UnitOfWork implements IUnitOfWork {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ICATEGORIAS_REPOSITORY) readonly categoriasRepository: ICategoriasRepository,
    @Inject(IPROVEEDORES_REPOSITORY) readonly proveedoresRepository: IProveedoresRepository,
    @Inject(ICARRITOS_REPOSITORY) readonly carritosRepository: ICarritosRepository,
    @Inject(IITEMS_CARRITO_REPOSITORY) readonly itemsCarritoRepository: IItemsCarritoRepository,
    @Inject(IRESERVAS_REPOSITORY) readonly reservasRepository: IReservasRepository,
    @Inject(IDETALLES_RESERVA_REPOSITORY) readonly detallesReservaRepository: IDetallesReservaRepository,
    @Inject(IAUDITORIA_REPOSITORY) readonly auditoriaRepository: IAuditoriaRepository,
  ) {}

  async addItemToCarritoAtomic(data: AddItemAtomicData): Promise<CarritoConItems> {
    const { idCliente, idProductoExterno, nombreProducto, cantidad, precioUnitario } = data;

    return this.prisma.$transaction(async (tx) => {
      let carrito = await tx.carritos.findFirst({
        where: { id_cliente: idCliente, estado: 'ACTIVO' },
        include: INCLUDE_ITEMS_CARRITO,
      });

      if (!carrito) {
        carrito = await tx.carritos.create({
          data: { id_cliente: idCliente, estado: 'ACTIVO', total: 0 },
          include: INCLUDE_ITEMS_CARRITO,
        });
      }

      const existing = await tx.items_carrito.findFirst({
        where: { id_carrito: carrito.id, id_producto_externo: idProductoExterno },
      });

      if (existing) {
        await tx.items_carrito.update({
          where: { id: existing.id },
          data: { cantidad: (existing.cantidad ?? 0) + cantidad },
        });
      } else {
        await tx.items_carrito.create({
          data: { id_carrito: carrito.id, id_producto_externo: idProductoExterno, nombre_producto: nombreProducto, cantidad, precio_unitario: precioUnitario },
        });
      }

      const updatedCarrito = await tx.carritos.findUnique({
        where: { id: carrito.id },
        include: INCLUDE_ITEMS_CARRITO,
      });
      if (!updatedCarrito) throw new InternalServerErrorException('Error al obtener carrito');

      const newTotal = updatedCarrito.items_carrito.reduce(
        (sum, item) => sum + (item.cantidad ?? 0) * Number(item.precio_unitario),
        0,
      );

      return tx.carritos.update({
        where: { id: carrito.id },
        data: { total: newTotal },
        include: INCLUDE_ITEMS_CARRITO,
      });
    });
  }

  async updateItemCantidadAtomic(idItem: string, cantidad: number): Promise<CarritoConItems> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.items_carrito.findUnique({ where: { id: idItem } });
      if (!item || !item.id_carrito) throw new InternalServerErrorException('Item no encontrado');

      await tx.items_carrito.update({ where: { id: idItem }, data: { cantidad } });

      const updatedCarrito = await tx.carritos.findUnique({
        where: { id: item.id_carrito },
        include: INCLUDE_ITEMS_CARRITO,
      });
      if (!updatedCarrito) throw new InternalServerErrorException('Carrito no encontrado');

      const newTotal = updatedCarrito.items_carrito.reduce(
        (sum, i) => sum + (i.id === idItem ? cantidad : (i.cantidad ?? 0)) * Number(i.precio_unitario),
        0,
      );

      return tx.carritos.update({
        where: { id: item.id_carrito },
        data: { total: newTotal },
        include: INCLUDE_ITEMS_CARRITO,
      });
    });
  }

  async removeItemAtomic(idItem: string): Promise<CarritoConItems> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.items_carrito.findUnique({ where: { id: idItem } });
      if (!item || !item.id_carrito) throw new InternalServerErrorException('Item no encontrado');

      await tx.items_carrito.delete({ where: { id: idItem } });

      const updatedCarrito = await tx.carritos.findUnique({
        where: { id: item.id_carrito },
        include: INCLUDE_ITEMS_CARRITO,
      });
      if (!updatedCarrito) throw new InternalServerErrorException('Carrito no encontrado');

      const newTotal = updatedCarrito.items_carrito.reduce(
        (sum, i) => sum + (i.cantidad ?? 0) * Number(i.precio_unitario),
        0,
      );

      return tx.carritos.update({
        where: { id: item.id_carrito },
        data: { total: newTotal },
        include: INCLUDE_ITEMS_CARRITO,
      });
    });
  }

  async convertirCarritoAReservaAtomic(idCarrito: string, idCliente: string): Promise<ReservaConDetalles> {
    return this.prisma.$transaction(async (tx) => {
      const carrito = await tx.carritos.findUnique({
        where: { id: idCarrito },
        include: { items_carrito: true },
      });
      if (!carrito || carrito.estado !== 'ACTIVO') {
        throw new InternalServerErrorException('Carrito no disponible para checkout');
      }

      const items = carrito.items_carrito;
      if (items.length === 0) {
        throw new InternalServerErrorException('El carrito está vacío');
      }

      const total = items.reduce(
        (sum, item) => sum + (item.cantidad ?? 0) * Number(item.precio_unitario),
        0,
      );

      const reserva = await tx.reservas.create({
        data: { id_cliente: idCliente, total, status: 'PENDIENTE' },
      });

      for (const item of items) {
        if (!item.id_producto_externo) continue;
        await tx.detalles_reserva.create({
          data: {
            id_reserva: reserva.id,
            id_externo: item.id_producto_externo,
            cantidad: item.cantidad ?? 1,
            precio_unitario: item.precio_unitario,
          },
        });
      }

      await tx.carritos.update({ where: { id: idCarrito }, data: { estado: 'COMPLETADO' } });

      const result = await tx.reservas.findUnique({
        where: { id: reserva.id },
        include: INCLUDE_DETALLES_PROVEEDOR,
      });
      if (!result) throw new InternalServerErrorException('Error al obtener reserva creada');

      return result;
    });
  }

  async convertirCarritoAReservaGrpcAtomic(idCarrito: string, idCliente: string): Promise<ReservaConDetalles> {
    return this.prisma.$transaction(async (tx) => {
      const carrito = await tx.carritos.findUnique({
        where: { id: idCarrito },
        include: { items_carrito: true },
      });
      if (!carrito || carrito.estado !== 'ACTIVO') {
        throw new InternalServerErrorException('Carrito no disponible para checkout');
      }

      const items = carrito.items_carrito;
      if (items.length === 0) {
        throw new InternalServerErrorException('El carrito está vacío');
      }

      const total = items.reduce(
        (sum, item) => sum + (item.cantidad ?? 0) * Number(item.precio_unitario),
        0,
      );

      const reserva = await tx.reservas.create({
        data: { id_cliente: idCliente, total, status: 'PENDIENTE' },
      });

      for (const item of items) {
        if (!item.id_producto_externo) continue;
        await tx.detalles_reserva.create({
          data: {
            id_reserva: reserva.id,
            id_externo: null,
            cantidad: item.cantidad ?? 1,
            precio_unitario: item.precio_unitario,
          } as never,
        });
      }

      await tx.carritos.update({ where: { id: idCarrito }, data: { estado: 'COMPLETADO' } });

      const result = await tx.reservas.findUnique({
        where: { id: reserva.id },
        include: INCLUDE_DETALLES_PROVEEDOR,
      });
      if (!result) throw new InternalServerErrorException('Error al obtener reserva creada');

      return result;
    });
  }
}
