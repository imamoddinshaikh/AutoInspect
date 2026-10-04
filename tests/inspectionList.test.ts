// tests/inspectionList.test.ts
// Phase 6 committed tests: Home search/filter/sort/pagination/counts,
// metadata lightness, resume targets, demo dedup. Canonical validation and
// lifecycle come from the real services/inspectionSections.ts.
// Run with: npm test

import {
  canGeneratePdf,
  computeCounts,
  continueResumeTarget,
  filterByStatus,
  InspectionMetadata,
  matchesSearch,
  paginate,
  removeInspectionById,
  sortByUpdatedDesc,
  summaryResumeTarget,
  toInspectionMetadata,
} from '../services/inspectionList.ts';
import {
  getInspectionLifecycleStatus,
  validateInspection,
} from '../services/inspectionSections.ts';
import {
  buildDemoInspection,
  DEMO_INSPECTION_ID,
} from '../services/demoInspection.ts';

let pass = 0;
let fail = 0;
const check = (name: string, cond: boolean, extra?: unknown) => {
  if (cond) {
    pass += 1;
  } else {
    fail += 1;
    console.error(`FAIL - ${name}`, extra ?? '');
  }
};

const PHOTO = 'data:image/jpeg;base64,' + 'A'.repeat(600);
const SECS: Record<string, string[]> = {
  exterior: ['EXTERIOR_FRONT_MAIN', 'EXTERIOR_FRONT_RIGHT', 'EXTERIOR_FRONT_LEFT', 'EXTERIOR_LEFT_MAIN', 'EXTERIOR_REAR_LEFT', 'EXTERIOR_REAR_MAIN', 'EXTERIOR_REAR_RIGHT', 'EXTERIOR_RIGHT_MAIN', 'EXTERIOR_REAR_BOOT_OPEN'],
  tyres: ['TYRES_LHS_FRONT', 'TYRES_RHS_FRONT', 'TYRES_LHS_REAR', 'TYRES_RHS_REAR', 'TYRES_SPARE'],
  electricals: ['ELECTRICALS_ODOMETER', 'ELECTRICALS_ELECTRICAL', 'ELECTRICALS_BATTERY', 'ELECTRICALS_AIRBAG', 'ELECTRICALS_MUSIC_SYSTEM'],
  interior: ['INTERIOR_DRIVER_SEAT', 'INTERIOR_SECOND_ROW_SEAT', 'INTERIOR_DASHBOARD', 'INTERIOR_LEATHER_SEAT', 'INTERIOR_FABRIC_SEAT'],
  engine: ['ENGINE_ENGINE', 'ENGINE_COOLANT', 'ENGINE_SOUND', 'ENGINE_EXHAUST_SMOKE', 'ENGINE_CLUTCH', 'ENGINE_GEAR_SHIFTING', 'ENGINE_TURBO_CHARGER', 'ENGINE_FUEL_INJECTOR'],
  ac: ['AC_COOLING', 'AC_HEATER', 'AC_COMPRESSOR'],
};
const DETAILS = {
  registrationNumber: 'GJ05AB1234', make: 'Tata', model: 'Nano',
  fuelType: 'Petrol', odometerKm: '68000',
};

const fullVehicle = (over: Record<string, unknown> = {}): any => {
  const sections: Record<string, any> = {};
  for (const [sec, items] of Object.entries(SECS)) {
    sections[sec] = { items: {} };
    for (const id of items) {
      sections[sec].items[id] = {
        status: 'good', comment: '', photo: { id, name: id, base64: PHOTO, file: null },
      };
    }
  }
  return {
    ...DETAILS, year: '2011', licensePlate: 'GJ05AB1234',
    photos: { front: { id: 'front', name: 'Front View', base64: PHOTO, file: null } },
    sections, ...over,
  };
};

const fullInspection = (id: string, extra: Record<string, unknown> = {}): any => ({
  id, agentName: 'Agent', insuredName: 'Insured', policyNumber: 'P1',
  inspectionDate: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
  vehicles: [fullVehicle()], pdfGenerated: false, ...extra,
});

const metaOf = (full: any): InspectionMetadata => toInspectionMetadata(full);

// 1. Empty Home
{
  const entries: InspectionMetadata[] = [];
  const counts = computeCounts(entries);
  check('1 empty counts zero', counts.total === 0 && counts.DRAFT === 0);
  const page = paginate(entries, 1);
  check('1 empty page', page.items.length === 0 && page.totalPages === 1 && page.total === 0);
  check('1 empty search/filter', filterByStatus(entries.filter((e) => matchesSearch(e, 'x')), 'all').length === 0);
}

// 2. One inspection
{
  const entries = [metaOf(fullInspection('inspection_1'))];
  check('2 one entry visible', entries.filter((e) => matchesSearch(e, '')).length === 1);
  check('2 one entry complete', entries[0].status === 'COMPLETED', entries[0].status);
}

// 3. 100 inspections (perf + pagination)
{
  const fulls = Array.from({ length: 100 }, (_, i) => fullInspection(`inspection_${String(i).padStart(3, '0')}`));
  const t0 = Date.now();
  const entries = fulls.map(metaOf);
  const sorted = sortByUpdatedDesc(entries);
  const searched = sorted.filter((e) => matchesSearch(e, 'tata'));
  const paged = paginate(sorted, 3);
  const dt = Date.now() - t0;
  check('3 hundred mapped', entries.length === 100);
  check('3 hundred under budget', dt < 5000, `${dt}ms`);
  check('3 five pages of 20', paged.totalPages === 5 && paged.items.length === 20, paged.totalPages);
  check('3 page window', paged.from === 41 && paged.to === 60, `${paged.from}-${paged.to}`);
  check('3 search across hundred', searched.length === 100);
}

// 4-9. Search
{
  const demo = metaOf({ ...fullInspection('inspection_demo'), vehicles: [fullVehicle({ registrationNumber: 'DEMO-001', licensePlate: 'DEMO-001', make: 'Tata', model: 'Nano' })] });
  const other = metaOf(fullInspection('inspection_other', {
    vehicles: [fullVehicle({ registrationNumber: 'MH01AB1234', licensePlate: 'MH01AB1234', make: 'Honda', model: 'City' })],
  }));
  const entries = [demo, other];
  check('4 search by registration', entries.filter((e) => matchesSearch(e, 'demo-001')).length === 1);
  check('5 search by make', entries.filter((e) => matchesSearch(e, 'nano')).length === 1);
  check('6 search by make (both share none)', entries.filter((e) => matchesSearch(e, 'tata')).length === 1);
  check('7 search by inspection ID', entries.filter((e) => matchesSearch(e, 'inspection_demo')).length === 1);
  check('8 case-insensitive', entries.filter((e) => matchesSearch(e, 'MH01')).length === 1);
  check('9 whitespace-tolerant', entries.filter((e) => matchesSearch(e, '  demo-001  ')).length === 1);
  check('9b no image-content match', entries.filter((e) => matchesSearch(e, 'AAAA')).length === 0);
}

// 10-15. Filters incl. stale-after-edit
{
  const draft = metaOf({ id: 'd', agentName: '', insuredName: '', inspectionDate: '2026-01-01', vehicles: [], pdfGenerated: false });
  const prog = metaOf({ id: 'p', agentName: 'A', insuredName: '', inspectionDate: '2026-01-01', vehicles: [{ make: 'T', model: '', year: '', photos: {} }], pdfGenerated: false });
  const done = metaOf(fullInspection('c'));
  const gen = metaOf(fullInspection('g', { pdfGenerated: true, pdfGeneratedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }));
  const stale = metaOf(fullInspection('s', { pdfGenerated: true, pdfGeneratedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-03T00:00:00.000Z' }));
  const entries = [draft, prog, done, gen, stale];
  check('10 all filter', filterByStatus(entries, 'all').length === 5);
  check('11 draft filter', filterByStatus(entries, 'DRAFT').map((e) => e.id).join() === 'd');
  check('12 in-progress filter', filterByStatus(entries, 'IN_PROGRESS').map((e) => e.id).join() === 'p');
  check('13 completed filter', filterByStatus(entries, 'COMPLETED').map((e) => e.id).join() === 'c');
  check('14 generated filter', filterByStatus(entries, 'PDF_GENERATED').map((e) => e.id).join() === 'g');
  check('15 stale filter (not under generated)', filterByStatus(entries, 'PDF_STALE').map((e) => e.id).join() === 's');
}

// 16-18. Sorting + legacy
{
  const a = metaOf(fullInspection('a', { updatedAt: '2026-01-01T00:00:00.000Z' }));
  const b = metaOf(fullInspection('b', { updatedAt: '2026-03-01T00:00:00.000Z' }));
  const c = metaOf(fullInspection('c', { updatedAt: '2026-02-01T00:00:00.000Z' }));
  check('16 updatedAt desc', sortByUpdatedDesc([a, b, c]).map((e) => e.id).join() === 'b,c,a');
  const legacy = toInspectionMetadata({ id: 'old', agentName: 'X', inspectionDate: '2023-05-01T00:00:00.000Z', vehicles: [{ make: 'H', model: 'C', year: '2018', photos: {} }] } as any);
  check('17 legacy fallback date', legacy.updatedAt === '2023-05-01T00:00:00.000Z', legacy.updatedAt);
  const mixed = sortByUpdatedDesc([legacy, b]);
  check('18 mixed legacy/current', mixed[0].id === 'b' && mixed[1].id === 'old');
  check('18b deterministic ties', JSON.stringify(sortByUpdatedDesc([a, b])) === JSON.stringify(sortByUpdatedDesc([b, a])));
}

// 19-20. Delete
{
  const entries = [metaOf(fullInspection('a')), metaOf(fullInspection('b'))];
  const after = removeInspectionById(entries, 'a');
  check('19 delete removes one', after.length === 1 && after[0].id === 'b');
  check('19b source untouched', entries.length === 2);
  check('20 delete missing safe', removeInspectionById(entries, 'zzz').length === 2);
}

// 21. Counts match canonical lifecycle
{
  const fulls = [fullInspection('c'), fullInspection('p', { vehicles: [{ make: 'T', model: '', year: '', photos: {} }] })];
  const entries = fulls.map(metaOf);
  const expected = fulls.map((f) => getInspectionLifecycleStatus(f));
  check('21 counts canonical', JSON.stringify(computeCounts(entries)) === JSON.stringify({
    total: 2,
    DRAFT: expected.filter((s) => s === 'DRAFT').length,
    IN_PROGRESS: expected.filter((s) => s === 'IN_PROGRESS').length,
    COMPLETED: expected.filter((s) => s === 'COMPLETED').length,
    PDF_GENERATED: expected.filter((s) => s === 'PDF_GENERATED').length,
    PDF_STALE: expected.filter((s) => s === 'PDF_STALE').length,
  }));
  check('21b validation agrees', validateInspection(fulls[0]).isComplete === (entries[0].status === 'COMPLETED'));
}

// 22. Multi-vehicle progress
{
  const mixed = fullInspection('m', {
    vehicles: [fullVehicle(), { make: 'H', model: 'City', year: '2018', photos: {}, sections: {} }],
  });
  const meta = metaOf(mixed);
  check('22 mixed IN_PROGRESS', meta.status === 'IN_PROGRESS', meta.status);
  check('22 mixed pct mid', meta.progressPct > 0 && meta.progressPct < 100, meta.progressPct);
  check('22 vehicle count shown', meta.vehicleCount === 2);
  const both = fullInspection('m2', { vehicles: [fullVehicle(), fullVehicle({ registrationNumber: 'X2', licensePlate: 'X2' })] });
  check('22b both done COMPLETED', metaOf(both).status === 'COMPLETED');
}

// 23. No image payloads retained
{
  const meta = metaOf(fullInspection('img'));
  const serialized = JSON.stringify(meta);
  check('23 no base64 retained', !serialized.includes('data:image') && serialized.length < 5000, serialized.length);
  check('23 photo count kept', meta.photoCount === 36, meta.photoCount);
}

// 24. Resume targets use existing mechanism
{
  check('24 continue target', JSON.stringify(continueResumeTarget()) === JSON.stringify({ vehicleIndex: 0, section: 'vehicle_details', step: 'VEHICLE_DETAILS' }));
  check('24 summary target', JSON.stringify(summaryResumeTarget()) === JSON.stringify({ vehicleIndex: 0, section: 'vehicle_details', step: 'SUMMARY' }));
}

// 25. Demo: fixed id, realistic content, dedup by upsert
{
  const d1 = buildDemoInspection();
  const d2 = buildDemoInspection();
  check('25 fixed demo id', d1.id === DEMO_INSPECTION_ID && d2.id === DEMO_INSPECTION_ID);
  check('25 demo content', d1.vehicles[0].registrationNumber === 'DEMO-001' && d1.vehicles[0].make === 'Tata' && d1.vehicles[0].model === 'Nano');
  const store = new Map<string, unknown>();
  store.set(d1.id, d1);
  store.set(d2.id, d2); // put() by keyPath:id upserts
  check('25 dedup by id', store.size === 1);
  check('25 demo validates (no crash)', validateInspection(d1 as any).totalRequired === 49);
}

// PDF gating mirrors Summary
{
  const done = metaOf(fullInspection('g1'));
  const prog = metaOf(fullInspection('g2', { vehicles: [{ make: 'T', model: '', year: '', photos: {} }] }));
  const gen = metaOf(fullInspection('g3', { pdfGenerated: true, pdfGeneratedAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' }));
  check('gating complete->allowed', canGeneratePdf(done) === true);
  check('gating incomplete->blocked', canGeneratePdf(prog) === false);
  check('gating generated->allowed', canGeneratePdf(gen) === true);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
