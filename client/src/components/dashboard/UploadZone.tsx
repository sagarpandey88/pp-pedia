import React, { useRef, useState } from 'react';
import {
  FolderZip24Regular,
  ArrowUpload20Regular,
  Sparkle20Filled,
} from '@fluentui/react-icons';
import { Button, Spinner } from '@fluentui/react-components';
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
            ? 'border-purple-500 bg-purple-950/20'
            : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          onChange={handleFileChange}
          className="hidden"
        />

        <div className="w-14 h-14 rounded-2xl bg-purple-900/20 border border-purple-500/30 flex items-center justify-center text-purple-400 mb-4 shadow-inner">
          <FolderZip24Regular className="w-7 h-7 text-purple-400" />
        </div>

        <h3 className="text-base font-semibold text-slate-100">
          Upload Power Platform Solution
        </h3>
        <p className="text-xs text-slate-400 mt-1 max-w-sm">
          Drag &amp; drop your exported <code className="text-purple-300 font-mono">.zip</code> solution file here, or browse from your computer. Files are parsed completely in your browser.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
          <Button
            appearance="primary"
            icon={<ArrowUpload20Regular />}
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessing}
            size="medium"
          >
            Select .ZIP Solution
          </Button>

          <span className="text-xs text-slate-500">or</span>

          <Button
            appearance="secondary"
            icon={isGeneratingSample ? <Spinner size="extra-tiny" /> : <Sparkle20Filled className="text-amber-400" />}
            onClick={handleLoadSample}
            disabled={isProcessing || isGeneratingSample}
            size="medium"
          >
            Load Sample Solution (Contoso Customer Support)
          </Button>
        </div>

        <div className="mt-5 flex items-center gap-4 text-[11px] text-slate-500">
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
