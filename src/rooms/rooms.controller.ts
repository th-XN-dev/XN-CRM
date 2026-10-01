import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrorResponse,
  ApiPaginatedResponse,
} from '../common/swagger/api-responses';
import { PERMISSIONS } from '../permissions/permissions.catalog';
import { CurrentTenant } from '../tenancy/decorators/current-tenant.decorator';
import { OrganizationScoped } from '../tenancy/decorators/organization-scoped.decorator';
import { RequirePermissions } from '../tenancy/decorators/require-permissions.decorator';
import { type TenantContext } from '../tenancy/tenant-context';
import { CreateRoomDto, ListRoomsQueryDto, UpdateRoomDto } from './dto/room.dto';
import { RoomResponseDto } from './dto/room-response.dto';
import { RoomsService } from './rooms.service';

@ApiTags('Rooms')
@ApiBearerAuth()
@OrganizationScoped()
@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Post()
  @RequirePermissions(PERMISSIONS.ROOMS_CREATE)
  @ApiOperation({ summary: 'Create a room in a branch (branch defaults to X-Branch-Id)' })
  @ApiEnvelopeResponse(RoomResponseDto, HttpStatus.CREATED)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'ROOM_CODE_TAKEN')
  create(@CurrentTenant() tenant: TenantContext, @Body() dto: CreateRoomDto) {
    return this.rooms.create(tenant, dto);
  }

  @Get()
  @RequirePermissions(PERMISSIONS.ROOMS_READ)
  @ApiOperation({ summary: 'List rooms (filters: branchId, isActive, search)' })
  @ApiPaginatedResponse(RoomResponseDto)
  list(@CurrentTenant() tenant: TenantContext, @Query() query: ListRoomsQueryDto) {
    return this.rooms.list(tenant, query);
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ROOMS_READ)
  @ApiOperation({ summary: 'Get a room' })
  @ApiEnvelopeResponse(RoomResponseDto)
  @ApiErrorResponse(HttpStatus.NOT_FOUND, 'ROOM_NOT_FOUND')
  findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.findOne(tenant, id);
  }

  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROOMS_UPDATE)
  @ApiOperation({ summary: 'Update a room (branch is immutable)' })
  @ApiEnvelopeResponse(RoomResponseDto)
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.rooms.update(tenant, id, dto);
  }

  @Delete(':id')
  @RequirePermissions(PERMISSIONS.ROOMS_DELETE)
  @ApiOperation({ summary: 'Deactivate a room (soft delete)' })
  @ApiEnvelopeResponse(RoomResponseDto)
  @ApiErrorResponse(HttpStatus.CONFLICT, 'ROOM_IN_USE')
  deactivate(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.rooms.deactivate(tenant, id);
  }
}
