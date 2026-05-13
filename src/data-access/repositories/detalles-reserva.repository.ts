import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { IDetallesReservaRepository } from './interfaces/i-detalles-reserva.repository';
import type { detalles_reserva } from '@prisma/client';

@Injectable()
export class DetallesReservaRepository implements IDetallesReservaRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByReserva(idReserva: string): Promise<detalles_reserva[]> {
    return this.prisma.detalles_reserva.findMany({ where: { id_reserva: idReserva } });
  }

  create(data: {
    id_reserva: string;
    id_externo: string;
    id_proveedor?: string;
    cantidad: number;
    precio_unitario: number;
  }): Promise<detalles_reserva> {
    return this.prisma.detalles_reserva.create({ data });
  }
}
