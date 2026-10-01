import { api } from '@/services/api/http';
import type {
  CancelInvoiceDto,
  CashSessionDetailDto,
  CashSessionResponseDto,
  CloseCashSessionDto,
  CreateExpenseDto,
  CreateInvoiceDto,
  CreatePaymentDto,
  CreateRefundDto,
  DebtorsPageDto,
  ExpenseResponseDto,
  FinanceSummaryDto,
  InvoiceDetailDto,
  InvoiceListItemDto,
  OpenCashSessionDto,
  PaymentDetailDto,
  PaymentResponseDto,
  RefundListItemDto,
  RefundResponseDto,
  UpdateExpenseDto,
  UpdateInvoiceDto,
} from '@/services/api/schema.gen';
import type { Paginated } from '@/types/api';

export type InvoiceStatus = InvoiceListItemDto['status'];
export const INVOICE_STATUSES: readonly InvoiceStatus[] = ['PENDING', 'PARTIAL', 'OVERDUE', 'PAID', 'CANCELLED'];
export type PaymentMethod = PaymentResponseDto['method'];
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER'];
export type ExpenseCategory = ExpenseResponseDto['category'];
export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'RENT',
  'SALARY',
  'UTILITY',
  'MARKETING',
  'EQUIPMENT',
  'OFFICE',
  'TRANSPORT',
  'OTHER',
];
export type ExpenseMethod = ExpenseResponseDto['paymentMethod'];
export const EXPENSE_METHODS: readonly ExpenseMethod[] = ['CASH', 'CARD', 'BANK_TRANSFER', 'OTHER'];

type Sort = 'asc' | 'desc';
interface Page {
  page?: number;
  limit?: number;
}

export interface InvoiceListParams extends Page {
  search?: string;
  status?: InvoiceStatus | '';
  overdue?: boolean;
  branchId?: string;
  familyId?: string;
  studentId?: string;
  from?: string;
  to?: string;
  sortBy?: 'issueDate' | 'dueDate' | 'createdAt' | 'finalAmount';
  sortOrder?: Sort;
}
export interface PaymentListParams extends Page {
  method?: PaymentMethod | '';
  branchId?: string;
  invoiceId?: string;
  familyId?: string;
  studentId?: string;
  cashSessionId?: string;
  from?: string;
  to?: string;
  sortOrder?: Sort;
}
export interface DebtorListParams extends Page {
  search?: string;
  branchId?: string;
  overdue?: boolean;
  partial?: boolean;
  dueTo?: string;
  minAmount?: number;
  sortBy?: 'amount' | 'oldestDueDate' | 'name';
  sortOrder?: Sort;
}
export interface ExpenseListParams extends Page {
  category?: ExpenseCategory | '';
  paymentMethod?: ExpenseMethod | '';
  branchId?: string;
  cashSessionId?: string;
  from?: string;
  to?: string;
  sortBy?: 'expenseDate' | 'amount' | 'createdAt';
  sortOrder?: Sort;
}
export interface CashSessionListParams extends Page {
  status?: 'OPEN' | 'CLOSED' | '';
  branchId?: string;
  from?: string;
  to?: string;
  sortOrder?: Sort;
}
export interface RefundListParams extends Page {
  branchId?: string;
  familyId?: string;
  from?: string;
  to?: string;
}

export const financeApi = {
  invoices: (params: InvoiceListParams) => api.get<Paginated<InvoiceListItemDto>>('/invoices', { params }),
  invoice: (id: string) => api.get<InvoiceDetailDto>(`/invoices/${id}`),
  createInvoice: (body: CreateInvoiceDto) => api.post<InvoiceListItemDto>('/invoices', body),
  updateInvoice: (id: string, body: UpdateInvoiceDto) => api.patch<InvoiceListItemDto>(`/invoices/${id}`, body),
  cancelInvoice: (id: string, body: CancelInvoiceDto) => api.post<InvoiceListItemDto>(`/invoices/${id}/cancel`, body),
  summary: (params: { familyId?: string; studentId?: string }) =>
    api.get<FinanceSummaryDto>('/invoices/summary', { params }),

  payments: (params: PaymentListParams) => api.get<Paginated<PaymentResponseDto>>('/payments', { params }),
  payment: (id: string) => api.get<PaymentDetailDto>(`/payments/${id}`),
  createPayment: (body: CreatePaymentDto) => api.post<PaymentResponseDto>('/payments', body),
  refund: (paymentId: string, body: CreateRefundDto) =>
    api.post<RefundResponseDto>(`/payments/${paymentId}/refunds`, body),
  refunds: (params: RefundListParams) => api.get<Paginated<RefundListItemDto>>('/refunds', { params }),

  debtors: (params: DebtorListParams) => api.get<DebtorsPageDto>('/debtors', { params }),

  cashSessions: (params: CashSessionListParams) =>
    api.get<Paginated<CashSessionResponseDto>>('/cash-sessions', { params }),
  cashSession: (id: string) => api.get<CashSessionDetailDto>(`/cash-sessions/${id}`),
  /** The caller's open session (null when none — the API answers 200 with null). */
  currentCashSession: () => api.get<CashSessionDetailDto | null>('/cash-sessions/current'),
  openCashSession: (body: OpenCashSessionDto) => api.post<CashSessionDetailDto>('/cash-sessions', body),
  closeCashSession: (id: string, body: CloseCashSessionDto) =>
    api.post<CashSessionDetailDto>(`/cash-sessions/${id}/close`, body),

  expenses: (params: ExpenseListParams) => api.get<Paginated<ExpenseResponseDto>>('/expenses', { params }),
  createExpense: (body: CreateExpenseDto) => api.post<ExpenseResponseDto>('/expenses', body),
  updateExpense: (id: string, body: UpdateExpenseDto) => api.patch<ExpenseResponseDto>(`/expenses/${id}`, body),
};

/** Every money view: a payment or refund changes debts, cash totals and the dashboard. */
export const MONEY_KEYS = [
  ['invoices'],
  ['payments'],
  ['refunds'],
  ['debtors'],
  ['cash'],
  ['finance'],
  ['dashboard'],
] as const;
