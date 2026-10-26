import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import {
  Copy20Regular,
  Checkmark20Regular,
  ZoomIn20Regular,
  ZoomOut20Regular,
  ArrowReset20Regular,
  Warning20Regular,
  FullScreenMaximize20Regular,
  FullScreenMinimize20Regular,
} from '@fluentui/react-icons';
import { Tooltip, Button } from '@fluentui/react-components';

interface MermaidDiagramProps {
  chart: string;
}

let mermaidInitialized = false;

export const MermaidDiagram: React.FC<MermaidDiagramProps> = ({ chart }) => {
  const [svgContent, setSvgContent] = useState<string>('');
  const [intrinsicWidth, setIntrinsicWidth] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [scale, setScale] = useState<number>(1);
  const [mode, setMode] = useState<'fit' | 'actual'>('actual');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showRaw, setShowRaw] = useState<boolean>(false);

  useEffect(() => {
    if (!mermaidInitialized) {
      mermaid.initialize({
        startOnLoad: false,
        theme: 'dark',
        securityLevel: 'loose',
        fontFamily: "'Segoe UI Variable', 'Segoe UI', system-ui, sans-serif",
        themeVariables: {
          darkMode: true,
          background: '#0f172a',
          primaryColor: '#742774',
          primaryTextColor: '#f8fafc',
          primaryBorderColor: '#893289',
          lineColor: '#94a3b8',
          secondaryColor: '#1e293b',
          tertiaryColor: '#090d16',
        },
      });
      mermaidInitialized = true;
    }

    let isMounted = true;
    const renderDiagram = async () => {
      try {
        setError(null);
        const cleanChart = chart.trim();
        if (!cleanChart) return;

        const id = `mermaid_${Math.random().toString(36).substring(2, 9)}`;
        const { svg } = await mermaid.render(id, cleanChart);
        if (isMounted) {
          // Extract natural/intrinsic width from mermaid output (e.g. style="max-width: 3200px;")
          const match = /style="[^"]*max-width:\s*([0-9.]+)px/i.exec(svg);
          if (match) {
            const w = parseFloat(match[1]);
            setIntrinsicWidth(w);
            // Default wide diagrams (>900px) to 'actual' mode so they don't appear squished
            if (w > 900) {
              setMode('actual');
            }
          }
          setSvgContent(svg);
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Mermaid render error:', err);
          setError(err?.message || 'Failed to render diagram syntax.');
        }
      }
    };

    renderDiagram();
    return () => {
      isMounted = false;
    };
  }, [chart]);

  // Handle ESC key for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(chart);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleZoomIn = () => {
    setScale((s) => Math.min(+(s + 0.25).toFixed(2), 4.0));
  };

  const handleZoomOut = () => {
    setScale((s) => Math.max(+(s - 0.25).toFixed(2), 0.25));
  };

  const handleReset = () => {
    setScale(1);
    setMode('actual');
  };

  const toggleMode = () => {
    setMode((m) => (m === 'fit' ? 'actual' : 'fit'));
    setScale(1);
  };

  const renderToolbar = (fullscreenMode = false) => (
    <div className="flex items-center justify-between px-4 py-2 bg-slate-900/95 border-b border-slate-800 text-xs text-slate-400 select-none">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
        <span className="font-semibold text-slate-200">
          {fullscreenMode ? 'Full Screen Diagram Viewer' : 'Mermaid Diagram'}
        </span>
        <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-purple-300 font-mono">
          {Math.round(scale * 100)}%
        </span>
        {intrinsicWidth && (
          <span className="text-[10px] text-slate-500 hidden sm:inline">
            ({Math.round(intrinsicWidth)}px native width)
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Tooltip content="Zoom In" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<ZoomIn20Regular />}
            onClick={handleZoomIn}
          />
        </Tooltip>

        <Tooltip content="Zoom Out" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<ZoomOut20Regular />}
            onClick={handleZoomOut}
          />
        </Tooltip>

        <Tooltip content="Reset Zoom (100%)" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={<ArrowReset20Regular />}
            onClick={handleReset}
          />
        </Tooltip>

        {intrinsicWidth && (
          <button
            onClick={toggleMode}
            className={`px-2 py-0.5 rounded text-[11px] font-medium transition ${
              mode === 'actual'
                ? 'bg-purple-900/40 text-purple-300 border border-purple-500/40'
                : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title={mode === 'actual' ? 'Switch to Fit Width' : 'Switch to 100% Native Size'}
          >
            {mode === 'actual' ? '100% Actual Size' : 'Fit to Width'}
          </button>
        )}

        <div className="w-px h-3 bg-slate-700 mx-1" />

        <Button
          appearance="subtle"
          size="small"
          icon={fullscreenMode ? <FullScreenMinimize20Regular className="text-purple-400" /> : <FullScreenMaximize20Regular />}
          onClick={() => setIsFullscreen(!fullscreenMode)}
        >
          <span className="hidden sm:inline text-xs">{fullscreenMode ? 'Exit Fullscreen' : 'Fullscreen'}</span>
        </Button>

        <button
          onClick={() => setShowRaw(!showRaw)}
          className="px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition text-[11px]"
        >
          {showRaw ? 'View Diagram' : 'View Code'}
        </button>

        <Tooltip content="Copy Mermaid syntax" relationship="label">
          <Button
            appearance="subtle"
            size="small"
            icon={copied ? <Checkmark20Regular className="text-emerald-400" /> : <Copy20Regular />}
            onClick={handleCopy}
          />
        </Tooltip>
      </div>
    </div>
  );

  const renderContent = () => {
    if (showRaw) {
      return (
        <pre className="text-xs font-mono text-slate-300 w-full p-4 overflow-x-auto bg-slate-900 rounded-lg">
          {chart}
        </pre>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center p-6 text-center text-amber-400">
          <Warning20Regular className="w-6 h-6 mb-2" />
          <p className="text-sm font-medium">Diagram Syntax Error</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md font-mono">{error}</p>
          <button
            onClick={() => setShowRaw(true)}
            className="mt-3 text-xs underline text-purple-400 hover:text-purple-300"
          >
            View source syntax
          </button>
        </div>
      );
    }

    if (!svgContent) {
      return (
        <div className="text-xs text-slate-500 animate-pulse text-center py-12">
          Rendering diagram...
        </div>
      );
    }

    // Determine width based on mode and scale
    const targetWidth =
      mode === 'actual' && intrinsicWidth
        ? `${Math.round(intrinsicWidth * scale)}px`
        : `${Math.round(scale * 100)}%`;

    return (
      <div className="w-full overflow-auto p-4 flex justify-center bg-slate-950/60 min-h-[220px]">
        <div
          style={{
            width: targetWidth,
            minWidth: targetWidth,
            maxWidth: 'none',
            transition: 'width 0.15s ease-out',
          }}
          className="flex justify-center [&_svg]:w-full [&_svg]:h-auto [&_svg]:max-w-none"
          dangerouslySetInnerHTML={{ __html: svgContent }}
        />
      </div>
    );
  };

  return (
    <>
      {/* Standard embedded view */}
      <div className="my-6 rounded-xl border border-slate-800 bg-slate-900/80 shadow-lg overflow-hidden backdrop-blur-sm">
        {renderToolbar(false)}
        {renderContent()}
      </div>

      {/* Fullscreen interactive modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 backdrop-blur-md flex flex-col animate-in fade-in duration-150">
          {renderToolbar(true)}
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            {renderContent()}
          </div>
        </div>
      )}
    </>
  );
};
