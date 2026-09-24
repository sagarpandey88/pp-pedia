import React, { useRef, useState } from 'react';
import { Upload, FileArchive, Sparkles, Loader2 } from 'lucide-react';
import { createSampleSolutionZip } from '../../assets/sampleSolution';

interface UploadZoneProps {
  onFileSelected: (file: File | Blob) => void;
  isProcessing?: boolean;
}

export const UploadZone: React.FC<UploadZoneProps> = ({
  onFileSelected,
  isProcessing = false,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.zip')) {
        onFileSelected(file);
      } else {
        alert('Please upload a Power Platform solution .zip archive.');
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      onFileSelected(file);
    }
  };

  const handleLoadSample = async () => {
    try {
      setIsGeneratingSample(true);
      const blob = await createSampleSolutionZip();
      onFileSelected(blob);
    } catch (err) {
      console.error('Error generating sample solution:', err);
    } finally {
      setIsGeneratingSample(false);
    }
  };

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-2xl p-8 lg:p-10 transition-all text-center flex flex-col items-center justify-center ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-950/20'
            : 'border-slate-800 hover:border-slate-700 bg-slate-900/30'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-4">
          <FileArchive className="w-7 h-7" />
        </div>

        <h3 className="text-base font-semibold text-slate-100">
          Upload Power Platform Solution
        </h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Drag & drop your exported <code className="text-indigo-300">.zip</code> solution file here, or browse from your computer. Files are processed completely in your browser.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 transition shadow-lg shadow-indigo-600/20 disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Select .ZIP File</span>
          </button>

          <span className="text-xs text-slate-500">or</span>

          <button
            onClick={handleLoadSample}
            disabled={isProcessing || isGeneratingSample}
            className="px-4 py-2 bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700/80 rounded-xl text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50"
          >
            {isGeneratingSample ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>Load Sample Solution (Contoso Customer Support)</span>
          </button>
        </div>

        <div className="mt-4 flex items-center gap-4 text-[11px] text-slate-500">
          <span>✓ 100% Client-Side Processing</span>
          <span>•</span>
          <span>✓ Zero Remote Uploads</span>
          <span>•</span>
          <span>✓ IndexedDB Persistent PGlite</span>
        </div>
      </div>
    </div>
  );
};

