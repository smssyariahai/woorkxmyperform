// Modul aplikasi yang dapat diaktifkan/nonaktifkan per kantor.
export const AVAILABLE_MODULES = [
  { key: 'inbox', label: 'Inbox' },
  { key: 'crm', label: 'CRM' },
  { key: 'hr', label: 'HR & Rekrutmen' },
  { key: 'broadcast', label: 'Broadcast' },
  { key: 'bot', label: 'Bot' },
  { key: 'kantor', label: 'Kantor Virtual' },
  { key: 'channels', label: 'Saluran' },
] as const;

export type ModuleKey = (typeof AVAILABLE_MODULES)[number]['key'];
