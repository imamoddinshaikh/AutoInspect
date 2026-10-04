import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import PageContainer from '../components/PageContainer.tsx';
import Button from '../components/Button.tsx';
import ConfirmationModal from '../components/ConfirmationModal.tsx';
import InspectionListCard from '../components/InspectionListCard.tsx';
import { PlusCircle, Search, FlaskConical, ChevronLeft, ChevronRight } from 'lucide-react';
import { APP_NAME } from '../constants.ts';
import { InspectionContext } from '../App.tsx';
import { InspectionStep } from '../types.ts';
import {
  deleteInspectionById,
  describeSaveError,
  getInspectionById,
  getInspectionMetadata,
  saveInspection,
} from '../services/inspectionService.ts';
import { generatePdf } from '../services/pdfGenerator.ts';
import { ensureDemoInspection } from '../services/demoInspection.ts';
import { ensureInspectionId } from '../utils/inspectionIds.ts';
import {
  computeCounts,
  filterByStatus,
  InspectionMetadata,
  matchesSearch,
  PAGE_SIZE,
  paginate,
  sortByUpdatedDesc,
  StatusFilter,
  STATUS_FILTERS,
} from '../services/inspectionList.ts';

const HomeScreen: React.FC = () => {
  const navigate = useNavigate();
  const context = useContext(InspectionContext);

  // Read-only list state: metadata only, never photo payloads.
  const [entries, setEntries] = useState<InspectionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [pdfBusyId, setPdfBusyId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isLoadingDemo, setIsLoadingDemo] = useState(false);

  const fetchMetadata = useCallback(async () => {
    setIsLoading(true);
    try {
      const metas = await getInspectionMetadata();
      setEntries(sortByUpdatedDesc(metas));
    } catch (e) {
      console.error('Failed to load inspections:', e);
      toast.error('Could not load inspections.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  useEffect(() => {
    setPage(1);
  }, [query, filter]);

  const counts = useMemo(() => computeCounts(entries), [entries]);

  const visible = useMemo(() => {
    const searched = entries.filter((e) => matchesSearch(e, query));
    return filterByStatus(searched, filter);
  }, [entries, query, filter]);

  const paged = useMemo(() => paginate(visible, page, PAGE_SIZE), [visible, page]);

  const handleStartNewInspection = () => {
    context?.resetInspection();
    navigate('/new-inspection');
  };

  const resume = async (id: string, step: InspectionStep, route: string) => {
    const full = await getInspectionById(id);
    if (!full) {
      toast.error('Could not find the inspection.');
      return;
    }
    context?.setCurrentInspection(full);
    context?.setCurrentVehicleIndex(0);
    context?.setCurrentStep(step);
    context?.setCurrentSection('vehicle_details');
    navigate(route);
  };

  const handlePdf = async (id: string) => {
    if (pdfBusyId) return;
    setPdfBusyId(id);
    try {
      const full = await getInspectionById(id);
      if (!full) {
        toast.error('Could not find the inspection.');
        return;
      }
      await generatePdf(full);
      const now = new Date().toISOString();
      const updated = {
        ...full,
        id: ensureInspectionId(full.id),
        pdfGenerated: true,
        pdfGeneratedAt: now,
        updatedAt: now,
      };
      await saveInspection(updated);
      const metas = await getInspectionMetadata();
      setEntries(sortByUpdatedDesc(metas));
      toast.success('PDF generated.');
    } catch (e) {
      console.error('PDF action failed:', e);
      toast.error(describeSaveError(e));
    } finally {
      setPdfBusyId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      await deleteInspectionById(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      toast.success('Inspection deleted.');
    } catch (e) {
      console.error('Delete failed:', e);
      toast.error(describeSaveError(e));
    }
  };

  const handleLoadDemo = async () => {
    if (isLoadingDemo) return;
    setIsLoadingDemo(true);
    try {
      const { created } = await ensureDemoInspection();
      const metas = await getInspectionMetadata();
      setEntries(sortByUpdatedDesc(metas));
      toast.success(created ? 'Demo inspection loaded.' : 'Demo inspection already exists.');
    } catch (e) {
      console.error('Demo load failed:', e);
      toast.error('Could not load the demo inspection.');
    } finally {
      setIsLoadingDemo(false);
    }
  };

  const deleting = entries.find((e) => e.id === deleteId);
  const deletingLabel =
    deleting && deleting.vehicles[0] && (deleting.vehicles[0].make || deleting.vehicles[0].model)
      ? `${deleting.vehicles[0].make} ${deleting.vehicles[0].model}`.trim()
      : 'this inspection';

  return (
    <PageContainer className="px-2 sm:px-4">
      {/* Compact header (keeps branding + primary entry point) */}
      <div className="flex items-center justify-between mb-4 px-1">
        <div>
          <h1 className="text-2xl font-extrabold" style={{ color: 'var(--app-color-primary)' }}>
            {APP_NAME}
          </h1>
          <p className="text-xs" style={{ color: 'var(--app-color-secondary-text)' }}>
            Vehicle inspections on this device
          </p>
        </div>
        <Button onClick={handleStartNewInspection} size="lg" aria-label="Start New Vehicle Inspection">
          <PlusCircle size={20} className="mr-2" /> New
        </Button>
      </div>

      {/* Dashboard counts (canonical lifecycle, metadata only) */}
      <div className="grid grid-cols-5 gap-1.5 mb-4">
        {[
          { label: 'Total', value: counts.total },
          { label: 'Draft', value: counts.DRAFT },
          { label: 'In Prog.', value: counts.IN_PROGRESS },
          { label: 'Done', value: counts.COMPLETED },
          { label: 'Stale', value: counts.PDF_STALE },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-lg shadow border border-gray-200 text-center py-2 px-1">
            <p className="text-lg font-bold app-text-primary">{c.value}</p>
            <p className="text-[10px] text-gray-500 font-medium">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-3">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search reg, make, model, inspection ID..."
          aria-label="Search inspections"
          className="w-full pl-10 pr-3 py-2.5 text-sm text-gray-800 border rounded-xl shadow-sm focus:ring-2 focus:outline-none placeholder-gray-400 border-[var(--app-color-border)]"
          style={{ backgroundColor: 'var(--app-color-input-background)' }}
        />
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={`flex-shrink-0 min-h-[44px] px-3 text-xs font-semibold rounded-full border ${
              filter === f.id
                ? 'text-white border-transparent'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
            style={filter === f.id ? { backgroundColor: 'var(--app-color-primary)' } : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <p className="text-center text-gray-500 py-10">Loading inspections...</p>
      ) : entries.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-xl font-semibold text-gray-700 mb-2">No inspections yet</p>
          <p className="text-gray-500 mb-6">Create your first vehicle inspection.</p>
          <div className="space-y-3 max-w-sm mx-auto">
            <Button onClick={handleStartNewInspection} size="lg" className="w-full">
              <PlusCircle size={20} className="mr-2" /> Create New Inspection
            </Button>
            <Button onClick={handleLoadDemo} variant="outline" size="lg" className="w-full" isLoading={isLoadingDemo}>
              <FlaskConical size={20} className="mr-2" /> Load Demo Inspection
            </Button>
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-lg font-semibold text-gray-700 mb-2">No inspections match your search.</p>
          <p className="text-gray-500 mb-6">Try a different term or filter.</p>
          <Button onClick={handleLoadDemo} variant="outline" size="lg" isLoading={isLoadingDemo}>
            <FlaskConical size={20} className="mr-2" /> Load Demo Inspection
          </Button>
        </div>
      ) : (
        <div>
          <p className="text-xs text-gray-500 mb-2 px-1">
            Showing {paged.from}–{paged.to} of {paged.total} · sorted by most recently updated
          </p>
          {paged.items.map((meta) => (
            <InspectionListCard
              key={meta.id}
              meta={meta}
              onContinue={(id) => resume(id, InspectionStep.VEHICLE_DETAILS, '/new-inspection')}
              onSummary={(id) => resume(id, InspectionStep.SUMMARY, '/summary')}
              onPdf={handlePdf}
              onDelete={(id) => setDeleteId(id)}
              pdfBusy={pdfBusyId === meta.id}
            />
          ))}
          {paged.totalPages > 1 && (
            <div className="flex items-center justify-between mt-2 mb-4 px-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={paged.page <= 1}
              >
                <ChevronLeft size={16} className="mr-1" /> Prev
              </Button>
              <span className="text-xs text-gray-600 font-medium">
                Page {paged.page} of {paged.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(paged.totalPages, p + 1))}
                disabled={paged.page >= paged.totalPages}
              >
                Next <ChevronRight size={16} className="ml-1" />
              </Button>
            </div>
          )}
          <div className="mt-4 mb-6 flex justify-center">
            <Button onClick={handleLoadDemo} variant="ghost" size="sm" isLoading={isLoadingDemo}>
              <FlaskConical size={16} className="mr-2" /> Load Demo Inspection
            </Button>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={confirmDelete}
        title="Confirmar eliminación"
        message={`¿Estás seguro de que deseas eliminar ${deletingLabel}? Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        confirmVariant="danger"
      />
    </PageContainer>
  );
};

export default HomeScreen;
