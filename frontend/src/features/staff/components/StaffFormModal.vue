<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { z } from 'zod';
import FormField from '@/components/forms/FormField.vue';
import FormModal from '@/components/forms/FormModal.vue';
import AppCheckbox from '@/components/ui/AppCheckbox.vue';
import AppInput from '@/components/ui/AppInput.vue';
import AppSelect from '@/components/ui/AppSelect.vue';
import AppSwitch from '@/components/ui/AppSwitch.vue';
import { useEntityForm } from '@/composables/useEntityForm';
import { zId, zOptionalEmail, zOptionalPhone } from '@/lib/validation';
import type { CreateStaffDto, StaffCredentialsDto, StaffMemberDto, UpdateStaffDto } from '@/services/api/schema.gen';
import { useApiMutation } from '@/services/query/useApiQuery';
import { useSessionStore } from '@/stores/session.store';
import { staffApi, useStaffRoles } from '../api';

/**
 * Add a staff member (account + role + branches) or change an existing
 * member's role and branches. Only roles the caller may hand out are offered;
 * the API enforces the same rule.
 */
const props = defineProps<{ member?: StaffMemberDto | null }>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ created: [credentials: StaffCredentialsDto] }>();
const { t, te } = useI18n();
const session = useSessionStore();
const roles = useStaffRoles();
const editing = computed(() => !!props.member);
const allBranches = ref(false);
const branchIds = ref<string[]>([]);
const branchesError = ref<string | undefined>();

const roleOptions = computed(() =>
  (roles.data.value ?? []).map((role) => ({
    value: role.key,
    label: `${te(`roles.${role.key}`) ? t(`roles.${role.key}`) : role.name}${role.assignable ? '' : ` · ${t('management.staff.notAssignable')}`}`,
    disabled: !role.assignable,
  })),
);
const schema = z
  .object({
    name: z.string().trim().max(120),
    email: zOptionalEmail(),
    phone: zOptionalPhone(),
    roleKey: zId(),
  })
  .superRefine((value, context) => {
    if (!editing.value && !value.name) context.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: t('validation.required') });
    if (!editing.value && !value.email && !value.phone) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['email'], message: t('validation.login') });
    }
  });

const save = useApiMutation({
  fn: (values: z.output<typeof schema>): Promise<StaffCredentialsDto | StaffMemberDto> => {
    const access = { allBranches: allBranches.value, branchIds: allBranches.value ? undefined : branchIds.value };
    return props.member
      ? staffApi.update(session.organizationId ?? '', props.member.id, { roleKey: values.roleKey as UpdateStaffDto['roleKey'], ...access })
      : staffApi.create(session.organizationId ?? '', {
          name: values.name,
          email: values.email,
          phone: values.phone,
          roleKey: values.roleKey as CreateStaffDto['roleKey'],
          ...access,
        });
  },
  invalidates: [['staff'], ['members']],
  success: () => (editing.value ? t('management.staff.saved') : t('management.staff.created')),
  onSuccess: (result) => {
    open.value = false;
    if ('temporaryPassword' in result) emit('created', result);
  },
});
const { defineField, errors, onSubmit, formError, reset, isSubmitting } = useEntityForm({
  schema,
  initialValues: () => ({ name: '', email: '', phone: '', roleKey: props.member?.role ?? '' }),
  submit: (values) => {
    branchesError.value = !allBranches.value && branchIds.value.length === 0 ? t('management.staff.chooseBranches') : undefined;
    return branchesError.value ? Promise.resolve() : save.mutateAsync(values);
  },
  fieldCodes: { MEMBER_ALREADY_EXISTS: 'email', ROLE_NOT_ASSIGNABLE: 'roleKey' },
});
const [name] = defineField('name');
const [email] = defineField('email');
const [phone] = defineField('phone');
const [roleKey] = defineField('roleKey');
watch(open, (value) => {
  if (!value) return;
  reset();
  allBranches.value = props.member?.allBranches ?? false;
  branchIds.value = props.member?.branches.map((b) => b.id) ?? (session.apiBranchId ? [session.apiBranchId] : []);
  branchesError.value = undefined;
});
function toggleBranch(id: string, on: boolean): void {
  branchIds.value = on ? [...new Set([...branchIds.value, id])] : branchIds.value.filter((b) => b !== id);
}
</script>

<template>
  <FormModal
    v-model:open="open"
    :title="editing ? $t('management.staff.edit') : $t('management.staff.new')"
    :description="editing ? member?.user.name : $t('management.staff.contactHint')"
    :loading="isSubmitting"
    :error="formError"
    @submit="onSubmit"
  >
    <template v-if="!editing">
      <FormField v-slot="field" :label="$t('management.staff.name')" :error="errors.name">
        <AppInput :id="field.id" v-model="name" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
      </FormField>
      <div class="grid gap-4 sm:grid-cols-2">
        <FormField v-slot="field" :label="$t('management.staff.email')" :error="errors.email">
          <AppInput :id="field.id" v-model="email" type="email" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
        <FormField v-slot="field" :label="$t('management.staff.phone')" :error="errors.phone" optional>
          <AppInput :id="field.id" v-model="phone" type="tel" inputmode="tel" autocomplete="off" :invalid="field.invalid" :described-by="field.describedBy" />
        </FormField>
      </div>
    </template>
    <FormField v-slot="field" :label="$t('management.staff.role')" :error="errors.roleKey">
      <AppSelect :id="field.id" v-model="roleKey" :options="roleOptions" :placeholder="$t('validation.choose')" :invalid="field.invalid" :described-by="field.describedBy" />
    </FormField>
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-sm font-medium text-fg">{{ $t('management.staff.branches') }}</legend>
      <AppSwitch v-if="session.context?.membership.allBranches" v-model="allBranches" :label="$t('management.staff.allBranches')" />
      <ul v-if="!allBranches" class="grid gap-2 sm:grid-cols-2">
        <li v-for="branch in session.branches" :key="branch.id" class="rounded-xl border border-border px-3 py-2">
          <AppCheckbox :model-value="branchIds.includes(branch.id)" :label="branch.name" @update:model-value="toggleBranch(branch.id, $event)" />
        </li>
      </ul>
      <p v-if="branchesError" class="text-sm text-danger" role="alert">{{ branchesError }}</p>
    </fieldset>
  </FormModal>
</template>
