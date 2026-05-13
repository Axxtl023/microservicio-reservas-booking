import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ICarritosRepository, CarritoConItems } from './interfaces/i-carritos.repository';
import { INCLUDE_ITEMS_CARRITO } from './interfaces/i-carritos.repository';

@Injectable()
export class CarritosRepository implements ICarritosRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActivoByCliente(idCliente: string): Promise<CarritoConItems | null> {
    return this.prisma.carritos.findFirst({
      where: { id_cliente: idCliente, estado: 'ACTIVO' },
      include: INCLUDE_ITEMS_CARRITO,
    });
  }

  findById(id: string): Promise<CarritoConItems | null> {
    return this.prisma.carritos.findUnique({
      where: { id },
      include: INCLUDE_ITEMS_CARRITO,
    });
  }

  create(idCliente: string): Promise<CarritoConItems> {
    return this.prisma.carritos.create({
      data: { id_cliente: idCliente, estado: 'ACTIVO', total: 0 },
      include: INCLUDE_ITEMS_CARRITO,
    });
  }

  async updateTotal(id: string, total: number): Promise<void> {
    await this.prisma.carritos.update({ where: { id }, data: { total } });
  }

  async updateEstado(id: string, estado: string): Promise<void> {
    await this.prisma.carritos.update({ where: { id }, data: { estado } });
  }
}
