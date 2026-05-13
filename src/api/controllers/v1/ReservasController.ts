import {
  Controller, Get, Post, Patch, Body, Param, Query,
  Inject, Req, HttpException, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { buildMeta } from '../../../common/pagination.types';
import type { IReservasService } from '../../../business/reservas/interfaces/i-reservas.service';
import { IRESERVAS_SERVICE } from '../../../business/reservas/interfaces/i-reservas.service';
import { CheckoutDto, UpdateEstadoDto, ReservaResponseDto } from '../../../business/reservas/dtos/reserva.dto';
import { ApiResponse as ApiResult } from '../../common/api-response';
import { JwtAuthGuard } from '../../../business/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import type { JwtPayload } from '../../../business/auth/interfaces/jwt-payload.interface';

@ApiTags('Reservas')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/reservas')
export class ReservasController {
  constructor(
    @Inject(IRESERVAS_SERVICE)
    private readonly reservasService: IReservasService,
  ) {}

  @Post('checkout')
  @Roles('admin', 'cliente')
  @ApiOperation({ summary: 'Convertir carrito activo en reserva (checkout)' })
  @ApiBody({ type: CheckoutDto })
  @ApiResponse({ status: 201, type: ReservaResponseDto })
  async checkout(
    @Req() req: { user: JwtPayload },
    @Body() dto: CheckoutDto,
  ): Promise<ApiResult<ReservaResponseDto>> {
    try {
      const idCliente = req.user.idCliente ?? req.user.sub;
      const result = await this.reservasService.checkout(dto.idCarrito, idCliente);
      return ApiResult.ok(result as unknown as ReservaResponseDto, 'Reserva creada exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Get('me')
  @Roles('admin', 'cliente')
  @ApiOperation({ summary: 'Obtener mis reservas' })
  @ApiResponse({ status: 200, type: [ReservaResponseDto] })
  async getMisReservas(@Req() req: { user: JwtPayload }): Promise<ApiResult<ReservaResponseDto[]>> {
    try {
      const idCliente = req.user.idCliente ?? req.user.sub;
      const result = await this.reservasService.getMisReservas(idCliente);
      return ApiResult.ok(result as unknown as ReservaResponseDto[], 'Reservas obtenidas exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Get('all')
  @Roles('admin')
  @ApiOperation({ summary: 'Listar todas las reservas con paginación (admin)' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getAllReservas(
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<ApiResult<ReservaResponseDto[]>> {
    try {
      const p = page ? Number(page) : 1;
      const l = limit ? Number(limit) : 20;
      const result = await this.reservasService.getAllReservasPaginated({ search, page: p, limit: l });
      return ApiResult.paginated(
        result.data as unknown as ReservaResponseDto[],
        buildMeta(result.total, result.page, result.limit),
        'Reservas obtenidas exitosamente',
      );
    } catch (error) { this.handleError(error); }
  }

  @Get(':id')
  @Roles('admin', 'cliente')
  @ApiOperation({ summary: 'Obtener reserva por ID' })
  async getById(@Param('id') id: string): Promise<ApiResult<ReservaResponseDto>> {
    try {
      const result = await this.reservasService.getById(id);
      return ApiResult.ok(result as unknown as ReservaResponseDto, 'Reserva obtenida exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Patch(':id/estado')
  @Roles('admin')
  @ApiOperation({ summary: 'Actualizar estado de una reserva (admin)' })
  @ApiBody({ type: UpdateEstadoDto })
  async updateEstado(
    @Param('id') id: string,
    @Body() dto: UpdateEstadoDto,
  ): Promise<ApiResult<ReservaResponseDto>> {
    try {
      const result = await this.reservasService.updateEstado(id, dto.status);
      return ApiResult.ok(result as unknown as ReservaResponseDto, 'Estado actualizado exitosamente');
    } catch (error) { this.handleError(error); }
  }

  private handleError(error: unknown): never {
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = error instanceof Error ? error.message : 'Error interno';
    throw new HttpException(ApiResult.fail(message), status);
  }
}
