import type { auditoria } from '@prisma/client';
import type { AuditoriaDataModel } from '../models/auditoria.data-model';

export class AuditoriaDataMapper {
  static toDataModel(entity: auditoria): AuditoriaDataModel {
    return {
      id: entity.id,
      idUsuario: entity.id_usuario ?? null,
      accion: entity.accion,
      tabla: entity.tabla,
      detalles: entity.detalles ?? null,
      ip: entity.ip ?? null,
      fecha: entity.fecha,
    };
  }

  static toDataModelList(entities: auditoria[]): AuditoriaDataModel[] {
    return entities.map((e) => this.toDataModel(e));
  }
}
