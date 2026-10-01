<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue';
import { useRouter } from 'vue-router';
import { useQuickActionsStore, type QuickDialog } from './actions';

/**
 * The dialogs behind the quick actions, mounted once in the shell. Each loads
 * on first use; after "create", the new record opens.
 */
const store = useQuickActionsStore();
const router = useRouter();
const StudentFormModal = defineAsyncComponent(() => import('@/features/students/components/StudentFormModal.vue'));
const FamilyFormModal = defineAsyncComponent(() => import('@/features/families/components/FamilyFormModal.vue'));
const InvoiceFormModal = defineAsyncComponent(() => import('@/features/finance/components/InvoiceFormModal.vue'));
const PaymentFormModal = defineAsyncComponent(() => import('@/features/finance/components/PaymentFormModal.vue'));
const LeadFormModal = defineAsyncComponent(() => import('@/features/leads/components/LeadFormModal.vue'));
const TaskFormModal = defineAsyncComponent(() => import('@/features/tasks/components/TaskFormModal.vue'));

const isOpen = (dialog: QuickDialog) =>
  computed({ get: () => store.dialog === dialog, set: (value: boolean) => (value ? store.open(dialog) : store.close()) });
const student = isOpen('student');
const family = isOpen('family');
const invoice = isOpen('invoice');
const payment = isOpen('payment');
const lead = isOpen('lead');
const task = isOpen('task');
</script>

<template>
  <StudentFormModal v-if="store.dialog === 'student'" v-model:open="student" @saved="(s) => router.push({ name: 'student', params: { id: s.id } })" />
  <FamilyFormModal v-if="store.dialog === 'family'" v-model:open="family" @saved="(f) => router.push({ name: 'family', params: { id: f.id } })" />
  <InvoiceFormModal v-if="store.dialog === 'invoice'" v-model:open="invoice" @saved="(i) => router.push({ name: 'invoice', params: { id: i.id } })" />
  <PaymentFormModal v-if="store.dialog === 'payment'" v-model:open="payment" @saved="(p) => router.push({ name: 'invoice', params: { id: p.invoiceId } })" />
  <LeadFormModal v-if="store.dialog === 'lead'" v-model:open="lead" @saved="(l) => router.push({ name: 'lead', params: { id: l.id } })" />
  <TaskFormModal v-if="store.dialog === 'task'" v-model:open="task" @saved="(t) => router.push({ name: 'task', params: { id: t.id } })" />
</template>
