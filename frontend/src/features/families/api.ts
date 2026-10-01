import { api } from '@/services/api/http';
import type {
  CreateFamilyDto,
  FamilyDetailDto,
  FamilyListItemDto,
  FamilyResponseDto,
  UpdateFamilyDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';

export interface FamilyListParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean | string;
  branchId?: string;
  sortBy?: 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export const familiesApi = {
  list: (params: FamilyListParams) => api.get<Paginated<FamilyListItemDto>>('/families', { params }),
  get: (id: string) => api.get<FamilyDetailDto>(`/families/${id}`),
  create: (body: CreateFamilyDto) => api.post<FamilyResponseDto>('/families', body),
  update: (id: string, body: UpdateFamilyDto) => api.patch<FamilyResponseDto>(`/families/${id}`, body),
  deactivate: (id: string) => api.delete<FamilyResponseDto>(`/families/${id}`),
};
