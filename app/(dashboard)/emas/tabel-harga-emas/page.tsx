'use client';

// Porting dari backup src/pages/TabelHargaEmas.tsx (MyPerform) → WOORK.
// Perubahan vs backup:
// - Helper autentikasi & fetch Postgres backup dihapus; API lewat
//   helper lib/emas/client.ts (fetchGoldHistory, saveGoldHistoryRow,
//   deleteGoldHistoryDate, removeGoldType, fetchGoldSettings, saveGoldSetting,
//   syncGoldPricesToday) dan lib/islami/logamMuliaApi.ts untuk harga live.
// - SELURUH auto-sync admin (cron) DIHAPUS: tidak ada endpoint auto-sync di
//   WOORK (VM reset menghapus cron). Sync hanya manual via tombol
//   "Sync Harga Live" → syncGoldPricesToday().
// - Halaman ini TIDAK punya editor tarif_biaya di backup; tarif hanya dibaca
//   sebagai default lewat fetchGoldSettings (dipakai kalkulator lain).
// - Hak akses tulis: layout (dashboard) sudah mewajibkan login; WOORK belum
//   punya izin tulis per-modul seperti backup, jadi semua user login boleh
//   menulis di halaman ini.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Save, Loader2, Trash2, Plus, Edit, RotateCcw, TrendingUp, Table, Calendar,
  Settings, ChevronRight, ChevronDown, ChevronUp, Download, RefreshCw, Globe,
  Eye, EyeOff, Columns, ChevronLeft, ChevronsLeft, ChevronsRight, Upload,
  FileSpreadsheet, CheckCircle2, AlertCircle, X, MoreVertical, LayoutGrid,
  ChevronsUpDown, Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';
import {
  fetchAllLiveMarketPrices, parsePrimaryPriceFromItems,
  ALL_GOLD_SOURCES, getTodayWibDateString,
} from '@/lib/islami/logamMuliaApi';
import type { LogamMuliaPriceItem } from '@/lib/islami/logamMuliaApi';
import {
  fetchGoldHistory, saveGoldHistoryRow, deleteGoldHistoryDate, removeGoldType,
  fetchGoldSettings, saveGoldSetting, syncGoldPricesToday,
} from '@/lib/emas/client';
import type { GoldHistoryItem } from '@/lib/emas/client';

// Formatting Helpers
const formatRibuan = (num: number | string): string => {
  const parsed = typeof num === 'string' ? parseInt(num.replace(/\./g, '')) || 0 : num;
  return new Intl.NumberFormat('id-ID').format(parsed);
};

const unformatRibuan = (str: string): number => {
  if (!str) return 0;
  return parseInt(str.toString().replace(/\./g, '')) || 0;
};

// Karatase Factors
const KARATS = [
  { karat: '24', kadar: '99,90%', factor: 1.0, code: '999' },
  { karat: '23', kadar: '95,80%', factor: 0.958, code: '-' },
  { karat: '22', kadar: '91,60%', factor: 0.916, code: '-' },
  { karat: '21', kadar: '87,50%', factor: 0.875, code: '875' },
  { karat: '20', kadar: '83,00%', factor: 0.83, code: '-' },
  { karat: '19', kadar: '79,00%', factor: 0.79, code: '-' },
  { karat: '18', kadar: '75,00%', factor: 0.75, code: '750' },
  { karat: '17', kadar: '75,00%', factor: 0.75, code: '750' },
  { karat: '16', kadar: '70,00%', factor: 0.67, code: '700' },
  { karat: '10', kadar: '42,00%', factor: 0.42, code: '420' },
  { karat: '9', kadar: '37,50%', factor: 0.375, code: '375' },
  { karat: '6', kadar: '30,00%', factor: 0.30, code: '300' },
];

interface GoldHistoryEntry {
  id: string; // "YYYY-MM-DD"
  date: string; // "YYYY-MM-DD"
  hargaTaksir24K: number;
  prices: Record<string, number>;
  buybackPrices?: Record<string, number>;
}

const DEFAULT_GOLD_TYPES = [
  'Antam Berdiri',
  'UBS Press',
  'SP',
  'T (Cukim)',
  'Harga Mal',
  'Harga emas.org',
];

export default function TabelHargaEmasPage() {
  // Layout (dashboard) sudah mewajibkan login; WOORK belum punya izin tulis
  // per-modul seperti backup (modulePermissions), jadi semua user login
  // dianggap punya akses tulis di halaman ini.
  const hasWriteAccess = true;

  // State Management
  const [activeTab, setActiveTab] = useState<'taksir' | 'harian'>('taksir');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Core prices & active gold types
  const [currentHargaTaksir24K, setCurrentHargaTaksir24K] = useState<number>(0);
  const [activeGoldTypes, setActiveGoldTypes] = useState<string[]>([...DEFAULT_GOLD_TYPES]);
  const [history, setHistory] = useState<GoldHistoryEntry[]>([]);

  // Date Filter State
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [showDateFilterModal, setShowDateFilterModal] = useState<boolean>(false);
  const [tempStartDate, setTempStartDate] = useState<string>('');
  const [tempEndDate, setTempEndDate] = useState<string>('');
  const [showActionMenu, setShowActionMenu] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getDateFilterLabel = () => {
    if (filterStartDate && filterEndDate) {
      if (filterStartDate === filterEndDate) return filterStartDate;
      return `${filterStartDate} s/d ${filterEndDate}`;
    }
    if (filterStartDate) return `≥ ${filterStartDate}`;
    if (filterEndDate) return `≤ ${filterEndDate}`;
    return 'Filter Tanggal';
  };
  const isDateFilterActive = Boolean(filterStartDate || filterEndDate);

  const filteredHistory = history.filter((entry) => {
    if (filterStartDate && entry.date < filterStartDate) return false;
    if (filterEndDate && entry.date > filterEndDate) return false;
    return true;
  });

  // Pagination & Items Per Page State
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);

  // Reset to page 1 when filter or itemsPerPage changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filterStartDate, filterEndDate, itemsPerPage]);

  const totalPages = useMemo(() => {
    if (itemsPerPage === -1) return 1;
    return Math.ceil(filteredHistory.length / itemsPerPage) || 1;
  }, [filteredHistory.length, itemsPerPage]);

  const paginatedHistory = useMemo(() => {
    if (itemsPerPage === -1) return filteredHistory;
    const startIdx = (currentPage - 1) * itemsPerPage;
    return filteredHistory.slice(startIdx, startIdx + itemsPerPage);
  }, [filteredHistory, currentPage, itemsPerPage]);

  const startItemIndex = filteredHistory.length === 0 ? 0 : (currentPage - 1) * (itemsPerPage === -1 ? filteredHistory.length : itemsPerPage) + 1;
  const endItemIndex = itemsPerPage === -1 ? filteredHistory.length : Math.min(currentPage * itemsPerPage, filteredHistory.length);

  // View mode state (Table vs Cards) with local storage persistence
  const [viewMode, setViewMode] = useState<'table' | 'cards'>(() => {
    try {
      const saved = localStorage.getItem('tabel_emas_view_mode');
      if (saved === 'table' || saved === 'cards') return saved;
    } catch (e) { /* abaikan */ }
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      return 'cards';
    }
    return 'table';
  });

  const handleSetViewMode = (mode: 'table' | 'cards') => {
    setViewMode(mode);
    try {
      localStorage.setItem('tabel_emas_view_mode', mode);
    } catch (e) { /* abaikan */ }
  };

  // History item 3-dots action menu state & delete confirmation modal state
  const [activeMenuEntryId, setActiveMenuEntryId] = useState<string | null>(null);
  const [historyToDelete, setHistoryToDelete] = useState<GoldHistoryEntry | null>(null);
  const [deletingHistory, setDeletingHistory] = useState(false);

  // Date accordion state for Card View
  const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});

  const toggleDateAccordion = (dateId: string) => {
    setCollapsedDates((prev) => ({
      ...prev,
      [dateId]: !prev[dateId],
    }));
  };

  // Check if all visible paginated history dates are collapsed
  const isAllCollapsed = useMemo(() => {
    if (!paginatedHistory.length) return false;
    return paginatedHistory.every((entry) => !!collapsedDates[entry.id]);
  }, [paginatedHistory, collapsedDates]);

  const toggleAllDates = () => {
    if (isAllCollapsed) {
      setCollapsedDates({});
    } else {
      const allCollapsed: Record<string, boolean> = {};
      filteredHistory.forEach((h) => {
        allCollapsed[h.id] = true;
      });
      setCollapsedDates(allCollapsed);
    }
  };

  // Editing current taksir 24k state
  const [editTaksirValue, setEditTaksirValue] = useState<string>('0');
  const [editTaksirDate, setEditTaksirDate] = useState<string>(getTodayWibDateString());

  // Manage custom gold types
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeDescription, setNewTypeDescription] = useState('');
  const [newTypeSource, setNewTypeSource] = useState('');
  const [newTypeCategory, setNewTypeCategory] = useState('');
  const [goldTypeDescriptions, setGoldTypeDescriptions] = useState<Record<string, string>>({});
  const [goldTypeSources, setGoldTypeSources] = useState<Record<string, string>>({});
  const [goldTypeCategories, setGoldTypeCategories] = useState<Record<string, string>>({});
  const [editingTypeDescName, setEditingTypeDescName] = useState<string | null>(null);
  const [editingTypeDescValue, setEditingTypeDescValue] = useState<string>('');
  const [editingTypeSourceValue, setEditingTypeSourceValue] = useState<string>('');
  const [editingTypeCategoryValue, setEditingTypeCategoryValue] = useState<string>('');
  const [showTypeSettings, setShowTypeSettings] = useState(false);
  const [goldTypeToDelete, setGoldTypeToDelete] = useState<string | null>(null);
  const [deletingType, setDeletingType] = useState(false);

  // Column visibility & grouping state with localStorage persistence
  const LOCAL_STORAGE_KEY_HIDDEN_COLUMNS = 'tabel_emas_hidden_columns';

  const [hiddenGoldTypes, setHiddenGoldTypes] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY_HIDDEN_COLUMNS);
      return saved ? JSON.parse(saved) : {};
    } catch (e) {
      return {};
    }
  });

  const [showColumnFilter, setShowColumnFilter] = useState(false);

  // Sync hiddenGoldTypes to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_HIDDEN_COLUMNS, JSON.stringify(hiddenGoldTypes));
    } catch (e) {
      console.error('Gagal menyimpan visibilitas kolom ke localStorage:', e);
    }
  }, [hiddenGoldTypes]);

  // Group active gold types by their source ("Sumber Data")
  const groupedGoldTypesBySource = useMemo<Record<string, string[]>>(() => {
    const groups: Record<string, string[]> = {};
    activeGoldTypes.forEach((type) => {
      const source = goldTypeSources[type] || 'Lainnya / Umum';
      if (!groups[source]) {
        groups[source] = [];
      }
      groups[source].push(type);
    });
    return groups;
  }, [activeGoldTypes, goldTypeSources]);

  // Visible active gold types
  const visibleActiveGoldTypes = useMemo(() => {
    return activeGoldTypes.filter((type) => !hiddenGoldTypes[type]);
  }, [activeGoldTypes, hiddenGoldTypes]);

  // Visibility toggle helpers
  const toggleTypeVisibility = (typeName: string) => {
    setHiddenGoldTypes((prev) => ({
      ...prev,
      [typeName]: !prev[typeName],
    }));
  };

  const showAllColumns = () => {
    setHiddenGoldTypes({});
  };

  const hideAllColumns = () => {
    const hidden: Record<string, boolean> = {};
    activeGoldTypes.forEach((t) => { hidden[t] = true; });
    setHiddenGoldTypes(hidden);
  };

  const toggleSourceGroup = (sourceName: string, typesInGroup: string[]) => {
    const allHidden = typesInGroup.every((t) => hiddenGoldTypes[t]);
    setHiddenGoldTypes((prev) => {
      const next = { ...prev };
      typesInGroup.forEach((t) => {
        next[t] = !allHidden;
      });
      return next;
    });
  };

  // Daily entry form state (modal/inline)
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<GoldHistoryEntry | null>(null);
  const [modalDate, setModalDate] = useState<string>('');
  const [modalTaksir24K, setModalTaksir24K] = useState<string>('0');
  const [modalPrices, setModalPrices] = useState<Record<string, string>>({});
  const [modalBuybackPrices, setModalBuybackPrices] = useState<Record<string, string>>({});

  // Logam Mulia API State
  const [fetchingApi, setFetchingApi] = useState(false);
  const [liveMarketData, setLiveMarketData] = useState<Record<string, LogamMuliaPriceItem[]>>({});
  const [showLiveMarket, setShowLiveMarket] = useState(false);
  const [loadingLiveMarket, setLoadingLiveMarket] = useState(false);

  // Excel Import/Export State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [importDataMap, setImportDataMap] = useState<Record<string, {
    hargaTaksir24K: number;
    prices: Record<string, number>;
    buybackPrices: Record<string, number>;
  }>>({});
  const [importNewGoldTypes, setImportNewGoldTypes] = useState<string[]>([]);
  const [selectedImportGoldTypes, setSelectedImportGoldTypes] = useState<string[]>([]);
  const [importHargaTaksir24K, setImportHargaTaksir24K] = useState(true);
  const [importing, setImporting] = useState(false);

  // Compute unique gold types present in the imported data map
  const importedGoldTypes = useMemo(() => {
    const values = Object.values(importDataMap) as {
      hargaTaksir24K: number;
      prices: Record<string, number>;
      buybackPrices: Record<string, number>;
    }[];
    return Array.from(new Set(
      values.flatMap((data) => [
        ...Object.keys(data.prices || {}),
        ...Object.keys(data.buybackPrices || {}),
      ]),
    )).sort();
  }, [importDataMap]);

  // Error/Success Notification state
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Auto dismiss alert
  useEffect(() => {
    if (alertMsg) {
      const timer = setTimeout(() => setAlertMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [alertMsg]);

  const showNotification = (type: 'success' | 'error', text: string) => {
    setAlertMsg({ type, text });
  };

  // Export History to Excel (.xlsx)
  const handleExportToExcel = () => {
    const exportItems = filteredHistory.length > 0 ? filteredHistory : history;
    if (exportItems.length === 0) {
      showNotification('error', 'Tidak ada data riwayat untuk di-export.');
      return;
    }

    const rows = exportItems.map((entry) => {
      const row: Record<string, any> = {
        'Tanggal': entry.date,
        'Harga Taksir 24K': entry.hargaTaksir24K || 0,
      };

      activeGoldTypes.forEach((typeName) => {
        const buyPrice = entry.prices?.[typeName];
        const buybackPrice = entry.buybackPrices?.[typeName];
        row[`${typeName} (Beli)`] = buyPrice !== undefined && buyPrice !== null ? buyPrice : '';
        row[`${typeName} (Buyback)`] = buybackPrice !== undefined && buybackPrice !== null ? buybackPrice : '';
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    const colWidths = [{ wch: 14 }, { wch: 18 }];
    activeGoldTypes.forEach(() => {
      colWidths.push({ wch: 22 });
      colWidths.push({ wch: 22 });
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Riwayat Harga Emas');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `Riwayat_Harga_Emas_${dateStr}.xlsx`);
    showNotification('success', `Berhasil meng-export ${exportItems.length} data riwayat ke file Excel!`);
  };

  // Import File Handler (Parses .xlsx, .xls, .csv)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        if (!buffer) return;

        const workbook = XLSX.read(buffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });

        if (!rawData || rawData.length === 0) {
          showNotification('error', 'File Excel kosong atau format tidak terbaca.');
          return;
        }

        const dateMap: Record<string, {
          hargaTaksir24K: number;
          prices: Record<string, number>;
          buybackPrices: Record<string, number>;
        }> = {};

        const detectedGoldTypes = new Set<string>();

        for (const row of rawData) {
          let dateValue = row['Tanggal'] || row['tanggal'] || row['Date'] || row['date'] || row['TGL'] || row['tgl'];
          if (dateValue === undefined || dateValue === null || dateValue === '') continue;

          let dateStr = '';
          if (typeof dateValue === 'number') {
            const parsedDate = new Date(Math.round((dateValue - 25569) * 86400 * 1000));
            if (!isNaN(parsedDate.getTime())) {
              dateStr = parsedDate.toISOString().split('T')[0];
            }
          } else {
            const str = String(dateValue).trim().split('T')[0];
            if (str.includes('/')) {
              const parts = str.split('/');
              if (parts.length === 3) {
                if (parts[0].length === 4) {
                  dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                } else {
                  dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
              }
            } else if (str.includes('-')) {
              const parts = str.split('-');
              if (parts.length === 3) {
                if (parts[0].length === 4) {
                  dateStr = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
                } else {
                  dateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
              }
            } else {
              dateStr = str;
            }
          }

          if (!dateStr || dateStr.length < 8) continue;

          if (!dateMap[dateStr]) {
            dateMap[dateStr] = { hargaTaksir24K: 0, prices: {}, buybackPrices: {} };
          }

          const taksirVal = row['Harga Taksir 24K'] || row['Harga Taksir'] || row['Taksir 24K'] || row['Taksir'] || row['hargaTaksir24K'];
          if (taksirVal && !isNaN(Number(String(taksirVal).replace(/[^0-9.]/g, '')))) {
            const numTaksir = Number(String(taksirVal).replace(/[^0-9.]/g, ''));
            if (numTaksir > 0) {
              dateMap[dateStr].hargaTaksir24K = numTaksir;
            }
          }

          const jenisEmasCol = row['Jenis Emas'] || row['jenis_emas'] || row['Gold Type'] || row['Nama Emas'] || row['Sumber'];
          if (jenisEmasCol) {
            const typeName = String(jenisEmasCol).trim();
            if (typeName) {
              detectedGoldTypes.add(typeName);

              const buyPrice = row['Harga Beli'] || row['Harga'] || row['Price'] || row['Beli'] || row['Harga Sell'];
              if (buyPrice !== undefined && buyPrice !== '') {
                const numBuy = Number(String(buyPrice).replace(/[^0-9.]/g, ''));
                if (!isNaN(numBuy) && numBuy > 0) {
                  dateMap[dateStr].prices[typeName] = numBuy;
                }
              }

              const buybackPrice = row['Harga Buyback'] || row['Buyback'] || row['Harga Jual Kembali'];
              if (buybackPrice !== undefined && buybackPrice !== '') {
                const numBuyback = Number(String(buybackPrice).replace(/[^0-9.]/g, ''));
                if (!isNaN(numBuyback) && numBuyback > 0) {
                  dateMap[dateStr].buybackPrices[typeName] = numBuyback;
                }
              }
            }
          } else {
            for (const [key, val] of Object.entries(row)) {
              if (['Tanggal', 'tanggal', 'Date', 'date', 'TGL', 'tgl', 'Harga Taksir 24K', 'Harga Taksir', 'Taksir 24K', 'Taksir'].includes(key)) {
                continue;
              }
              if (val === undefined || val === null || val === '') continue;

              const numVal = Number(String(val).replace(/[^0-9.]/g, ''));
              if (isNaN(numVal) || numVal <= 0) continue;

              let keyName = key.trim();
              let isBuyback = false;

              if (keyName.toLowerCase().includes('buyback')) {
                isBuyback = true;
                keyName = keyName.replace(/\(buyback\)/gi, '').replace(/- buyback/gi, '').replace(/buyback/gi, '').trim();
              } else if (keyName.toLowerCase().includes('beli') || keyName.toLowerCase().includes('sell')) {
                keyName = keyName.replace(/\(beli\)/gi, '').replace(/- beli/gi, '').replace(/beli/gi, '').replace(/\(sell\)/gi, '').trim();
              }

              if (keyName) {
                detectedGoldTypes.add(keyName);
                if (isBuyback) {
                  dateMap[dateStr].buybackPrices[keyName] = numVal;
                } else {
                  dateMap[dateStr].prices[keyName] = numVal;
                }
              }
            }
          }
        }

        const totalDatesCount = Object.keys(dateMap).length;
        if (totalDatesCount === 0) {
          showNotification('error', 'Gagal memproses file. Pastikan terdapat kolom "Tanggal" dan harga emas.');
          return;
        }

        const newTypes = Array.from(detectedGoldTypes).filter((t) => !activeGoldTypes.includes(t));

        setImportDataMap(dateMap);
        setImportNewGoldTypes(newTypes);
        setSelectedImportGoldTypes(Array.from(detectedGoldTypes));
        setImportHargaTaksir24K(true);
        setShowImportModal(true);
      } catch (err: any) {
        console.error('Error reading excel file:', err);
        showNotification('error', 'Gagal membaca file Excel/CSV: ' + (err.message || err));
      }
    };

    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Confirm Import & Commit to database
  const handleConfirmImport = async () => {
    const dateEntries = Object.entries(importDataMap) as [string, {
      hargaTaksir24K: number;
      prices: Record<string, number>;
      buybackPrices: Record<string, number>;
    }][];
    if (dateEntries.length === 0) return;

    if (!importHargaTaksir24K && selectedImportGoldTypes.length === 0) {
      showNotification('error', 'Silakan pilih minimal 1 kolom emas untuk di-import.');
      return;
    }

    setImporting(true);
    try {
      const selectedNewTypes = importNewGoldTypes.filter((t) => selectedImportGoldTypes.includes(t));

      if (selectedNewTypes.length > 0) {
        const updatedActiveTypes = Array.from(new Set([...activeGoldTypes, ...selectedNewTypes]));
        setActiveGoldTypes(updatedActiveTypes);

        await saveGoldSetting('gold_types', {
          types: updatedActiveTypes,
          descriptions: goldTypeDescriptions,
          sources: goldTypeSources,
          categories: goldTypeCategories,
        });
      }

      // MERGE CLIENT-SIDE (kritis): upsert menimpa satu baris penuh,
      // jadi gabungkan dulu dengan riwayat yang sudah ada per tanggal.
      const { history: existingHistory } = await fetchGoldHistory();
      const existingByDate = new Map(existingHistory.map((e) => [e.date, e]));

      for (const [dateStr, data] of dateEntries) {
        const existing = existingByDate.get(dateStr);
        const mergedPrices: Record<string, number> = { ...(existing?.prices || {}) };
        const mergedBuybackPrices: Record<string, number> = { ...(existing?.buybackPrices || {}) };

        selectedImportGoldTypes.forEach((typeName) => {
          if (data.prices?.[typeName] !== undefined) {
            mergedPrices[typeName] = data.prices[typeName];
          }
          if (data.buybackPrices?.[typeName] !== undefined) {
            mergedBuybackPrices[typeName] = data.buybackPrices[typeName];
          }
        });

        await saveGoldHistoryRow({
          date: dateStr,
          hargaTaksir24K: importHargaTaksir24K
            ? (data.hargaTaksir24K || 0)
            : (existing?.hargaTaksir24K || 0),
          prices: mergedPrices,
          buybackPrices: mergedBuybackPrices,
        });
      }

      showNotification('success', `Berhasil meng-import ${dateEntries.length} data tanggal riwayat harga ke database!`);
      setShowImportModal(false);
      setImportDataMap({});
      setImportNewGoldTypes([]);
      setSelectedImportGoldTypes([]);
      setImportHargaTaksir24K(true);
      await loadData();
    } catch (err: any) {
      console.error('Error importing history:', err);
      showNotification('error', 'Gagal menyimpan data import ke database: ' + (err.message || err));
    } finally {
      setImporting(false);
    }
  };

  // Import all 18 sources from Logam Mulia API into active types
  const handleImportAllGoldSourcesFromApi = async () => {
    if (!hasWriteAccess) return;

    const updatedTypes = [...activeGoldTypes];
    const updatedDescriptions = { ...goldTypeDescriptions };
    const updatedSources = { ...goldTypeSources };
    const updatedCategories = { ...goldTypeCategories };

    let addedCount = 0;
    ALL_GOLD_SOURCES.forEach((s) => {
      if (!updatedTypes.includes(s.name)) {
        updatedTypes.push(s.name);
        addedCount++;
      }
      if (!updatedDescriptions[s.name]) {
        updatedDescriptions[s.name] = s.defaultDesc;
      }
      if (!updatedSources[s.name]) {
        updatedSources[s.name] = s.sourceName;
      }
      if (!updatedCategories[s.name]) {
        updatedCategories[s.name] = 'Logam Mulia';
      }
    });

    try {
      await saveGoldSetting('gold_types', { types: updatedTypes, descriptions: updatedDescriptions, sources: updatedSources, categories: updatedCategories });
      setActiveGoldTypes(updatedTypes);
      setGoldTypeDescriptions(updatedDescriptions);
      setGoldTypeSources(updatedSources);
      setGoldTypeCategories(updatedCategories);
      showNotification('success', `Berhasil mengimpor ${addedCount} jenis emas baru dari 18 sumber API Logam Mulia!`);
    } catch (err) {
      console.error('Error importing gold sources:', err);
      showNotification('error', 'Gagal mengimpor jenis emas dari API.');
    }
  };

  // Auto fill form modal using Logam Mulia API across all 18 sources
  const handleAutoFillFromApi = async () => {
    setFetchingApi(true);
    try {
      const liveData = await fetchAllLiveMarketPrices();
      setLiveMarketData(liveData);

      const newPrices: Record<string, string> = { ...modalPrices };
      const newBuybackPrices: Record<string, string> = { ...modalBuybackPrices };

      // Map active gold types to fetched prices (do not overwrite modalTaksir24K)
      activeGoldTypes.forEach((typeName) => {
        const lowerType = typeName.toLowerCase();

        // Find matching source
        const matchedSource = ALL_GOLD_SOURCES.find((s) =>
          s.name.toLowerCase() === lowerType ||
          lowerType.includes(s.id.toLowerCase()) ||
          lowerType.includes(s.sourceName.toLowerCase()) ||
          s.name.toLowerCase().includes(lowerType),
        );

        if (matchedSource && liveData[matchedSource.id]) {
          const parsed = parsePrimaryPriceFromItems(liveData[matchedSource.id], matchedSource.id);
          if (parsed.sellPrice) {
            newPrices[typeName] = formatRibuan(parsed.sellPrice);
          }
          if (parsed.buybackPrice) {
            newBuybackPrices[typeName] = formatRibuan(parsed.buybackPrice);
          }
        }
      });

      setModalPrices(newPrices);
      setModalBuybackPrices(newBuybackPrices);
      showNotification('success', 'Berhasil menarik harga jual & buyback dari 18 sumber Logam Mulia API!');
    } catch (err) {
      console.error('Error fetching prices from Logam Mulia API:', err);
      showNotification('error', 'Gagal menarik data dari Logam Mulia API.');
    } finally {
      setFetchingApi(false);
    }
  };

  // Sync manual: tarik harga live 18 sumber lalu simpan sebagai riwayat
  // hari ini (WIB). Pengganti auto-sync cron backup — di WOORK tidak ada
  // scheduler, jadi sync hanya terjadi saat tombol ini ditekan.
  // Catatan: endpoint server mengisi hargaTaksir24K hari ini dari harga jual
  // Antam 1g (bukan mempertahankan taksir manual seperti backup).
  const handleSyncLiveToday = async () => {
    if (!hasWriteAccess) return;
    setSaving(true);
    try {
      // Pastikan ke-18 sumber ada di katalog jenis emas
      const updatedTypes = [...activeGoldTypes];
      const updatedDescriptions = { ...goldTypeDescriptions };
      const updatedSources = { ...goldTypeSources };
      const updatedCategories = { ...goldTypeCategories };
      ALL_GOLD_SOURCES.forEach((s) => {
        if (!updatedTypes.includes(s.name)) updatedTypes.push(s.name);
        if (!updatedDescriptions[s.name]) updatedDescriptions[s.name] = s.defaultDesc;
        if (!updatedSources[s.name]) updatedSources[s.name] = s.sourceName;
        if (!updatedCategories[s.name]) updatedCategories[s.name] = 'Logam Mulia';
      });
      await saveGoldSetting('gold_types', { types: updatedTypes, descriptions: updatedDescriptions, sources: updatedSources, categories: updatedCategories });
      setActiveGoldTypes(updatedTypes);
      setGoldTypeDescriptions(updatedDescriptions);
      setGoldTypeSources(updatedSources);
      setGoldTypeCategories(updatedCategories);

      const saved: GoldHistoryItem = await syncGoldPricesToday();
      showNotification('success', `Berhasil menyimpan 18 harga pasar emas ke riwayat harian tanggal ${saved.date}!`);
      await loadData(saved.date);
    } catch (err: any) {
      console.error('Error syncing live prices:', err);
      showNotification('error', 'Gagal sync harga live: ' + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  // Fetch Live Market Overview
  const handleFetchLiveMarketData = async () => {
    setLoadingLiveMarket(true);
    try {
      const data = await fetchAllLiveMarketPrices();
      setLiveMarketData(data);
      setShowLiveMarket(true);
      showNotification('success', 'Data harga pasar emas real-time (18 sumber) berhasil diperbarui!');
    } catch (err) {
      console.error('Error loading live market data:', err);
      showNotification('error', 'Gagal memuat harga pasar emas real-time.');
    } finally {
      setLoadingLiveMarket(false);
    }
  };

  // Load configuration and history
  const loadData = async (targetDateOverride?: string) => {
    setLoading(true);
    try {
      const activeDate = targetDateOverride || editTaksirDate || getTodayWibDateString();

      // 1. Fetch custom gold types (kunci 'gold_types' di GoldSetting;
      // fetchGoldSettings mengembalikan seluruh settings incl. tarif_biaya)
      const settings = (await fetchGoldSettings()) as unknown as Record<string, any>;
      const goldTypesData = settings.gold_types || {};
      const loadedTypes: string[] = Array.isArray(goldTypesData.types) ? [...goldTypesData.types] : [];
      const loadedDescs: Record<string, string> = goldTypesData.descriptions ? { ...goldTypesData.descriptions } : {};
      const loadedSources: Record<string, string> = goldTypesData.sources ? { ...goldTypesData.sources } : {};
      const loadedCategories: Record<string, string> = goldTypesData.categories ? { ...goldTypesData.categories } : {};

      // Ensure all 18 ALL_GOLD_SOURCES are present
      ALL_GOLD_SOURCES.forEach((s) => {
        if (!loadedTypes.includes(s.name)) {
          loadedTypes.push(s.name);
        }
        if (!loadedDescs[s.name]) {
          loadedDescs[s.name] = s.defaultDesc;
        }
        if (!loadedSources[s.name]) {
          loadedSources[s.name] = s.sourceName;
        }
        if (!loadedCategories[s.name]) {
          loadedCategories[s.name] = 'Logam Mulia';
        }
      });

      // Pastikan jenis default backup tetap ada bila settings masih kosong
      DEFAULT_GOLD_TYPES.forEach((t) => {
        if (!loadedTypes.includes(t)) loadedTypes.unshift(t);
      });

      setActiveGoldTypes(loadedTypes);
      setGoldTypeDescriptions(loadedDescs);
      setGoldTypeSources(loadedSources);
      setGoldTypeCategories(loadedCategories);

      // 3. Fetch gold price history
      const { history: historyData } = await fetchGoldHistory();
      const entries: GoldHistoryEntry[] = historyData.map((h) => ({
        id: h.date,
        date: h.date,
        hargaTaksir24K: h.hargaTaksir24K || 0,
        prices: h.prices || {},
        buybackPrices: h.buybackPrices || {},
      }));
      entries.sort((a, b) => b.date.localeCompare(a.date));
      setHistory(entries);

      // Now set the input price according to the active date
      const matchedEntry = entries.find((h) => h.date === activeDate);
      if (matchedEntry && matchedEntry.hargaTaksir24K > 0) {
        setEditTaksirValue(formatRibuan(matchedEntry.hargaTaksir24K));
        setCurrentHargaTaksir24K(matchedEntry.hargaTaksir24K);
      } else {
        setEditTaksirValue('');
        setCurrentHargaTaksir24K(0);
      }
    } catch (err) {
      console.error('Error loading gold data:', err);
      showNotification('error', 'Gagal memuat data harga emas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Harga Taksir 24k
  const handleUpdateTaksir24K = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasWriteAccess) {
      showNotification('error', 'Anda tidak memiliki hak akses untuk mengubah harga taksir.');
      return;
    }

    const priceNum = unformatRibuan(editTaksirValue);
    if (priceNum <= 0) {
      showNotification('error', 'Harga taksir harus lebih besar dari 0.');
      return;
    }

    setSaving(true);
    try {
      // 1. Save/Update current taksir in settings/harga_emas_aktif
      await saveGoldSetting('harga_emas_aktif', {
        currentHargaTaksir24K: priceNum,
        lastUpdatedHargaTaksir: editTaksirDate,
        updatedAt: new Date().toISOString(),
      });

      // 2. Also save/update historical log (merge client-side: sertakan
      // prices & buybackPrices entri yang sudah ada agar tidak hilang)
      const currentHistoryEntry = history.find((h) => h.date === editTaksirDate);

      await saveGoldHistoryRow({
        date: editTaksirDate,
        hargaTaksir24K: priceNum,
        prices: currentHistoryEntry?.prices || {},
        buybackPrices: currentHistoryEntry?.buybackPrices || {},
      });

      setCurrentHargaTaksir24K(priceNum);
      showNotification('success', `Harga taksir 24K berhasil diperbarui menjadi Rp ${formatRibuan(priceNum)}!`);
      loadData(editTaksirDate);
    } catch (err) {
      console.error('Error updating taksir price:', err);
      showNotification('error', 'Gagal memperbarui harga taksir.');
    } finally {
      setSaving(false);
    }
  };

  // Add customized gold type
  const handleAddGoldType = async () => {
    if (!hasWriteAccess) return;
    const trimmed = newTypeName.trim();
    const trimmedDesc = newTypeDescription.trim();
    const trimmedSource = newTypeSource.trim();
    const trimmedCategory = newTypeCategory.trim();
    if (!trimmed) return;
    if (activeGoldTypes.includes(trimmed)) {
      showNotification('error', 'Jenis emas tersebut sudah ada.');
      return;
    }

    const updatedTypes = [...activeGoldTypes, trimmed];
    const updatedDescriptions = { ...goldTypeDescriptions };
    const updatedSources = { ...goldTypeSources };
    const updatedCategories = { ...goldTypeCategories };
    if (trimmedDesc) {
      updatedDescriptions[trimmed] = trimmedDesc;
    }
    if (trimmedSource) {
      updatedSources[trimmed] = trimmedSource;
    }
    if (trimmedCategory) {
      updatedCategories[trimmed] = trimmedCategory;
    }

    try {
      await saveGoldSetting('gold_types', { types: updatedTypes, descriptions: updatedDescriptions, sources: updatedSources, categories: updatedCategories });
      setActiveGoldTypes(updatedTypes);
      setGoldTypeDescriptions(updatedDescriptions);
      setGoldTypeSources(updatedSources);
      setGoldTypeCategories(updatedCategories);
      setNewTypeName('');
      setNewTypeDescription('');
      setNewTypeSource('');
      setNewTypeCategory('');
      showNotification('success', `Jenis emas "${trimmed}" berhasil ditambahkan.`);
    } catch (err) {
      console.error('Error adding gold type:', err);
      showNotification('error', 'Gagal menyimpan jenis emas baru.');
    }
  };

  // Update description, source & category for existing gold type
  const handleSaveTypeMeta = async (typeName: string, newDesc: string, newSource: string, newCategory: string) => {
    if (!hasWriteAccess) return;
    const updatedDescriptions = { ...goldTypeDescriptions, [typeName]: newDesc.trim() };
    const updatedSources = { ...goldTypeSources, [typeName]: newSource.trim() };
    const updatedCategories = { ...goldTypeCategories, [typeName]: newCategory.trim() };
    try {
      await saveGoldSetting('gold_types', { types: activeGoldTypes, descriptions: updatedDescriptions, sources: updatedSources, categories: updatedCategories });
      setGoldTypeDescriptions(updatedDescriptions);
      setGoldTypeSources(updatedSources);
      setGoldTypeCategories(updatedCategories);
      setEditingTypeDescName(null);
      showNotification('success', `Informasi jenis emas "${typeName}" berhasil diperbarui.`);
    } catch (err) {
      console.error('Error updating metadata:', err);
      showNotification('error', 'Gagal menyimpan data.');
    }
  };

  // Remove gold type & all corresponding price history entries
  const confirmRemoveGoldType = async () => {
    if (!hasWriteAccess || !goldTypeToDelete) return;

    setDeletingType(true);
    const typeName = goldTypeToDelete;

    try {
      // 1. Update gold_types settings
      const updatedTypes = activeGoldTypes.filter((t) => t !== typeName);
      const updatedDescriptions = { ...goldTypeDescriptions };
      const updatedSources = { ...goldTypeSources };
      const updatedCategories = { ...goldTypeCategories };
      delete updatedDescriptions[typeName];
      delete updatedSources[typeName];
      delete updatedCategories[typeName];

      await saveGoldSetting('gold_types', { types: updatedTypes, descriptions: updatedDescriptions, sources: updatedSources, categories: updatedCategories });
      setActiveGoldTypes(updatedTypes);
      setGoldTypeDescriptions(updatedDescriptions);
      setGoldTypeSources(updatedSources);
      setGoldTypeCategories(updatedCategories);

      // 2. Clear from gold_price_history via the dedicated endpoint
      await removeGoldType(typeName);

      // 3. Update local history state
      setHistory((prev) => prev.map((entry) => {
        const newPrices = { ...entry.prices };
        const newBuybacks = { ...(entry.buybackPrices || {}) };
        delete newPrices[typeName];
        delete newBuybacks[typeName];
        return { ...entry, prices: newPrices, buybackPrices: newBuybacks };
      }));

      showNotification('success', `Jenis emas "${typeName}" dan seluruh riwayat harganya berhasil dihapus.`);
    } catch (err) {
      console.error('Error removing gold type and its history:', err);
      showNotification('error', `Gagal menghapus jenis emas "${typeName}".`);
    } finally {
      setDeletingType(false);
      setGoldTypeToDelete(null);
    }
  };

  // Open modal to add or edit daily history entry
  const openHistoryModal = (entry: GoldHistoryEntry | null = null) => {
    if (!hasWriteAccess) {
      showNotification('error', 'Anda tidak memiliki hak akses untuk mengubah data riwayat.');
      return;
    }

    setSelectedEntry(entry);
    if (entry) {
      setModalDate(entry.date);
      setModalTaksir24K(formatRibuan(entry.hargaTaksir24K));

      const pricesMap: Record<string, string> = {};
      const buybackMap: Record<string, string> = {};
      activeGoldTypes.forEach((t) => {
        pricesMap[t] = entry.prices[t] ? formatRibuan(entry.prices[t]) : '0';
        buybackMap[t] = entry.buybackPrices?.[t] ? formatRibuan(entry.buybackPrices[t]) : '0';
      });
      setModalPrices(pricesMap);
      setModalBuybackPrices(buybackMap);
    } else {
      setModalDate(getTodayWibDateString());
      setModalTaksir24K(formatRibuan(currentHargaTaksir24K));

      const pricesMap: Record<string, string> = {};
      const buybackMap: Record<string, string> = {};
      activeGoldTypes.forEach((t) => {
        pricesMap[t] = '0';
        buybackMap[t] = '0';
      });
      setModalPrices(pricesMap);
      setModalBuybackPrices(buybackMap);
    }
    setShowHistoryModal(true);
  };

  // Save history modal
  const handleSaveHistoryEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasWriteAccess) return;

    const taksirNum = unformatRibuan(modalTaksir24K);
    if (!modalDate) {
      showNotification('error', 'Tanggal harus diisi.');
      return;
    }

    setSaving(true);
    try {
      const entryPrices: Record<string, number> = {};
      const entryBuybackPrices: Record<string, number> = {};
      activeGoldTypes.forEach((t) => {
        entryPrices[t] = unformatRibuan(modalPrices[t] || '0');
        entryBuybackPrices[t] = unformatRibuan(modalBuybackPrices[t] || '0');
      });

      await saveGoldHistoryRow({
        date: modalDate,
        hargaTaksir24K: taksirNum,
        prices: entryPrices,
        buybackPrices: entryBuybackPrices,
      });

      // If we are saving/updating for today or a newer date, update the default current taksir 24k as well!
      const isLatestOrToday = !history.length || modalDate >= history[0].date;
      if (isLatestOrToday) {
        await saveGoldSetting('harga_emas_aktif', {
          currentHargaTaksir24K: taksirNum,
          lastUpdatedHargaTaksir: modalDate,
          updatedAt: new Date().toISOString(),
        });
        setCurrentHargaTaksir24K(taksirNum);
      }

      showNotification('success', `Riwayat harga emas tanggal ${modalDate} berhasil disimpan!`);
      setShowHistoryModal(false);
      loadData(editTaksirDate);
    } catch (err) {
      console.error('Error saving history entry:', err);
      showNotification('error', 'Gagal menyimpan riwayat harian.');
    } finally {
      setSaving(false);
    }
  };

  // Delete history entry confirmed
  const confirmDeleteHistoryEntry = async () => {
    if (!hasWriteAccess || !historyToDelete) return;
    setDeletingHistory(true);
    const id = historyToDelete.id;
    try {
      await deleteGoldHistoryDate(id);
      const formattedDate = id.split('-').reverse().join('/');
      showNotification('success', `Riwayat harga emas tanggal ${formattedDate} berhasil dihapus.`);
      setHistoryToDelete(null);
      loadData(editTaksirDate);
    } catch (err) {
      console.error('Error deleting history entry:', err);
      showNotification('error', 'Gagal menghapus riwayat harian.');
    } finally {
      setDeletingHistory(false);
    }
  };

  return (
    <div className="w-full relative min-h-screen pb-12">
      {/* Page Header (Compact with Segmented Tab UI) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3.5 sm:p-4 rounded-xl sm:rounded-2xl shadow-xs border border-slate-100 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-lg shrink-0">🏆</span>
          <h1 className="text-base sm:text-lg font-bold text-slate-800 tracking-tight">
            Tabel Harga Emas &amp; Taksir
          </h1>
        </div>

        {/* Tab Segmented Control */}
        <div className="w-full sm:w-auto flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/70">
          <button
            type="button"
            onClick={() => setActiveTab('taksir')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'taksir'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
            }`}
          >
            <Table size={15} />
            <span>Harga Taksir Emas</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('harian')}
            className={`flex-1 sm:flex-initial px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'harian'
                ? 'bg-white text-slate-900 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/40'
            }`}
          >
            <TrendingUp size={15} />
            <span>Harga Emas Harian</span>
          </button>
        </div>
      </div>

      {/* Notifications Alert */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`mb-6 p-4 rounded-xl text-sm font-semibold border shadow-sm flex items-center justify-between ${
              alertMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}
          >
            <span>{alertMsg.text}</span>
            <button onClick={() => setAlertMsg(null)} className="text-slate-400 hover:text-slate-600 font-bold ml-4">
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="bg-white rounded-2xl p-16 shadow-lg border border-slate-100 flex flex-col items-center justify-center space-y-4">
          <Loader2 className="animate-spin text-amber-500" size={40} />
          <p className="text-slate-500 font-semibold text-sm">Sedang memuat data harga emas...</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {activeTab === 'taksir' ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Left Form: Update 24k Price */}
              <div className="lg:col-span-1 space-y-4 sm:space-y-6">
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-500 to-yellow-600 px-4 sm:px-5 py-3 sm:py-3.5 text-white">
                    <h2 className="text-sm sm:text-base font-bold tracking-tight">Atur Harga Taksir 24K</h2>
                  </div>

                  <form onSubmit={handleUpdateTaksir24K} className="p-4 sm:p-5 space-y-3.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase">Tanggal Update</label>
                      <div className="relative">
                        <Calendar size={15} className="absolute left-3 top-2.5 text-slate-400" />
                        <input
                          type="date"
                          value={editTaksirDate}
                          onChange={(e) => {
                            const newDate = e.target.value;
                            setEditTaksirDate(newDate);
                            const entry = history.find((h) => h.date === newDate);
                            if (entry) {
                              setEditTaksirValue(formatRibuan(entry.hargaTaksir24K));
                            } else {
                              setEditTaksirValue('');
                            }
                          }}
                          disabled={!hasWriteAccess}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 font-semibold text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 transition disabled:opacity-60"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1 uppercase">Harga Taksir 24K (per gram)</label>
                      <div className="relative">
                        <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">Rp</span>
                        <input
                          type="text"
                          value={editTaksirValue}
                          onChange={(e) => {
                            const numeric = e.target.value.replace(/\D/g, '');
                            setEditTaksirValue(formatRibuan(numeric || '0'));
                          }}
                          disabled={!hasWriteAccess}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-10 pr-3 py-2.5 font-extrabold text-slate-800 text-base focus:outline-none focus:ring-2 focus:ring-amber-500 transition disabled:opacity-60"
                        />
                      </div>
                    </div>

                    {hasWriteAccess ? (
                      <button
                        type="submit"
                        disabled={saving}
                        className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-xs hover:shadow transition-all text-xs sm:text-sm cursor-pointer"
                      >
                        {saving ? (
                          <>
                            <Loader2 size={16} className="animate-spin" /> Menyimpan...
                          </>
                        ) : (
                          <>
                            <Save size={16} /> Update &amp; Simpan Taksir
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="bg-amber-50 text-amber-800 p-2.5 rounded-lg text-xs font-medium border border-amber-200 text-center flex items-center justify-center gap-1.5">
                        <Eye size={14} /> Mode Hanya Lihat. Perubahan harga memerlukan hak akses Write.
                      </div>
                    )}
                  </form>
                </div>
              </div>

              {/* Right Table: Karatase list */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                  <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-4 sm:px-5 py-3 sm:py-3.5 text-white flex justify-between items-center">
                    <div>
                      <h2 className="text-sm sm:text-base font-bold">Tabel Simulasi Penentuan Harga Taksir Emas</h2>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold text-[11px] uppercase">
                          <th className="py-2.5 sm:py-3 px-3.5 sm:px-5">Karatase</th>
                          <th className="hidden sm:table-cell py-2.5 sm:py-3 px-3.5 sm:px-5">Kadar (%)</th>
                          <th className="hidden sm:table-cell py-2.5 sm:py-3 px-3.5 sm:px-5">Rumus Persentase</th>
                          <th className="py-2.5 sm:py-3 px-3.5 sm:px-5 text-right">Harga Taksir per Gram</th>
                        </tr>
                      </thead>
                      <tbody>
                        {KARATS.map((k) => {
                          const currentPriceToCalculate = unformatRibuan(editTaksirValue);
                          const estimatedPrice = Math.round(currentPriceToCalculate * k.factor);
                          return (
                            <tr key={k.karat} className="border-b border-slate-50 hover:bg-slate-50/40 transition-colors font-medium text-xs sm:text-sm">
                              <td className="py-2.5 sm:py-3 px-3.5 sm:px-5">
                                <div className="flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                                  <span className="font-extrabold text-slate-800">{k.karat} Karat</span>
                                  {k.code !== '-' && (
                                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 text-[10px] rounded font-mono">
                                      {k.code}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="hidden sm:table-cell py-2.5 sm:py-3 px-3.5 sm:px-5 text-slate-600 font-mono text-xs">{k.kadar}</td>
                              <td className="hidden sm:table-cell py-2.5 sm:py-3 px-3.5 sm:px-5 text-slate-500 text-xs">{(k.factor * 100).toFixed(1)}%</td>
                              <td className="py-2.5 sm:py-3 px-3.5 sm:px-5 text-right font-bold text-slate-900 font-mono text-xs sm:text-sm">
                                {currentPriceToCalculate > 0 ? `Rp ${formatRibuan(estimatedPrice)}` : '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Daily prices table */}
              <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                <div className="bg-slate-800 text-white px-3.5 py-2.5 sm:px-5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 sm:gap-3 relative">
                  <div>
                    <h2 className="text-sm sm:text-lg font-bold tracking-tight">Riwayat &amp; Daftar Harga Emas Harian</h2>
                  </div>

                  <div className="flex items-center gap-1.5 sm:gap-2 flex-nowrap justify-end w-full sm:w-auto relative">
                    {/* Hidden input for Import Excel */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {/* Manual Sync Harga Live (pengganti auto-sync cron) */}
                    {hasWriteAccess && (
                      <button
                        type="button"
                        onClick={handleSyncLiveToday}
                        disabled={saving}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 sm:gap-1.5 shadow transition whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-60"
                        title="Tarik harga live 18 sumber & simpan sebagai riwayat hari ini (sync manual — tidak ada auto-sync di WOORK)"
                      >
                        {saving ? <Loader2 size={14} className="animate-spin shrink-0" /> : <Zap size={14} className="shrink-0" />}
                        <span className="hidden sm:inline">Sync Harga Live</span>
                      </button>
                    )}

                    {/* Unified Date Range Filter Field / Button with Dropdown Popover */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setTempStartDate(filterStartDate);
                          setTempEndDate(filterEndDate);
                          setShowDateFilterModal(!showDateFilterModal);
                        }}
                        className={`px-2.5 py-1.5 sm:px-3 sm:py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 sm:gap-1.5 transition border shrink-0 cursor-pointer ${
                          isDateFilterActive
                            ? 'bg-amber-500 text-slate-950 border-amber-400 font-extrabold shadow-sm'
                            : 'bg-slate-700/90 hover:bg-slate-700 text-slate-200 border-slate-600'
                        }`}
                        title="Filter rentang tanggal riwayat harga"
                      >
                        <Calendar size={13} className={`shrink-0 ${isDateFilterActive ? 'text-slate-950' : 'text-amber-400'}`} />
                        {isDateFilterActive ? (
                          <span className="truncate max-w-[100px] sm:max-w-[200px]">{getDateFilterLabel()}</span>
                        ) : (
                          <span className="hidden sm:inline">Filter Tanggal</span>
                        )}
                      </button>

                      {/* Dropdown Popover - Centered on Mobile, Light Mode & Compact */}
                      {showDateFilterModal && (
                        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-0 sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2">
                          <div
                            className="fixed inset-0 bg-slate-900/50 sm:bg-transparent z-30"
                            onClick={() => setShowDateFilterModal(false)}
                          />
                          <div className="relative w-full max-w-sm sm:w-96 bg-white border border-slate-200 text-slate-800 rounded-2xl shadow-2xl p-3.5 sm:p-4 z-40">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2 mb-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                                  <Calendar size={15} />
                                </div>
                                <h3 className="font-bold text-sm text-slate-900">Filter Rentang Tanggal</h3>
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowDateFilterModal(false)}
                                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
                              >
                                <X size={16} />
                              </button>
                            </div>

                            {/* Quick Presets */}
                            <div className="space-y-1 mb-3">
                              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Preset Cepat</label>
                              <div className="grid grid-cols-3 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const today = getTodayWibDateString();
                                    setTempStartDate(today);
                                    setTempEndDate(today);
                                  }}
                                  className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-950 border border-slate-200 py-1 px-2 rounded-lg font-semibold transition text-center"
                                >
                                  Hari Ini
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const today = new Date();
                                    const past = new Date(today);
                                    past.setDate(today.getDate() - 7);
                                    setTempStartDate(past.toISOString().split('T')[0]);
                                    setTempEndDate(today.toISOString().split('T')[0]);
                                  }}
                                  className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-950 border border-slate-200 py-1 px-2 rounded-lg font-semibold transition text-center"
                                >
                                  7 Hari Terakhir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const today = new Date();
                                    const past = new Date(today);
                                    past.setDate(today.getDate() - 30);
                                    setTempStartDate(past.toISOString().split('T')[0]);
                                    setTempEndDate(today.toISOString().split('T')[0]);
                                  }}
                                  className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-950 border border-slate-200 py-1 px-2 rounded-lg font-semibold transition text-center"
                                >
                                  30 Hari Terakhir
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const today = new Date();
                                    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                                    setTempStartDate(firstDay.toISOString().split('T')[0]);
                                    setTempEndDate(today.toISOString().split('T')[0]);
                                  }}
                                  className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-950 border border-slate-200 py-1 px-2 rounded-lg font-semibold transition text-center"
                                >
                                  Bulan Ini
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTempStartDate('');
                                    setTempEndDate('');
                                  }}
                                  className="text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-950 border border-slate-200 py-1 px-2 rounded-lg font-semibold transition col-span-2 text-center"
                                >
                                  Semua Data (Tanpa Batas)
                                </button>
                              </div>
                            </div>

                            {/* Date Inputs */}
                            <div className="grid grid-cols-2 gap-2 mb-3">
                              <div>
                                <label className="text-[10px] font-bold text-slate-700 block mb-0.5">Tanggal Mulai</label>
                                <input
                                  type="date"
                                  value={tempStartDate}
                                  onChange={(e) => setTempStartDate(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500 focus:bg-white transition"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-bold text-slate-700 block mb-0.5">Tanggal Selesai</label>
                                <input
                                  type="date"
                                  value={tempEndDate}
                                  onChange={(e) => setTempEndDate(e.target.value)}
                                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:border-amber-500 focus:bg-white transition"
                                />
                              </div>
                            </div>

                            {/* Footer Actions */}
                            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => {
                                  setTempStartDate('');
                                  setTempEndDate('');
                                  setFilterStartDate('');
                                  setFilterEndDate('');
                                  setShowDateFilterModal(false);
                                }}
                                className="text-xs text-rose-600 hover:text-rose-700 font-bold px-1.5 py-1 rounded-lg hover:bg-rose-50 transition flex items-center gap-1"
                              >
                                <RotateCcw size={12} /> Reset
                              </button>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setShowDateFilterModal(false)}
                                  className="px-2.5 py-1 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition border border-slate-200"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFilterStartDate(tempStartDate);
                                    setFilterEndDate(tempEndDate);
                                    setShowDateFilterModal(false);
                                  }}
                                  className="px-3.5 py-1 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold shadow-sm transition"
                                >
                                  Terapkan
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* View Mode Switcher: Tabel ↔ Kartu */}
                    <div className="flex items-center bg-slate-700/80 p-0.5 rounded-xl border border-slate-600 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleSetViewMode('cards')}
                        className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition cursor-pointer ${
                          viewMode === 'cards'
                            ? 'bg-amber-500 text-slate-950 shadow-xs font-extrabold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                        title="Mode Kartu Harian (Optimal di Layar HP)"
                      >
                        <LayoutGrid size={13} className="shrink-0" />
                        <span className="hidden sm:inline">Kartu</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetViewMode('table')}
                        className={`px-2 sm:px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 sm:gap-1.5 transition cursor-pointer ${
                          viewMode === 'table'
                            ? 'bg-amber-500 text-slate-950 shadow-xs font-extrabold'
                            : 'text-slate-300 hover:text-white'
                        }`}
                        title="Mode Tabel Lengkap"
                      >
                        <Table size={13} className="shrink-0" />
                        <span className="hidden sm:inline">Tabel</span>
                      </button>
                    </div>

                    {/* Input Harga Harian (Write access) */}
                    {hasWriteAccess && (
                      <button
                        type="button"
                        onClick={() => openHistoryModal(null)}
                        className="bg-amber-500 hover:bg-amber-600 text-slate-950 px-2.5 py-1.5 sm:px-3.5 sm:py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 sm:gap-1.5 shadow transition whitespace-nowrap shrink-0 cursor-pointer"
                        title="Input data harga emas harian manual"
                      >
                        <Plus size={14} className="shrink-0" />
                        <span className="hidden sm:inline">Input Harga Harian</span>
                      </button>
                    )}

                    {/* 3-Dots Action Menu Dropdown */}
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowActionMenu(!showActionMenu)}
                        className={`p-1.5 rounded-xl transition border flex items-center justify-center cursor-pointer ${
                          showActionMenu
                            ? 'bg-slate-700 text-amber-400 border-slate-500'
                            : 'bg-slate-700/80 hover:bg-slate-700 text-slate-200 border-slate-600'
                        }`}
                        title="Menu Opsi & Pengaturan Tabel"
                      >
                        <MoreVertical size={16} />
                      </button>

                      {/* Dropdown Popover */}
                      {showActionMenu && (
                        <>
                          <div
                            className="fixed inset-0 z-30"
                            onClick={() => setShowActionMenu(false)}
                          />
                          <div className="absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-2xl shadow-2xl py-1.5 z-40 text-slate-700 text-xs overflow-hidden">
                            {/* Filter Kolom */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowActionMenu(false);
                                setShowColumnFilter(true);
                              }}
                              className="w-full px-3.5 py-2.5 text-left hover:bg-slate-100 flex items-center justify-between gap-2 transition"
                            >
                              <div className="flex items-center gap-2">
                                <Columns size={15} className="text-amber-500" />
                                <span className="font-semibold text-slate-800">Filter Kolom</span>
                              </div>
                              <span className="bg-slate-100 text-slate-600 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border border-slate-200">
                                {visibleActiveGoldTypes.length}/{activeGoldTypes.length}
                              </span>
                            </button>

                            {/* Live Pasar Emas API */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowActionMenu(false);
                                handleFetchLiveMarketData();
                                setShowLiveMarket(true);
                              }}
                              className="w-full px-3.5 py-2.5 text-left hover:bg-slate-100 flex items-center justify-between gap-2 transition"
                            >
                              <div className="flex items-center gap-2">
                                <Globe size={15} className="text-emerald-500" />
                                <span className="font-semibold text-slate-800">Live Pasar Emas API</span>
                              </div>
                              <span className="bg-emerald-500/10 text-emerald-600 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/20">
                                18 API
                              </span>
                            </button>

                            {/* Sync Harga Live (manual — pengganti Auto-Sync Cron backup) */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowActionMenu(false);
                                handleSyncLiveToday();
                              }}
                              className="w-full px-3.5 py-2.5 text-left hover:bg-slate-100 flex items-center justify-between gap-2 transition"
                            >
                              <div className="flex items-center gap-2">
                                <Zap size={15} className="text-emerald-500" />
                                <span className="font-semibold text-slate-800">Sync Harga Live</span>
                              </div>
                              <span className="bg-emerald-500/10 text-emerald-600 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-500/20">
                                MANUAL
                              </span>
                            </button>

                            {/* Kelola Jenis Emas (Write access) */}
                            {hasWriteAccess && (
                              <button
                                type="button"
                                onClick={() => {
                                  setShowActionMenu(false);
                                  setShowTypeSettings(true);
                                }}
                                className="w-full px-3.5 py-2.5 text-left hover:bg-slate-100 flex items-center gap-2 transition"
                              >
                                <Settings size={15} className="text-purple-500" />
                                <span className="font-semibold text-slate-800">Kelola Jenis Emas</span>
                              </button>
                            )}

                            <div className="my-1 border-t border-slate-100" />

                            {/* Export Excel */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowActionMenu(false);
                                handleExportToExcel();
                              }}
                              className="w-full px-3.5 py-2.5 text-left hover:bg-slate-100 flex items-center gap-2 transition text-emerald-600"
                            >
                              <Download size={15} />
                              <span className="font-semibold text-slate-800">Export Excel</span>
                            </button>

                            {/* Import Excel */}
                            <button
                              type="button"
                              onClick={() => {
                                setShowActionMenu(false);
                                fileInputRef.current?.click();
                              }}
                              className="w-full px-3.5 py-2.5 text-left hover:bg-slate-100 flex items-center gap-2 transition text-amber-600"
                            >
                              <Upload size={15} />
                              <span className="font-semibold text-slate-800">Import Excel</span>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Content Views: Cards View vs Table View */}
                {viewMode === 'cards' ? (
                  <div className="p-3 sm:p-5 space-y-3.5 bg-slate-50/50">
                    {/* Quick Accordion Toggle Toolbar */}
                    {filteredHistory.length > 0 && (
                      <div className="flex items-center justify-between gap-2 px-1 text-xs text-slate-500 font-semibold">
                        <span>Menampilkan {paginatedHistory.length} dari {filteredHistory.length} tanggal riwayat</span>
                        <button
                          type="button"
                          onClick={toggleAllDates}
                          className="hover:text-amber-900 text-[11px] sm:text-xs font-bold text-slate-700 bg-white hover:bg-amber-50 px-2.5 py-1 rounded-lg border border-slate-200 transition shadow-2xs flex items-center gap-1.5 cursor-pointer select-none"
                        >
                          {isAllCollapsed ? (
                            <>
                              <ChevronsUpDown size={13} className="text-amber-600" />
                              <span>Buka Semua</span>
                            </>
                          ) : (
                            <>
                              <ChevronUp size={13} className="text-slate-500" />
                              <span>Tutup Semua</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {filteredHistory.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 font-medium bg-white rounded-2xl border border-slate-100 p-6">
                        {history.length === 0
                          ? "Belum ada riwayat harga harian yang dimasukkan."
                          : "Tidak ada riwayat harga emas yang cocok dengan filter tanggal."}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {paginatedHistory.map((entry) => {
                          const formattedDate = entry.date.split('-').reverse().join('/');
                          const isToday = entry.date === getTodayWibDateString();
                          const isCollapsed = !!collapsedDates[entry.id];

                          // Find previous day entry to calculate price diff
                          const currentIndex = history.findIndex((h) => h.id === entry.id);
                          const prevEntry = currentIndex !== -1 && currentIndex + 1 < history.length ? history[currentIndex + 1] : null;

                          return (
                            <div
                              key={entry.id}
                              className={`bg-white rounded-2xl border transition-all shadow-xs overflow-hidden ${
                                isToday
                                  ? 'border-sky-300 ring-2 ring-sky-100'
                                  : 'border-slate-200/90 hover:border-slate-300'
                              }`}
                            >
                              {/* Header Card (Interactive Accordion Header) */}
                              <div
                                onClick={() => toggleDateAccordion(entry.id)}
                                className={`px-3.5 py-2.5 sm:py-3 flex items-center justify-between gap-2 cursor-pointer select-none transition ${
                                  isToday ? 'bg-sky-50/70 hover:bg-sky-100/70' : 'bg-slate-50/80 hover:bg-slate-100/80'
                                } ${!isCollapsed ? 'border-b border-slate-100' : ''}`}
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold shrink-0 ${
                                    isToday ? 'bg-sky-100 text-sky-700 border border-sky-200' : 'bg-white text-slate-700 border border-slate-200 shadow-2xs'
                                  }`}>
                                    <Calendar size={15} className={isToday ? 'text-sky-600' : 'text-amber-600'} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className={`font-extrabold text-sm ${isToday ? 'text-sky-950' : 'text-slate-900'}`}>{formattedDate}</span>
                                      {isToday && (
                                        <span className="text-[9px] font-extrabold bg-sky-500 text-white px-1.5 py-0.2 rounded-full shadow-2xs">
                                          HARI INI
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                      <span>Taksir 24K:</span>
                                      <span className="font-mono font-extrabold text-slate-900">
                                        Rp {formatRibuan(entry.hargaTaksir24K)}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  {/* Actions 3-Dots Menu */}
                                  {hasWriteAccess && (
                                    <div className="relative shrink-0" onClick={(e) => e.stopPropagation()}>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuEntryId(activeMenuEntryId === `card-${entry.id}` ? null : `card-${entry.id}`);
                                        }}
                                        className={`p-1.5 rounded-lg transition border shadow-2xs flex items-center justify-center ${
                                          activeMenuEntryId === `card-${entry.id}`
                                            ? 'bg-amber-100 text-amber-950 border-amber-400 ring-2 ring-amber-200'
                                            : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border-slate-200'
                                        }`}
                                        title="Pilihan Aksi"
                                      >
                                        <MoreVertical size={14} />
                                      </button>

                                      {activeMenuEntryId === `card-${entry.id}` && (
                                        <>
                                          {/* Invisible backdrop */}
                                          <div
                                            className="fixed inset-0 z-30"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setActiveMenuEntryId(null);
                                            }}
                                          />
                                          {/* Dropdown Menu */}
                                          <div
                                            className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-xl z-40 py-1 overflow-hidden text-left"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveMenuEntryId(null);
                                                openHistoryModal(entry);
                                              }}
                                              className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition"
                                            >
                                              <Edit size={13} className="text-blue-600" />
                                              <span>Edit Riwayat</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveMenuEntryId(null);
                                                setHistoryToDelete(entry);
                                              }}
                                              className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition border-t border-slate-100"
                                            >
                                              <Trash2 size={13} className="text-rose-600" />
                                              <span>Hapus Riwayat</span>
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  )}

                                  {/* Accordion Chevron Indicator */}
                                  <div
                                    className={`p-1 rounded-lg text-slate-400 hover:text-slate-700 transition-transform duration-200 ${
                                      !isCollapsed ? 'rotate-180 text-slate-700' : ''
                                    }`}
                                  >
                                    <ChevronDown size={18} />
                                  </div>
                                </div>
                              </div>

                              {/* Accordion Body: Grid of active gold prices */}
                              <AnimatePresence initial={false}>
                                {!isCollapsed && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="p-3 sm:p-4 bg-slate-50/40">
                                      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 sm:gap-2.5 lg:gap-3">
                                        {visibleActiveGoldTypes.map((type) => {
                                          const sellVal = entry.prices[type];
                                          const buybackVal = entry.buybackPrices?.[type];
                                          const prevSellVal = prevEntry?.prices?.[type];

                                          // Calculate % change compared to previous date
                                          let diffPercentStr = '+0%';
                                          let diffColorClass = 'text-slate-400';

                                          if (sellVal && prevSellVal && prevSellVal > 0) {
                                            const diffPct = ((sellVal - prevSellVal) / prevSellVal) * 100;
                                            if (diffPct > 0) {
                                              diffPercentStr = `+${diffPct.toFixed(1)}%`;
                                              diffColorClass = 'text-emerald-600 font-bold';
                                            } else if (diffPct < 0) {
                                              diffPercentStr = `${diffPct.toFixed(1)}%`;
                                              diffColorClass = 'text-rose-600 font-bold';
                                            } else {
                                              diffPercentStr = '+0%';
                                              diffColorClass = 'text-slate-400';
                                            }
                                          }

                                          return (
                                            <div
                                              key={type}
                                              className="bg-white border border-slate-200/90 rounded-xl sm:rounded-2xl p-2.5 sm:p-3.5 shadow-2xs hover:shadow-sm hover:border-slate-300 transition flex flex-col justify-between gap-1.5 sm:gap-2"
                                            >
                                              {/* Row 1: Title */}
                                              <div className="flex items-center justify-between gap-1 min-w-0">
                                                <span className="font-bold text-[11px] sm:text-xs md:text-sm text-slate-800 truncate" title={type}>
                                                  {type}
                                                </span>
                                              </div>

                                              {/* Row 2: Price (Large Bold) & % Change */}
                                              <div className="flex items-baseline justify-between gap-1 flex-wrap">
                                                <span className="font-extrabold text-xs sm:text-sm md:text-base text-slate-900 font-mono tracking-tight truncate">
                                                  {sellVal ? `Rp ${formatRibuan(sellVal)}` : '-'}
                                                </span>
                                                <span className={`text-[9px] sm:text-[10px] md:text-[11px] font-mono shrink-0 ${diffColorClass}`}>
                                                  {diffPercentStr}
                                                </span>
                                              </div>

                                              {/* Row 3: Buyback */}
                                              <div className="flex items-center justify-between gap-1 text-[10px] sm:text-xs pt-1 border-t border-slate-100">
                                                <span className="text-slate-400 font-medium shrink-0">Buyback:</span>
                                                <span className="font-semibold text-slate-700 font-mono text-[10px] sm:text-xs truncate">
                                                  {buybackVal ? `Rp ${formatRibuan(buybackVal)}` : '-'}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Table View with responsive sticky columns */
                  <div className="overflow-x-auto relative">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold text-xs uppercase">
                          <th className="py-3 px-2.5 sm:py-3.5 sm:px-4 sticky left-0 z-20 bg-slate-50 min-w-[90px] w-[90px] sm:min-w-[130px] sm:w-[130px] border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                            Tanggal
                          </th>
                          <th className="py-3 px-3 sm:py-3.5 sm:px-4 sm:sticky sm:left-[130px] sm:z-20 bg-slate-50 min-w-[120px] w-[120px] sm:min-w-[150px] sm:w-[150px] border-r sm:border-r-2 border-slate-200 sm:border-slate-300 sm:shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)]">
                            Harga Taksir 24K
                          </th>
                          {visibleActiveGoldTypes.map((type) => (
                            <th key={type} className="py-3.5 px-6 min-w-[150px]">
                              <div>{type}</div>
                              {goldTypeSources[type] && (
                                <div className="text-[10px] text-amber-600 font-semibold normal-case truncate max-w-[140px] font-sans">
                                  Sumber: {goldTypeSources[type]}
                                </div>
                              )}
                              {goldTypeCategories[type] && (
                                <div className="text-[10px] text-blue-600 font-semibold normal-case truncate max-w-[140px] font-sans">
                                  Kat: {goldTypeCategories[type]}
                                </div>
                              )}
                              {goldTypeDescriptions[type] && (
                                <div
                                  className="text-[10px] text-slate-400 font-normal normal-case truncate max-w-[140px] font-sans"
                                  title={goldTypeDescriptions[type]}
                                >
                                  {goldTypeDescriptions[type]}
                                </div>
                              )}
                            </th>
                          ))}
                          {hasWriteAccess && <th className="py-3.5 px-6 text-right min-w-[100px]">Aksi</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistory.length === 0 ? (
                          <tr>
                            <td
                              colSpan={2 + visibleActiveGoldTypes.length + (hasWriteAccess ? 1 : 0)}
                              className="py-12 text-center text-slate-400 font-medium"
                            >
                              {history.length === 0
                                ? "Belum ada riwayat harga harian yang dimasukkan."
                                : "Tidak ada riwayat harga emas yang cocok dengan filter tanggal."
                              }
                            </td>
                          </tr>
                        ) : (
                          paginatedHistory.map((entry) => {
                            const formattedDate = entry.date.split('-').reverse().join('/');
                            const isToday = entry.date === getTodayWibDateString();
                            return (
                              <tr
                                key={entry.id}
                                className={`group border-b border-slate-100 transition-colors font-medium ${
                                  isToday ? 'bg-sky-50/60 hover:bg-sky-50/90' : 'hover:bg-amber-50/40'
                                }`}
                              >
                                <td
                                  className={`py-3 px-2.5 sm:py-3.5 sm:px-4 font-bold sticky left-0 z-10 min-w-[90px] w-[90px] sm:min-w-[130px] sm:w-[130px] border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors ${
                                    isToday
                                      ? 'bg-sky-50 text-sky-950 group-hover:bg-sky-100/90 border-l-4 border-l-sky-500'
                                      : 'bg-white text-slate-800 group-hover:bg-amber-50/90'
                                  }`}
                                >
                                  <div className="flex items-center">
                                    <span className={`text-xs sm:text-sm font-mono sm:font-sans ${isToday ? 'font-extrabold text-sky-950' : 'text-slate-800 font-bold'}`}>{formattedDate}</span>
                                  </div>
                                </td>
                                <td
                                  className={`py-3 px-3 sm:py-3.5 sm:px-4 text-slate-900 font-extrabold font-mono text-xs sm:sticky sm:left-[130px] sm:z-10 min-w-[120px] w-[120px] sm:min-w-[150px] sm:w-[150px] border-r sm:border-r-2 border-slate-200 sm:border-slate-300 sm:shadow-[4px_0_8px_-2px_rgba(0,0,0,0.08)] transition-colors ${
                                    isToday ? 'bg-sky-50/70 group-hover:bg-sky-100/90' : 'bg-white group-hover:bg-amber-50/90'
                                  }`}
                                >
                                  Rp {formatRibuan(entry.hargaTaksir24K)}
                                </td>
                                {visibleActiveGoldTypes.map((type) => {
                                  const sellVal = entry.prices[type];
                                  const buybackVal = entry.buybackPrices?.[type];

                                  return (
                                    <td key={type} className="py-2.5 px-4 text-slate-700 font-mono text-xs">
                                      {sellVal || buybackVal ? (
                                        <div className="flex flex-col gap-1 min-w-[130px]">
                                          <div className="flex items-center justify-between gap-1.5 bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Beli</span>
                                            <span className="font-extrabold text-slate-800">{sellVal ? `Rp ${formatRibuan(sellVal)}` : '-'}</span>
                                          </div>
                                          <div className="flex items-center justify-between gap-1.5 bg-emerald-50/70 px-2 py-0.5 rounded border border-emerald-100/80">
                                            <span className="text-[10px] font-extrabold text-emerald-600 uppercase tracking-tight">Buyback</span>
                                            <span className="font-bold text-emerald-700">{buybackVal ? `Rp ${formatRibuan(buybackVal)}` : '-'}</span>
                                          </div>
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 text-center block">-</span>
                                      )}
                                    </td>
                                  );
                                })}
                                {hasWriteAccess && (
                                  <td className="py-3.5 px-6 text-right">
                                    <div className="relative inline-block text-left">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setActiveMenuEntryId(activeMenuEntryId === `table-${entry.id}` ? null : `table-${entry.id}`);
                                        }}
                                        className={`p-1.5 rounded-lg transition border shadow-2xs flex items-center justify-center ${
                                          activeMenuEntryId === `table-${entry.id}`
                                            ? 'bg-amber-100 text-amber-950 border-amber-400 ring-2 ring-amber-200'
                                            : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-100 border-slate-200'
                                        }`}
                                        title="Pilihan Aksi"
                                      >
                                        <MoreVertical size={14} />
                                      </button>

                                      {activeMenuEntryId === `table-${entry.id}` && (
                                        <>
                                          {/* Invisible backdrop */}
                                          <div
                                            className="fixed inset-0 z-30"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              setActiveMenuEntryId(null);
                                            }}
                                          />
                                          {/* Dropdown Menu */}
                                          <div
                                            className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-xl z-40 py-1 overflow-hidden text-left"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveMenuEntryId(null);
                                                openHistoryModal(entry);
                                              }}
                                              className="w-full px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2 transition"
                                            >
                                              <Edit size={13} className="text-blue-600" />
                                              <span>Edit Riwayat</span>
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => {
                                                setActiveMenuEntryId(null);
                                                setHistoryToDelete(entry);
                                              }}
                                              className="w-full px-3 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2 transition border-t border-slate-100"
                                            >
                                              <Trash2 size={13} className="text-rose-600" />
                                              <span>Hapus Riwayat</span>
                                            </button>
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                )}
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination Controls */}
                {filteredHistory.length > 0 && (
                  <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-4 rounded-b-2xl">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 font-medium">
                      <div className="flex items-center gap-2">
                        <select
                          value={itemsPerPage}
                          onChange={(e) => setItemsPerPage(Number(e.target.value))}
                          className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer shadow-2xs"
                        >
                          <option value={5}>5 baris</option>
                          <option value={10}>10 baris</option>
                          <option value={25}>25 baris</option>
                          <option value={50}>50 baris</option>
                          <option value={100}>100 baris</option>
                          <option value={-1}>Semua ({filteredHistory.length})</option>
                        </select>
                      </div>
                      <span className="text-slate-300 hidden sm:inline">|</span>
                      <span>
                        <strong className="text-slate-800 font-bold">{startItemIndex}</strong> - <strong className="text-slate-800 font-bold">{endItemIndex}</strong> dari <strong className="text-slate-800 font-bold">{filteredHistory.length}</strong> data
                      </span>
                    </div>

                    {itemsPerPage !== -1 && totalPages > 1 && (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setCurrentPage(1)}
                          disabled={currentPage === 1}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition shadow-2xs"
                          title="Halaman Pertama"
                        >
                          <ChevronsLeft size={16} />
                        </button>
                        <button
                          onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition shadow-2xs"
                          title="Halaman Sebelumnya"
                        >
                          <ChevronLeft size={16} />
                        </button>

                        <div className="flex items-center gap-1 px-1">
                          {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter((page) => {
                              return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
                            })
                            .reduce<(number | string)[]>((acc, page, index, arr) => {
                              if (index > 0 && page - (arr[index - 1] as number) > 1) {
                                acc.push('...');
                              }
                              acc.push(page);
                              return acc;
                            }, [])
                            .map((item, idx) => {
                              if (item === '...') {
                                return <span key={`ellipsis-${idx}`} className="px-1.5 text-slate-400 text-xs font-bold">...</span>;
                              }
                              const pageNum = item as number;
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => setCurrentPage(pageNum)}
                                  className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-extrabold transition ${
                                    currentPage === pageNum
                                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                                  }`}
                                >
                                  {pageNum}
                                </button>
                              );
                            })}
                        </div>

                        <button
                          onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition shadow-2xs"
                          title="Halaman Selanjutnya"
                        >
                          <ChevronRight size={16} />
                        </button>
                        <button
                          onClick={() => setCurrentPage(totalPages)}
                          disabled={currentPage === totalPages}
                          className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-white text-slate-600 transition shadow-2xs"
                          title="Halaman Terakhir"
                        >
                          <ChevronsRight size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Input/Update Modal Dialog */}
      <AnimatePresence>
        {showHistoryModal && (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex justify-center items-center p-3 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowHistoryModal(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="bg-gradient-to-r from-amber-500 to-yellow-600 px-5 py-3.5 text-white flex justify-between items-center">
                <h3 className="text-base font-bold tracking-tight">
                  {selectedEntry ? 'Edit Riwayat Harga Emas' : 'Input Harga Emas Baru'}
                </h3>
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="text-white hover:text-amber-100 font-extrabold text-2xl leading-none focus:outline-none"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleSaveHistoryEntry} className="p-4 sm:p-5 space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-col sm:flex-row items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-amber-500 text-white rounded-lg flex items-center justify-center font-bold shrink-0">
                      <Zap size={18} className="text-white animate-pulse" />
                    </div>
                    <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Integrasi Logam Mulia API</h4>
                  </div>
                  <button
                    type="button"
                    onClick={handleAutoFillFromApi}
                    disabled={fetchingApi}
                    className="w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition whitespace-nowrap"
                  >
                    {fetchingApi ? (
                      <>
                        <Loader2 size={13} className="animate-spin" /> Menarik Data...
                      </>
                    ) : (
                      <>
                        <Download size={13} /> Tarik Harga Otomatis
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Tanggal Riwayat</label>
                    <input
                      type="date"
                      required
                      value={modalDate}
                      onChange={(e) => setModalDate(e.target.value)}
                      disabled={selectedEntry !== null}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 transition disabled:opacity-60"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 uppercase">Harga Taksir 24K (per gram)</label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-slate-400 font-bold text-xs">Rp</span>
                      <input
                        type="text"
                        required
                        value={modalTaksir24K}
                        onChange={(e) => {
                          const numeric = e.target.value.replace(/\D/g, '');
                          setModalTaksir24K(formatRibuan(numeric || '0'));
                        }}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <h4 className="font-extrabold text-slate-800 text-xs mb-2.5 uppercase tracking-wider">
                    🛍️ Harga Pasaran Berbagai Jenis Emas
                  </h4>

                  {activeGoldTypes.length === 0 ? (
                    <p className="text-xs text-slate-500 italic">Belum ada jenis emas tambahan yang dikonfigurasi. Klik Kelola Jenis Emas di luar modal untuk menambahkan.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                      {activeGoldTypes.map((type) => (
                        <div key={type} className="bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <label className="block text-xs font-extrabold text-slate-800 mb-1.5 truncate">{type}</label>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="block text-[10px] font-bold text-slate-500 mb-0.5">Harga Beli</span>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1.5 text-slate-400 font-bold text-xs">Rp</span>
                                <input
                                  type="text"
                                  value={modalPrices[type] || '0'}
                                  onChange={(e) => {
                                    const numeric = e.target.value.replace(/\D/g, '');
                                    setModalPrices({
                                      ...modalPrices,
                                      [type]: formatRibuan(numeric || '0'),
                                    });
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                                />
                              </div>
                            </div>
                            <div>
                              <span className="block text-[10px] font-bold text-emerald-600 mb-0.5">Buyback</span>
                              <div className="relative">
                                <span className="absolute left-2.5 top-1.5 text-slate-400 font-bold text-xs">Rp</span>
                                <input
                                  type="text"
                                  value={modalBuybackPrices[type] || '0'}
                                  onChange={(e) => {
                                    const numeric = e.target.value.replace(/\D/g, '');
                                    setModalBuybackPrices({
                                      ...modalBuybackPrices,
                                      [type]: formatRibuan(numeric || '0'),
                                    });
                                  }}
                                  className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 transition"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowHistoryModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md transition"
                  >
                    {saving ? (
                      <>
                        <Loader2 size={14} className="animate-spin" /> Menyimpan...
                      </>
                    ) : (
                      'Simpan Riwayat'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Gold Type Delete Confirmation Modal */}
      <AnimatePresence>
        {goldTypeToDelete && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" id="gold-delete-modal">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden">
              <div className="p-6 text-center space-y-4">
                <div className="mx-auto w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center text-rose-500">
                  <Trash2 size={24} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Hapus Jenis Emas</h3>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Apakah Anda yakin ingin menghapus jenis emas <strong className="text-slate-700">&quot;{goldTypeToDelete}&quot;</strong>?
                  <br />
                  <span className="text-rose-600 font-semibold text-xs mt-1 block">
                    ⚠️ Tindakan ini akan menghapus semua riwayat data harga terkait emas ini secara permanen dari database.
                  </span>
                </p>
                <div className="flex gap-3 justify-center pt-2">
                  <button
                    onClick={() => setGoldTypeToDelete(null)}
                    disabled={deletingType}
                    className="flex-1 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-sm font-semibold text-slate-500 transition"
                  >
                    Batal
                  </button>
                  <button
                    onClick={confirmRemoveGoldType}
                    disabled={deletingType}
                    className="flex-1 bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-sm flex items-center justify-center gap-1.5"
                  >
                    {deletingType ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Proses...
                      </>
                    ) : (
                      'Ya, Hapus Semua'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Import Preview Modal */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-6 max-w-3xl w-full shadow-2xl space-y-5 max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center border border-amber-500/30">
                    <FileSpreadsheet size={22} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-lg text-slate-900">Preview Import History Excel</h3>
                    <p className="text-xs text-slate-500">File: <span className="text-amber-600 font-mono font-semibold">{importFileName}</span></p>
                  </div>
                </div>
                <button
                  onClick={() => setShowImportModal(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Total Tanggal Terbaca</span>
                  <span className="font-mono font-extrabold text-amber-600 text-base">{Object.keys(importDataMap).length} Tanggal</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Jenis Emas Baru</span>
                  <span className="font-mono font-extrabold text-emerald-600 text-base">{importNewGoldTypes.length} Jenis</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">Status Format</span>
                  <span className="font-mono font-bold text-slate-700 text-xs flex items-center gap-1 mt-1">
                    <CheckCircle2 size={14} className="text-emerald-500" /> Siap di-import
                  </span>
                </div>
              </div>

              {importNewGoldTypes.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5 text-amber-600" />
                  <div>
                    <strong className="font-bold block">Jenis Emas Baru Ditemukan:</strong>
                    <p className="text-slate-700 mt-0.5">{importNewGoldTypes.join(', ')}</p>
                    <p className="text-[11px] text-amber-600 mt-1">Jenis emas di atas akan otomatis ditambahkan ke daftar kolom aktif saat di-import.</p>
                  </div>
                </div>
              )}

              {/* Column Selection Section */}
              <div className="bg-slate-50/70 border border-slate-200 p-4 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-800">Pilih Kolom Emas untuk Di-import</h4>
                    <p className="text-[11px] text-slate-500">Pilih jenis emas yang ingin disimpan ke database (minimal 1)</p>
                  </div>
                  <div className="flex gap-2 text-[10px]">
                    <button
                      onClick={() => {
                        setSelectedImportGoldTypes(importedGoldTypes);
                        setImportHargaTaksir24K(true);
                      }}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold rounded-lg transition"
                    >
                      Pilih Semua
                    </button>
                    <button
                      onClick={() => {
                        setSelectedImportGoldTypes([]);
                        setImportHargaTaksir24K(false);
                      }}
                      className="px-2.5 py-1 bg-white/50 hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-700 font-bold rounded-lg transition"
                    >
                      Kosongkan
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                  {/* Harga Taksir 24K Option */}
                  <button
                    onClick={() => setImportHargaTaksir24K(!importHargaTaksir24K)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                      importHargaTaksir24K
                        ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 shadow-sm shadow-amber-500/5'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className={`w-3 h-3 rounded flex items-center justify-center border transition-all ${
                      importHargaTaksir24K ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {importHargaTaksir24K && (
                        <svg className="w-2.5 h-2.5 stroke-[4px] stroke-current" fill="none" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      )}
                    </div>
                    Harga Taksir 24K (Flat)
                  </button>

                  {importedGoldTypes.map((typeName) => {
                    const isSelected = selectedImportGoldTypes.includes(typeName);
                    return (
                      <button
                        key={typeName}
                        onClick={() => {
                          if (isSelected) {
                            setSelectedImportGoldTypes(selectedImportGoldTypes.filter((t) => t !== typeName));
                          } else {
                            setSelectedImportGoldTypes([...selectedImportGoldTypes, typeName]);
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                          isSelected
                            ? 'bg-amber-500/10 border-amber-500/40 text-amber-700 shadow-sm shadow-amber-500/5'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        <div className={`w-3 h-3 rounded flex items-center justify-center border transition-all ${
                          isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-300 bg-white'
                        }`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 stroke-[4px] stroke-current" fill="none" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </div>
                        {typeName}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preview Table */}
              <div className="flex-1 overflow-auto border border-slate-200 rounded-xl bg-white">
                <table className="w-full text-left text-xs text-slate-700 border-collapse min-w-max">
                  <thead className="bg-slate-50 sticky top-0 text-slate-600 font-bold border-b border-slate-200 z-10">
                    <tr>
                      <th className="p-3 text-left border-r border-slate-200" rowSpan={2}>Tanggal</th>
                      {importHargaTaksir24K && (
                        <th className="p-3 text-right border-r border-slate-200" rowSpan={2}>Harga Taksir 24K</th>
                      )}
                      {importedGoldTypes.map((typeName) => {
                        const isSelected = selectedImportGoldTypes.includes(typeName);
                        if (!isSelected) return null;
                        return (
                          <th key={typeName} className="p-2 text-center border-r border-slate-200 text-[11px] text-slate-800" colSpan={2}>
                            {typeName}
                          </th>
                        );
                      })}
                    </tr>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-500">
                      {importedGoldTypes.map((typeName) => {
                        const isSelected = selectedImportGoldTypes.includes(typeName);
                        if (!isSelected) return null;
                        return (
                          <React.Fragment key={`${typeName}-sub`}>
                            <th className="p-1.5 text-right border-r border-slate-200 font-medium">Beli</th>
                            <th className="p-1.5 text-right border-r border-slate-200 font-medium text-amber-600">Buyback</th>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(Object.entries(importDataMap) as [string, {
                      hargaTaksir24K: number;
                      prices: Record<string, number>;
                      buybackPrices: Record<string, number>;
                    }][]).slice(0, 15).map(([dateStr, data]) => {
                      return (
                        <tr key={dateStr} className="hover:bg-slate-50 font-medium border-b border-slate-100">
                          <td className="p-3 font-mono font-bold text-amber-600 whitespace-nowrap border-r border-slate-200">{dateStr}</td>
                          {importHargaTaksir24K && (
                            <td className="p-3 text-right font-mono text-slate-800 whitespace-nowrap border-r border-slate-200">
                              {data.hargaTaksir24K > 0 ? `Rp ${formatRibuan(data.hargaTaksir24K)}` : '-'}
                            </td>
                          )}
                          {importedGoldTypes.map((typeName) => {
                            const isSelected = selectedImportGoldTypes.includes(typeName);
                            if (!isSelected) return null;
                            const buyPrice = data.prices?.[typeName];
                            const buybackPrice = data.buybackPrices?.[typeName];
                            return (
                              <React.Fragment key={`${dateStr}-${typeName}`}>
                                <td className="p-3 text-right font-mono whitespace-nowrap text-emerald-600 border-r border-slate-200">
                                  {buyPrice !== undefined && buyPrice !== null ? `Rp ${formatRibuan(buyPrice)}` : '-'}
                                </td>
                                <td className="p-3 text-right font-mono whitespace-nowrap text-amber-600 border-r border-slate-200">
                                  {buybackPrice !== undefined && buybackPrice !== null ? `Rp ${formatRibuan(buybackPrice)}` : '-'}
                                </td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {Object.keys(importDataMap).length > 15 && (
                <p className="text-[11px] text-slate-500 text-center italic">
                  Menampilkan 15 tanggal pertama dari total {Object.keys(importDataMap).length} tanggal.
                </p>
              )}

              {/* Action Footer */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  onClick={() => setShowImportModal(false)}
                  disabled={importing}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-bold transition"
                >
                  Batal
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importing}
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold flex items-center gap-2 shadow-lg transition"
                >
                  {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                  Proses Import ke Database
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Live Market API Modal - Light Mode & Compact */}
        {showLiveMarket && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowLiveMarket(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-3.5 sm:p-5 max-w-5xl w-full shadow-2xl space-y-3.5 max-h-[90vh] flex flex-col"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shrink-0">
                    <Globe size={18} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base text-slate-900">Live Pasar Emas</h3>
                    <span className="bg-emerald-100 text-emerald-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                      18 ENDPOINTS LIVE
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  {hasWriteAccess && (
                    <button
                      onClick={handleSyncLiveToday}
                      disabled={saving}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs px-3 py-1.5 rounded-lg transition shadow-xs flex items-center gap-1.5"
                      title="Sync manual: simpan semua 18 harga sumber emas ke riwayat harian hari ini"
                    >
                      {saving ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
                      Auto-Simpan Riwayat Hari Ini
                    </button>
                  )}
                  <button
                    onClick={handleFetchLiveMarketData}
                    disabled={loadingLiveMarket}
                    className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 hover:text-slate-900 transition border border-slate-200"
                    title="Refresh Data All 18 Sources"
                  >
                    <RefreshCw size={14} className={loadingLiveMarket ? 'animate-spin' : ''} />
                  </button>
                  <button
                    onClick={() => setShowLiveMarket(false)}
                    className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition border border-slate-200"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Grid 18 items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 overflow-y-auto pr-1 flex-1 min-h-[280px]">
                {ALL_GOLD_SOURCES.map((sourceInfo) => {
                  const items = liveMarketData[sourceInfo.id] || [];
                  const parsed = parsePrimaryPriceFromItems(items, sourceInfo.id);

                  return (
                    <div
                      key={sourceInfo.id}
                      className="bg-slate-50/90 border border-slate-200 p-3 rounded-xl space-y-2 hover:border-amber-400 hover:shadow-md transition flex flex-col justify-between"
                    >
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-start gap-1">
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 truncate" title={sourceInfo.name}>{sourceInfo.name}</h4>
                            <span className="text-[10px] text-slate-500 block font-medium truncate">{sourceInfo.sourceName}</span>
                          </div>
                          <span className="text-[9px] bg-slate-200 text-slate-700 font-mono px-1.5 py-0.5 rounded shrink-0">
                            {items.length > 0 ? `${items.length} item` : '0 item'}
                          </span>
                        </div>

                        <div className="space-y-1 bg-white p-2 rounded-lg border border-slate-200/80 shadow-2xs">
                          <div className="flex justify-between items-baseline">
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">Harga Jual:</span>
                            <span className="text-xs font-extrabold font-mono text-emerald-700">
                              {parsed.sellPrice ? `Rp ${formatRibuan(parsed.sellPrice)}` : '-'}
                            </span>
                          </div>
                          <div className="flex justify-between items-baseline">
                            <span className="text-[10px] text-slate-500 font-semibold uppercase">Buyback:</span>
                            <span className="text-xs font-bold font-mono text-amber-700">
                              {parsed.buybackPrice ? `Rp ${formatRibuan(parsed.buybackPrice)}` : '-'}
                            </span>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-500 truncate leading-snug" title={parsed.materialType || sourceInfo.defaultDesc}>
                          ℹ️ {parsed.materialType ? parsed.materialType : sourceInfo.defaultDesc}
                        </p>
                      </div>

                      {hasWriteAccess && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowLiveMarket(false);
                            openHistoryModal(null);
                            handleAutoFillFromApi();
                          }}
                          className="w-full text-[10px] bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-950 border border-slate-200 font-bold py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1 mt-1 shadow-2xs"
                        >
                          + Gunakan di Form Input
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
                <span>Sumber Data: <strong className="text-slate-700">18 Endpoints Logam Mulia API (iamutaki/workers)</strong></span>
                <div className="flex items-center gap-2">
                  {hasWriteAccess && (
                    <button
                      onClick={handleImportAllGoldSourcesFromApi}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-3 py-1.5 rounded-lg transition text-xs flex items-center gap-1 shadow-xs"
                    >
                      <Plus size={13} /> Tambah 18 Jenis Emas Ke Katalog
                    </button>
                  )}
                  <button
                    onClick={() => setShowLiveMarket(false)}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition"
                  >
                    Tutup
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {/* Kelola Jenis Emas Modal - Light Mode & Compact */}
        {showTypeSettings && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowTypeSettings(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-3.5 sm:p-5 max-w-4xl w-full shadow-2xl space-y-3.5 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center border border-purple-200 shrink-0">
                    <Settings size={18} />
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Kelola &amp; Kustomisasi Jenis Emas</h3>
                </div>

                <button
                  onClick={() => setShowTypeSettings(false)}
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition border border-slate-200"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 2-Column Content */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 overflow-y-auto pr-1 flex-1 min-h-[320px]">
                {/* Active Gold Types List (2 cols) */}
                <div className="lg:col-span-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                      Jenis Emas Aktif ({activeGoldTypes.length})
                    </h4>
                  </div>

                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1.5">
                    {activeGoldTypes.map((type) => {
                      const desc = goldTypeDescriptions[type];
                      const source = goldTypeSources[type];
                      const category = goldTypeCategories[type];
                      const isEditing = editingTypeDescName === type;

                      return (
                        <div
                          key={type}
                          className="bg-slate-50/90 border border-slate-200 rounded-xl p-2.5 space-y-1.5 hover:border-slate-300 transition shadow-2xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                              <span className="font-bold text-slate-900 text-xs">{type}</span>
                              {source && !isEditing && (
                                <span className="bg-amber-100 text-amber-900 text-[10px] font-semibold px-2 py-0.5 rounded border border-amber-200">
                                  {source}
                                </span>
                              )}
                              {category && !isEditing && (
                                <span className="bg-blue-100 text-blue-900 text-[10px] font-semibold px-2 py-0.5 rounded border border-blue-200">
                                  {category}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {!isEditing && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTypeDescName(type);
                                    setEditingTypeDescValue(desc || '');
                                    setEditingTypeSourceValue(source || '');
                                    setEditingTypeCategoryValue(category || '');
                                  }}
                                  className="text-xs text-slate-500 hover:text-amber-700 hover:bg-amber-50 p-1 rounded font-medium transition"
                                  title="Edit Info"
                                >
                                  <Edit size={13} />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setGoldTypeToDelete(type)}
                                className="text-slate-400 hover:text-rose-600 hover:bg-rose-50 font-bold text-sm p-1 rounded transition"
                                title={`Hapus ${type}`}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {isEditing ? (
                            <div className="space-y-2 pt-2 border-t border-slate-200 bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Deskripsi</label>
                                <input
                                  type="text"
                                  value={editingTypeDescValue}
                                  onChange={(e) => setEditingTypeDescValue(e.target.value)}
                                  placeholder="Deskripsi jenis emas..."
                                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 w-full focus:outline-none focus:border-amber-500 focus:bg-white"
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Sumber Data</label>
                                  <input
                                    type="text"
                                    value={editingTypeSourceValue}
                                    onChange={(e) => setEditingTypeSourceValue(e.target.value)}
                                    placeholder="cth: Logam Mulia"
                                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 w-full focus:outline-none focus:border-amber-500 focus:bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Kategori</label>
                                  <input
                                    type="text"
                                    value={editingTypeCategoryValue}
                                    onChange={(e) => setEditingTypeCategoryValue(e.target.value)}
                                    placeholder="cth: Batangan"
                                    className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-900 w-full focus:outline-none focus:border-amber-500 focus:bg-white"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end gap-1.5 pt-1">
                                <button
                                  type="button"
                                  onClick={() => setEditingTypeDescName(null)}
                                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-2.5 py-1 rounded-lg text-xs transition border border-slate-200"
                                >
                                  Batal
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleSaveTypeMeta(type, editingTypeDescValue, editingTypeSourceValue, editingTypeCategoryValue)}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded-lg text-xs transition shadow-2xs"
                                >
                                  Simpan
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-[11px] text-slate-600 leading-normal">
                              {desc ? desc : <span className="text-slate-400 italic">Tidak ada deskripsi</span>}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Add New Type Form (1 col) */}
                <div className="space-y-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 h-fit shadow-2xs">
                  <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Plus size={14} className="text-amber-600" /> Tambah Jenis Baru
                  </label>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Nama Emas <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newTypeName}
                        onChange={(e) => setNewTypeName(e.target.value)}
                        placeholder="cth: UBS Press, Antam Retro"
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Deskripsi <span className="text-slate-400">(Opsional)</span>
                      </label>
                      <textarea
                        value={newTypeDescription}
                        onChange={(e) => setNewTypeDescription(e.target.value)}
                        placeholder="cth: Emas batangan UBS press"
                        rows={2}
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 w-full resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Sumber Data <span className="text-slate-400">(Opsional)</span>
                      </label>
                      <input
                        type="text"
                        value={newTypeSource}
                        onChange={(e) => setNewTypeSource(e.target.value)}
                        placeholder="cth: Logam Mulia, Galeri 24"
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 w-full"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-0.5">
                        Kategori <span className="text-slate-400">(Opsional)</span>
                      </label>
                      <input
                        type="text"
                        value={newTypeCategory}
                        onChange={(e) => setNewTypeCategory(e.target.value)}
                        placeholder="cth: Batangan, Perhiasan"
                        className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 w-full"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddGoldType}
                      className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold px-3.5 py-2 rounded-xl text-xs shadow transition w-full flex items-center justify-center gap-1.5 mt-1"
                    >
                      <Plus size={14} /> Tambah Jenis Emas
                    </button>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowTypeSettings(false)}
                  className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition border border-slate-200"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Column Filter Modal - Light Mode & Compact */}
        {showColumnFilter && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowColumnFilter(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-3.5 sm:p-5 max-w-4xl w-full shadow-2xl space-y-3.5 max-h-[90vh] flex flex-col"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200">
                    <Columns size={18} />
                  </div>
                  <h3 className="font-bold text-base text-slate-900">Filter Kolom Tabel Emas</h3>
                </div>

                <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={showAllColumns}
                    className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 transition"
                  >
                    Tampilkan Semua ({activeGoldTypes.length})
                  </button>
                  <button
                    type="button"
                    onClick={hideAllColumns}
                    className="text-xs font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 px-2.5 py-1 rounded-lg border border-rose-200 transition"
                  >
                    Sembunyikan Semua
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowColumnFilter(false)}
                    className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition border border-slate-200"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Grouped Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 overflow-y-auto pr-1 flex-1 min-h-[280px]">
                {Object.keys(groupedGoldTypesBySource).map((sourceName) => {
                  const typesInGroup = groupedGoldTypesBySource[sourceName];
                  const visibleInGroupCount = typesInGroup.filter((t) => !hiddenGoldTypes[t]).length;
                  const allInGroupVisible = visibleInGroupCount === typesInGroup.length;

                  return (
                    <div
                      key={sourceName}
                      className="bg-slate-50/90 border border-slate-200 rounded-xl p-3 space-y-2 shadow-2xs"
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5">
                        <div className="flex items-center gap-1.5 truncate">
                          <span className="text-amber-800 font-extrabold text-xs">Sumber:</span>
                          <span className="font-extrabold text-slate-900 text-xs truncate" title={sourceName}>
                            {sourceName}
                          </span>
                          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded-full font-mono">
                            {visibleInGroupCount}/{typesInGroup.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleSourceGroup(sourceName, typesInGroup)}
                          className="text-[10px] font-bold text-amber-900 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded border border-amber-300 transition"
                        >
                          {allInGroupVisible ? 'Sembunyikan' : 'Pilih Semua'}
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {typesInGroup.map((type) => {
                          const isVisible = !hiddenGoldTypes[type];
                          return (
                            <button
                              type="button"
                              key={type}
                              onClick={() => toggleTypeVisibility(type)}
                              className={`text-xs font-semibold px-2 py-1 rounded-lg border transition flex items-center gap-1.5 ${
                                isVisible
                                  ? 'bg-amber-500 text-slate-950 font-extrabold border-amber-400 shadow-2xs hover:bg-amber-600'
                                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400 hover:bg-slate-100'
                              }`}
                            >
                              {isVisible ? <Eye size={12} className="text-slate-950" /> : <EyeOff size={12} className="text-slate-400" />}
                              <span>{type}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex justify-end pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowColumnFilter(false)}
                  className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-extrabold shadow transition"
                >
                  Selesai
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Delete History Entry Confirmation Modal */}
        {historyToDelete && (
          <div
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget && !deletingHistory) setHistoryToDelete(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white border border-slate-200 text-slate-800 rounded-2xl p-4 sm:p-5 max-w-md w-full shadow-2xl space-y-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200">
                  <AlertCircle size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base text-slate-900">Konfirmasi Hapus Riwayat</h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Apakah Anda yakin ingin menghapus seluruh data riwayat harga emas tanggal{' '}
                    <span className="font-extrabold text-slate-900 font-mono bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                      {historyToDelete.date.split('-').reverse().join('/')}
                    </span>
                    ? Tindakan ini tidak dapat dibatalkan.
                  </p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Harga Taksir 24K:</span>
                  <span className="font-bold text-slate-900 font-mono">
                    Rp {formatRibuan(historyToDelete.hargaTaksir24K)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Total Jenis Emas:</span>
                  <span className="font-bold text-slate-900">
                    {Object.keys(historyToDelete.prices || {}).length} item terdaftar
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={deletingHistory}
                  onClick={() => setHistoryToDelete(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition disabled:opacity-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  disabled={deletingHistory}
                  onClick={confirmDeleteHistoryEntry}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white shadow-xs hover:shadow transition flex items-center gap-1.5 disabled:opacity-50"
                >
                  {deletingHistory ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Menghapus...
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} /> Hapus Riwayat
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
