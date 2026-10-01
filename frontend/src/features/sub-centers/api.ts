import { computed, type MaybeRefOrGetter } from 'vue';
import type { SelectOption } from '@/components/ui/AppSelect.vue';
import { api } from '@/services/api/http';
import type { CreateSubCenterDto, SubCenterDto, UpdateSubCenterDto } from '@/services/api/schema.gen';
import { useApiQuery } from '@/services/query/useApiQuery';

export type SubCenterStatus = SubCenterDto['status'];

export const subCentersApi = {
  list: () => api.get<SubCenterDto[]>('/sub-centers'),
  create: (body: CreateSubCenterDto) => api.post<SubCenterDto>('/sub-centers', body),
  update: (id: string, body: UpdateSubCenterDto) => api.patch<SubCenterDto>(`/sub-centers/${id}`, body),
  setStatus: (id: string, status: SubCenterStatus) => api.post<SubCenterDto>(`/sub-centers/${id}/status`, { status }),
};

export function useSubCenters(enabled?: MaybeRefOrGetter<boolean>) {
  const query = useApiQuery({ key: ['sub-centers'], fn: subCentersApi.list, staleTime: 30_000, enabled });
  /** Not archived, for "belongs to" selects. */
  const options = computed<SelectOption[]>(
    () =>
      query.data.value
        ?.filter((sub) => sub.status !== 'ARCHIVED')
        .map((sub) => ({ value: sub.id, label: sub.name })) ?? [],
  );
  return { ...query, options };
}
