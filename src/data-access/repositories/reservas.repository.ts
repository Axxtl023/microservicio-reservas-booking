import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { IReservasRepository, ReservaConDetalles, ReservaFiltros } from './interfaces/i-reservas.repository';
import { INCLUDE_DETALLES_PROVEEDOR } from './interfaces/i-reservas.repository';

@Injectable()
export class ReservasRepository implements IReservasRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<ReservaConDetalles | null> {
    return this.prisma.reservas.findUnique({
      where: { id },
      include: INCLUDE_DETALLES_PROVEEDOR,
    });
  }

  findByCliente(idCliente: string): Promise<ReservaConDetalles[]> {
    return this.prisma.reservas.findMany({
      where: { id_cliente: idCliente },
      include: INCLUDE_DETALLES_PROVEEDOR,
      orderBy: { created_at: 'desc' },
    });
  }

  async findAllPaginated(filtros: ReservaFiltros): Promise<{ data: ReservaConDetalles[]; total: number; page: number; limit: number }> {
    const { search, page, limit } = filtros;
    const skip = (page - 1) * limit;

    const where = search
      ? { id_cliente: { contains: search, mode: 'insensitive' as const } }
      : undefined;

    const [data, total] = await Promise.all([
      this.prisma.reservas.findMany({
        where,
        include: INCLUDE_DETALLES_PROVEEDOR,
        skip,
        take: limit,
        orderBy: { created_at: 'desc' },
      }),
      this.prisma.reservas.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  updateEstado(id: string, status: string): Promise<ReservaConDetalles> {
    return this.prisma.reservas.update({
      where: { id },
      data: { status },
      include: INCLUDE_DETALLES_PROVEEDOR,
    });
  }
}
