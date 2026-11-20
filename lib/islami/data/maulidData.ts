import { KitabMaulidInfo } from '../types/maulid';
import rawData from './maulidKitabStore.json';

export const DAFTAR_KITAB_MAULID: KitabMaulidInfo[] = rawData as KitabMaulidInfo[];

export function getKitabById(id: string): KitabMaulidInfo | undefined {
  return DAFTAR_KITAB_MAULID.find((k) => k.id === id);
}
