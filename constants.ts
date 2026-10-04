
import { Inspection, Photo, Vehicle, PhotoCategoryKey, PhotoCategoryConfig, AllPhotoCategoryKeys } from './types.ts';
import { getDefaultAgentName } from './services/inspectionService.ts'; // Importar función
import { generateInspectionId } from './utils/inspectionIds.ts';

// Single source of truth for PDF config lives in services/pdfConfig.ts.
// Re-exported here so any legacy `constants.ts → PDF_OPTIONS` import keeps working.
export { PDF_OPTIONS } from './services/pdfConfig.ts';
export type { PdfOptions } from './services/pdfConfig.ts';

// Keys for storage
const STORAGE_PREFIX = 'autoinspect_';
export const STORAGE_KEYS = {
  inspection: `${STORAGE_PREFIX}current_inspection`,
  step: `${STORAGE_PREFIX}current_step`,
  vehicleIndex: `${STORAGE_PREFIX}current_vehicle_index`,
  section: `${STORAGE_PREFIX}current_section`,
} as const;

export const APP_NAME = "AutoInspect";
export const LOCAL_STORAGE_KEY = "autoinspect_inspections";

const createPhotoObject = (categoryKey: PhotoCategoryKey): Photo => {
  const config = PhotoCategoryConfig[categoryKey];
  return {
    id: config.id,
    name: config.name,
    base64: null,
    file: null,
  };
};

export const initialVehicleState = (): Vehicle => ({
  clientId: `vehicle_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`, // For UI keying
  make: '',
  model: '',
  year: '',
  photos: AllPhotoCategoryKeys.reduce((acc, key) => {
    acc[key] = createPhotoObject(key);
    return acc;
  }, {} as Record<PhotoCategoryKey, Photo>),
});

export const initialInspectionState = (): Inspection => ({
  id: generateInspectionId(),
  agentName: getDefaultAgentName(), // Usar nombre de agente predeterminado
  insuredName: '',
  policyNumber: '',
  inspectionDate: new Date().toISOString(),
  vehicles: [initialVehicleState()], // Initialize with one vehicle
});

export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;