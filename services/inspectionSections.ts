// services/inspectionSections.ts
// Phase 3: AutoInspect section/item catalog + progress/status/validation logic.
// Stable IDs matter: they will later be consumed by PDF generation, validation,
// backend/API and the Flutter app. Do not rename existing IDs.

import {
  Inspection,
  InspectionItemStatus,
  InspectionLifecycleStatus,
  SectionItemState,
  Vehicle,
  VehicleSectionState,
} from '../types.ts';

export interface SectionItemDef {
  id: string;
  label: string;
  /** Photo evidence required for the inspection to be COMPLETED. */
  photoRequired: boolean;
  /**
   * Status decision required for COMPLETED. Defaults to true when omitted —
   * every checklist item needs an explicit status (Not Available counts).
   */
  statusRequired?: boolean;
  hint?: string;
}

export const isStatusRequired = (item: SectionItemDef): boolean =>
  item.statusRequired !== false;

/** Valid inspection decisions — "Not Available" counts as inspected. */
const VALID_STATUSES: ReadonlySet<string> = new Set([
  'good',
  'fair',
  'poor',
  'needs_attention',
  'not_available',
]);

export const isValidStatus = (s: unknown): boolean =>
  typeof s === 'string' && VALID_STATUSES.has(s);

/**
 * A required photo counts only with real image data — never empty objects,
 * broken data URLs, null/undefined, or preview-only slots.
 */
export const hasValidPhoto = (
  photo: { base64?: string | null; preview?: string | null } | null | undefined,
): boolean => {
  const b64 = photo?.base64;
  if (typeof b64 !== 'string' || b64.length < 100) return false;
  if (b64.startsWith('data:')) return b64.startsWith('data:image');
  return true; // bare base64 payload
};

/** Vehicle-detail fields required for COMPLETED (label for reporting). */
export const REQUIRED_DETAIL_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'registrationNumber', label: 'Registration Number' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'fuelType', label: 'Fuel Type' },
  { key: 'odometerKm', label: 'Kilometres / Odometer' },
];

export interface InspectionSectionDef {
  id: string;
  title: string;
  subtitle?: string;
  items: SectionItemDef[];
}

export type WizardStepId =
  | 'vehicle_details'
  | 'exterior'
  | 'tyres'
  | 'electricals'
  | 'interior'
  | 'engine'
  | 'ac'
  | 'comments';

export interface WizardStepDef {
  id: WizardStepId;
  title: string;
  sectionId?: string; // set for the six inspection sections
}

export const WIZARD_STEPS: WizardStepDef[] = [
  { id: 'vehicle_details', title: 'Vehicle Details' },
  { id: 'exterior', title: 'Exterior', sectionId: 'exterior' },
  { id: 'tyres', title: 'Tyres', sectionId: 'tyres' },
  { id: 'electricals', title: 'Electricals', sectionId: 'electricals' },
  { id: 'interior', title: 'Interior', sectionId: 'interior' },
  { id: 'engine', title: 'Engine & Transmission', sectionId: 'engine' },
  { id: 'ac', title: 'AC', sectionId: 'ac' },
  { id: 'comments', title: 'Comments' },
];

export const isWizardStepId = (v: unknown): v is WizardStepId =>
  typeof v === 'string' && (WIZARD_STEPS as WizardStepDef[]).some((s) => s.id === v);

export const ITEM_STATUSES: Array<{ id: InspectionItemStatus; label: string }> = [
  { id: 'good', label: 'Good' },
  { id: 'fair', label: 'Fair' },
  { id: 'poor', label: 'Poor' },
  { id: 'needs_attention', label: 'Needs Attention' },
  { id: 'not_available', label: 'Not Available' },
];

export const INSPECTION_SECTIONS: InspectionSectionDef[] = [
  {
    id: 'exterior',
    title: 'Exterior',
    subtitle: 'Capture each required exterior photo point.',
    items: [
      { id: 'EXTERIOR_FRONT_MAIN', label: 'Front Main', photoRequired: true },
      { id: 'EXTERIOR_FRONT_RIGHT', label: 'Front Right Side', photoRequired: true },
      { id: 'EXTERIOR_FRONT_LEFT', label: 'Front Left Side', photoRequired: true },
      { id: 'EXTERIOR_LEFT_MAIN', label: 'Left Main', photoRequired: true },
      { id: 'EXTERIOR_REAR_LEFT', label: 'Rear Left Side', photoRequired: true },
      { id: 'EXTERIOR_REAR_MAIN', label: 'Rear Main', photoRequired: true },
      { id: 'EXTERIOR_REAR_RIGHT', label: 'Rear Right Side', photoRequired: true },
      { id: 'EXTERIOR_RIGHT_MAIN', label: 'Right Main', photoRequired: true },
      { id: 'EXTERIOR_REAR_BOOT_OPEN', label: 'Rear Boot Opened', photoRequired: true },
    ],
  },
  {
    id: 'tyres',
    title: 'Tyres',
    subtitle: 'Record condition and capture photo evidence per tyre.',
    items: [
      { id: 'TYRES_LHS_FRONT', label: 'LHS Front Tyre', photoRequired: false },
      { id: 'TYRES_RHS_FRONT', label: 'RHS Front Tyre', photoRequired: false },
      { id: 'TYRES_LHS_REAR', label: 'LHS Rear Tyre', photoRequired: false },
      { id: 'TYRES_RHS_REAR', label: 'RHS Rear Tyre', photoRequired: false },
      { id: 'TYRES_SPARE', label: 'Spare Tyre', photoRequired: false },
    ],
  },
  {
    id: 'electricals',
    title: 'Electricals',
    subtitle: 'Check electrical items; add photos where useful.',
    items: [
      { id: 'ELECTRICALS_ODOMETER', label: 'Odometer', photoRequired: false, hint: 'Photo of the odometer reading is recommended.' },
      { id: 'ELECTRICALS_ELECTRICAL', label: 'Electrical', photoRequired: false },
      { id: 'ELECTRICALS_BATTERY', label: 'Battery', photoRequired: false },
      { id: 'ELECTRICALS_AIRBAG', label: 'Airbag Feature', photoRequired: false },
      { id: 'ELECTRICALS_MUSIC_SYSTEM', label: 'Music System', photoRequired: false },
    ],
  },
  {
    id: 'interior',
    title: 'Interior',
    subtitle: 'Record interior condition with photo evidence.',
    items: [
      { id: 'INTERIOR_DRIVER_SEAT', label: 'Driver Seat', photoRequired: false },
      { id: 'INTERIOR_SECOND_ROW_SEAT', label: 'Second Row Seat', photoRequired: false },
      { id: 'INTERIOR_DASHBOARD', label: 'Dashboard', photoRequired: false },
      { id: 'INTERIOR_LEATHER_SEAT', label: 'Leather Seat', photoRequired: false },
      { id: 'INTERIOR_FABRIC_SEAT', label: 'Fabric Seat', photoRequired: false },
    ],
  },
  {
    id: 'engine',
    title: 'Engine & Transmission',
    subtitle: 'Record status and comments; photos where appropriate.',
    items: [
      { id: 'ENGINE_ENGINE', label: 'Engine', photoRequired: false },
      { id: 'ENGINE_COOLANT', label: 'Coolant', photoRequired: false },
      { id: 'ENGINE_SOUND', label: 'Engine Sound', photoRequired: false },
      { id: 'ENGINE_EXHAUST_SMOKE', label: 'Exhaust Smoke', photoRequired: false },
      { id: 'ENGINE_CLUTCH', label: 'Clutch', photoRequired: false },
      { id: 'ENGINE_GEAR_SHIFTING', label: 'Gear Shifting', photoRequired: false },
      { id: 'ENGINE_TURBO_CHARGER', label: 'Turbo Charger', photoRequired: false },
      { id: 'ENGINE_FUEL_INJECTOR', label: 'Fuel Injector', photoRequired: false },
    ],
  },
  {
    id: 'ac',
    title: 'AC',
    subtitle: 'Check AC and heater operation.',
    items: [
      { id: 'AC_COOLING', label: 'AC Cooling', photoRequired: false },
      { id: 'AC_HEATER', label: 'Heater', photoRequired: false },
      { id: 'AC_COMPRESSOR', label: 'AC Compressor', photoRequired: false },
    ],
  },
];

export const getSectionDef = (sectionId: string): InspectionSectionDef | undefined =>
  INSPECTION_SECTIONS.find((s) => s.id === sectionId);

/** Lazily read (never persist here) a vehicle's section state. */
export const getVehicleSection = (
  vehicle: Vehicle,
  sectionId: string,
): VehicleSectionState => {
  const existing = vehicle.sections?.[sectionId];
  if (existing && typeof existing === 'object' && existing.items && typeof existing.items === 'object') {
    return existing;
  }
  return { items: {} };
};

export const getItemState = (
  vehicle: Vehicle,
  sectionId: string,
  itemId: string,
): SectionItemState => {
  return getVehicleSection(vehicle, sectionId).items[itemId] ?? {};
};

const hasPhoto = (s: SectionItemState): boolean => !!s.photo?.base64;
const hasAnyData = (s: SectionItemState): boolean =>
  !!s.status || !!s.photo?.base64 || !!(s.comment && s.comment.trim() !== '');

export type MissingKind = 'field' | 'photo' | 'status';

export interface MissingItem {
  vehicleIndex: number;
  sectionId: string;
  sectionTitle: string;
  itemId: string | null; // null → vehicle-level field
  label: string;
  kind: MissingKind;
}

export interface MissingSectionSummary {
  vehicleIndex: number;
  sectionId: string;
  sectionTitle: string;
  missingCount: number;
}

export interface InspectionValidationResult {
  isComplete: boolean;
  missingVehicleFields: MissingItem[];
  missingPhotos: MissingItem[];
  missingStatuses: MissingItem[];
  missingSections: MissingSectionSummary[];
  totalRequired: number;
  totalCompleted: number;
}

/**
 * Required for COMPLETED, per vehicle:
 * - 5 vehicle-detail fields (reg. number, make, model, fuel, odometer)
 * - every photoRequired item (Exterior 9) with a VALID photo
 * - every statusRequired item with a valid status (Not Available counts)
 */
export const getMissingRequired = (inspection: Inspection): MissingItem[] =>
  validateInspection(inspection).allMissing;

const REQUIRED_PER_VEHICLE =
  REQUIRED_DETAIL_FIELDS.length +
  INSPECTION_SECTIONS.reduce(
    (acc, s) => acc + s.items.filter((i) => i.photoRequired).length,
    0,
  ) +
  INSPECTION_SECTIONS.reduce(
    (acc, s) => acc + s.items.filter((i) => isStatusRequired(i)).length,
    0,
  );

export const validateInspection = (
  inspection: Inspection,
): InspectionValidationResult & { allMissing: MissingItem[] } => {
  const missingVehicleFields: MissingItem[] = [];
  const missingPhotos: MissingItem[] = [];
  const missingStatuses: MissingItem[] = [];
  let totalCompleted = 0;

  inspection.vehicles.forEach((vehicle, vehicleIndex) => {
    const flat = vehicle as unknown as Record<string, unknown>;
    for (const field of REQUIRED_DETAIL_FIELDS) {
      const v = flat[field.key];
      if (typeof v === 'string' ? v.trim() !== '' : !!v) {
        totalCompleted += 1;
      } else {
        missingVehicleFields.push({
          vehicleIndex,
          sectionId: 'vehicle_details',
          sectionTitle: 'Vehicle Details',
          itemId: null,
          label: field.label,
          kind: 'field',
        });
      }
    }
    for (const section of INSPECTION_SECTIONS) {
      for (const item of section.items) {
        const state = getItemState(vehicle, section.id, item.id);
        if (item.photoRequired) {
          if (hasValidPhoto(state.photo)) {
            totalCompleted += 1;
          } else {
            missingPhotos.push({
              vehicleIndex,
              sectionId: section.id,
              sectionTitle: section.title,
              itemId: item.id,
              label: `${item.label} photo`,
              kind: 'photo',
            });
          }
        }
        if (isStatusRequired(item)) {
          if (isValidStatus(state.status)) {
            totalCompleted += 1;
          } else {
            missingStatuses.push({
              vehicleIndex,
              sectionId: section.id,
              sectionTitle: section.title,
              itemId: item.id,
              label: `${item.label} status`,
              kind: 'status',
            });
          }
        }
      }
    }
  });

  const allMissing = [...missingVehicleFields, ...missingPhotos, ...missingStatuses];
  const totalRequired = inspection.vehicles.length * REQUIRED_PER_VEHICLE;

  const bySection = new Map<string, MissingSectionSummary>();
  for (const m of allMissing) {
    const key = `${m.vehicleIndex}|${m.sectionId}`;
    const existing = bySection.get(key);
    if (existing) {
      existing.missingCount += 1;
    } else {
      bySection.set(key, {
        vehicleIndex: m.vehicleIndex,
        sectionId: m.sectionId,
        sectionTitle: m.sectionTitle,
        missingCount: 1,
      });
    }
  }

  return {
    isComplete: allMissing.length === 0 && inspection.vehicles.length > 0,
    missingVehicleFields,
    missingPhotos,
    missingStatuses,
    missingSections: [...bySection.values()],
    totalRequired,
    totalCompleted,
    allMissing,
  };
};

export interface SectionProgress {
  sectionId: string;
  title: string;
  done: number;
  total: number;
}

export interface VehicleProgress {
  vehicleIndex: number;
  sections: SectionProgress[];
  /** 0..1 required items completed / total required (deterministic). */
  overall: number;
  requiredDone: number;
  requiredTotal: number;
  missingRequired: MissingItem[];
  requiredMet: boolean;
}

export const getVehicleProgress = (
  vehicle: Vehicle,
  vehicleIndex: number,
  validation?: InspectionValidationResult & { allMissing: MissingItem[] },
): VehicleProgress => {
  // Section bars keep showing entry activity; overall % is required-based.
  const sections: SectionProgress[] = INSPECTION_SECTIONS.map((section) => {
    let done = 0;
    for (const item of section.items) {
      if (hasAnyData(getItemState(vehicle, section.id, item.id))) done += 1;
    }
    return { sectionId: section.id, title: section.title, done, total: section.items.length };
  });

  const v = validation ?? validateInspection({ vehicles: [vehicle] } as Inspection);
  const mine = v.allMissing.filter((m) => m.vehicleIndex === (validation ? vehicleIndex : 0));
  const requiredTotal = REQUIRED_PER_VEHICLE;
  const requiredDone = Math.max(0, requiredTotal - mine.length);

  return {
    vehicleIndex,
    sections,
    overall: requiredTotal === 0 ? 0 : requiredDone / requiredTotal,
    requiredDone,
    requiredTotal,
    missingRequired: mine,
    requiredMet: mine.length === 0,
  };
};

export interface InspectionProgress {
  vehicles: VehicleProgress[];
  /** 0..1 required items completed / total required (mean across vehicles). */
  overall: number;
  requiredDone: number;
  requiredTotal: number;
  missingRequired: MissingItem[];
  requiredMet: boolean;
}

export const getInspectionProgress = (inspection: Inspection): InspectionProgress => {
  const validation = validateInspection(inspection);
  const vehicles = inspection.vehicles.map((v, i) => getVehicleProgress(v, i, validation));
  const overall =
    validation.totalRequired === 0
      ? 0
      : validation.totalCompleted / validation.totalRequired;
  return {
    vehicles,
    overall,
    requiredDone: validation.totalCompleted,
    requiredTotal: validation.totalRequired,
    missingRequired: validation.allMissing,
    requiredMet: validation.isComplete,
  };
};

const inspectionHasAnyData = (inspection: Inspection): boolean => {
  if ((inspection.agentName || '').trim() !== '') return true;
  if ((inspection.insuredName || '').trim() !== '') return true;
  if ((inspection.policyNumber || '').trim() !== '') return true;
  if ((inspection.comments || '').trim() !== '') return true;
  for (const v of inspection.vehicles) {
    const flat = v as unknown as Record<string, unknown>;
    for (const key of Object.keys(flat)) {
      if (key === 'photos' || key === 'sections' || key === 'clientId') continue;
      const val = flat[key];
      if (typeof val === 'string' && val.trim() !== '') return true;
    }
    if (v.generalComment && v.generalComment.trim() !== '') return true;
    if (v.photos && Object.values(v.photos).some((p) => p?.base64)) return true;
    const sections = v.sections ?? {};
    for (const section of Object.values(sections)) {
      if (section && typeof section === 'object') {
        if (Object.values(section.items ?? {}).some((s) => s && hasAnyData(s))) return true;
      }
    }
  }
  return false;
};

/**
 * Single source of truth for lifecycle status. Keeps the legacy
 * `pdfGenerated` boolean as the source of truth for "a PDF was made",
 * layered with updatedAt/pdfGeneratedAt for staleness. updatedAt is stamped
 * on every content mutation, so any post-PDF edit flips to PDF_STALE.
 */
export const getInspectionStatus = (
  inspection: Inspection & { pdfGenerated?: boolean },
): InspectionLifecycleStatus => {
  if (inspection.pdfGenerated) {
    const updated = inspection.updatedAt ?? '';
    const generatedAt = inspection.pdfGeneratedAt ?? '';
    if (generatedAt !== '' && updated !== '' && updated > generatedAt) {
      return 'PDF_STALE';
    }
    return 'PDF_GENERATED';
  }
  if (validateInspection(inspection).isComplete) {
    return 'COMPLETED';
  }
  return inspectionHasAnyData(inspection) ? 'IN_PROGRESS' : 'DRAFT';
};

/** Canonical name for the lifecycle helper (alias of getInspectionStatus). */
export const getInspectionLifecycleStatus = getInspectionStatus;

export const STATUS_LABELS: Record<InspectionLifecycleStatus, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  PDF_GENERATED: 'PDF Generated',
  PDF_STALE: 'PDF Outdated',
};
