import React, { useContext, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import Modal from 'react-modal';
import { InspectionContext } from '../App';
import Button from '../components/Button.tsx';
import { generatePdfBlob, buildPdfFilename } from '../services/pdfGenerator';
import { describeSaveError, saveInspection } from '../services/inspectionService';
import { sendInspectionEmail, formatEmailError } from '../services/emailService.ts';
import { ensureInspectionId } from '../utils/inspectionIds.ts';
import { STORAGE_KEYS } from '../constants.ts';
import {
  getInspectionLifecycleStatus,
  getInspectionProgress,
  InspectionValidationResult,
  MissingItem,
  STATUS_LABELS,
  validateInspection,
} from '../services/inspectionSections.ts';
import { InspectionLifecycleStatus } from '../types.ts';

// ───────────────────────────────────────────────────────────
// Tipos
interface SummaryItemProps {
  label: string;
  value: string | React.ReactNode;
  isMissing?: boolean;
}

const SummaryItem: React.FC<SummaryItemProps> = ({ label, value, isMissing = false }) => (
  <div className="py-2 border-b border-gray-200 flex justify-between items-center">
    <span className="text-sm font-medium text-gray-600">{label}:</span>
    {isMissing ? (
      <span className="text-sm text-gray-400 italic">(Opcional - No proporcionado)</span>
    ) : (
      <span className="text-sm text-gray-800 text-right break-all">{value}</span>
    )}
  </div>
);

const InspectionProgressBlock: React.FC<{
  progress: ReturnType<typeof getInspectionProgress>;
  validation: InspectionValidationResult & { allMissing: MissingItem[] };
  status: InspectionLifecycleStatus;
  onJump: (vehicleIndex: number, sectionId: string) => void;
}> = ({ progress, validation, status, onJump }) => {
  const pct = Math.round(progress.overall * 100);
  const grouped = new Map<string, { vehicleIndex: number; sectionTitle: string; sectionId: string; items: MissingItem[] }>();
  for (const m of validation.allMissing) {
    const key = `${m.vehicleIndex}|${m.sectionId}`;
    const g = grouped.get(key);
    if (g) {
      g.items.push(m);
    } else {
      grouped.set(key, { vehicleIndex: m.vehicleIndex, sectionTitle: m.sectionTitle, sectionId: m.sectionId, items: [m] });
    }
  }
  return (
    <section className="bg-white p-4 rounded-lg shadow">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold app-text-secondary">
          {validation.isComplete ? 'Inspection Complete' : 'Inspection Incomplete'}
        </h2>
        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
          {STATUS_LABELS[status]}
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-200 overflow-hidden mb-1">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: 'var(--app-color-primary)' }}
        />
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {pct}% complete · {validation.totalCompleted}/{validation.totalRequired} required items
      </p>
      {progress.vehicles.map((vp) => {
        const missing = vp.missingRequired.length;
        return (
          <div key={vp.vehicleIndex} className="mb-2">
            <p className="text-sm font-semibold text-gray-700">
              Vehicle {vp.vehicleIndex + 1} — {vp.requiredMet ? 'Complete' : `${missing} item${missing === 1 ? '' : 's'} missing`}
            </p>
            {vp.sections.map((s) => (
              <div key={s.sectionId} className="flex items-center gap-2 py-0.5">
                <span className="text-xs text-gray-600 flex-1">{s.title}</span>
                <div className="w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-green-500"
                    style={{ width: `${s.total === 0 ? 0 : Math.round((s.done / s.total) * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500 w-10 text-right">{s.done}/{s.total}</span>
              </div>
            ))}
          </div>
        );
      })}
      {!validation.isComplete ? (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-semibold text-amber-800 mb-2">
            {validation.allMissing.length} item{validation.allMissing.length === 1 ? ' still needs' : 's still need'} attention.
          </p>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {[...grouped.values()].map((g) => (
              <div key={`${g.vehicleIndex}_${g.sectionId}`}>
                <p className="text-xs font-bold text-amber-900 mb-1">
                  Vehicle {g.vehicleIndex + 1} · {g.sectionTitle} ({g.items.length})
                </p>
                <div className="space-y-1.5">
                  {g.items.map((m, i) => (
                    <button
                      key={`${m.itemId ?? m.label}_${i}`}
                      type="button"
                      onClick={() => onJump(m.vehicleIndex, m.sectionId)}
                      className="w-full text-left text-xs text-amber-900 bg-white border border-amber-200 rounded px-2 py-1.5 hover:bg-amber-100"
                    >
                      {m.label} — Go to Section →
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-green-700 font-medium mt-2">All required items are complete.</p>
      )}
    </section>
  );
};

const SummaryValidationArea: React.FC<{
  inspection: any;
  onJump: (vehicleIndex: number, sectionId: string) => void;
}> = ({ inspection, onJump }) => {
  const progress = getInspectionProgress(inspection);
  const validation = validateInspection(inspection);
  const status = getInspectionLifecycleStatus({
    ...inspection,
    pdfGenerated: inspection.pdfGenerated ?? false,
  });
  return (
    <InspectionProgressBlock
      progress={progress}
      validation={validation}
      status={status}
      onJump={onJump}
    />
  );
};

const SummaryActions: React.FC<{
  inspection: any;
  onBack: () => void;
  onSaveDraft: () => void;
  isSaving: boolean;
  onGeneratePdf: () => void;
  isGeneratingPdf: boolean;
  onSendEmail: () => void;
}> = ({ inspection, onBack, onSaveDraft, isSaving, onGeneratePdf, isGeneratingPdf, onSendEmail }) => {
  const validation = validateInspection(inspection);
  const status = getInspectionLifecycleStatus({
    ...inspection,
    pdfGenerated: inspection.pdfGenerated ?? false,
  });
  // Incomplete inspections cannot mint a first PDF; an existing (still
  // reproducible) PDF may always be downloaded again.
  const canGenerate = validation.isComplete || status === 'PDF_GENERATED';
  const pdfLabel =
    status === 'PDF_GENERATED'
      ? 'Download PDF'
      : status === 'PDF_STALE'
        ? 'Regenerate PDF'
        : 'Generate & Save PDF';
  return (
    <div className="sticky bottom-0 z-10 bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-t p-4 mt-8">
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="outline" className="w-full" onClick={onBack}>
          Back to Inspection
        </Button>
        <Button variant="outline" className="w-full" size="lg" onClick={onSaveDraft} isLoading={isSaving}>
          {isSaving ? 'Saving...' : 'Save Draft'}
        </Button>
        <Button
          className="w-full"
          size="lg"
          onClick={onGeneratePdf}
          isLoading={isGeneratingPdf}
          disabled={!canGenerate}
          title={canGenerate ? pdfLabel : 'Complete required inspection items before generating the final report.'}
        >
          {isGeneratingPdf ? 'Processing...' : pdfLabel}
        </Button>
        <Button variant="primary" className="w-full" size="lg" onClick={onSendEmail}>
          Send Email
        </Button>
      </div>
      {!canGenerate && (
        <p className="text-xs text-amber-700 mt-2 text-center">
          Complete required inspection items before generating the final report.
        </p>
      )}
      {status === 'PDF_STALE' && canGenerate && (
        <p className="text-xs text-amber-700 mt-2 text-center">
          Inspection changed — regenerate PDF.
        </p>
      )}
    </div>
  );
};

const SummaryScreen: React.FC = () => {
  const context = useContext(InspectionContext);
  const navigate = useNavigate();

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [email, setEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [modalTitle, setModalTitle] = useState('Operation Successful');
  const [modalMessage, setModalMessage] = useState('Your inspection has been saved successfully.');

  const openingRef = useRef(false); // evita doble click o dobles invocaciones (PDF)
  const savingRef = useRef(false); // guard for Save Draft rapid clicks
  const emailRef = useRef(false); // guard for Send Email rapid clicks

  const addDebugLog = (m: string) => {
    console.log('[DEBUG]', m);
    setDebugLogs(prev => [...prev, m].slice(-6));
  };

  const currentInspection = context?.currentInspection;
  const setCurrentInspection = context?.setCurrentInspection;
  const resetInspection = context?.resetInspection ?? (() => {});
  const setCurrentSection = context?.setCurrentSection;
  const setCurrentVehicleIndex = context?.setCurrentVehicleIndex;

  // Rehidrata si iOS remontó el componente y el contexto viene vacío
  useEffect(() => {
    if (!currentInspection && setCurrentInspection) {
      try {
        const cached =
          sessionStorage.getItem(STORAGE_KEYS.inspection) ??
          sessionStorage.getItem('currentInspection');
        if (cached) setCurrentInspection(JSON.parse(cached));
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { setIsGeneratingPdf(false); }, [currentInspection?.id]);

  // Advertencias de fotos (no bloquea)
  useEffect(() => {
    try {
      if (!currentInspection?.vehicles) return;
      currentInspection.vehicles.forEach((v, i) => {
        if (!v.photos || Object.keys(v.photos).length === 0) {
          console.warn(`Falta al menos una foto en el vehículo ${i + 1}`);
        }
      });
    } catch (e) {
      console.error('Error verificando fotos:', e);
    }
  }, [currentInspection]);

  if (!context || !currentInspection) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Modal
          isOpen={showSuccessModal}
          onRequestClose={() => setShowSuccessModal(false)}
          contentLabel="Resultado de la operación"
          className="modal"
          overlayClassName="modal-overlay"
        >
          <h2 className="text-xl font-bold mb-4">{modalTitle}</h2>
          <p className="mb-4">{modalMessage}</p>

          {debugLogs.length > 0 && (
            <div className="mt-4 p-3 bg-gray-100 rounded text-sm text-gray-700 max-h-32 overflow-y-auto">
              <p className="font-semibold mb-2">Detalles:</p>
              {debugLogs.map((log, i) => (
                <div key={i} className="py-1 border-b border-gray-200 last:border-0">{log}</div>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowSuccessModal(false)}
            className="w-full mt-4 bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
          >
            Cerrar
          </button>
        </Modal>
      </div>
    );
  }

  const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (/\bMacintosh\b/.test(navigator.userAgent) && 'ontouchend' in document);

  const saveErrorMessage = (e: unknown): string => describeSaveError(e);

  /**
   * A. Save Draft — persists everything WITHOUT requiring email/PDF.
   * Never marks pdfGenerated unless it was already true.
   */
  const handleSaveDraft = async () => {
    if (savingRef.current || !currentInspection || !setCurrentInspection) return;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const stableId = ensureInspectionId(currentInspection.id);
      const toSave = {
        ...currentInspection,
        id: stableId,
        // Preserve existing flag: a draft save must not claim a PDF exists.
        pdfGenerated: (currentInspection as any).pdfGenerated ?? false,
      };
      await saveInspection(toSave as any);
      setCurrentInspection(prev => ({ ...prev, id: stableId }));
      toast.success('Draft saved.');
    } catch (e) {
      console.error('Error saving draft:', e);
      toast.error(saveErrorMessage(e));
    } finally {
      setIsSaving(false);
      savingRef.current = false;
    }
  };

  /**
   * B/C. Generate (+ Save) PDF — pdfGenerated=true ONLY after generation succeeds.
   * On failure the draft is preserved (saved with its prior flag) and never
   * falsely marked as generated.
   */
  const handleGeneratePdf = async () => {
    if (openingRef.current || !currentInspection) return;
    openingRef.current = true;
    setIsGeneratingPdf(true);

    try {
      const blob = await generatePdfBlob({ ...currentInspection, pdfGenerated: true } as any);

      // Generation succeeded → now persist with pdfGenerated:true (upsert by ID).
      const stableId = ensureInspectionId(currentInspection.id);
      const generatedAt = new Date().toISOString();
      try {
        await saveInspection({
          ...currentInspection,
          id: stableId,
          pdfGenerated: true,
          pdfGeneratedAt: generatedAt,
          updatedAt: generatedAt,
        } as any);
        if (setCurrentInspection) {
          setCurrentInspection(prev => ({ ...prev, id: stableId }));
        }
      } catch (saveErr) {
        console.error('PDF generated but save failed:', saveErr);
        toast.error(saveErrorMessage(saveErr));
        // The PDF itself is still usable — continue to download/open it.
      }

      const url = URL.createObjectURL(blob);
      const filename = `inspection_${currentInspection.policyNumber || 'report'}_${Date.now()}.pdf`.replace(/[^\w.-]/g,'_');

      if (isiOS) {
        // iOS: no intenta descargar; solo abre el visor en una pestaña
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        // Desktop: descarga directa
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 15000);
      }

      setModalTitle('Saved');
      setModalMessage('PDF generated and inspection saved successfully.');
      setShowSuccessModal(true);
    } catch (e) {
      console.error('Error generating PDF:', e);
      // Data safety: preserve the draft with its prior pdfGenerated flag.
      try {
        if (setCurrentInspection) {
          const stableId = ensureInspectionId(currentInspection.id);
          await saveInspection({
            ...currentInspection,
            id: stableId,
            pdfGenerated: (currentInspection as any).pdfGenerated ?? false,
          } as any);
          setCurrentInspection(prev => ({ ...prev, id: stableId }));
        }
      } catch (safeErr) {
        console.error('Draft preservation save also failed:', safeErr);
      }
      setModalTitle('Error');
      setModalMessage('There was an error generating the PDF. Your inspection data was preserved — please try again.');
      setShowSuccessModal(true);
    } finally {
      setIsGeneratingPdf(false);
      openingRef.current = false;
    }
  };

  // ───────────────────────────────────────────────────────────
  // Enviar por email (lógica compartida en services/emailService.ts)
  // ───────────────────────────────────────────────────────────
  const handleSendEmail = async () => {
    if (emailRef.current || !email || !currentInspection || !setCurrentInspection) return;
    emailRef.current = true;
    setIsSendingEmail(true);
    setModalTitle('Enviando correo...');
    setModalMessage('Estamos preparando el informe. Por favor, espera...');
    setShowSuccessModal(true);

    try {
      addDebugLog('Generando PDF...');
      const blob = await generatePdfBlob(currentInspection as any);
      addDebugLog(`PDF generado (${(blob.size / (1024 * 1024)).toFixed(2)} MB)`);

      addDebugLog('Enviando email...');
      await sendInspectionEmail(blob, email, {
        filename: buildPdfFilename(currentInspection as any),
        policyNumber: currentInspection.policyNumber,
      });

      const emailedAt = new Date().toISOString();
      const updated = {
        ...currentInspection,
        id: ensureInspectionId(currentInspection.id),
        emailSent: true,
        emailAddress: email,
        sentAt: emailedAt,
        pdfGenerated: true,
        pdfGeneratedAt: emailedAt,
        updatedAt: emailedAt,
      };

      await saveInspection(updated as any);
      setCurrentInspection(prev => ({ ...prev, id: updated.id }));

      addDebugLog('¡Correo enviado con éxito!');
      setModalTitle('¡Éxito!');
      setModalMessage('El correo se ha enviado correctamente con el PDF adjunto.');
      setShowSuccessModal(true);
      setShowEmailModal(false);
    } catch (e: any) {
      console.error('Error en el proceso de envío:', e);
      setModalTitle('Error');
      setModalMessage(formatEmailError(e));
      setShowSuccessModal(true);
    } finally {
      setIsSendingEmail(false);
      emailRef.current = false;
    }
  };

  const handleViewInspections = () => navigate('/inspections');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-4">
        <div className="space-y-6">
          <section className="bg-white p-4 rounded-lg shadow">
            <h2 className="text-lg font-semibold app-text-secondary mb-3">Inspector & Insured Details</h2>
            <SummaryItem label="Agent's Name" value={currentInspection.agentName} />
            <SummaryItem label="Insured's Name" value={currentInspection.insuredName} isMissing={!currentInspection.insuredName} />
            <SummaryItem label="Policy Number" value={currentInspection.policyNumber || ''} isMissing={!currentInspection.policyNumber} />
            <SummaryItem label="Inspection Date" value={new Date(currentInspection.inspectionDate).toLocaleDateString()} />
          </section>

          {currentInspection.vehicles.map((vehicle, index) => {
            const base = `Vehicle ${index + 1}`;
            const mm = [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim();
            const title = mm ? `${base}: ${mm}` : `${base} Details`;
            return (
              <section key={vehicle.clientId || index} className="bg-white p-4 rounded-lg shadow">
                <h2 className="text-lg font-semibold app-text-secondary mb-3">{title}</h2>
                <SummaryItem label="Vehicle Make" value={vehicle.make || 'Not specified'} isMissing={!vehicle.make} />
                <SummaryItem label="Vehicle Model" value={vehicle.model || 'Not specified'} isMissing={!vehicle.model} />
                <h3 className="text-md font-semibold app-text-secondary mt-4 mb-2">Photos for Vehicle {index + 1}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(vehicle.photos).map(([k, photo]) => {
                    if (!photo) return null;
                    const display = k.charAt(0).toUpperCase() + k.slice(1);
                    return (
                      <div key={photo.id} className="text-center">
                        <span className="text-xs block mb-1 text-gray-600">{display}</span>
                        {photo.base64 ? (
                          <img src={photo.base64} alt={display} className="w-full h-24 object-cover rounded border" />
                        ) : (
                          <div className="w-full h-24 bg-gray-100 rounded border flex items-center justify-center">
                            <span className="text-xs text-gray-400 italic">(Not provided)</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {/* Inspection progress + missing required items */}
          <SummaryValidationArea
            inspection={currentInspection}
            onJump={(vehicleIndex, sectionId) => {
              if (setCurrentVehicleIndex) setCurrentVehicleIndex(vehicleIndex);
              if (setCurrentSection) setCurrentSection(sectionId as any);
              navigate('/inspection');
            }}
          />

          {/* Action Bar */}
          <SummaryActions
            inspection={currentInspection}
            onBack={() => navigate('/inspection')}
            onSaveDraft={handleSaveDraft}
            isSaving={isSaving}
            onGeneratePdf={handleGeneratePdf}
            isGeneratingPdf={isGeneratingPdf}
            onSendEmail={() => setShowEmailModal(true)}
          />
        </div>

        {/* Modal simple de resultado */}
        {showSuccessModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl text-center max-w-sm w-full">
              <div
                className={`mx-auto mb-4 text-5xl ${
                  /error/i.test(modalTitle) ? 'text-red-500' : 'text-green-500'
                }`}
              >
                {/error/i.test(modalTitle) ? '✕' : '✓'}
              </div>

              <h3 className="text-xl font-semibold mb-2">{modalTitle}</h3>
              <p className="text-gray-600 mb-6">{modalMessage}</p>
              <div className="space-y-3">
                <Button
                  onClick={() => { setShowSuccessModal(false); setIsGeneratingPdf(false); resetInspection(); navigate('/new-inspection'); }}
                  className="w-full"
                >
                  Start New Inspection
                </Button>
                <Button onClick={handleViewInspections} variant="outline" className="w-full">
                  View All Inspections
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Modal para email */}
        {showEmailModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl text-center max-w-sm w-full">
              <h3 className="text-xl font-semibold mb-4">Send Report by Email</h3>
              <div className="mb-4">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter recipient's email"
                  aria-label="Recipient email address"
                  className="w-full min-h-[44px] p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="flex-1 font-semibold rounded-lg px-5 py-2.5 text-sm border border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendEmail}
                  className={`flex-1 font-semibold rounded-lg px-5 py-2.5 text-sm text-white shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all ${
                    !email || isSendingEmail ? 'opacity-60 cursor-not-allowed' : 'hover:opacity-90'
                  }`}
                  style={{ backgroundColor: 'var(--app-color-primary)' }}
                  disabled={!email || isSendingEmail}
                >
                  {isSendingEmail ? (
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending...
                    </span>
                  ) : 'Send Email'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SummaryScreen;
