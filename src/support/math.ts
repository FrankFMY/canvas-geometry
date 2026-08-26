import type { Trigone } from "./types.js";

export type RoundMethod = "up" | "down" | "math";

export const round = (value: number | null | undefined, fraction = 2, method: RoundMethod = "math"): number => {
  if (value === null || value === undefined || Number.isNaN(value)) return 0;
  const factor = 10 ** fraction;
  if (method === "up") return Math.ceil(value * factor) / factor;
  if (method === "down") return Math.floor(value * factor) / factor;
  return Math.round(value * factor) / factor;
};

export const clamp = (minimum: number, value: number, maximum: number): number => Math.max(Math.min(value, maximum), minimum);
export const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;
export const toDegrees = (radians: number): number => (radians * 180) / Math.PI;
export const toTrigone = (radians: number): Trigone => [Math.sin(radians), Math.cos(radians)];
export const lerp = (start: number, end: number, weight: number): number => start + (end - start) * weight;
