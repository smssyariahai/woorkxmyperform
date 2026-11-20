import { ProphetItem } from './types';
import { PROPHETS_1_TO_5 } from './prophets1to5';
import { PROPHETS_6_TO_10 } from './prophets6to10';
import { PROPHETS_11_TO_15 } from './prophets11to15';
import { PROPHETS_16_TO_20 } from './prophets16to20';
import { PROPHETS_21_TO_25 } from './prophets21to25';

export * from './types';

export const PROPHETS_DATA: ProphetItem[] = [
  ...PROPHETS_1_TO_5,
  ...PROPHETS_6_TO_10,
  ...PROPHETS_11_TO_15,
  ...PROPHETS_16_TO_20,
  ...PROPHETS_21_TO_25,
];

export function getProphetById(id: string): ProphetItem | undefined {
  return PROPHETS_DATA.find((p) => p.id.toLowerCase() === id.toLowerCase());
}

export function getProphetByOrder(order: number): ProphetItem | undefined {
  return PROPHETS_DATA.find((p) => p.order === order);
}
