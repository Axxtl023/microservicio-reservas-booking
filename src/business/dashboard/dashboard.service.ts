import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import type {
  IDashboardService,
  VentasPorProveedorQuery,
  VentasPorProveedorResponse,
  VentasProveedor,
  VentasTotalesTipo,
} from './interfaces/i-dashboard.service';

const TIPOS_BASE = ['VEHICLE', 'FLIGHT', 'HOTEL', 'ATTRACTION'] as const;

const emptyTotales = (): VentasTotalesTipo => ({
  revenue: 0,
  confirmadas: 0,
  canceladas: 0,
  pendientes: 0,
});

@Injectable()
export class DashboardService implements IDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  // SOLO LECTURA. No muta nada.
  // Lee detalles_reserva + reservas + proveedores, agrega en memoria.
  async ventasPorProveedor(query: VentasPorProveedorQuery): Promise<VentasPorProveedorResponse> {
    const { desde, hasta } = query;

    // Trae todos los proveedores para que aparezcan también los que tienen 0 ventas
    const proveedores = await this.prisma.proveedores.findMany({
      orderBy: [{ tipo: 'asc' }, { nombre: 'asc' }],
    });

    const detalles = await this.prisma.detalles_reserva.findMany({
      where: {
        reservas: {
          fecha_reserva: { gte: desde, lte: hasta },
        },
      },
      select: {
        id_proveedor: true,
        status: true,
        cantidad: true,
        precio_unitario: true,
        created_at: true,
        reservas: {
          select: { status: true, fecha_reserva: true },
        },
      },
    });

    // Bucket por proveedor
    const bucket = new Map<string, {
      revenue: number;
      confirmadas: number;
      canceladas: number;
      pendientes: number;
      ultimaVenta: Date | null;
    }>();

    for (const d of detalles) {
      if (!d.id_proveedor) continue;
      const reservaStatus = (d.reservas?.status ?? 'PAGADA').toUpperCase();
      const detalleStatus = (d.status ?? 'CONFIRMADA').toUpperCase();
      const subtotal = Number(d.precio_unitario) * (d.cantidad ?? 0);

      const b = bucket.get(d.id_proveedor) ?? {
        revenue: 0,
        confirmadas: 0,
        canceladas: 0,
        pendientes: 0,
        ultimaVenta: null,
      };

      // Cancelado domina: si la reserva o el detalle están cancelados, cuenta como cancelada
      if (reservaStatus === 'CANCELADA' || detalleStatus === 'CANCELADA') {
        b.canceladas += 1;
      } else if (reservaStatus === 'PENDIENTE') {
        b.pendientes += 1;
        // Pendiente NO suma revenue todavía
      } else {
        // PAGADA / CONFIRMADA / cualquier otro happy-path
        b.confirmadas += 1;
        b.revenue += subtotal;
      }

      const fecha = d.reservas?.fecha_reserva ?? d.created_at ?? null;
      if (fecha && (!b.ultimaVenta || fecha > b.ultimaVenta)) {
        b.ultimaVenta = fecha;
      }

      bucket.set(d.id_proveedor, b);
    }

    // Construir respuesta por proveedor (todos, incluso los que no aparecen en el bucket)
    const proveedoresOut: VentasProveedor[] = proveedores.map((p) => {
      const b = bucket.get(p.id) ?? {
        revenue: 0,
        confirmadas: 0,
        canceladas: 0,
        pendientes: 0,
        ultimaVenta: null,
      };
      const totalContados = b.confirmadas + b.canceladas;
      const cancelRate = totalContados > 0 ? b.canceladas / totalContados : 0;
      const ticketPromedio = b.confirmadas > 0 ? b.revenue / b.confirmadas : 0;

      return {
        id: p.id,
        nombre: p.nombre,
        tipo: p.tipo,
        activo: p.activo ?? false,
        revenue: Number(b.revenue.toFixed(2)),
        confirmadas: b.confirmadas,
        canceladas: b.canceladas,
        pendientes: b.pendientes,
        ticketPromedio: Number(ticketPromedio.toFixed(2)),
        cancelRate: Number(cancelRate.toFixed(4)),
        ultimaVenta: b.ultimaVenta ? b.ultimaVenta.toISOString() : null,
      };
    });

    // Totales por tipo (rollup)
    const totalesPorTipo: Record<string, VentasTotalesTipo> = {};
    for (const tipo of TIPOS_BASE) totalesPorTipo[tipo] = emptyTotales();
    for (const p of proveedoresOut) {
      const t = totalesPorTipo[p.tipo] ?? emptyTotales();
      t.revenue += p.revenue;
      t.confirmadas += p.confirmadas;
      t.canceladas += p.canceladas;
      t.pendientes += p.pendientes;
      totalesPorTipo[p.tipo] = t;
    }
    // Redondeo final del revenue por tipo
    for (const k of Object.keys(totalesPorTipo)) {
      totalesPorTipo[k].revenue = Number(totalesPorTipo[k].revenue.toFixed(2));
    }

    return {
      rango: { desde: desde.toISOString(), hasta: hasta.toISOString() },
      totalesPorTipo,
      proveedores: proveedoresOut,
    };
  }
}
