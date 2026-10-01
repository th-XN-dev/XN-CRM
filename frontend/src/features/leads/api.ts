import { api } from '@/services/api/http';
import type {
  ConvertLeadDto,
  CreateLeadDto,
  LeadActivityResponseDto,
  LeadConversionResultDto,
  LeadDetailDto,
  LeadListItemDto,
  LeadResponseDto,
  LeadSourceResponseDto,
  LeadStatsResponseDto,
  UpdateLeadDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';

export type LeadStatus = LeadResponseDto['status'];
export type LeadPriority = LeadResponseDto['priority'];
/** The sales funnel, left to right. CONVERTED only via the conversion flow; LOST is final. */
export const PIPELINE: readonly LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL_BOOKED', 'TRIAL_ATTENDED', 'NEGOTIATION', 'CONVERTED'];
export const LEAD_STATUSES: readonly LeadStatus[] = [...PIPELINE, 'LOST'];
export const OPEN_STATUSES: readonly LeadStatus[] = PIPELINE.filter((status) => status !== 'CONVERTED');
export const LEAD_PRIORITIES: readonly LeadPriority[] = ['LOW', 'MEDIUM', 'HIGH'];
export const ACTIVITY_TYPES = ['CALL', 'MESSAGE', 'MEETING', 'TRIAL', 'NOTE'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface LeadListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: LeadStatus | '';
  priority?: LeadPriority | '';
  sourceId?: string;
  assignedToId?: string;
  branchId?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'nextFollowUpAt' | 'name' | 'priority' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export const leadsApi = {
  list: (params: LeadListParams) => api.get<Paginated<LeadListItemDto>>('/leads', { params }),
  followUps: (params: { filter?: 'today' | 'overdue' | 'upcoming'; assignedToId?: string; page?: number; limit?: number }) =>
    api.get<Paginated<LeadListItemDto>>('/leads/follow-ups', { params }),
  stats: () => api.get<LeadStatsResponseDto>('/leads/stats'),
  get: (id: string) => api.get<LeadDetailDto>(`/leads/${id}`),
  create: (body: CreateLeadDto) => api.post<LeadResponseDto>('/leads', body),
  update: (id: string, body: UpdateLeadDto) => api.patch<LeadResponseDto>(`/leads/${id}`, body),
  remove: (id: string) => api.delete<LeadResponseDto>(`/leads/${id}`),
  changeStatus: (id: string, status: LeadStatus, reason?: string) =>
    api.patch<LeadResponseDto>(`/leads/${id}/status`, { status, reason }),
  assign: (id: string, assignedToId: string | null) => api.patch<LeadResponseDto>(`/leads/${id}/assign`, { assignedToId }),
  followUp: (id: string, nextFollowUpAt: string | null) =>
    api.patch<LeadResponseDto>(`/leads/${id}/follow-up`, { nextFollowUpAt }),
  addActivity: (id: string, type: ActivityType, note?: string) =>
    api.post<LeadActivityResponseDto>(`/leads/${id}/activities`, { type, note }),
  activities: (id: string, page: number) =>
    api.get<Paginated<LeadActivityResponseDto>>(`/leads/${id}/activities`, { params: { page, limit: 30 } }),
  convert: (id: string, body: ConvertLeadDto) => api.post<LeadConversionResultDto>(`/leads/${id}/convert`, body),
  sources: () => api.get<LeadSourceResponseDto[]>('/lead-sources', { params: { isActive: true } }),
};

export const LEAD_KEYS = [['leads'], ['dashboard']] as const;
