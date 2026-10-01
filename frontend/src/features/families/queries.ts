import { toValue, type MaybeRefOrGetter } from 'vue';
import { useApiMutation, useApiQuery } from '@/services/query/useApiQuery';
import type { UpdateFamilyDto } from '@/services/api/schema.gen';
import { familiesApi, type FamilyListParams } from './api';

export function useFamilies(params: MaybeRefOrGetter<FamilyListParams>) {
  return useApiQuery({
    key: () => ['families', 'list', toValue(params)],
    fn: () => familiesApi.list(toValue(params)),
    keepPrevious: true,
  });
}

export function useFamily(id: MaybeRefOrGetter<string>) {
  return useApiQuery({
    key: () => ['families', 'detail', toValue(id)],
    fn: () => familiesApi.get(toValue(id)),
  });
}

export function useSetFamilyActive(id: MaybeRefOrGetter<string>) {
  return useApiMutation({
    fn: (active: boolean) =>
      active
        ? familiesApi.update(toValue(id), { isActive: true } satisfies UpdateFamilyDto)
        : familiesApi.deactivate(toValue(id)),
    invalidates: [['families'], ['dashboard']],
    toastError: true,
  });
}
