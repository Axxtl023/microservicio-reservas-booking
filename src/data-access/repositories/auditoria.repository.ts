import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { IAuditoriaRepository, CreateAuditoriaData } from './interfaces/i-auditoria.repository';
import type { auditoria } from '@prisma/client';

@Injectable()
export class AuditoriaRepository implements IAuditoriaRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateAuditoriaData): Promise<auditoria> {
    return this.prisma.auditoria.create({ data });
  }

  async findAll(page: number, limit: number): Promise<{ data: auditoria[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.auditoria.findMany({
        skip,
        take: limit,
        orderBy: { fecha: 'desc' },
      }),
      this.prisma.auditoria.count(),
    ]);
    return { data, total };
  }
}
