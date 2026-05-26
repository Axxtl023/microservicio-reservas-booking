import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  Inject, HttpException, HttpStatus, UseGuards, BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { IProveedoresService } from '../../../business/catalogo/interfaces/i-proveedores.service';
import { IPROVEEDORES_SERVICE } from '../../../business/catalogo/interfaces/i-proveedores.service';
import { CreateProveedorDto, UpdateProveedorDto, ProveedorResponseDto, ProveedorPublicoDto } from '../../../business/catalogo/dtos/proveedor.dto';
import { PROVEEDOR_TIPOS, type ProveedorTipo } from '../../../data-management/models/proveedor.data-model';
import { ApiResponse as ApiResult } from '../../common/api-response';
import { JwtAuthGuard } from '../../../business/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';

@ApiTags('Proveedores')
@Controller('api/v1/proveedores')
export class ProveedoresController {
  constructor(
    @Inject(IPROVEEDORES_SERVICE)
    private readonly proveedoresService: IProveedoresService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Listar proveedores con búsqueda opcional (admin)' })
  @ApiQuery({ name: 'search', required: false })
  async findAll(@Query('search') search?: string): Promise<ApiResult<ProveedorResponseDto[]>> {
    try {
      const result = await this.proveedoresService.findAll(search);
      return ApiResult.ok(result as unknown as ProveedorResponseDto[], 'Proveedores obtenidos exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Get('publico')
  @ApiOperation({
    summary: 'Listar proveedores activos por tipo (público para FE — mapea nombre→UUID al agregar al carrito)',
  })
  @ApiQuery({ name: 'tipo', required: true, enum: PROVEEDOR_TIPOS })
  async findActivosByTipo(@Query('tipo') tipo: string): Promise<ApiResult<ProveedorPublicoDto[]>> {
    try {
      if (!PROVEEDOR_TIPOS.includes(tipo as ProveedorTipo)) {
        throw new BadRequestException(`tipo debe ser uno de: ${PROVEEDOR_TIPOS.join(', ')}`);
      }
      const proveedores = await this.proveedoresService.findAllActivosByTipo(tipo as ProveedorTipo);
      const publicos: ProveedorPublicoDto[] = proveedores.map((p) => ({
        id: p.id,
        nombre: p.nombre,
        tipo: p.tipo,
        activo: p.activo,
      }));
      return ApiResult.ok(publicos, 'Proveedores obtenidos exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Obtener proveedor por ID (admin)' })
  async findById(@Param('id') id: string): Promise<ApiResult<ProveedorResponseDto>> {
    try {
      const result = await this.proveedoresService.findById(id);
      return ApiResult.ok(result as unknown as ProveedorResponseDto, 'Proveedor obtenido exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Crear proveedor (admin)' })
  @ApiBody({ type: CreateProveedorDto })
  async create(@Body() dto: CreateProveedorDto): Promise<ApiResult<ProveedorResponseDto>> {
    try {
      const result = await this.proveedoresService.create(dto);
      return ApiResult.ok(result as unknown as ProveedorResponseDto, 'Proveedor creado exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Actualizar proveedor (admin)' })
  @ApiBody({ type: UpdateProveedorDto })
  async update(@Param('id') id: string, @Body() dto: UpdateProveedorDto): Promise<ApiResult<ProveedorResponseDto>> {
    try {
      const result = await this.proveedoresService.update(id, dto);
      return ApiResult.ok(result as unknown as ProveedorResponseDto, 'Proveedor actualizado exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT')
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
