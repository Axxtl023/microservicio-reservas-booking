import { Injectable, Inject } from '@nestjs/common';
import type { IAuditoriaService } from './interfaces/i-auditoria.service';
import type { IUnitOfWork } from '../../data-management/interfaces/i-unit-of-work';
import { IUNIT_OF_WORK } from '../../data-management/interfaces/i-unit-of-work';
import { AuditoriaDataMapper } from '../../data-management/mappers/auditoria.data-mapper';
import type { AuditoriaDataModel } from '../../data-management/models/auditoria.data-model';

@Injectable()
export class AuditoriaService implements IAuditoriaService {
  constructor(@Inject(IUNIT_OF_WORK) private readonly uow: IUnitOfWork) {}

  async registrar(data: { idUsuario?: string; accion: string; tabla: string; detalles?: string; ip?: string }): Promise<void> {
    await this.uow.auditoriaRepository.create({
      id_usuario: data.idUsuario,
      accion: data.accion,
      tabla: data.tabla,
      detalles: data.detalles,
      ip: data.ip,
    });
  }

  async findAll(page: number, limit: number): Promise<{ data: AuditoriaDataModel[]; total: number }> {
    const result = await this.uow.auditoriaRepository.findAll(page, limit);
    return {
      data: AuditoriaDataMapper.toDataModelList(result.data),
      total: result.total,
    };
  }
}
