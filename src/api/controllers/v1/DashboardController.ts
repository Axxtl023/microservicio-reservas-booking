import {
  Controller, Get, Query, Inject, HttpException, HttpStatus, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { IDashboardService, VentasPorProveedorResponse } from '../../../business/dashboard/interfaces/i-dashboard.service';
import { IDASHBOARD_SERVICE } from '../../../business/dashboard/interfaces/i-dashboard.service';
import { ApiResponse as ApiResult } from '../../common/api-response';
import { JwtAuthGuard } from '../../../business/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('api/v1/admin/dashboard')
export class DashboardController {
  constructor(
    @Inject(IDASHBOARD_SERVICE)
    private readonly dashboardService: IDashboardService,
  ) {}

  @Get('ventas-por-proveedor')
  @ApiOperation({ summary: 'Resumen de ventas por proveedor en un rango de fechas (admin)' })
  @ApiQuery({ name: 'desde', required: false, description: 'ISO 8601 — default: hoy - 30d' })
  @ApiQuery({ name: 'hasta', required: false, description: 'ISO 8601 — default: ahora' })
  async ventasPorProveedor(
    @Query('desde') desdeRaw?: string,
    @Query('hasta') hastaRaw?: string,
  ): Promise<ApiResult<VentasPorProveedorResponse>> {
    try {
      const hasta = hastaRaw ? new Date(hastaRaw) : new Date();
      const desde = desdeRaw
        ? new Date(desdeRaw)
        : new Date(hasta.getTime() - 30 * 24 * 60 * 60 * 1000);

      if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
        throw new BadRequestException('desde/hasta deben ser fechas ISO 8601 válidas');
      }
      if (desde > hasta) {
        throw new BadRequestException('desde no puede ser posterior a hasta');
      }

      const result = await this.dashboardService.ventasPorProveedor({ desde, hasta });
      return ApiResult.ok(result, 'Ventas por proveedor obtenidas exitosamente');
    } catch (error) {
      const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
      const message = error instanceof Error ? error.message : 'Error interno';
      throw new HttpException(ApiResult.fail(message), status);
    }
  }
}
