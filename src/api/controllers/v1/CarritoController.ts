import {
  Controller, Get, Post, Patch, Delete, Body, Param,
  Inject, Req, HttpException, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import type { ICarritoService } from '../../../business/carrito/interfaces/i-carrito.service';
import { ICARRITO_SERVICE } from '../../../business/carrito/interfaces/i-carrito.service';
import { AddItemDto, UpdateItemCantidadDto, CarritoResponseDto } from '../../../business/carrito/dtos/carrito.dto';
import { ApiResponse as ApiResult } from '../../common/api-response';
import { JwtAuthGuard } from '../../../business/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';
import type { JwtPayload } from '../../../business/auth/interfaces/jwt-payload.interface';

@ApiTags('Carrito')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/carrito')
export class CarritoController {
  constructor(
    @Inject(ICARRITO_SERVICE)
    private readonly carritoService: ICarritoService,
  ) {}

  @Get('me')
  @Roles('admin', 'cliente')
  @ApiOperation({ summary: 'Obtener carrito activo del cliente autenticado' })
  @ApiResponse({ status: 200, type: CarritoResponseDto })
  async getCarritoActivo(@Req() req: { user: JwtPayload }): Promise<ApiResult<CarritoResponseDto>> {
    try {
      const idCliente = req.user.idCliente ?? req.user.sub;
      const result = await this.carritoService.getCarritoActivo(idCliente);
      return ApiResult.ok(result as unknown as CarritoResponseDto, 'Carrito obtenido exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Post('add')
  @Roles('admin', 'cliente')
  @ApiOperation({ summary: 'Agregar ítem al carrito' })
  @ApiBody({ type: AddItemDto })
  @ApiResponse({ status: 201, type: CarritoResponseDto })
  async addItem(
    @Req() req: { user: JwtPayload },
    @Body() dto: AddItemDto,
  ): Promise<ApiResult<CarritoResponseDto>> {
    try {
      const idCliente = req.user.idCliente ?? req.user.sub;
      const result = await this.carritoService.addItem(idCliente, dto.idProveedor, dto.idProductoExterno, dto.nombreProducto, dto.cantidad, dto.precioUnitario, dto.metadata);
      return ApiResult.ok(result as unknown as CarritoResponseDto, 'Ítem agregado al carrito');
    } catch (error) { this.handleError(error); }
  }

  @Patch('item/:id')
  @Roles('admin', 'cliente')
  @ApiOperation({ summary: 'Actualizar cantidad de un ítem del carrito' })
  @ApiBody({ type: UpdateItemCantidadDto })
  async updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateItemCantidadDto,
  ): Promise<ApiResult<CarritoResponseDto>> {
    try {
      const result = await this.carritoService.updateItemCantidad(id, dto.cantidad);
      return ApiResult.ok(result as unknown as CarritoResponseDto, 'Ítem actualizado');
    } catch (error) { this.handleError(error); }
  }

  @Delete('item/:id')
  @Roles('admin', 'cliente')
  @ApiOperation({ summary: 'Eliminar ítem del carrito' })
  async removeItem(@Param('id') id: string): Promise<ApiResult<CarritoResponseDto>> {
    try {
      const result = await this.carritoService.removeItem(id);
      return ApiResult.ok(result as unknown as CarritoResponseDto, 'Ítem eliminado del carrito');
    } catch (error) { this.handleError(error); }
  }

  private handleError(error: unknown): never {
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = error instanceof Error ? error.message : 'Error interno';
    throw new HttpException(ApiResult.fail(message), status);
  }
}
