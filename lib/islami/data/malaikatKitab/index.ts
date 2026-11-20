import { ANGELS_DATA } from './angelsData';
import { BOOKS_DATA } from './booksData';
import { SUHUF_DATA } from './suhufData';
import { MalaikatItem, KitabSuhufItem, MalaikatKitabItem } from './types';

export * from './types';
export * from './angelsData';
export * from './booksData';
export * from './suhufData';

export const ALL_MALAIKAT_KITAB: MalaikatKitabItem[] = [
  ...ANGELS_DATA,
  ...BOOKS_DATA,
  ...SUHUF_DATA,
];

export const getAngelById = (id: string): MalaikatItem | undefined => {
  return ANGELS_DATA.find((a) => a.id === id || `${a.order}` === id);
};

export const getBookById = (id: string): KitabSuhufItem | undefined => {
  return BOOKS_DATA.find((b) => b.id === id || `${b.order}` === id);
};

export const getSuhufById = (id: string): KitabSuhufItem | undefined => {
  return SUHUF_DATA.find((s) => s.id === id || `${s.order}` === id);
};

export const getMalaikatKitabById = (id: string): MalaikatKitabItem | undefined => {
  return ALL_MALAIKAT_KITAB.find((item) => item.id === id);
};
