import React, { useState, useEffect, useCallback, useContext } from 'react';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, FileText } from 'lucide-react';
import PageContainer from '../components/PageContainer.tsx';
import Button from '../components/Button.tsx';
import ConfirmationModal from '../components/ConfirmationModal.tsx';
import InspectionListCard from '../components/InspectionListCard.tsx';
import { SavedInspection, InspectionStep } from '../types.ts';
import {
  deleteInspectionById,
  describeSaveError,
  getInspectionById,
  getInspectionMetadata,
  saveInspection,
} from '../services/inspectionService';
import { generatePdf, generatePdfBlob, buildPdfFilename } from '../services/pdfGenerator.ts';
import { sendInspectionEmail, formatEmailError } from '../services/emailService.ts';
import { ensureInspectionId } from '../utils/inspectionIds.ts';
import { InspectionMetadata, sortByUpdatedDesc } from '../services/inspectionList.ts';
import { InspectionContext } from '../App.tsx';

const InspectionsListScreen: React.FC = () => {
  // Metadata-only list state (never photo payloads).
  const [metas, setMetas] = useState<InspectionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
  const [inspectionToDeleteId, setInspectionToDeleteId] = useState<string | null>(null);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [currentEmail, setCurrentEmail] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [currentInspectionForEmail, setCurrentInspectionForEmail] = useState<SavedInspection | null>(null);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const navigate = useNavigate();
  const context = useContext(InspectionContext);

  if (!context) {
    console.error('InspectionContext not found in InspectionsListScreen');
    return <div className="p-4">Error: Application context is not available.</div>;
  }

  const { setCurrentInspection, setCurrentStep, setCurrentVehicleIndex, setCurrentSection } = context;

  const fetchMetas = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await getInspectionMetadata();
      setMetas(sortByUpdatedDesc(list));
    } catch (e) {
      console.error('Failed to load inspections:', e);
      toast.error('Could not load inspections.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetas();
  }, [fetchMetas]);

  const triggerDeleteInspection = (id: string) => {
    setInspectionToDeleteId(id);
    setShowDeleteConfirmModal(true);
  };

  const confirmDeleteInspection = async () => {
    if (!inspectionToDeleteId) {
      setShowDeleteConfirmModal(false);
      return;
    }
    const id = inspectionToDeleteId;
    setInspectionToDeleteId(null);
    setShowDeleteConfirmModal(false);
    try {
      await deleteInspectionById(id);
      setMetas((prev) => prev.filter((m) => m.id !== id));
      toast.success('Inspection deleted.');
    } catch (e) {
      console.error('Delete failed:', e);
      toast.error(describeSaveError(e));
    }
  };

  const cancelDeleteInspection = () => {
    setInspectionToDeleteId(null);
    setShowDeleteConfirmModal(false);
  };

  const handleDownloadPdf = async (id: string) => {
    if (pdfBusyId) return;
    setPdfBusyId(id);
    try {
      const inspection = await getInspectionById(id);
      if (!inspection) {
        toast.error('Could not find the inspection.');
        return;
      }
      await generatePdf(inspection);
      const now = new Date().toISOString();
      const updated: SavedInspection = {
        ...inspection,
        id: ensureInspectionId(inspection.id),
        pdfGenerated: true,
        pdfGeneratedAt: now,
        updatedAt: now,
      };
      await saveInspection(updated);
      const list = await getInspectionMetadata();
      setMetas(sortByUpdatedDesc(list));
      toast.success('PDF generated.');
    } catch (error) {
      toast.error(`Failed to download PDF: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPdfBusyId(null);
    }
  };

  const handleEditInspection = async (id: string) => {
    const inspectionToEdit = await getInspectionById(id);
    if (inspectionToEdit) {
      setCurrentInspection(inspectionToEdit);
      setCurrentVehicleIndex(0);
      setCurrentStep(InspectionStep.VEHICLE_DETAILS);
      setCurrentSection('vehicle_details');
      navigate('/new-inspection');
    } else {
      toast.error('Error: Could not find the inspection to edit.');
      console.error('Inspection with ID not found for editing:', id);
    }
  };

  const handleSummaryInspection = async (id: string) => {
    const full = await getInspectionById(id);
    if (!full) {
      toast.error('Could not find the inspection.');
      return;
    }
    setCurrentInspection(full);
    setCurrentVehicleIndex(0);
    setCurrentStep(InspectionStep.SUMMARY);
    navigate('/summary');
  };

  const handleEmailPdf = async (id: string) => {
    const full = await getInspectionById(id);
    if (!full) {
      toast.error('Could not find the inspection.');
      return;
    }
    setCurrentInspectionForEmail(full);
    setCurrentEmail((full as any).emailAddress || '');
    setEmailError(null);
    setShowEmailModal(true);
  };

  const handleSendEmail = async () => {
    if (!currentInspectionForEmail || !currentEmail) return;

    setIsSendingEmail(true);
    setEmailError(null);

    try {
      const blob = await generatePdfBlob(currentInspectionForEmail);
      const filename = buildPdfFilename(currentInspectionForEmail);

      await sendInspectionEmail(blob, currentEmail, {
        filename,
        policyNumber: currentInspectionForEmail.policyNumber,
        subject: `Informe de Inspección - ${new Date().toLocaleDateString()}`,
        html: `
          <h1>Inspección de Vehículo</h1>
          <p>Hola,</p>
          <p>Adjunto encontrarás el informe de inspección para ${currentInspectionForEmail.insuredName || 'tu vehículo'}.</p>
          <p><strong>Detalles:</strong></p>
          <ul>
            <li>Agente: ${currentInspectionForEmail.agentName || 'No especificado'}</li>
            <li>Fecha: ${new Date().toLocaleDateString()}</li>
            <li>N° de Póliza: ${currentInspectionForEmail.policyNumber || 'N/A'}</li>
          </ul>
          <p>Gracias por usar AutoInspect.</p>
        `,
      });

      const emailedAt = new Date().toISOString();
      const updatedInspection = {
        ...currentInspectionForEmail,
        id: ensureInspectionId(currentInspectionForEmail.id),
        emailSent: true,
        emailAddress: currentEmail,
        sentAt: emailedAt,
        pdfGenerated: true,
        pdfGeneratedAt: emailedAt,
        updatedAt: emailedAt,
      };

      await saveInspection(updatedInspection);

      const list = await getInspectionMetadata();
      setMetas(sortByUpdatedDesc(list));

      toast.success('¡Correo enviado exitosamente!');
      setShowEmailModal(false);
    } catch (e: any) {
      console.error('Error en el proceso de envío:', e);
      const msg = formatEmailError(e);
      setEmailError(msg);
      toast.error(msg);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const inspectionBeingDeleted = metas.find((m) => m.id === inspectionToDeleteId);
  const firstVehicle = inspectionBeingDeleted?.vehicles[0];
  const vehicleInfoForModal =
    firstVehicle && (firstVehicle.make || firstVehicle.model)
      ? `${firstVehicle.make} ${firstVehicle.model}`.trim()
      : 'this inspection';

  return (
    <PageContainer title="Saved Inspections">
      {isLoading ? (
        <div className="flex justify-center items-center h-full">
          <p>Loading inspections...</p>
        </div>
      ) : metas.length === 0 ? (
        <div className="text-center py-10">
          <FileText size={48} className="mx-auto text-gray-400 mb-4" />
          <h3 className="text-xl font-semibold text-gray-700 mb-2">No Inspections Found</h3>
          <p className="text-gray-500 mb-6">Start by creating a new vehicle inspection.</p>
          <Button onClick={() => navigate('/new-inspection')} size="lg">
            <PlusCircle size={20} className="mr-2" />
            Create New Inspection
          </Button>
        </div>
      ) : (
        <div className="p-1">
          <p className="text-xs text-gray-500 mb-2 px-1">
            {metas.length} saved · sorted by most recently updated
          </p>
          {metas.map((meta) => (
            <InspectionListCard
              key={meta.id}
              meta={meta}
              onContinue={handleEditInspection}
              onSummary={handleSummaryInspection}
              onPdf={handleDownloadPdf}
              onDelete={triggerDeleteInspection}
              onEmail={handleEmailPdf}
              pdfBusy={pdfBusyId === meta.id}
            />
          ))}
          <div className="mt-8 flex justify-center">
            <Button onClick={() => navigate('/new-inspection')} size="lg" variant="primary">
              <PlusCircle size={20} className="mr-2" />
              Create Another Inspection
            </Button>
          </div>
        </div>
      )}
      <ConfirmationModal
        isOpen={showDeleteConfirmModal}
        onClose={cancelDeleteInspection}
        onConfirm={confirmDeleteInspection}
        title="Confirmar eliminación"
        message={`¿Estás seguro de que deseas eliminar ${vehicleInfoForModal}? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        confirmVariant="danger"
      />

      {/* Email Modal */}
      <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 ${showEmailModal ? 'block' : 'hidden'}`}>
        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold">Enviar PDF por correo</h3>
            <button
              onClick={() => setShowEmailModal(false)}
              className="text-gray-500 hover:text-gray-700 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
              disabled={isSendingEmail}
              aria-label="Close email dialog"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSendEmail(); }} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Correo electrónico
              </label>
              <input
                type="email"
                id="email"
                value={currentEmail}
                onChange={(e) => setCurrentEmail(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ingrese el correo electrónico"
                required
                disabled={isSendingEmail}
              />
              {emailError && (
                <p className="mt-1 text-sm text-red-600">{emailError}</p>
              )}
            </div>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                disabled={isSendingEmail}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSendingEmail || !currentEmail}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 flex items-center"
              >
                {isSendingEmail ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Enviando...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                    Enviar correo
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </PageContainer>
  );
};

export default InspectionsListScreen;
