import React, { ChangeEvent, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { Camera, Images, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import { Photo } from '../types.ts';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from '../constants.ts';

interface PhotoUploadCardProps {
  photoSlot: Photo;
  onPhotoChange: (photoSlotId: string, file: File | null) => void;
  errorMessage?: string | null;
}

const PhotoUploadCard: React.FC<PhotoUploadCardProps> = ({ photoSlot, onPhotoChange, errorMessage }) => {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const resetInputs = () => {
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // User cancelled the picker/camera: keep the existing photo untouched.
    if (!file) {
      resetInputs();
      return;
    }
    if (file.size === 0) {
      toast.error('That photo looks empty. Please take or choose another photo — your previous photo was kept.');
      resetInputs();
      return;
    }
    if (file.type && !file.type.startsWith('image/')) {
      toast.error('That file is not a photo. Please choose an image — your previous photo was kept.');
      resetInputs();
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      // Do NOT clear a previously captured photo on a failed pick.
      toast.error(`That photo is larger than ${MAX_FILE_SIZE_MB}MB. Please take a smaller photo — your previous photo was kept.`);
      resetInputs();
      return;
    }
    onPhotoChange(photoSlot.id, file);
    resetInputs();
  };

  const handleRemovePhoto = () => {
    onPhotoChange(photoSlot.id, null);
    resetInputs();
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow border border-gray-200 min-w-0">
      <h3 className="text-sm font-semibold text-gray-700 mb-2">{photoSlot.name}</h3>
      {/* Camera-first input (opens the camera on phones, picker on desktop) */}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        ref={cameraInputRef}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      {/* Gallery input (lets the inspector pick an existing photo) */}
      <input
        type="file"
        accept="image/*"
        ref={galleryInputRef}
        onChange={handleFileChange}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      {photoSlot.base64 ? (
        <div>
          <div className="relative group">
            <img src={photoSlot.base64} alt={photoSlot.name} className="w-full h-32 object-cover rounded-md" />
            <div className="absolute inset-0 bg-black bg-opacity-50 hidden sm:flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
              <button
                onClick={() => cameraInputRef.current?.click()}
                className="p-2 text-white hover:app-text-accent"
                title="Retake Photo"
                aria-label={`Retake ${photoSlot.name} photo`}
              >
                <RefreshCw size={24} />
              </button>
              <button
                onClick={handleRemovePhoto}
                className="p-2 text-white hover:text-red-300"
                title="Remove Photo"
                aria-label={`Remove ${photoSlot.name} photo`}
              >
                <XCircle size={24} />
              </button>
            </div>
          </div>
          {/* Always-visible actions for touch devices (no hover on mobile) */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              aria-label={`Retake ${photoSlot.name} photo`}
              className="min-h-[44px] inline-flex items-center justify-center px-3 text-sm font-medium rounded-lg border border-gray-300 bg-white text-gray-700"
            >
              <RefreshCw size={16} className="mr-1.5" /> Retake
            </button>
            <button
              type="button"
              onClick={handleRemovePhoto}
              aria-label={`Remove ${photoSlot.name} photo`}
              className="min-h-[44px] inline-flex items-center justify-center px-3 text-sm font-medium rounded-lg border border-red-300 bg-white text-red-600"
            >
              <XCircle size={16} className="mr-1.5" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            aria-label={`Take ${photoSlot.name} photo with camera`}
            className="w-full min-h-[44px] py-3 border-2 border-dashed border-gray-300 rounded-md flex flex-col items-center justify-center text-gray-400 hover:app-border-accent hover:app-text-accent transition-colors"
          >
            <Camera size={32} />
            <span className="mt-1 text-xs font-medium">Tap to take photo</span>
          </button>
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            aria-label={`Choose ${photoSlot.name} photo from gallery`}
            className="w-full min-h-[44px] mt-2 inline-flex items-center justify-center px-3 text-sm text-gray-600"
          >
            <Images size={16} className="mr-1.5" /> Choose from gallery
          </button>
        </div>
      )}
      {errorMessage && (
          <p className="mt-2 text-xs text-red-500 flex items-center" role="alert">
            <AlertTriangle size={14} className="mr-1 shrink-0" />
            {errorMessage}
          </p>
        )}
      {!photoSlot.base64 && photoSlot.name.toLowerCase().includes('(optional)') && (
        <p className="mt-2 text-xs text-gray-400 italic">Optional</p>
      )}
    </div>
  );
};

export default PhotoUploadCard;
