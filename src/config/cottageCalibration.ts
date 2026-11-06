export const COTTAGE_CALIBRATION_VARIANTS = ['A', 'B0', 'B1', 'B2', 'B3'] as const;
export type CalibrationVariant = typeof COTTAGE_CALIBRATION_VARIANTS[number];
export type TripoCalibrationVariant = Exclude<CalibrationVariant, 'A'>;
export const COTTAGE_B20_VARIANTS = ['A', 'B0', 'B1', 'B20', 'B2', 'B3'] as const;
export type CottageReviewVariant = typeof COTTAGE_B20_VARIANTS[number];
export type TripoReviewVariant = Exclude<CottageReviewVariant, 'A'>;
export const COTTAGE_CALIBRATION_VIEWS = ['golden', 'front', 'top', 'contact-front'] as const;
export interface CottageCalibrationPreset {
  p2PresetUrl: string;
  relativeScales: Record<TripoCalibrationVariant, number> & { B20?: number };
  gate?: 'P3-B0';
  contact: { lowerBandFraction: number; gridSteps: number; toleranceM: number };
  placement: { gardenMarginM: number; treeMarginM: number; minimumFrontClearanceM: number };
}
export function parseCottageB20Preset(value: unknown, baseline: CottageCalibrationPreset): CottageCalibrationPreset {
  const p = record(value);
  if (p.schemaVersion !== 1 || p.baselinePresetUrl !== '/assets/presets/cottage-candidate-01-p3-a.json' || p.relativeScale !== 1.2 || baseline.gate) {
    throw new Error('P3-B0 must add only the authorized 1.20x candidate to the original P3-A preset');
  }
  return { ...baseline, gate: 'P3-B0', relativeScales: { ...baseline.relativeScales, B20: 1.2 } };
}
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid P3-A configuration');
  return value as Record<string, unknown>;
};
const numeric = (value: unknown, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('Invalid P3-A calibration range');
  return value;
};
export function parseCottageCalibrationPreset(value: unknown): CottageCalibrationPreset {
  const p = record(value), scales = record(p.relativeScales), contact = record(p.contact), placement = record(p.placement);
  if (p.schemaVersion !== 1 || p.p2PresetUrl !== '/assets/presets/cottage-candidate-01-p2.json' ||
    scales.B0 !== 1 || scales.B1 !== 1.15 || scales.B2 !== 1.25 || scales.B3 !== 1.35) throw new Error('P3-A must retain the four authorized scales and P2 baseline');
  const gridSteps = numeric(contact.gridSteps, 8, 32);
  if (!Number.isInteger(gridSteps)) throw new Error('P3-A gridSteps must be an integer');
  return {
    p2PresetUrl: p.p2PresetUrl, relativeScales: { B0: 1, B1: 1.15, B2: 1.25, B3: 1.35 },
    contact: { gridSteps, lowerBandFraction: numeric(contact.lowerBandFraction, 0.002, 0.02), toleranceM: numeric(contact.toleranceM, 0.001, 0.02) },
    placement: { gardenMarginM: numeric(placement.gardenMarginM, 0, 0.1), treeMarginM: numeric(placement.treeMarginM, 0, 0.1), minimumFrontClearanceM: numeric(placement.minimumFrontClearanceM, 0.6, 1.6) },
  };
}
