// utils/inspectionIds.ts
// Centralized inspection ID generation (Phase 1).
// Format stays compatible with the existing IndexedDB keyPath:id setup
// (plain string keys, previously `inspection_${Date.now()}`).

export const generateInspectionId = (): string => {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? (crypto as Crypto).randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `inspection_${Date.now()}_${rand}`;
};

export const ensureInspectionId = (id?: string | null): string => {
  if (typeof id === 'string' && id.trim() !== '') return id;
  return generateInspectionId();
};
