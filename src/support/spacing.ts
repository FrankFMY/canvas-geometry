export type P0 = [];
export type P1 = [number] | number;
export type P2 = [vertical: number, horizontal: number];
export type P3 = [top: number, horizontal: number, bottom: number];
export type P4 = [top: number, right: number, bottom: number, left: number];
export type PN = P0 | P1 | P2 | P3 | P4;
export type SP = number | number[];
export type SP0 = [];
export type SP1 = [SP] | SP;
export type SP2 = [vertical: SP, horizontal: SP];
export type SP3 = [top: SP, horizontal: SP, bottom: SP];
export type SP4 = [top: SP, right: SP, bottom: SP, left: SP];
export type SPN = SP0 | SP1 | SP2 | SP3 | SP4;

export const pn = (value: PN = []): P4 => {
  if (typeof value === "number") return [value, value, value, value];
  if (value.length === 1) return [value[0], value[0], value[0], value[0]];
  if (value.length === 2) return [value[0], value[1], value[0], value[1]];
  if (value.length === 3) return [value[0], value[1], value[2], value[1]];
  if (value.length === 4) return [value[0], value[1], value[2], value[3]];
  return [0, 0, 0, 0];
};

export const spn = (value: SPN = []): SP4 => pn(value as PN);
