// components/InspectionListCard.tsx
// Phase 6: shared metadata-only inspection card (Home + Saved list).
// Renders identity/status/progress — never photo data.

import React from 'react';
import { FileDown, Trash2, Edit3, Mail, Eye } from 'lucide-react';
import Button from './Button.tsx';
import {
  canGeneratePdf,
  InspectionMetadata,
  pdfActionLabel,
} from '../services/inspectionList.ts';
import { STATUS_LABELS } from '../services/inspectionSections.ts';

interface InspectionListCardProps {
  meta: InspectionMetadata;
  onContinue: (id: string) => void;
  onSummary: (id: string) => void;
  onPdf: (id: string) => void;
  onDelete: (id: string) => void;
  onEmail?: (id: string) => void;
  pdfBusy?: boolean;
}

const fmtUpdated = (iso: string): string => {
  if (!iso) return 'Unknown date';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'Unknown date';
  return new Date(t).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const InspectionListCard: React.FC<InspectionListCardProps> = ({
  meta,
  onContinue,
  onSummary,
  onPdf,
  onDelete,
  onEmail,
  pdfBusy = false,
}) => {
  const primary = meta.vehicles[0];
  const title = primary && (primary.make || primary.model)
    ? [primary.make, primary.model].filter(Boolean).join(' ')
    : 'Vehicle Details';
  const reg = primary?.registrationNumber || '';
  const canPdf = canGeneratePdf(meta);
  const stale = meta.status === 'PDF_STALE';

  return (
    <div className="bg-white p-4 rounded-lg shadow border border-gray-200 mb-4">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-md font-semibold app-text-primary truncate">{title}</h3>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {STATUS_LABELS[meta.status]}
            </span>
            {meta.vehicleCount > 1 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 border border-gray-200">
                {meta.vehicleCount} vehicles
              </span>
            )}
          </div>
          {reg ? <p className="text-xs font-semibold text-gray-700 mt-1">Reg: {reg}</p> : null}
          <p className="text-xs text-gray-500">Insured: {meta.insuredName || '(Not provided)'}</p>
          <p className="text-xs text-gray-500">Updated: {fmtUpdated(meta.updatedAt)}</p>
          <div className="mt-1.5">
            <div className="h-1.5 w-32 rounded-full bg-gray-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-green-500"
                style={{ width: `${meta.progressPct}%` }}
              />
            </div>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {meta.progressPct}% · {meta.requiredDone}/{meta.requiredTotal} required
              {meta.photoCount > 0 ? ` · ${meta.photoCount} photos` : ''}
            </p>
          </div>
          {stale && (
            <p className="text-[11px] font-semibold text-amber-700 mt-1">
              Inspection changed — regenerate PDF.
            </p>
          )}
        </div>
        <div className="flex flex-col space-y-2 items-end shrink-0">
          <Button
            onClick={() => onPdf(meta.id)}
            variant="outline"
            size="sm"
            isLoading={pdfBusy}
            disabled={!canPdf}
            title={canPdf ? pdfActionLabel(meta) : 'Complete required inspection items before generating the final report.'}
            className="app-text-primary app-border-primary w-full justify-start"
          >
            <FileDown size={16} className="mr-1" /> {pdfBusy ? 'Processing...' : pdfActionLabel(meta)}
          </Button>
          {onEmail && (
            <Button onClick={() => onEmail(meta.id)} variant="outline" size="sm" className="w-full justify-start">
              <Mail size={16} className="mr-1" /> Email PDF
            </Button>
          )}
          <Button onClick={() => onSummary(meta.id)} variant="outline" size="sm" className="w-full justify-start">
            <Eye size={16} className="mr-1" /> Summary
          </Button>
          <Button onClick={() => onContinue(meta.id)} variant="outline" size="sm" className="w-full justify-start">
            <Edit3 size={16} className="mr-1" /> Continue
          </Button>
          <Button onClick={() => onDelete(meta.id)} variant="danger" size="sm" className="w-full justify-start">
            <Trash2 size={16} className="mr-1" /> Delete
          </Button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-2 break-all">ID: {meta.id}</p>
    </div>
  );
};

export default InspectionListCard;
