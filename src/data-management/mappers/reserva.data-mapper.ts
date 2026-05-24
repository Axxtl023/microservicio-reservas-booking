import type { ReservaConDetalles } from '../../data-access/repositories/interfaces/i-reservas.repository';
import type { ReservaDataModel, DetalleReservaDataModel } from '../models/reserva.data-model';

export class ReservaDataMapper {
  static toDataModel(entity: ReservaConDetalles): ReservaDataModel {
    return {
      id: entity.id,
      idCliente: entity.id_cliente ?? null,
      total: Number(entity.total),
      fechaReserva: entity.fecha_reserva ?? null,
      createdAt: entity.created_at ?? null,
      status: entity.status ?? null,
      detalles: entity.detalles_reserva.map((d): DetalleReservaDataModel => {
        const detalle = d as typeof d & { id_externo_codigo?: string | null };
        return {
        id: d.id,
        idReserva: d.id_reserva ?? null,
        idProveedor: d.id_proveedor ?? null,
        idExterno: d.id_externo ?? null,
        idExternoCodigo: detalle.id_externo_codigo ?? null,
        nombreProveedor: d.proveedores?.nombre ?? null,
        cantidad: d.cantidad,
        precioUnitario: Number(d.precio_unitario),
        createdAt: d.created_at ?? null,
        };
      }),
    };
  }

  static toDataModelList(entities: ReservaConDetalles[]): ReservaDataModel[] {
    return entities.map((e) => this.toDataModel(e));
  }
}
