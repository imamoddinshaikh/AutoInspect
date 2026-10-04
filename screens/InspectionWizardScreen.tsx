// screens/InspectionWizardScreen.tsx
// Phase 3: AutoInspect section wizard —
// Vehicle Details → Exterior → Tyres → Electricals → Interior →
// Engine & Transmission → AC → Comments → Review.
// Reuses PageContainer, Button, Input, PhotoUploadCard (via SectionItemCard),
// the existing compression pipeline and IndexedDB save layer.

import React, { useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Save } from 'lucide-react';
import { InspectionContext } from '../App.tsx';
import PageContainer from '../components/PageContainer.tsx';
import Button from '../components/Button.tsx';
import Input from '../components/Input.tsx';
import SectionItemCard from '../components/SectionItemCard.tsx';
import { InspectionItemStatus, InspectionStep, Vehicle } from '../types.ts';
import {
  getInspectionProgress,
  getInspectionStatus,
  getItemState,
  getSectionDef,
  getVehicleSection,
  STATUS_LABELS,
  WIZARD_STEPS,
  WizardStepId,
} from '../services/inspectionSections.ts';
import { describeSaveError, saveInspection } from '../services/inspectionService.ts';
import { fileToCompressedDataURL } from '../utils/fileUpload.ts';
import { ensureInspectionId } from '../utils/inspectionIds.ts';
import { createPhotoGuard } from '../utils/photoSequence.ts';

// ── Small select matching the Input look ─────────────────────────────
const SelectField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allowEmpty?: boolean;
}> = ({ label, value, onChange, options, allowEmpty = true }) => (
  <div className="mb-4">
    <label className="block text-sm font-normal mb-1.5" style={{ color: 'var(--app-color-text-muted)' }}>
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-4 py-2.5 text-gray-800 border rounded-xl shadow-sm focus:ring-2 focus:outline-none sm:text-sm transition-colors duration-150 border-[var(--app-color-border)]"
      style={{ backgroundColor: 'var(--app-color-input-background)' }}
    >
      {allowEmpty && <option value="">— Select —</option>}
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  </div>
);

const MONTHS = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const FUELS = ['Petrol', 'Diesel', 'CNG', 'LPG', 'Electric', 'Hybrid'];
const YES_NO = ['Yes', 'No'];
const INSURANCE = ['Active', 'Expired', 'Not Available'];

const InspectionWizardScreen: React.FC = () => {
  const context = useContext(InspectionContext);
  const navigate = useNavigate();
  const [isSaving, setIsSaving] = useState(false);
  const [photoErrors, setPhotoErrors] = useState<Record<string, string | null>>({});
  const savingRef = useRef(false);

  const currentInspection = context?.currentInspection;
  const setCurrentInspection = context?.setCurrentInspection;

  useEffect(() => {
    context?.setCurrentStep(InspectionStep.PHOTO_CAPTURE);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!context || !currentInspection || !setCurrentInspection) {
    return <div className="p-4">Loading...</div>;
  }

  const {
    currentVehicleIndex, setCurrentVehicleIndex,
    currentSection, setCurrentSection,
  } = context;

  // Guard: nothing to inspect yet
  if (!currentInspection.agentName || currentInspection.vehicles.length === 0) {
    navigate('/new-inspection');
    return <div>Redirecting...</div>;
  }

  const safeVehicleIndex = Math.min(
    Math.max(0, currentVehicleIndex),
    currentInspection.vehicles.length - 1,
  );
  const activeVehicle: Vehicle = currentInspection.vehicles[safeVehicleIndex];
  if (!activeVehicle) {
    return <div>Redirecting...</div>;
  }

  const stepIndex = Math.max(0, WIZARD_STEPS.findIndex((s) => s.id === currentSection));
  const step: (typeof WIZARD_STEPS)[number] = WIZARD_STEPS[stepIndex] ?? WIZARD_STEPS[0];

  const progress = getInspectionProgress(currentInspection);
  const vehicleProgress = progress.vehicles[safeVehicleIndex];
  const status = getInspectionStatus({ ...currentInspection, pdfGenerated: (currentInspection as any).pdfGenerated ?? false });

  // ── Mutations (per vehicle — never shared between vehicles) ─────────
  // Every content mutation stamps updatedAt so post-PDF edits flip the
  // lifecycle to PDF_STALE. Passive rendering never touches timestamps.
  const touchNow = () => new Date().toISOString();
  const patchVehicle = (vehicleIndex: number, patch: Partial<Vehicle>) => {
    setCurrentInspection((prev) => ({
      ...prev,
      updatedAt: touchNow(),
      vehicles: prev.vehicles.map((v, i) => (i === vehicleIndex ? { ...v, ...patch } : v)),
    }));
  };

  const setVehicleField = (field: keyof Vehicle, value: string) => {
    patchVehicle(safeVehicleIndex, { [field]: value } as Partial<Vehicle>);
  };

  const patchItem = (
    vehicleIndex: number,
    sectionId: string,
    itemId: string,
    patch: Partial<{ status: InspectionItemStatus | null; comment: string; photo: any }>,
  ) => {
    setCurrentInspection((prev) => ({
      ...prev,
      updatedAt: touchNow(),
      vehicles: prev.vehicles.map((v, i) => {
        if (i !== vehicleIndex) return v;
        const section = getVehicleSection(v, sectionId);
        const current = section.items[itemId] ?? {};
        return {
          ...v,
          sections: {
            ...(v.sections ?? {}),
            [sectionId]: {
              items: {
                ...section.items,
                [itemId]: {
                  ...current,
                  ...patch,
                  updatedAt: new Date().toISOString(),
                },
              },
            },
          },
        };
      }),
    }));
  };

  const photoGuard = useRef(createPhotoGuard());

  const handleItemPhoto = async (
    sectionId: string,
    itemId: string,
    itemLabel: string,
    file: File | null,
  ) => {
    const errorKey = `${safeVehicleIndex}_${sectionId}_${itemId}`;
    if (!file) {
      photoGuard.current.take(errorKey);
      patchItem(safeVehicleIndex, sectionId, itemId, {
        photo: { id: itemId, name: itemLabel, base64: null, file: null, sectionId, itemId } as any,
      });
      setPhotoErrors((prev) => ({ ...prev, [errorKey]: null }));
      return;
    }
    const token = photoGuard.current.take(errorKey);
    try {
      const compressed = await fileToCompressedDataURL(file, {
        maxSide: 1000,
        quality: 0.68,
        minQuality: 0.5,
        targetKB: 170,
      });
      // A newer capture may have finished first — never regress to stale data.
      if (!photoGuard.current.isLatest(errorKey, token)) return;
      patchItem(safeVehicleIndex, sectionId, itemId, {
        photo: {
          id: itemId,
          name: itemLabel,
          base64: compressed,
          preview: compressed,
          file: null,
          sectionId,
          itemId,
          capturedAt: new Date().toISOString(),
        } as any,
      });
      setPhotoErrors((prev) => ({ ...prev, [errorKey]: null }));
    } catch (err) {
      console.error('Error processing section photo:', err);
      if (!photoGuard.current.isLatest(errorKey, token)) return;
      setPhotoErrors((prev) => ({ ...prev, [errorKey]: 'Could not read that photo. Please try again — your previous photo was kept.' }));
    }
  };

  const handleSaveDraft = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const stableId = ensureInspectionId(currentInspection.id);
      await saveInspection({
        ...currentInspection,
        id: stableId,
        pdfGenerated: (currentInspection as any).pdfGenerated ?? false,
      } as any);
      setCurrentInspection((prev) => ({ ...prev, id: stableId }));
      toast.success('Draft saved.');
    } catch (e) {
      console.error('Error saving draft:', e);
      toast.error(describeSaveError(e));
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  };

  const goToStep = (id: WizardStepId) => {
    setCurrentSection(id);
    window.scrollTo({ top: 0 });
  };

  const handlePrev = () => {
    if (stepIndex > 0) goToStep(WIZARD_STEPS[stepIndex - 1].id);
    else navigate('/new-inspection');
  };

  const handleNext = () => {
    if (stepIndex < WIZARD_STEPS.length - 1) {
      goToStep(WIZARD_STEPS[stepIndex + 1].id);
    } else {
      context.setCurrentStep(InspectionStep.SUMMARY);
      navigate('/summary');
    }
  };

  const pct = Math.round(progress.overall * 100);

  return (
    <PageContainer title={step.title} className="px-2 sm:px-4">
      {/* Status + overall progress (derived — survives reload) */}
      <div className="mb-4 p-3 bg-[var(--app-color-card-background)] rounded-2xl shadow-card-soft">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
            {STATUS_LABELS[status]}
          </span>
          <span className="text-xs font-medium text-gray-600">{pct}% complete</span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: 'var(--app-color-primary)' }}
          />
        </div>
        {currentInspection.vehicles.length > 1 && (
          <div className="flex gap-2 mt-3">
            {currentInspection.vehicles.map((v, i) => (
              <button
                key={v.clientId || i}
                type="button"
                onClick={() => setCurrentVehicleIndex(i)}
                className={`flex-1 min-h-[44px] px-2 text-xs font-semibold rounded-lg border ${
                  i === safeVehicleIndex
                    ? 'text-white border-transparent'
                    : 'bg-white text-gray-700 border-gray-300'
                }`}
                style={i === safeVehicleIndex ? { backgroundColor: 'var(--app-color-primary)' } : undefined}
              >
                Vehicle {i + 1}
                {v.registrationNumber ? ` · ${v.registrationNumber}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Section stepper */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {WIZARD_STEPS.map((s, i) => {
          const active = s.id === step.id;
          const done = i < stepIndex;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => goToStep(s.id)}
              className={`flex-shrink-0 min-h-[44px] px-3 text-xs font-semibold rounded-full border ${
                active
                  ? 'text-white border-transparent'
                  : done
                    ? 'bg-green-50 text-green-700 border-green-300'
                    : 'bg-white text-gray-600 border-gray-300'
              }`}
              style={active ? { backgroundColor: 'var(--app-color-primary)' } : undefined}
            >
              {i + 1}. {s.title}
            </button>
          );
        })}
      </div>

      {step.id === 'vehicle_details' && (
        <VehicleDetailsForm vehicle={activeVehicle} onField={setVehicleField} />
      )}

      {step.sectionId && (
        <div className="space-y-4 pb-4">
          {(getSectionDef(step.sectionId)?.items ?? []).map((item) => (
            <SectionItemCard
              key={item.id}
              item={item}
              state={getItemState(activeVehicle, step.sectionId as string, item.id)}
              onStatusChange={(status) => patchItem(safeVehicleIndex, step.sectionId as string, item.id, { status })}
              onCommentChange={(comment) => patchItem(safeVehicleIndex, step.sectionId as string, item.id, { comment })}
              onPhotoChange={(file) => handleItemPhoto(step.sectionId as string, item.id, item.label, file)}
              photoError={photoErrors[`${safeVehicleIndex}_${step.sectionId}_${item.id}`]}
            />
          ))}
          {vehicleProgress && (
            <p className="text-xs text-gray-500 px-1">
              {step.title}: {vehicleProgress.sections.find((s) => s.sectionId === step.sectionId)?.done ?? 0}/
              {vehicleProgress.sections.find((s) => s.sectionId === step.sectionId)?.total ?? 0} items with entries
              (Vehicle {safeVehicleIndex + 1}).
            </p>
          )}
        </div>
      )}

      {step.id === 'comments' && (
        <div className="space-y-5 pb-4">
          <section className="p-5 bg-[var(--app-color-card-background)] rounded-2xl shadow-card-soft">
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--app-color-secondary-text)' }}>
              Vehicle Comment — Vehicle {safeVehicleIndex + 1}
            </h2>
            <p className="text-xs text-gray-500 mb-3">Stored on this vehicle only.</p>
            <textarea
              value={activeVehicle.generalComment ?? ''}
              onChange={(e) => patchVehicle(safeVehicleIndex, { generalComment: e.target.value })}
              placeholder="Condition notes, damages, observations for this vehicle..."
              rows={4}
              className="w-full px-4 py-2.5 text-sm text-gray-800 border rounded-xl focus:ring-2 focus:outline-none placeholder-gray-400"
              style={{ backgroundColor: 'var(--app-color-input-background)' }}
            />
          </section>
          <section className="p-5 bg-[var(--app-color-card-background)] rounded-2xl shadow-card-soft">
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--app-color-secondary-text)' }}>
              General Inspection Comments
            </h2>
            <p className="text-xs text-gray-500 mb-3">Applies to the whole inspection.</p>
            <textarea
              value={currentInspection.comments ?? ''}
              onChange={(e) =>
                setCurrentInspection((prev) => ({ ...prev, comments: e.target.value, updatedAt: touchNow() }))
              }
              placeholder="Overall remarks, customer advisories..."
              rows={4}
              className="w-full px-4 py-2.5 text-sm text-gray-800 border rounded-xl focus:ring-2 focus:outline-none placeholder-gray-400"
              style={{ backgroundColor: 'var(--app-color-input-background)' }}
            />
          </section>
        </div>
      )}

      {/* Prev / Next / Save */}
      <div className="sticky bottom-0 z-10 bg-white/80 backdrop-blur border-t p-4 mt-4">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <Button variant="outline" className="w-full" onClick={handlePrev}>
            <ChevronLeft size={18} className="mr-1" /> Previous
          </Button>
          <Button variant="primary" className="w-full" size="lg" onClick={handleNext}>
            {stepIndex === WIZARD_STEPS.length - 1 ? 'Review Summary' : 'Next'} <ChevronRight size={18} className="ml-1" />
          </Button>
        </div>
        <Button variant="outline" className="w-full" onClick={handleSaveDraft} isLoading={isSaving}>
          <Save size={16} className="mr-2" /> {isSaving ? 'Saving...' : 'Save Draft'}
        </Button>
      </div>
    </PageContainer>
  );
};

// ── Vehicle details form (extended, all optional except reg. number) ──
const VehicleDetailsForm: React.FC<{
  vehicle: Vehicle;
  onField: (field: keyof Vehicle, value: string) => void;
}> = ({ vehicle, onField }) => {
  const v = (k: keyof Vehicle): string => (vehicle[k] as string) ?? '';
  const text = (k: keyof Vehicle) => ({
    value: v(k),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onField(k, e.target.value),
  });
  return (
    <div className="space-y-5 pb-4">
      <section className="p-5 bg-[var(--app-color-card-background)] rounded-2xl shadow-card-soft">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--app-color-secondary-text)' }}>Basic</h2>
        <Input label="Registration Number *" name="registrationNumber" value={v('registrationNumber')} onChange={(e) => onField('registrationNumber', e.target.value)} placeholder="e.g., KA05MN1234" />
        <Input label="Make" name="make" value={v('make')} onChange={(e) => onField('make', e.target.value)} placeholder="e.g., Toyota" />
        <Input label="Model" name="model" value={v('model')} onChange={(e) => onField('model', e.target.value)} placeholder="e.g., Corolla" />
        <Input label="Variant" name="variant" value={v('variant')} onChange={(e) => onField('variant', e.target.value)} placeholder="e.g., G CVT" />
        <Input label="Manufacturing Year" name="manufacturingYear" value={v('manufacturingYear')} onChange={(e) => onField('manufacturingYear', e.target.value)} placeholder="e.g., 2020" inputMode="numeric" />
        <Input label="Registration Year" name="registrationYear" value={v('registrationYear')} onChange={(e) => onField('registrationYear', e.target.value)} placeholder="e.g., 2020" inputMode="numeric" />
        <SelectField label="Registration Month" value={v('registrationMonth')} onChange={(val) => onField('registrationMonth', val)} options={MONTHS} />
        <Input label="Number of Owners" name="numberOfOwners" value={v('numberOfOwners')} onChange={(e) => onField('numberOfOwners', e.target.value)} placeholder="e.g., 1" inputMode="numeric" />
        <Input label="Kilometres / Odometer" name="odometerKm" {...text('odometerKm')} placeholder="e.g., 45200" inputMode="numeric" />
        <SelectField label="Fuel Type" value={v('fuelType')} onChange={(val) => onField('fuelType', val)} options={FUELS} />
        <Input label="City" name="city" value={v('city')} onChange={(e) => onField('city', e.target.value)} placeholder="e.g., Bengaluru" />
        <Input label="RTO" name="rto" value={v('rto')} onChange={(e) => onField('rto', e.target.value)} placeholder="e.g., KA05" />
      </section>

      <section className="p-5 bg-[var(--app-color-card-background)] rounded-2xl shadow-card-soft">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--app-color-secondary-text)' }}>Documents / Legal</h2>
        <SelectField label="Insurance Status" value={v('insuranceStatus')} onChange={(val) => onField('insuranceStatus', val)} options={INSURANCE} />
        <Input label="Insurance Expiry" name="insuranceExpiry" value={v('insuranceExpiry')} onChange={(e) => onField('insuranceExpiry', e.target.value)} placeholder="e.g., 2026-05" />
        <Input label="RC Status" name="rcStatus" value={v('rcStatus')} onChange={(e) => onField('rcStatus', e.target.value)} placeholder="e.g., Original available" />
        <SelectField label="Duplicate Key" value={v('duplicateKey')} onChange={(val) => onField('duplicateKey', val)} options={YES_NO} />
        <SelectField label="CNG / LPG" value={v('cngLpg')} onChange={(val) => onField('cngLpg', val)} options={['None', 'CNG', 'LPG']} />
        <Input label="Road Tax" name="roadTax" value={v('roadTax')} onChange={(e) => onField('roadTax', e.target.value)} placeholder="e.g., Paid till 2030" />
        <Input label="NOC" name="noc" value={v('noc')} onChange={(e) => onField('noc', e.target.value)} placeholder="e.g., Not required" />
        <Input label="Hypothecation" name="hypothecation" value={v('hypothecation')} onChange={(e) => onField('hypothecation', e.target.value)} placeholder="e.g., HDFC Bank / None" />
        <Input label="Chassis / Embossing" name="chassisEmbossing" value={v('chassisEmbossing')} onChange={(e) => onField('chassisEmbossing', e.target.value)} placeholder="e.g., Verified" />
        <Input label="Fitness" name="fitness" value={v('fitness')} onChange={(e) => onField('fitness', e.target.value)} placeholder="e.g., Valid till 2030" />
        <Input label="RC Condition" name="rcCondition" value={v('rcCondition')} onChange={(e) => onField('rcCondition', e.target.value)} placeholder="e.g., Good" />
        <Input label="Registration / Chassis Mismatch" name="regChassisMismatch" value={v('regChassisMismatch')} onChange={(e) => onField('regChassisMismatch', e.target.value)} placeholder="e.g., None" />
      </section>
      <p className="text-xs text-gray-500 px-1">* Registration Number is required to complete the inspection.</p>
    </div>
  );
};

export default InspectionWizardScreen;
