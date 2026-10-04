// services/demoInspection.ts
// Phase 6: safe, explicit demo-data path. Never auto-created on app load —
// only via the "Load Demo Inspection" action. Fixed stable ID guarantees
// no duplicates: IndexedDB put() upserts by keyPath:id, and we check first.

import { Inspection, InspectionItemStatus } from '../types.ts';
import { getInspectionById, saveInspection } from './inspectionService.ts';

export const DEMO_INSPECTION_ID = 'inspection_demo_nano';

const demoItem = (status: InspectionItemStatus, comment: string) => ({
  status,
  comment,
  photo: null,
  updatedAt: new Date().toISOString(),
});

/** Realistic workflow demo (details + statuses + comments; no photos). */
export const buildDemoInspection = (): Inspection => {
  const now = new Date().toISOString();
  const sections: Record<string, { items: Record<string, unknown> }> = {};
  const put = (section: string, items: Record<string, ReturnType<typeof demoItem>>) => {
    sections[section] = { items };
  };
  put('exterior', {
    EXTERIOR_FRONT_MAIN: demoItem('good', 'Bumper and grille clean, no dents.'),
    EXTERIOR_FRONT_RIGHT: demoItem('good', ''),
    EXTERIOR_FRONT_LEFT: demoItem('fair', 'Minor scratch on fender.'),
    EXTERIOR_LEFT_MAIN: demoItem('good', ''),
    EXTERIOR_REAR_LEFT: demoItem('good', ''),
    EXTERIOR_REAR_MAIN: demoItem('fair', 'Small paint chip near number plate.'),
    EXTERIOR_REAR_RIGHT: demoItem('good', ''),
    EXTERIOR_RIGHT_MAIN: demoItem('good', ''),
    EXTERIOR_REAR_BOOT_OPEN: demoItem('good', 'Boot floor dry, spare tools present.'),
  });
  put('tyres', {
    TYRES_LHS_FRONT: demoItem('fair', 'Tread ~50%.'),
    TYRES_RHS_FRONT: demoItem('fair', 'Tread ~50%.'),
    TYRES_LHS_REAR: demoItem('good', ''),
    TYRES_RHS_REAR: demoItem('good', ''),
    TYRES_SPARE: demoItem('not_available', 'Spare wheel not present.'),
  });
  put('electricals', {
    ELECTRICALS_ODOMETER: demoItem('good', 'Reading consistent with service history.'),
    ELECTRICALS_ELECTRICAL: demoItem('good', ''),
    ELECTRICALS_BATTERY: demoItem('fair', 'Terminals show light corrosion.'),
    ELECTRICALS_AIRBAG: demoItem('not_available', 'No airbag in this variant.'),
    ELECTRICALS_MUSIC_SYSTEM: demoItem('good', ''),
  });
  put('interior', {
    INTERIOR_DRIVER_SEAT: demoItem('fair', 'Seat cover worn on bolster.'),
    INTERIOR_SECOND_ROW_SEAT: demoItem('good', ''),
    INTERIOR_DASHBOARD: demoItem('good', ''),
    INTERIOR_LEATHER_SEAT: demoItem('not_available', 'Fabric seats in this variant.'),
    INTERIOR_FABRIC_SEAT: demoItem('fair', 'Light stains on rear bench.'),
  });
  put('engine', {
    ENGINE_ENGINE: demoItem('good', 'No leaks observed.'),
    ENGINE_COOLANT: demoItem('good', ''),
    ENGINE_SOUND: demoItem('good', 'Idles smoothly.'),
    ENGINE_EXHAUST_SMOKE: demoItem('good', 'No visible smoke.'),
    ENGINE_CLUTCH: demoItem('fair', 'Bite point slightly high.'),
    ENGINE_GEAR_SHIFTING: demoItem('good', ''),
    ENGINE_TURBO_CHARGER: demoItem('not_available', 'Naturally aspirated engine.'),
    ENGINE_FUEL_INJECTOR: demoItem('good', ''),
  });
  put('ac', {
    AC_COOLING: demoItem('good', 'Cools effectively.'),
    AC_HEATER: demoItem('good', ''),
    AC_COMPRESSOR: demoItem('good', ''),
  });

  return {
    id: DEMO_INSPECTION_ID,
    agentName: 'Demo Agent',
    insuredName: 'Demo Insured',
    policyNumber: 'DEMO-POL-001',
    inspectionDate: now,
    updatedAt: now,
    comments: 'Demo inspection created to showcase the AutoInspect workflow.',
    vehicles: [
      {
        make: 'Tata',
        model: 'Nano',
        year: '2011',
        variant: 'LX',
        registrationNumber: 'DEMO-001',
        licensePlate: 'DEMO-001',
        manufacturingYear: '2011',
        registrationYear: '2011',
        registrationMonth: '06',
        numberOfOwners: '2',
        odometerKm: '68000',
        fuelType: 'Petrol',
        city: 'Demo City',
        rto: 'DEMO-RTO',
        insuranceStatus: 'Active',
        insuranceExpiry: '2026-12',
        rcStatus: 'Original available',
        duplicateKey: 'Yes',
        cngLpg: 'None',
        roadTax: 'Paid',
        noc: 'Not required',
        hypothecation: 'None',
        chassisEmbossing: 'Verified',
        fitness: 'Valid',
        rcCondition: 'Good',
        regChassisMismatch: 'None',
        photos: {
          front: { id: 'front', name: 'Front View', base64: null, file: null },
          back: { id: 'back', name: 'Rear View', base64: null, file: null },
          left: { id: 'left', name: 'Left Side', base64: null, file: null },
          right: { id: 'right', name: 'Right Side', base64: null, file: null },
        },
        sections: sections as any,
        generalComment: 'Overall fair condition for its age; tyres need attention soon.',
      },
    ],
  };
};

export interface EnsureDemoResult {
  created: boolean;
  id: string;
}

/**
 * Create the demo inspection only if it does not already exist.
 * Safe to call repeatedly — never duplicates.
 */
export const ensureDemoInspection = async (): Promise<EnsureDemoResult> => {
  const existing = await getInspectionById(DEMO_INSPECTION_ID);
  if (existing) return { created: false, id: DEMO_INSPECTION_ID };
  const demo = buildDemoInspection();
  await saveInspection(demo as any);
  return { created: true, id: DEMO_INSPECTION_ID };
};
