export const lt = (a: number, b: number, epsilon = 1e-5): boolean => a - b < -epsilon;
export const lte = (a: number, b: number, epsilon = 1e-5): boolean => a - b <= epsilon;
export const gt = (a: number, b: number, epsilon = 1e-5): boolean => a - b > epsilon;
export const gte = (a: number, b: number, epsilon = 1e-5): boolean => a - b >= -epsilon;
export const eq = (a: number, b: number, epsilon = 1e-5): boolean => Math.abs(a - b) <= epsilon;
export const inside = (minimum: number, value: number, maximum: number, epsilon = 1e-5): boolean => gt(value, minimum, epsilon) && lt(value, maximum, epsilon);
export const insideOrEqual = (minimum: number, value: number, maximum: number, epsilon = 1e-5): boolean => gte(value, minimum, epsilon) && lte(value, maximum, epsilon);
export const outside = (minimum: number, value: number, maximum: number, epsilon = 1e-5): boolean => lt(value, minimum, epsilon) || gt(value, maximum, epsilon);
export const outsideOrEqual = (minimum: number, value: number, maximum: number, epsilon = 1e-5): boolean => lte(value, minimum, epsilon) || gte(value, maximum, epsilon);
