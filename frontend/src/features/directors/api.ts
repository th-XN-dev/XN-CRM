import { toValue, type MaybeRefOrGetter } from 'vue';
import { api } from '@/services/api/http';
import type {
  CreateDirectorDto,
  DirectorCredentialsDto,
  DirectorDto,
  UpdateDirectorDto,
} from '@/services/api/schema.gen';
import { useAccountQuery } from '@/services/query/useAccountQuery';
import type { Paginated } from '@/types/api';

const platform = { skipTenant: true } as const;

export interface DirectorListParams {
  page?: number;
  limit?: number;
  search?: string;
  centerId?: string;
  sortOrder?: 'asc' | 'desc';
}

export const directorsApi = {
  list: (params: DirectorListParams) => api.get<Paginated<DirectorDto>>('/owner/directors', { ...platform, params }),
  create: (body: CreateDirectorDto) => api.post<DirectorCredentialsDto>('/owner/directors', body, platform),
  update: (id: string, body: UpdateDirectorDto) => api.patch<DirectorDto>(`/owner/directors/${id}`, body, platform),
  resetPassword: (id: string) => api.post<DirectorCredentialsDto>(`/owner/directors/${id}/reset-password`, undefined, platform),
};

export function useDirectors(params: MaybeRefOrGetter<DirectorListParams>) {
  return useAccountQuery({
    key: () => ['owner', 'directors', toValue(params)],
    fn: () => directorsApi.list(toValue(params)),
    keepPrevious: true,
  });
}
