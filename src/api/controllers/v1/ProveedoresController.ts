import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  Inject, HttpException, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { IProveedoresService } from '../../../business/catalogo/interfaces/i-proveedores.service';
import { IPROVEEDORES_SERVICE } from '../../../business/catalogo/interfaces/i-proveedores.service';
import { CreateProveedorDto, UpdateProveedorDto, ProveedorResponseDto } from '../../../business/catalogo/dtos/proveedor.dto';
import { ApiResponse as ApiResult } from '../../common/api-response';
import { JwtAuthGuard } from '../../../business/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';

@ApiTags('Proveedores')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('api/v1/proveedores')
export class ProveedoresController {
  constructor(
    @Inject(IPROVEEDORES_SERVICE)
    private readonly proveedoresService: IProveedoresService,
  ) {}

  @Get()
  @Roles('admin')
  @ApiOperation({ summary: 'Listar proveedores con búsqueda opcional (admin)' })
  @ApiQuery({ name: 'search', required: false })
  async findAll(@Query('search') search?: string): Promise<ApiResult<ProveedorResponseDto[]>> {
    try {
      const result = await this.proveedoresService.findAll(search);
      return ApiResult.ok(result as unknown as ProveedorResponseDto[], 'Proveedores obtenidos exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Get(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Obtener proveedor por ID (admin)' })
  async findById(@Param('id') id: string): Promise<ApiResult<ProveedorResponseDto>> {
    try {
      const result = await this.proveedoresService.findById(id);
      return ApiResult.ok(result as unknown as ProveedorResponseDto, 'Proveedor obtenido exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Crear proveedor (admin)' })
  @ApiBody({ type: CreateProveedorDto })
  async create(@Body() dto: CreateProveedorDto): Promise<ApiResult<ProveedorResponseDto>> {
    try {
      const result = await this.proveedoresService.create(dto);
      return ApiResult.ok(result as unknown as ProveedorResponseDto, 'Proveedor creado exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Actualizar proveedor (admin)' })
  @ApiBody({ type: UpdateProveedorDto })
  async update(@Param('id') id: string, @Body() dto: UpdateProveedorDto): Promise<ApiResult<ProveedorResponseDto>> {
    try {
      const result = await this.proveedoresService.update(id, dto);
      return ApiResult.ok(result as unknown as ProveedorResponseDto, 'Proveedor actualizado exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Eliminar proveedor (admin)' })
  async delete(@Param('id') id: string): Promise<ApiResult<null>> {
    try {
      await this.proveedoresService.delete(id);
      return ApiResult.ok(null, 'Proveedor eliminado exitosamente');
    } catch (error) { this.handleError(error); }
  }

  private handleError(error: unknown): never {
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = error instanceof Error ? error.message : 'Error interno';
    throw new HttpException(ApiResult.fail(message), status);
  }
}
