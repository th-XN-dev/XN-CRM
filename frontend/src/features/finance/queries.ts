import { toValue, type MaybeRefOrGetter } from 'vue';
import { useApiQuery } from '@/services/query/useApiQuery';
import {
  type CashSessionListParams,
  type DebtorListParams,
  type ExpenseListParams,
  financeApi,
  type InvoiceListParams,
  type PaymentListParams,
  type RefundListParams,
} from './api';

type Params<T> = MaybeRefOrGetter<T>;
type Enabled = MaybeRefOrGetter<boolean> | undefined;

export function useInvoices(params: Params<InvoiceListParams>, enabled?: Enabled) {
  return useApiQuery({
    key: () => ['invoices', 'list', toValue(params)],
    fn: () => financeApi.invoices(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

export function useInvoice(id: Params<string>) {
  return useApiQuery({ key: () => ['invoices', 'detail', toValue(id)], fn: () => financeApi.invoice(toValue(id)) });
}

export function useAccountSummary(params: Params<{ familyId?: string; studentId?: string }>, enabled?: Enabled) {
  return useApiQuery({
    key: () => ['invoices', 'summary', toValue(params)],
    fn: () => financeApi.summary(toValue(params)),
    enabled,
  });
}

export function usePayments(params: Params<PaymentListParams>, enabled?: Enabled) {
  return useApiQuery({
    key: () => ['payments', 'list', toValue(params)],
    fn: () => financeApi.payments(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

export function usePayment(id: Params<string>, enabled?: Enabled) {
  return useApiQuery({ key: () => ['payments', 'detail', toValue(id)], fn: () => financeApi.payment(toValue(id)), enabled });
}

export function useRefunds(params: Params<RefundListParams>, enabled?: Enabled) {
  return useApiQuery({
    key: () => ['refunds', 'list', toValue(params)],
    fn: () => financeApi.refunds(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

export function useDebtors(params: Params<DebtorListParams>, enabled?: Enabled) {
  return useApiQuery({
    key: () => ['debtors', 'list', toValue(params)],
    fn: () => financeApi.debtors(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

export function useExpenses(params: Params<ExpenseListParams>, enabled?: Enabled) {
  return useApiQuery({
    key: () => ['finance', 'expenses', toValue(params)],
    fn: () => financeApi.expenses(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

export function useCashSessions(params: Params<CashSessionListParams>, enabled?: Enabled) {
  return useApiQuery({
    key: () => ['cash', 'list', toValue(params)],
    fn: () => financeApi.cashSessions(toValue(params)),
    keepPrevious: true,
    enabled,
  });
}

/** The caller's open drawer; refreshed every minute while visible (other tabs, other cashiers' refunds). */
export function useCurrentCashSession(enabled?: Enabled) {
  return useApiQuery({
    key: ['cash', 'current'],
    fn: financeApi.currentCashSession,
    refetchInterval: 60_000,
    enabled,
  });
}

export function useCashSession(id: Params<string>, enabled?: Enabled) {
  return useApiQuery({ key: () => ['cash', 'detail', toValue(id)], fn: () => financeApi.cashSession(toValue(id)), enabled });
}
