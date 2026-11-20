import {
  HaditsItem,
  KitabInfo,
  HaditsGroupType,
  HaditsDatabaseReport,
  HaditsQueryResponse,
} from './types/hadits';

// ---------------------------------------------------------------------------
// Porting haditsDatabaseService backup -> WOORK.
// Perbedaan utama: respons API WOORK dibungkus { success, data }, sedangkan
// backup mengembalikan bentuk polos. Metadata kitab diambil dari
// GET /api/hadits/books (bukan import haditsMetadata / JSON hadits langsung).
// Bookmark hadits & ukuran font tetap localStorage (tidak ada tabel DB).
// ---------------------------------------------------------------------------

const BOOKMARK_STORAGE_KEY = 'islamic_hadits_bookmarks';
const FONT_SIZE_STORAGE_KEY = 'islamic_hadits_font_size';

export interface BookmarkItem {
  id: string;
  kitabId: string;
  kitabNama: string;
  nomor: number;
  arabPreview: string;
  terjemahanPreview: string;
  savedAt: string;
}

let kitabCache: KitabInfo[] | null = null;
let kitabCachePromise: Promise<KitabInfo[]> | null = null;

async function fetchBooks(): Promise<KitabInfo[]> {
  if (kitabCache) return kitabCache;
  if (!kitabCachePromise) {
    kitabCachePromise = (async () => {
      const res = await fetch('/api/hadits/books');
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const body = await res.json();
      const books: KitabInfo[] = body?.data?.books || body?.books || [];
      kitabCache = books;
      return books;
    })().catch((err) => {
      kitabCachePromise = null;
      throw err;
    });
  }
  return kitabCachePromise;
}

function emptyQueryResponse(params: {
  kitabId?: string;
  grup?: string;
  search?: string;
  nomor?: number;
  page?: number;
  limit?: number;
}): HaditsQueryResponse {
  return {
    items: [],
    pagination: {
      total: 0,
      page: params.page || 1,
      limit: params.limit || 20,
      totalPages: 1,
      hasNextPage: false,
      hasPrevPage: false,
    },
    activeFilter: {
      kitabId: params.kitabId || 'all',
      grup: params.grup || 'all',
      search: params.search || '',
      nomor: params.nomor || null,
    },
  };
}

export class HaditsDatabaseService {
  /** Daftar kitab dari GET /api/hadits/books (di-cache di memori). */
  static async getKitabList(): Promise<KitabInfo[]> {
    try {
      return await fetchBooks();
    } catch (err) {
      console.error('Error fetching kitab list:', err);
      return [];
    }
  }

  /** Sinkron dari cache (kosong sebelum getKitabList() pertama kali dipanggil). */
  static getKitabById(id: string): KitabInfo | undefined {
    return (kitabCache || []).find((k) => k.id === id);
  }

  static getKitabByGrup(grup: HaditsGroupType): KitabInfo[] {
    return (kitabCache || []).filter((k) => k.grup === grup);
  }

  static async queryHadits(params: {
    kitabId?: string;
    grup?: string;
    search?: string;
    nomor?: number;
    page?: number;
    limit?: number;
  }): Promise<HaditsQueryResponse> {
    try {
      const q = new URLSearchParams();
      if (params.kitabId && params.kitabId !== 'all') q.set('kitabId', params.kitabId);
      if (params.grup && params.grup !== 'all') q.set('grup', params.grup);
      if (params.search && params.search.trim()) q.set('search', params.search.trim());
      if (params.nomor && !isNaN(params.nomor)) q.set('nomor', params.nomor.toString());
      if (params.page) q.set('page', params.page.toString());
      if (params.limit) q.set('limit', params.limit.toString());

      const res = await fetch(`/api/hadits/list?${q.toString()}`);
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const body = await res.json();
      // WOORK membungkus respons di `data`; backup tidak.
      return (body?.data || body) as HaditsQueryResponse;
    } catch (err) {
      console.error('Error in HaditsDatabaseService.queryHadits:', err);
      return emptyQueryResponse(params);
    }
  }

  static async getHaditsDetail(kitabId: string, nomor: number): Promise<HaditsItem | null> {
    try {
      const res = await fetch(`/api/hadits/${kitabId}/${nomor}`);
      if (!res.ok) return null;
      const body = await res.json();
      return (body?.data || body) as HaditsItem;
    } catch (err) {
      console.error('Error fetching hadits detail:', err);
      return null;
    }
  }

  /** Laporan audit dari GET /api/hadits/stats (dipetakan ke bentuk backup). */
  static async getAuditReport(): Promise<HaditsDatabaseReport | null> {
    try {
      const res = await fetch('/api/hadits/stats');
      if (!res.ok) return null;
      const body = await res.json();
      const stats = body?.data || body;
      if (!stats || !Array.isArray(stats.kitabStats)) return null;
      return {
        totalKitabKeseluruhan: stats.totalKitabKeseluruhan,
        totalHaditsKeseluruhan: stats.totalHaditsKeseluruhan,
        grupBreakdown: stats.grupBreakdown,
        kitabStats: stats.kitabStats,
        masterSourceKitab: stats.kitabStats
          .filter((k: { isMasterSource: boolean }) => k.isMasterSource)
          .map((k: { nama: string }) => k.nama),
        secondarySourceKitab: stats.kitabStats
          .filter((k: { isMasterSource: boolean }) => !k.isMasterSource)
          .map((k: { nama: string }) => k.nama),
        ignoredDuplicates: [],
        databaseStructure: {
          tableName: 'hadits_items',
          primaryKey: ['id'],
          indexes: ['idx_hadits_grup', 'idx_hadits_nomor', 'idx_hadits_perawi'],
          fields: [
            { name: 'id', type: 'VARCHAR(100)', description: 'ID unik: {kitabId}_{nomor}' },
            { name: 'kitab_id', type: 'VARCHAR(64)', description: 'ID kitab (FK master_kitab_hadits)' },
            { name: 'nomor_hadits', type: 'INTEGER', description: 'Nomor hadits dalam kitab' },
            { name: 'teks_arab', type: 'TEXT', description: 'Teks hadits berbahasa Arab' },
            { name: 'terjemahan_indonesia', type: 'TEXT', description: 'Terjemahan Bahasa Indonesia' },
          ],
        },
      };
    } catch (err) {
      console.error('Error fetching hadits stats:', err);
      return null;
    }
  }

  static getBookmarks(): BookmarkItem[] {
    try {
      const saved = localStorage.getItem(BOOKMARK_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }

  static isBookmarked(id: string): boolean {
    const list = this.getBookmarks();
    return list.some((b) => b.id === id);
  }

  static toggleBookmark(hadits: HaditsItem): boolean {
    const list = this.getBookmarks();
    const exists = list.some((b) => b.id === hadits.id);
    let updated: BookmarkItem[];

    if (exists) {
      updated = list.filter((b) => b.id !== hadits.id);
    } else {
      const newItem: BookmarkItem = {
        id: hadits.id,
        kitabId: hadits.kitabId || '',
        kitabNama: hadits.kitabNama || hadits.nama_kitab || '',
        nomor: hadits.nomor ?? hadits.nomor_hadits ?? 0,
        arabPreview: hadits.arab ? hadits.arab.substring(0, 100) : '',
        terjemahanPreview: hadits.terjemahan ? hadits.terjemahan.substring(0, 120) : '',
        savedAt: new Date().toISOString(),
      };
      updated = [newItem, ...list];
    }

    try {
      localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save bookmark:', e);
    }
    return !exists;
  }

  static getFontSize(): number {
    try {
      const size = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
      return size ? Number(size) : 24;
    } catch {
      return 24;
    }
  }

  static setFontSize(size: number): void {
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, size.toString());
    } catch {}
  }

  static generatePostgresSqlScript(totalKitab: number, totalHadits: number): string {
    return `-- DATABASE HADITS TERPADU INDONESIA (POSTGRESQL SCHEMA)
-- Total Kitab: ${totalKitab} Kitab | Total Hadits: ${totalHadits.toLocaleString('id-ID')} Hadits

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

DO $$ BEGIN
    CREATE TYPE hadits_grup_enum AS ENUM ('kutub_sittah', 'kutub_tisah', 'lainnya');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS master_kitab_hadits (
    id VARCHAR(64) PRIMARY KEY,
    nama VARCHAR(150) NOT NULL,
    nama_arab VARCHAR(150) NOT NULL,
    grup hadits_grup_enum NOT NULL,
    grup_label VARCHAR(100) NOT NULL,
    pengarang VARCHAR(255) NOT NULL,
    wafat VARCHAR(50),
    total_hadits INTEGER NOT NULL DEFAULT 0,
    sumber_data VARCHAR(150) NOT NULL,
    is_master_source BOOLEAN NOT NULL DEFAULT true,
    deskripsi TEXT,
    derajat VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS hadits_items (
    id VARCHAR(100) PRIMARY KEY,
    kitab_id VARCHAR(64) NOT NULL REFERENCES master_kitab_hadits(id) ON DELETE CASCADE,
    grup_kitab hadits_grup_enum NOT NULL,
    nama_kitab VARCHAR(150) NOT NULL,
    nama_kitab_arab VARCHAR(150) NOT NULL,
    nomor_hadits INTEGER NOT NULL,
    bab VARCHAR(255) NOT NULL DEFAULT '',
    perawi VARCHAR(255) NOT NULL DEFAULT '',
    teks_arab TEXT NOT NULL,
    terjemahan_indonesia TEXT NOT NULL,
    sumber_data VARCHAR(150) NOT NULL,
    derajat VARCHAR(100) DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_kitab_nomor UNIQUE (kitab_id, nomor_hadits)
);

CREATE INDEX IF NOT EXISTS idx_hadits_grup ON hadits_items(grup_kitab);
CREATE INDEX IF NOT EXISTS idx_hadits_nomor ON hadits_items(nomor_hadits);
CREATE INDEX IF NOT EXISTS idx_hadits_perawi ON hadits_items(perawi);
CREATE INDEX IF NOT EXISTS idx_hadits_fts_id ON hadits_items USING gin(to_tsvector('indonesian', terjemahan_indonesia));
CREATE INDEX IF NOT EXISTS idx_hadits_trgm ON hadits_items USING gin(terjemahan_indonesia gin_trgm_ops);`;
  }

  static generateFirestoreExportData(books: KitabInfo[], totalHadits: number): string {
    const firestoreCollections = {
      _metadata: {
        description: `Firestore Unified Hadith Database (${books.length} Books, ${totalHadits.toLocaleString('id-ID')} Hadiths)`,
        version: '2.0.0',
        collections: [
          { name: 'hadits_master_kitab', docId: 'kitabId', count: books.length },
          { name: 'hadits_indonesia', docId: '{kitabId}_{nomorHadits}', count: totalHadits },
        ],
        groups: [
          { name: 'kutub_sittah', count: books.filter((k) => k.grup === 'kutub_sittah').length },
          { name: 'kutub_tisah', count: books.filter((k) => k.grup === 'kutub_tisah').length },
          { name: 'lainnya', count: books.filter((k) => k.grup === 'lainnya').length },
        ],
      },
      master_kitab: books,
    };
    return JSON.stringify(firestoreCollections, null, 2);
  }

  static generateRagSemanticExport(books: KitabInfo[]): string {
    const sampleForRag = books.map((k) => ({
      document_id: `corpus_kitab_${k.id}`,
      title: `${k.nama} (${k.namaArab})`,
      text: `Kitab: ${k.nama} (${k.namaArab})
Pengarang: ${k.pengarang} (Wafat: ${k.wafat})
Kategori: ${k.grupLabel}
Total Hadits: ${k.totalHadits}
Sumber Data: ${k.sumberData}
Deskripsi: ${k.deskripsi}`,
      metadata: {
        id: k.id,
        nama: k.nama,
        grup: k.grup,
        totalHadits: k.totalHadits,
        sumberData: k.sumberData,
        isMasterSource: k.isMasterSource,
      },
    }));
    return JSON.stringify(sampleForRag, null, 2);
  }
}
