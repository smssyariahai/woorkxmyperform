import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
  password: z.string().min(1, 'Password wajib diisi'),
});

export const registerSchema = z
  .object({
    name: z.string().min(3, 'Nama minimal 3 karakter').max(100),
    company: z.string().min(2, 'Nama perusahaan wajib diisi').max(100),
    email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
    phone: z.string().min(9, 'Nomor WhatsApp tidak valid').max(20),
    password: z.string().min(8, 'Password minimal 8 karakter').max(100),
    confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi'),
    agree: z.literal(true, {
      errorMap: () => ({ message: 'Anda harus menyetujui Terms & Privacy Policy' }),
    }),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(8, 'Password minimal 8 karakter').max(100),
    confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Konfirmasi password tidak sama',
    path: ['confirmPassword'],
  });

export const customerSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter').max(100),
  phone: z.string().max(20).optional().nullable(),
  email: z.string().email('Format email tidak valid').optional().nullable().or(z.literal('')),
  company: z.string().max(100).optional().nullable(),
  industry: z.string().max(100).optional().nullable(),
  source: z.string().max(100).optional().nullable(),
  stage: z.string().max(50).optional(),
  score: z.enum(['Tinggi', 'Sedang', 'Rendah']).optional().nullable(),
  business: z.string().max(200).optional().nullable(),
  interest: z.string().max(200).optional().nullable(),
  budget: z.string().max(200).optional().nullable(),
  ownerId: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export const messageSchema = z.object({
  body: z.string().min(1, 'Pesan tidak boleh kosong').max(4000),
});

export const noteSchema = z.object({
  body: z.string().min(1, 'Catatan tidak boleh kosong').max(2000),
});

export const followUpSchema = z.object({
  customerId: z.string().min(1),
  scheduledAt: z.string().min(1, 'Jadwal wajib diisi'),
  notes: z.string().max(1000).optional().nullable(),
  assignedToId: z.string().optional().nullable(),
});

export const campaignSchema = z.object({
  name: z.string().min(3, 'Nama campaign minimal 3 karakter').max(120),
  channelType: z.enum(['WHATSAPP', 'INSTAGRAM', 'FACEBOOK']).default('WHATSAPP'),
  message: z.string().min(1, 'Pesan tidak boleh kosong').max(4000),
  scheduledAt: z.string().optional().nullable(),
  audience: z.enum(['inbox_all', 'inbox_selected']).optional().nullable(),
  customerIds: z.array(z.string()).max(10000).optional().nullable(),
});

export const inviteSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  role: z.enum(['ADMIN', 'SUPERVISOR', 'AGENT', 'VIEWER']),
});

export const onboardingSchema = z.object({
  company: z.string().min(2, 'Nama perusahaan wajib diisi'),
  industry: z.string().optional().nullable(),
  teamSize: z.string().optional().nullable(),
  channels: z.array(z.string()).min(1, 'Pilih minimal 1 channel'),
  invites: z.array(z.string().email()).optional(),
});

export const templateSchema = z.object({
  name: z.string().min(2, 'Nama template minimal 2 karakter').max(100),
  category: z.string().min(1).max(50).default('Umum'),
  body: z.string().min(1, 'Isi template tidak boleh kosong').max(4000),
  isActive: z.boolean().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

export const HR_STAGES = ['LAMARAN', 'SCREENING', 'INTERVIEW', 'OFFERING', 'DITERIMA', 'DITOLAK'] as const;
export const HR_EMPLOYMENT_TYPES = ['PKWTT', 'PKWT', 'FREELANCE', 'MAGANG'] as const;
export const HR_CONTRACT_TYPES = ['PKWTT', 'PKWT'] as const;

export const hrVacancySchema = z.object({
  title: z.string().min(3, 'Judul lowongan minimal 3 karakter').max(120),
  department: z.string().max(80).optional().nullable(),
  location: z.string().max(80).optional().nullable(),
  employmentType: z.enum(HR_EMPLOYMENT_TYPES).default('PKWTT'),
  quota: z.coerce.number().int().min(1).max(1000).default(1),
  status: z.enum(['OPEN', 'CLOSED', 'DRAFT']).default('OPEN'),
  description: z.string().max(5000).optional().nullable(),
  salaryMin: z.coerce.number().min(0).optional().nullable(),
  salaryMax: z.coerce.number().min(0).optional().nullable(),
});

export const hrCandidateSchema = z.object({
  vacancyId: z.string().min(1).optional().nullable(),
  name: z.string().min(3, 'Nama minimal 3 karakter').max(120),
  email: z.string().email('Format email tidak valid').max(120).optional().nullable().or(z.literal('')),
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  education: z.string().max(120).optional().nullable(),
  experience: z.string().max(2000).optional().nullable(),
  source: z.string().max(60).optional().nullable(),
  stage: z.enum(HR_STAGES).default('LAMARAN'),
  rating: z.coerce.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export const hrEmployeeSchema = z.object({
  employeeNo: z.string().min(1, 'Nomor karyawan wajib diisi').max(30),
  name: z.string().min(3, 'Nama minimal 3 karakter').max(120),
  nik: z.string().max(20).optional().nullable(),
  email: z.string().email('Format email tidak valid').max(120).optional().nullable().or(z.literal('')),
  phone: z.string().max(20).optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  position: z.string().min(2, 'Jabatan wajib diisi').max(80),
  department: z.string().max(80).optional().nullable(),
  joinDate: z.string().min(1, 'Tanggal bergabung wajib diisi'),
  status: z.enum(['AKTIF', 'NONAKTIF', 'CUTI']).default('AKTIF'),
});

export const hrContractSchema = z.object({
  employeeId: z.string().min(1, 'Karyawan wajib dipilih'),
  contractNo: z.string().min(1, 'Nomor kontrak wajib diisi').max(60),
  type: z.enum(HR_CONTRACT_TYPES).default('PKWTT'),
  startDate: z.string().min(1, 'Tanggal mulai wajib diisi'),
  endDate: z.string().optional().nullable(),
  probationEnd: z.string().optional().nullable(),
  salary: z.coerce.number().min(0).optional().nullable(),
  position: z.string().min(2, 'Jabatan wajib diisi').max(80),
  status: z.enum(['AKTIF', 'BERAKHIR', 'DIPUTUS']).default('AKTIF'),
  notes: z.string().max(2000).optional().nullable(),
});

export const hrHireSchema = z.object({
  position: z.string().min(2, 'Jabatan wajib diisi').max(80),
  department: z.string().max(80).optional().nullable(),
  joinDate: z.string().min(1, 'Tanggal bergabung wajib diisi'),
  contractType: z.enum(HR_CONTRACT_TYPES).default('PKWTT'),
  contractNo: z.string().min(1, 'Nomor kontrak wajib diisi').max(60),
  salary: z.coerce.number().min(0).optional().nullable(),
  probationMonths: z.coerce.number().int().min(0).max(12).default(3),
});

export const ESIGN_WORKFLOW_TYPES = ['SEQUENTIAL', 'PARALLEL'] as const;
export const ESIGN_STATUSES = [
  'DRAFT', 'PENDING_APPROVAL', 'PENDING_SIGNATURE', 'PARTIALLY_SIGNED',
  'SIGNED', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED',
] as const;
export const ESIGN_APPROVAL_STATUSES = ['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'] as const;

export const esignDocumentSchema = z.object({
  documentNumber: z.string().min(1, 'Nomor dokumen wajib diisi').max(60),
  title: z.string().min(3, 'Judul dokumen minimal 3 karakter').max(200),
  category: z.string().min(1, 'Kategori wajib diisi').max(50),
  description: z.string().max(2000).optional().nullable(),
  workflowType: z.enum(ESIGN_WORKFLOW_TYPES).default('SEQUENTIAL'),
  approvalStatus: z.enum(ESIGN_APPROVAL_STATUSES).default('NOT_REQUIRED'),
  approverId: z.string().min(1).optional().nullable(),
  expiresAt: z.string().optional().nullable(),
  // Tampilan elemen tanda tangan di PDF final (default semua tampil).
  showSignerName: z.boolean().optional(),
  showSignerPosition: z.boolean().optional(),
  showSignedDate: z.boolean().optional(),
  showDocRef: z.boolean().optional(),
});

export const esignSignerSchema = z.object({
  userId: z.string().min(1, 'Penandatangan wajib dipilih'),
  signingOrder: z.coerce.number().int().min(1).max(100),
  signingGroup: z.coerce.number().int().min(1).max(100).optional(),
  placementPage: z.coerce.number().int().min(1).optional().nullable(),
  placementX: z.coerce.number().min(0).max(1).optional().nullable(),
  placementY: z.coerce.number().min(0).max(1).optional().nullable(),
  placementWidth: z.coerce.number().min(0).max(1).optional().nullable(),
  placementHeight: z.coerce.number().min(0).max(1).optional().nullable(),
});

export const esignSignSchema = z.object({
  pin: z.string().regex(/^\d{4,12}$/, 'PIN harus 4–12 digit angka'),
  confirm: z.literal(true, {
    errorMap: () => ({ message: 'Konfirmasi tanda tangan wajib dicentang' }),
  }),
});

export const esignPinSchema = z.object({
  pin: z.string().regex(/^\d{4,12}$/, 'PIN harus 4–12 digit angka'),
  currentPin: z.string().regex(/^\d{4,12}$/, 'PIN saat ini tidak valid').optional().nullable(),
});

export const esignTemplateSchema = z.object({
  name: z.string().min(2, 'Nama template minimal 2 karakter').max(120),
  category: z.string().min(1).max(50).default('Umum'),
  generator: z.string().max(60).optional().nullable(),
  placeholders: z.string().max(5000).optional().nullable(),
});
