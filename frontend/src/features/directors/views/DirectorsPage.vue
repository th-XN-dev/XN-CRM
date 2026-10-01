<script setup lang="ts">
import { Plus } from 'lucide-vue-next';
import { ref } from 'vue';
import PageHeader from '@/components/layout/PageHeader.vue';
import AppButton from '@/components/ui/AppButton.vue';
import DirectorsTable from '../components/DirectorsTable.vue';

const table = ref<InstanceType<typeof DirectorsTable>>();
</script>

<template>
  <div>
    <PageHeader :title="$t('owner.directors.title')" :description="$t('owner.directors.subtitle')">
      <template #actions>
        <AppButton :icon="Plus" @click="table?.create()">{{ $t('owner.directors.new') }}</AppButton>
      </template>
    </PageHeader>
    <DirectorsTable ref="table" />
  </div>
</template>
