'use client';

import { useEffect, useRef, useState } from 'react';
import { Field, Input } from '@/components/ui/input';
import {
  getDistricts,
  getProvinces,
  getRegencies,
  getVillages,
  type RegionItem,
} from '@/lib/perusahaan/regions';

export interface RegionValue {
  country: string;
  province: string;
  city: string;
  district: string;
  village: string;
  postalCode: string;
}

const COUNTRIES = [
  'Indonesia',
  'Malaysia',
  'Singapura',
  'Thailand',
  'Vietnam',
  'Filipina',
  'Brunei Darussalam',
  'Kamboja',
  'Laos',
  'Myanmar',
  'Timor Leste',
  'Australia',
  'Selandia Baru',
  'Jepang',
  'Korea Selatan',
  'Tiongkok',
  'Hong Kong',
  'Taiwan',
  'India',
  'Pakistan',
  'Bangladesh',
  'Sri Lanka',
  'Nepal',
  'Arab Saudi',
  'Uni Emirat Arab',
  'Qatar',
  'Kuwait',
  'Turki',
  'Amerika Serikat',
  'Kanada',
  'Inggris',
  'Irlandia',
  'Belanda',
  'Jerman',
  'Prancis',
  'Spanyol',
  'Italia',
  'Swiss',
  'Austria',
  'Belgia',
  'Swedia',
  'Norwegia',
  'Denmark',
  'Finlandia',
  'Rusia',
  'Mesir',
  'Afrika Selatan',
  'Brasil',
  'Meksiko',
];

function findByName(list: RegionItem[], name: string): RegionItem | undefined {
  const n = name.trim().toLowerCase();
  return list.find((x) => x.name.toLowerCase() === n);
}

export function RegionPicker({
  value,
  onChange,
  disabled,
}: {
  value: RegionValue;
  onChange: (patch: Partial<RegionValue>) => void;
  disabled?: boolean;
}) {
  const isIndonesia = (value.country || 'Indonesia') === 'Indonesia';
  const [provinces, setProvinces] = useState<RegionItem[]>([]);
  const [regencies, setRegencies] = useState<RegionItem[]>([]);
  const [districts, setDistricts] = useState<RegionItem[]>([]);
  const [villages, setVillages] = useState<RegionItem[]>([]);
  const [provinceId, setProvinceId] = useState('');
  const [regencyId, setRegencyId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [loadingLevel, setLoadingLevel] = useState<string | null>(null);
  const [fetchFailed, setFetchFailed] = useState(false);
  const initDone = useRef(false);

  // Muat provinsi + selesaikan rantai ID dari nama yang sudah tersimpan.
  useEffect(() => {
    if (!isIndonesia || initDone.current) return;
    initDone.current = true;
    let cancelled = false;
    (async () => {
      try {
        setLoadingLevel('provinsi');
        const provs = await getProvinces();
        if (cancelled) return;
        setProvinces(provs);
        const prov = findByName(provs, value.province);
        if (!prov) return;
        setProvinceId(prov.id);
        setLoadingLevel('kota');
        const regs = await getRegencies(prov.id);
        if (cancelled) return;
        setRegencies(regs);
        const reg = findByName(regs, value.city);
        if (!reg) return;
        setRegencyId(reg.id);
        setLoadingLevel('kecamatan');
        const dists = await getDistricts(reg.id);
        if (cancelled) return;
        setDistricts(dists);
        const dist = findByName(dists, value.district);
        if (!dist) return;
        setDistrictId(dist.id);
        setLoadingLevel('kelurahan');
        const vils = await getVillages(dist.id);
        if (cancelled) return;
        setVillages(vils);
      } catch {
        if (!cancelled) setFetchFailed(true);
      } finally {
        if (!cancelled) setLoadingLevel(null);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIndonesia]);

  async function onProvinceChange(id: string) {
    const item = provinces.find((p) => p.id === id);
    setProvinceId(id);
    setRegencyId('');
    setDistrictId('');
    setRegencies([]);
    setDistricts([]);
    setVillages([]);
    onChange({ province: item?.name ?? '', city: '', district: '', village: '' });
    if (!id) return;
    try {
      setLoadingLevel('kota');
      setRegencies(await getRegencies(id));
    } catch {
      setFetchFailed(true);
    } finally {
      setLoadingLevel(null);
    }
  }

  async function onRegencyChange(id: string) {
    const item = regencies.find((p) => p.id === id);
    setRegencyId(id);
    setDistrictId('');
    setDistricts([]);
    setVillages([]);
    onChange({ city: item?.name ?? '', district: '', village: '' });
    if (!id) return;
    try {
      setLoadingLevel('kecamatan');
      setDistricts(await getDistricts(id));
    } catch {
      setFetchFailed(true);
    } finally {
      setLoadingLevel(null);
    }
  }

  async function onDistrictChange(id: string) {
    const item = districts.find((p) => p.id === id);
    setDistrictId(id);
    setVillages([]);
    onChange({ district: item?.name ?? '', village: '' });
    if (!id) return;
    try {
      setLoadingLevel('kelurahan');
      setVillages(await getVillages(id));
    } catch {
      setFetchFailed(true);
    } finally {
      setLoadingLevel(null);
    }
  }

  function onVillageChange(id: string) {
    const item = villages.find((p) => p.id === id);
    onChange({ village: item?.name ?? '' });
  }

  const manual = !isIndonesia || fetchFailed;

  return (
    <div className="space-y-4">
      <Field label="Negara">
        <select
          className="input"
          value={value.country || 'Indonesia'}
          onChange={(e) => onChange({ country: e.target.value })}
          disabled={disabled}
        >
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      {manual ? (
        <>
          {fetchFailed && isIndonesia && (
            <p className="text-[12px] text-amber-700 dark:text-amber-300">
              Data wilayah tidak dapat dimuat (koneksi ke layanan wilayah gagal). Silakan isi
              secara manual.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provinsi">
              <Input
                value={value.province}
                onChange={(e) => onChange({ province: e.target.value })}
                placeholder="Provinsi"
                disabled={disabled}
              />
            </Field>
            <Field label="Kota / Kabupaten">
              <Input
                value={value.city}
                onChange={(e) => onChange({ city: e.target.value })}
                placeholder="Kota / Kabupaten"
                disabled={disabled}
              />
            </Field>
            <Field label="Kecamatan">
              <Input
                value={value.district}
                onChange={(e) => onChange({ district: e.target.value })}
                placeholder="Kecamatan"
                disabled={disabled}
              />
            </Field>
            <Field label="Kelurahan / Desa">
              <Input
                value={value.village}
                onChange={(e) => onChange({ village: e.target.value })}
                placeholder="Kelurahan / Desa"
                disabled={disabled}
              />
            </Field>
          </div>
        </>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provinsi">
            <select
              className="input"
              value={provinceId}
              onChange={(e) => onProvinceChange(e.target.value)}
              disabled={disabled || loadingLevel === 'provinsi'}
            >
              <option value="">
                {loadingLevel === 'provinsi' ? 'Memuat provinsi…' : '— Pilih Provinsi —'}
              </option>
              {provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kota / Kabupaten">
            <select
              className="input"
              value={regencyId}
              onChange={(e) => onRegencyChange(e.target.value)}
              disabled={disabled || !provinceId || loadingLevel === 'kota'}
            >
              <option value="">
                {loadingLevel === 'kota'
                  ? 'Memuat kota…'
                  : provinceId
                    ? '— Pilih Kota / Kabupaten —'
                    : 'Pilih provinsi dulu'}
              </option>
              {regencies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kecamatan">
            <select
              className="input"
              value={districtId}
              onChange={(e) => onDistrictChange(e.target.value)}
              disabled={disabled || !regencyId || loadingLevel === 'kecamatan'}
            >
              <option value="">
                {loadingLevel === 'kecamatan'
                  ? 'Memuat kecamatan…'
                  : regencyId
                    ? '— Pilih Kecamatan —'
                    : 'Pilih kota dulu'}
              </option>
              {districts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kelurahan / Desa">
            <select
              className="input"
              value={villages.find((v) => v.name === value.village)?.id ?? ''}
              onChange={(e) => onVillageChange(e.target.value)}
              disabled={disabled || !districtId || loadingLevel === 'kelurahan'}
            >
              <option value="">
                {loadingLevel === 'kelurahan'
                  ? 'Memuat kelurahan…'
                  : districtId
                    ? '— Pilih Kelurahan / Desa —'
                    : 'Pilih kecamatan dulu'}
              </option>
              {villages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}

      <Field label="Kode Pos" optional>
        <Input
          value={value.postalCode}
          onChange={(e) => onChange({ postalCode: e.target.value.replace(/[^0-9]/g, '') })}
          placeholder="Contoh: 10110"
          disabled={disabled}
          inputMode="numeric"
          maxLength={10}
        />
      </Field>
    </div>
  );
}
