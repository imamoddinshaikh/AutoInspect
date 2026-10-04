// services/inspectionList.ts
// Phase 6: lightweight inspection-management helpers.
// - InspectionMetadata carries ONLY list-safe data (identity fields, counts,
//   precomputed status/progress). Photo base64 payloads are never retained.
// - All search/filter/sort/paginate/count helpers are pure, dependency-free
//   and safe with missing legacy fields. Canonical validation/lifecycle
//   always comes from services/inspectionSections.ts (never duplicated here).

import {
  getInspectionLifecycleStatus,
  getInspectionProgress,
  hasValidPhoto,
  validateInspection,
} from './inspectionSections.ts';
import { InspectionLifecycleStatus } from '../types.ts';

export interface InspectionMetaVehicle {
  registrationNumber: string;
  make: string;
  model: string;
  year: string;
}

export interface InspectionMetadata {
  id: string;
  agentName: string;
  insuredName: string;
  policyNumber?: string;
  inspectionDate: string;
  /** Effective last-change timestamp (falls back to inspectionDate for legacy). */
  updatedAt: string;
  pdfGenerated: boolean;
  pdfGeneratedAt?: string;
  vehicleCount: number;
  vehicles: InspectionMetaVehicle[];
  status: InspectionLifecycleStatus;
  progressPct: number;
  requiredDone: number;
  requiredTotal: number;
  missingCount: number;
  photoCount: number;
}

// Minimal structural input — compatible with SavedInspection without importing it.
// Photo/section shapes are intentionally loose (read-only boundary).
interface MetadataInput {
  id: string;
  agentName?: string;
  insuredName?: string;
  policyNumber?: string;
  inspectionDate?: string;
  updatedAt?: string;
  pdfGenerated?: boolean;
  pdfGeneratedAt?: string;
  vehicles?: Array<{
    registrationNumber?: string;
    licensePlate?: string;
    make?: string;
    model?: string;
    year?: string;
    photos?: Record<string, any>;
    sections?: Record<string, any>;
  }>;
}

/**
 * Map a full (hydrated) inspection to list-safe metadata.
 * Validation + lifecycle + progress are computed from the FULL record first
 * (canonical Phase 5 helpers), then every photo payload is dropped.
 * Read-only: never mutates the input.
 */
export const toInspectionMetadata = (inspection: MetadataInput): InspectionMetadata => {
  const full = {
    ...inspection,
    vehicles: Array.isArray(inspection.vehicles) ? inspection.vehicles : [],
  } as Parameters<typeof validateInspection>[0];

  const validation = validateInspection(full);
  const progress = getInspectionProgress(full);
  const status = getInspectionLifecycleStatus({
    ...(full as object),
    pdfGenerated: !!inspection.pdfGenerated,
  } as Parameters<typeof getInspectionLifecycleStatus>[0]);

  let photoCount = 0;
  const vehicles: InspectionMetaVehicle[] = (full.vehicles ?? []).map((v: any) => {
    const photos = v?.photos ?? {};
    for (const slot of Object.values(photos)) {
      if (hasValidPhoto(slot as any)) photoCount += 1;
    }
    const sections = v?.sections ?? {};
    for (const section of Object.values(sections) as any[]) {
      const items = (section as any)?.items ?? {};
      for (const item of Object.values(items) as any[]) {
        if (hasValidPhoto(item?.photo)) photoCount += 1;
      }
    }
    return {
      registrationNumber: (v?.registrationNumber || v?.licensePlate || '').trim(),
      make: (v?.make || '').trim(),
      model: (v?.model || '').trim(),
      year: (v?.year || '').trim(),
    };
  });

  return {
    id: inspection.id,
    agentName: inspection.agentName || '',
    insuredName: inspection.insuredName || '',
    policyNumber: inspection.policyNumber,
    inspectionDate: inspection.inspectionDate || '',
    updatedAt: inspection.updatedAt || inspection.inspectionDate || '',
    pdfGenerated: !!inspection.pdfGenerated,
    pdfGeneratedAt: inspection.pdfGeneratedAt,
    vehicleCount: vehicles.length,
    vehicles,
    status,
    progressPct: Math.round(progress.overall * 100),
    requiredDone: validation.totalCompleted,
    requiredTotal: validation.totalRequired,
    missingCount: validation.allMissing.length,
    photoCount,
  };
};

// ── Search ────────────────────────────────────────────────────
export const normalizeQuery = (q: string): string =>
  (q || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Case-insensitive, whitespace-tolerant match on reg/make/model/ID only. */
export const matchesSearch = (meta: InspectionMetadata, query: string): boolean => {
  const q = normalizeQuery(query);
  if (q === '') return true;
  const haystack = [
    meta.id,
    meta.insuredName,
    ...meta.vehicles.flatMap((v) => [v.registrationNumber, v.make, v.model]),
  ]
    .filter(Boolean)
    .map((s) => s.toLowerCase());
  return haystack.some((h) => h.includes(q));
};

// ── Filter ────────────────────────────────────────────────────
export type StatusFilter =
  | 'all'
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PDF_GENERATED'
  | 'PDF_STALE';

export const STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'DRAFT', label: 'Draft' },
  { id: 'IN_PROGRESS', label: 'In Progress' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'PDF_GENERATED', label: 'PDF Generated' },
  { id: 'PDF_STALE', label: 'PDF Stale' },
];

export const filterByStatus = (
  entries: InspectionMetadata[],
  filter: StatusFilter,
): InspectionMetadata[] =>
  filter === 'all' ? [...entries] : entries.filter((e) => e.status === filter);

// ── Sort (deterministic; legacy-safe) ─────────────────────────
const timeOf = (iso: string): number => {
  const t = Date.parse(iso || '');
  return Number.isNaN(t) ? 0 : t;
};

/** updatedAt desc → inspectionDate desc → id asc. Never mutates input. */
export const sortByUpdatedDesc = (
  entries: InspectionMetadata[],
): InspectionMetadata[] =>
  [...entries].sort((a, b) => {
    const d = timeOf(b.updatedAt) - timeOf(a.updatedAt);
    if (d !== 0) return d;
    const c = timeOf(b.inspectionDate) - timeOf(a.inspectionDate);
    if (c !== 0) return c;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

// ── Pagination ────────────────────────────────────────────────
export const PAGE_SIZE = 20;

export interface Page<T> {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
  from: number;
  to: number;
}

export const paginate = <T,>(
  entries: T[],
  page: number,
  perPage: number = PAGE_SIZE,
): Page<T> => {
  const total = entries.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  const items = entries.slice(start, start + perPage);
  return {
    items,
    page: safePage,
    totalPages,
    total,
    from: total === 0 ? 0 : start + 1,
    to: start + items.length,
  };
};

// ── Counts (canonical statuses only) ─────────────────────────
export interface StatusCounts {
  total: number;
  DRAFT: number;
  IN_PROGRESS: number;
  COMPLETED: number;
  PDF_GENERATED: number;
  PDF_STALE: number;
}

export const computeCounts = (entries: InspectionMetadata[]): StatusCounts => {
  const counts: StatusCounts = {
    total: entries.length,
    DRAFT: 0,
    IN_PROGRESS: 0,
    COMPLETED: 0,
    PDF_GENERATED: 0,
    PDF_STALE: 0,
  };
  for (const e of entries) {
    counts[e.status] += 1;
  }
  return counts;
};

// ── Pure list mutation (delete flow; errors handled by caller) ──
export const removeInspectionById = <T extends { id: string }>(
  entries: T[],
  id: string,
): T[] => entries.filter((e) => e.id !== id);

// ── PDF action gating (mirrors Summary rules; status is canonical) ──
// Enabled when all required items are done (non-empty), or when a
// reproducible PDF already exists (PDF_GENERATED).
export const canGeneratePdf = (meta: InspectionMetadata): boolean =>
  (meta.requiredTotal > 0 && meta.requiredDone >= meta.requiredTotal) ||
  meta.status === 'PDF_GENERATED';

export const pdfActionLabel = (meta: InspectionMetadata): string => {
  if (meta.status === 'PDF_GENERATED') return 'Download PDF';
  if (meta.status === 'PDF_STALE') return 'Regenerate PDF';
  return 'Generate PDF';
};

// ── Resume target (existing Phase 3/5 resume mechanism) ───────
export interface ResumeTarget {
  vehicleIndex: number;
  section: 'vehicle_details';
  step: 'VEHICLE_DETAILS' | 'SUMMARY';
}

export const continueResumeTarget = (): ResumeTarget => ({
  vehicleIndex: 0,
  section: 'vehicle_details',
  step: 'VEHICLE_DETAILS',
});

export const summaryResumeTarget = (): ResumeTarget => ({
  vehicleIndex: 0,
  section: 'vehicle_details',
  step: 'SUMMARY',
});
