// components/SectionItemCard.tsx
// Phase 3: one inspection checklist item — status chips + comment + photo evidence.
// Reuses PhotoUploadCard + the existing compression pipeline (via parent handler).

import React from 'react';
import { Check } from 'lucide-react';
import { InspectionItemStatus, Photo, SectionItemState } from '../types.ts';
import { ITEM_STATUSES, SectionItemDef } from '../services/inspectionSections.ts';
import PhotoUploadCard from './PhotoUploadCard.tsx';

interface SectionItemCardProps {
  item: SectionItemDef;
  state: SectionItemState;
  onStatusChange: (status: InspectionItemStatus | null) => void;
  onCommentChange: (comment: string) => void;
  onPhotoChange: (file: File | null) => void;
  photoError?: string | null;
}

const SectionItemCard: React.FC<SectionItemCardProps> = ({
  item,
  state,
  onStatusChange,
  onCommentChange,
  onPhotoChange,
  photoError,
}) => {
  const photoSlot: Photo = state.photo ?? {
    id: item.id,
    name: item.label,
    base64: null,
    file: null,
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-800">{item.label}</h3>
        <div className="flex items-center gap-2">
          {item.photoRequired && (
            <span className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
              Required
            </span>
          )}
          {photoSlot.base64 && (
            <span className="flex items-center text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              <Check size={12} className="mr-1" /> Captured
            </span>
          )}
        </div>
      </div>
      {item.hint && <p className="text-xs text-gray-500 mb-2">{item.hint}</p>}

      <p className="text-xs font-medium text-gray-600 mb-1.5 mt-2">Condition</p>
      <div className="flex flex-wrap gap-2 mb-3">
        {ITEM_STATUSES.map((s) => {
          const active = state.status === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onStatusChange(active ? null : s.id)}
              aria-pressed={active}
              className={`min-h-[44px] px-4 text-xs font-semibold rounded-full border transition-colors ${
                active
                  ? 'text-white border-transparent'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              style={active ? { backgroundColor: 'var(--app-color-primary)' } : undefined}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      <PhotoUploadCard
        photoSlot={{ ...photoSlot, name: `${item.label} Photo` }}
        onPhotoChange={(_slotId, file) => onPhotoChange(file)}
        errorMessage={photoError}
      />

      <label className="block text-xs font-medium text-gray-600 mt-3 mb-1" htmlFor={`comment-${item.id}`}>
        Comment (optional)
      </label>
      <textarea
        id={`comment-${item.id}`}
        value={state.comment ?? ''}
        onChange={(e) => onCommentChange(e.target.value)}
        placeholder={`Add a note about ${item.label.toLowerCase()}...`}
        rows={2}
        className="w-full px-3 py-2 text-sm text-gray-800 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none placeholder-gray-400"
        style={{ backgroundColor: 'var(--app-color-input-background)' }}
      />
    </div>
  );
};

export default SectionItemCard;
