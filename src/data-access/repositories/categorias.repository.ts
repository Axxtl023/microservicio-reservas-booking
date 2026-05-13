import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { ICategoriasRepository } from './interfaces/i-categorias.repository';
import type { categorias } from '@prisma/client';

@Injectable()
export class CategoriasRepository implements ICategoriasRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<categorias[]> {
    return this.prisma.categorias.findMany({ orderBy: { nombre: 'asc' } });
  }

  findById(id: string): Promise<categorias | null> {
    return this.prisma.categorias.findUnique({ where: { id } });
  }

  findByNombre(nombre: string): Promise<categorias | null> {
    return this.prisma.categorias.findUnique({ where: { nombre } });
  }

  create(data: { nombre: string; descripcion?: string }): Promise<categorias> {
    return this.prisma.categorias.create({ data });
  }

  update(id: string, data: { nombre?: string; descripcion?: string }): Promise<categorias> {
    return this.prisma.categorias.update({ where: { id }, data });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.categorias.delete({ where: { id } });
  }
}
