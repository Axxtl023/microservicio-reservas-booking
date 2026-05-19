import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { IItemsCarritoRepository } from './interfaces/i-items-carrito.repository';
import type { items_carrito } from '@prisma/client';

@Injectable()
export class ItemsCarritoRepository implements IItemsCarritoRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<items_carrito | null> {
    return this.prisma.items_carrito.findUnique({ where: { id } });
  }

  findByCarritoAndProducto(idCarrito: string, idProductoExterno: string): Promise<items_carrito | null> {
    return this.prisma.items_carrito.findFirst({
      where: { id_carrito: idCarrito, id_producto_externo: idProductoExterno },
    });
  }

  create(data: { id_carrito: string; id_producto_externo: string; nombre_producto: string; cantidad: number; precio_unitario: number }): Promise<items_carrito> {
    return this.prisma.items_carrito.create({ data });
  }

  updateCantidad(id: string, cantidad: number): Promise<items_carrito> {
    return this.prisma.items_carrito.update({ where: { id }, data: { cantidad } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.items_carrito.delete({ where: { id } });
  }
}
