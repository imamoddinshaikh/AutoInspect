export interface Photo {
  id: string; // e.g., 'front', 'vin'
  name: string; // e.g., 'Front View', 'VIN Number'
  base64: string | null;
  file?: File | null; // Temporary storage for file object before converting to base64
  note?: string; // Optional note for the photo
  preview?: string | null; // URL for preview purposes (data URL or blob URL)
  // Phase 3: association for section/item evidence photos (absent on legacy photos)
  sectionId?: string; // e.g., 'exterior'
  itemId?: string; // e.g., 'EXTERIOR_FRONT_MAIN'
  capturedAt?: string; // ISO string
}

export interface Vehicle {
  // Internal client-side ID for managing list of vehicles before saving
  // This is not part of the saved inspection ID structure.
  clientId?: string;
  make: string;
  model: string;
  year: string;
  licensePlate?: string;
  photos: {
    front: Photo;
    back: Photo;
    left: Photo;
    right: Photo;
    vin?: Photo;
    registration?: Photo;
    ownerId?: Photo;
    location?: Photo;
  };
  // ── Phase 3: AutoInspect extended vehicle details (all optional) ──
  registrationNumber?: string;
  variant?: string;
  manufacturingYear?: string;
  registrationYear?: string;
  registrationMonth?: string;
  numberOfOwners?: string;
  odometerKm?: string;
  fuelType?: string;
  city?: string;
  rto?: string;
  insuranceStatus?: string;
  insuranceExpiry?: string;
  rcStatus?: string;
  duplicateKey?: string;
  cngLpg?: string;
  roadTax?: string;
  noc?: string;
  hypothecation?: string;
  chassisEmbossing?: string;
  fitness?: string;
  rcCondition?: string;
  regChassisMismatch?: string;
  // ── Phase 3: per-vehicle section results + vehicle-level comment ──
  sections?: Partial<Record<string, VehicleSectionState>>;
  generalComment?: string;
}

/** Stable inspection item status values (shared across sections). */
export type InspectionItemStatus =
  | 'good'
  | 'fair'
  | 'poor'
  | 'needs_attention'
  | 'not_available';

/** State of a single checklist item within a section. */
export interface SectionItemState {
  status?: InspectionItemStatus | null;
  comment?: string;
  photo?: Photo | null;
  updatedAt?: string;
}

/** State of one inspection section for one vehicle. */
export interface VehicleSectionState {
  items: Partial<Record<string, SectionItemState>>;
}

export type InspectionLifecycleStatus =
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PDF_GENERATED'
  | 'PDF_STALE';

export interface Inspection {
  id: string; // Unique ID: InsuredName_VehicleModelVehicleYear_Timestamp (Primary vehicle used for ID)
  agentName: string;
  insuredName: string;
  policyNumber?: string;
  inspectionDate: string; // ISO string
  vehicles: Vehicle[]; // Changed from single vehicle to array
  updatedAt?: string; // ISO string, set on explicit saves (optional for backward compat)
  pdfGeneratedAt?: string; // ISO string of last successful PDF generation (optional)
  comments?: string; // General inspection-level comments (optional)
}

export enum InspectionStep {
  VEHICLE_DETAILS = 1,
  PHOTO_CAPTURE = 2,
  SUMMARY = 3,
}

export interface SavedInspection extends Inspection {
  pdfGenerated: boolean;
  emailSent?: boolean;
  emailAddress?: string;
  sentAt?: string;
}

export type PhotoCategoryKey = 'front' | 'back' | 'left' | 'right' | 'vin' | 'registration' | 'ownerId' | 'location';

export interface PhotoCategoryDetail {
  id: PhotoCategoryKey;
  name: string;
  isOptional: boolean;
}

export const PhotoCategoryConfig: Record<PhotoCategoryKey, PhotoCategoryDetail> = {
  front: { id: 'front', name: 'Front View', isOptional: true }, // Changed to true
  back: { id: 'back', name: 'Rear View', isOptional: true },    // Changed to true
  left: { id: 'left', name: 'Left Side', isOptional: true },   // Changed to true
  right: { id: 'right', name: 'Right Side', isOptional: true },  // Changed to true
  vin: { id: 'vin', name: 'VIN Number', isOptional: true },
  registration: { id: 'registration', name: 'Vehicle Registration', isOptional: true },
  ownerId: { id: 'ownerId', name: 'Owner ID', isOptional: true },
  location: { id: 'location', name: 'Location Screenshot', isOptional: true },
};


export const RequiredPhotoCategoryKeys: PhotoCategoryKey[] = Object.values(PhotoCategoryConfig)
  .filter(pc => !pc.isOptional)
  .map(pc => pc.id);

export const OptionalPhotoCategoryKeys: PhotoCategoryKey[] = Object.values(PhotoCategoryConfig)
  .filter(pc => pc.isOptional)
  .map(pc => pc.id);

export const AllPhotoCategoryKeys: PhotoCategoryKey[] = Object.values(PhotoCategoryConfig).map(pc => pc.id);


export interface SettingsItemType {
  id: string;
  label: string;
  icon: React.ElementType;
  action?: () => void;
  path?: string;
}