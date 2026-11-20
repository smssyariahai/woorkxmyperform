export type HaditsGroupType = "kutub_sittah" | "kutub_tisah" | "lainnya";

export interface KitabInfo {
  id: string;
  nama: string;
  namaArab: string;
  grup: HaditsGroupType;
  grupLabel: string;
  pengarang: string;
  wafat: string;
  totalHadits: number;
  sumberData: string;
  isMasterSource: boolean;
  deskripsi: string;
  derajat?: string;
  babUtama?: string[];
}

export interface HaditsItem {
  id: string;
  kitabId?: string;
  kitabNama?: string;
  nomor?: number;
  arab?: string;
  terjemahan?: string;
  grup?: HaditsGroupType;
  grup_kitab?: HaditsGroupType;
  grupLabel?: string;
  derajat?: string;
  bab?: string;
  perawi?: string;
  faedah?: string;
  // Aliases for compatibility
  nomor_hadits?: number;
  nama_kitab?: string;
  nama_kitab_arab?: string;
  teks_arab?: string;
  terjemahan_indonesia?: string;
  sumber_data?: string;
}

export interface HaditsGroupSummary {
  grup: HaditsGroupType;
  label: string;
  totalKitab: number;
  totalHadits: number;
  kitabList: string[];
}

export interface IgnoredDuplicateInfo {
  namaFile: string;
  kitab: string;
  alasan: string;
}

export interface DatabaseFieldSpec {
  name: string;
  type: string;
  description: string;
}

export interface DatabaseStructureRecommendation {
  tableName: string;
  primaryKey: string[];
  indexes: string[];
  fields: DatabaseFieldSpec[];
}

export interface HaditsDatabaseReport {
  totalKitabKeseluruhan: number;
  totalHaditsKeseluruhan: number;
  grupBreakdown: HaditsGroupSummary[];
  kitabStats: {
    id: string;
    nama: string;
    namaArab: string;
    grup: HaditsGroupType;
    totalHadits: number;
    sumberData: string;
    isMasterSource: boolean;
  }[];
  masterSourceKitab: string[];
  secondarySourceKitab: string[];
  ignoredDuplicates: IgnoredDuplicateInfo[];
  databaseStructure: DatabaseStructureRecommendation;
}

export interface HaditsQueryResponse {
  items: HaditsItem[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  activeFilter: {
    kitabId: string;
    grup: string;
    search: string;
    nomor: number | null;
  };
}
