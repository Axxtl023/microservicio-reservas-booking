import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
  Inject, HttpException, HttpStatus, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import type { ICategoriasService } from '../../../business/catalogo/interfaces/i-categorias.service';
import { ICATEGORIAS_SERVICE } from '../../../business/catalogo/interfaces/i-categorias.service';
import { CreateCategoriaDto, UpdateCategoriaDto, CategoriaResponseDto } from '../../../business/catalogo/dtos/categoria.dto';
import { ApiResponse as ApiResult } from '../../common/api-response';
import { JwtAuthGuard } from '../../../business/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../guards/roles.guard';
import { Roles } from '../../decorators/roles.decorator';

@ApiTags('Categorías')
@Controller('api/v1/categorias')
export class CategoriasController {
  constructor(
    @Inject(ICATEGORIAS_SERVICE)
    private readonly categoriasService: ICategoriasService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Listar todas las categorías (público)' })
  @ApiResponse({ status: 200, type: [CategoriaResponseDto] })
  async findAll(): Promise<ApiResult<CategoriaResponseDto[]>> {
    try {
      const result = await this.categoriasService.findAll();
      return ApiResult.ok(result as unknown as CategoriaResponseDto[], 'Categorías obtenidas exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener categoría por ID' })
  async findById(@Param('id') id: string): Promise<ApiResult<CategoriaResponseDto>> {
    try {
      const result = await this.categoriasService.findById(id);
      return ApiResult.ok(result as unknown as CategoriaResponseDto, 'Categoría obtenida exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Post()
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Crear categoría (admin)' })
  @ApiBody({ type: CreateCategoriaDto })
  async create(@Body() dto: CreateCategoriaDto): Promise<ApiResult<CategoriaResponseDto>> {
    try {
      const result = await this.categoriasService.create(dto);
      return ApiResult.ok(result as unknown as CategoriaResponseDto, 'Categoría creada exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Put(':id')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Actualizar categoría (admin)' })
  @ApiBody({ type: UpdateCategoriaDto })
  async update(@Param('id') id: string, @Body() dto: UpdateCategoriaDto): Promise<ApiResult<CategoriaResponseDto>> {
    try {
      const result = await this.categoriasService.update(id, dto);
      return ApiResult.ok(result as unknown as CategoriaResponseDto, 'Categoría actualizada exitosamente');
    } catch (error) { this.handleError(error); }
  }

  @Delete(':id')
  @ApiBearerAuth('JWT')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiOperation({ summary: 'Eliminar categoría (admin)' })
  async delete(@Param('id') id: string): Promise<ApiResult<null>> {
    try {
      await this.categoriasService.delete(id);
      return ApiResult.ok(null, 'Categoría eliminada exitosamente');
    } catch (error) { this.handleError(error); }
  }

  private handleError(error: unknown): never {
    const status = error instanceof HttpException ? error.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = error instanceof Error ? error.message : 'Error interno';
    throw new HttpException(ApiResult.fail(message), status);
  }
}
