import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { IProveedoresRepository } from './interfaces/i-proveedores.repository';
import type { ProveedorTipo } from '../../data-management/models/proveedor.data-model';
import type { proveedores } from '@prisma/client';

@Injectable()
export class ProveedoresRepository implements IProveedoresRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(search?: string): Promise<proveedores[]> {
    return this.prisma.proveedores.findMany({
      where: search ? { nombre: { contains: search, mode: 'insensitive' } } : undefined,
      orderBy: { nombre: 'asc' },
    });
  }

  findAllActivosByTipo(tipo: ProveedorTipo): Promise<proveedores[]> {
    return this.prisma.proveedores.findMany({
      where: { tipo, activo: true },
      orderBy: { nombre: 'asc' },
    });
  }

  findById(id: string): Promise<proveedores | null> {
    return this.prisma.proveedores.findUnique({ where: { id } });
  }

  findManyByIds(ids: string[]): Promise<proveedores[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return this.prisma.proveedores.findMany({ where: { id: { in: ids } } });
  }

  create(data: { nombre: string; tipo: ProveedorTipo; url_api_base: string; activo?: boolean }): Promise<proveedores> {
    return this.prisma.proveedores.create({ data });
  }

  update(id: string, data: { nombre?: string; tipo?: ProveedorTipo; url_api_base?: string; activo?: boolean }): Promise<proveedores> {
    return this.prisma.proveedores.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.proveedores.delete({ where: { id } });
  }
}
