
import { SavedInspection, PhotoCategoryKey, PhotoCategoryConfig, AllPhotoCategoryKeys, Vehicle, Photo } from '../types.ts';
import { initialVehicleState } from '../constants.ts';
import { ensureInspectionId } from '../utils/inspectionIds.ts';
import { toInspectionMetadata, InspectionMetadata } from './inspectionList.ts';
import * as inspectionDb from './inspectionDb';

// Clave para almacenar el nombre del agente por defecto
const DEFAULT_AGENT_NAME_KEY = 'autoinspect_default_agent_name';

// Obtener el nombre del agente por defecto desde el almacenamiento local
export const getDefaultAgentName = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(DEFAULT_AGENT_NAME_KEY) || '';
};

// Guardar el nombre del agente por defecto en el almacenamiento local
export const saveDefaultAgentName = (name: string): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DEFAULT_AGENT_NAME_KEY, name);
};

const ensureCompleteVehiclePhotos = (vehicleData: any): Vehicle => {
  const completePhotos: Record<PhotoCategoryKey, Photo> = {} as Record<PhotoCategoryKey, Photo>;
  AllPhotoCategoryKeys.forEach(key => {
    const config = PhotoCategoryConfig[key];
    completePhotos[key] = {
      id: key,
      name: config.name,
      base64: null,
      file: null,
    };
  });

  if (vehicleData.photos) {
    for (const key in vehicleData.photos) {
      if (AllPhotoCategoryKeys.includes(key as PhotoCategoryKey) && vehicleData.photos[key]) {
        const photoKey = key as PhotoCategoryKey;
        completePhotos[photoKey] = {
          id: vehicleData.photos[key].id || key,
          name: vehicleData.photos[key].name || PhotoCategoryConfig[photoKey]?.name || key,
          base64: vehicleData.photos[key].base64 || null,
          file: null, // file is transient
        };
      }
    }
  }

  // Phase 3: sanitize section evidence photos (drop transient File/preview,
  // keep compressed base64 + association metadata). Never throws away usable data.
  const sectionsIn = vehicleData.sections;
  let sectionsOut: Vehicle['sections'];
  if (sectionsIn && typeof sectionsIn === 'object') {
    sectionsOut = {};
    for (const sectionId of Object.keys(sectionsIn)) {
      const section = sectionsIn[sectionId];
      if (!section || typeof section !== 'object' || !section.items || typeof section.items !== 'object') continue;
      const itemsOut: Record<string, (typeof section.items)[string]> = {};
      for (const itemId of Object.keys(section.items)) {
        const item = section.items[itemId];
        if (!item || typeof item !== 'object') continue;
        const photoIn = (item as any).photo;
        let photoOut = null;
        if (photoIn && typeof photoIn === 'object') {
          photoOut = {
            ...photoIn,
            base64: photoIn.base64 ?? null,
            file: null,
            preview: null,
          };
        }
        itemsOut[itemId] = {
          ...(item as object),
          photo: photoOut,
        } as any;
      }
      sectionsOut[sectionId] = { items: itemsOut } as any;
    }
  }

  return {
    // Preserve every other field (legacy + Phase 3 extended details) verbatim.
    ...vehicleData,
    clientId: vehicleData.clientId || `vehicle_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    make: vehicleData.make || '',
    model: vehicleData.model || '',
    year: vehicleData.year || '',
    licensePlate: vehicleData.licensePlate || '',
    photos: completePhotos,
    ...(sectionsOut !== undefined ? { sections: sectionsOut } : {}),
  };
};

export const getInspections = async (): Promise<SavedInspection[]> => {
  const inspections = await inspectionDb.getAllInspections();
  const hydrated: SavedInspection[] = [];
  for (const inspData of inspections) {
    try {
      if (!inspData || typeof (inspData as any).id !== 'string') continue; // skip malformed
      let vehiclesArray: Vehicle[];
      if (Array.isArray(inspData.vehicles)) {
        vehiclesArray = inspData.vehicles.map(vehicleItem => ensureCompleteVehiclePhotos(vehicleItem));
      } else if ((inspData as any).vehicle) { // Legacy support
        vehiclesArray = [ensureCompleteVehiclePhotos((inspData as any).vehicle)];
      } else {
        vehiclesArray = [initialVehicleState()];
      }
      hydrated.push({
        ...inspData,
        vehicles: vehiclesArray,
      });
    } catch (e) {
      console.warn('Skipping malformed inspection record:', (inspData as any)?.id, e);
      continue; // never let one bad record blank the list
    }
  }
  return hydrated;
};

const stripPhotoForStorage = (slot: Photo | null | undefined): Photo | null => {
  if (!slot) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { file, preview, ...photoToStore } = slot as Photo & { preview?: string | null };
    // Keep base64 (persisted) + association metadata; drop transient File/preview.
    return { ...photoToStore, base64: (photoToStore as Photo).base64 ?? null } as Photo;
  } catch {
    return slot; // Preserve the existing usable slot if stripping fails.
  }
};

const cleanInspectionForStorage = (inspection: SavedInspection): SavedInspection => {
  const vehicles = Array.isArray(inspection.vehicles) ? inspection.vehicles : [];
  return {
    ...inspection,
    vehicles: vehicles.map(v => {
      const vehiclePhotosToStore = { ...(v?.photos ?? {}) } as Record<PhotoCategoryKey, Photo>;
      AllPhotoCategoryKeys.forEach(key => {
        const slot = vehiclePhotosToStore[key];
        if (slot) {
          const stripped = stripPhotoForStorage(slot);
          if (stripped) vehiclePhotosToStore[key] = stripped;
        }
      });
      // Phase 3: strip transients from section evidence photos as well.
      const sectionsIn = (v as Vehicle)?.sections;
      let sectionsOut = sectionsIn;
      if (sectionsIn && typeof sectionsIn === 'object') {
        sectionsOut = { ...sectionsIn } as Vehicle['sections'];
        for (const sectionId of Object.keys(sectionsIn)) {
          const section = (sectionsIn as Record<string, any>)[sectionId];
          if (!section || typeof section !== 'object' || !section.items) continue;
          const itemsOut: Record<string, any> = {};
          for (const itemId of Object.keys(section.items)) {
            const item = section.items[itemId];
            if (!item || typeof item !== 'object') continue;
            itemsOut[itemId] = { ...item, photo: stripPhotoForStorage(item.photo) };
          }
          (sectionsOut as Record<string, any>)[sectionId] = { ...section, items: itemsOut };
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { clientId: vehicleClientId, ...vehicleDetailsToStore } = (v ?? {}) as Vehicle; // Remove clientId before storage
      return { ...vehicleDetailsToStore, sections: sectionsOut, photos: vehiclePhotosToStore } as Vehicle;
    })
  };
};

/** Save (upsert) by stable ID: repeated saves update the same record. */
export const saveInspection = async (inspection: SavedInspection): Promise<void> => {
  const withId: SavedInspection = {
    ...inspection,
    id: ensureInspectionId(inspection.id),
    // Preserve a caller-provided updatedAt (e.g. PDF flow stamps
    // updatedAt === pdfGeneratedAt); otherwise stamp now.
    updatedAt: inspection.updatedAt || new Date().toISOString(),
  };
  let inspectionToSave: SavedInspection;
  try {
    inspectionToSave = cleanInspectionForStorage(withId);
  } catch (error: any) {
    console.error('Error serializing inspection for IndexedDB:', error);
    throw new Error('Could not prepare the inspection for saving. Your draft was preserved.');
  }
  try {
    await inspectionDb.saveInspection(inspectionToSave);
  } catch (error: any) {
    if (error?.name === 'QuotaExceededError') {
      throw new Error('QuotaExceededError: IndexedDB quota exceeded when trying to save inspection.');
    }
    console.error("Error saving inspection to IndexedDB:", error);
    throw error;
  }
};

export const overwriteAllInspections = async (inspectionsToSave: SavedInspection[]): Promise<void> => {
  const cleanedInspections = inspectionsToSave.map(insp =>
    cleanInspectionForStorage({ ...insp, id: ensureInspectionId(insp.id) }),
  );
  // NOTE: no updatedAt rewrite here — delete path must not touch remaining records.
  try {
    await inspectionDb.overwriteAllInspections(cleanedInspections);
  } catch (error: any) {
    if (error?.name === 'QuotaExceededError') {
      throw new Error('QuotaExceededError: IndexedDB quota exceeded when trying to overwrite all inspections.');
    }
    console.error("Error overwriting inspections in IndexedDB:", error);
    throw error;
  }
};


export const getInspectionById = async (id: string): Promise<SavedInspection | undefined> => {
  const found = await inspectionDb.getInspectionById(id);
  if (!found) return undefined;
  // Reuse the same backward-compatible hydration as getInspections()
  const all = await getInspections();
  return all.find((i) => i.id === id) ?? found;
};

/**
 * Phase 6: lightweight list read. Hydrates full records (canonical
 * validation needs section data), computes metadata, then drops every
 * photo payload — callers never hold base64 in list state.
 * Read-only: never writes back to IndexedDB.
 */
export const getInspectionMetadata = async (): Promise<InspectionMetadata[]> => {
  const inspections = await getInspections();
  return inspections.map((insp) => toInspectionMetadata(insp));
};

/** Delete exactly one inspection by ID. Throws on storage failure. */
export const deleteInspectionById = async (id: string): Promise<void> => {
  try {
    await inspectionDb.deleteInspection(id);
  } catch (error) {
    console.error('Error deleting inspection from IndexedDB:', error);
    throw error;
  }
};

/**
 * Phase 7: inspector-friendly storage error messages.
 * Never leaks raw DOMException names; always notes the draft is preserved.
 */
export const describeSaveError = (e: unknown): string => {
  const name = (e as { name?: string } | null)?.name || '';
  const msg = e instanceof Error ? e.message : String(e ?? '');
  if (name === 'QuotaExceededError' || /quota/i.test(msg)) {
    return 'Storage is almost full. Please remove old inspections or free device storage. Your entries were preserved.';
  }
  if (name === 'InvalidStateError') {
    return 'Could not save this inspection. Please try again. Your entries were preserved.';
  }
  if (/Failed to fetch|network|offline/i.test(msg)) {
    return 'No connection needed — this inspection saves on your device. Please try again.';
  }
  return 'Could not save this inspection. Your entries were preserved — please try again.';
};
