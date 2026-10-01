import { computed, toValue, type MaybeRefOrGetter } from 'vue';
import type { SelectOption } from '@/components/ui/AppSelect.vue';
import { api } from '@/services/api/http';
import type { CreateRoomDto, RoomResponseDto, UpdateRoomDto } from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';
import type { Paginated } from '@/types/api';

export interface RoomListParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean | string;
  branchId?: string;
  sortBy?: 'code' | 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export const roomsApi = {
  list: (params: RoomListParams) => api.get<Paginated<RoomResponseDto>>('/rooms', { params }),
  create: (body: CreateRoomDto) => api.post<RoomResponseDto>('/rooms', body),
  update: (id: string, body: UpdateRoomDto) => api.patch<RoomResponseDto>(`/rooms/${id}`, body),
  deactivate: (id: string) => api.delete<RoomResponseDto>(`/rooms/${id}`),
};

export function useRooms(params: MaybeRefOrGetter<RoomListParams>) {
  return useApiQuery({ key: () => ['rooms', 'list', toValue(params)], fn: () => roomsApi.list(toValue(params)), keepPrevious: true });
}

/** Active rooms (of one branch when given) for selects. */
export function useRoomOptions(enabled?: MaybeRefOrGetter<boolean>, branchId?: MaybeRefOrGetter<string | undefined>) {
  const query = useApiQuery({
    key: () => ['rooms', 'options', toValue(branchId) ?? null],
    fn: () => roomsApi.list({ isActive: true, branchId: toValue(branchId) || undefined, limit: 100, sortBy: 'name', sortOrder: 'asc' }),
    staleTime: 60_000,
    enabled,
  });
  const options = computed<SelectOption[]>(
    () => query.data.value?.items.map((room) => ({ value: room.id, label: `${room.name} · ${room.capacity}` })) ?? [],
  );
  return { ...query, options };
}
