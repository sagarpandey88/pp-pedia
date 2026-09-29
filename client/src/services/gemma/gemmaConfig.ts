export const DEFAULT_GEMMA_MODEL = 'onnx-community/functiongemma-270m-it-ONNX';

export interface GemmaModelOption {
  id: string;
  name: string;
  size: string;
  vram: string;
  recommended: boolean;
}

export const GEMMA_MODELS: GemmaModelOption[] = [
  {
    id: 'onnx-community/functiongemma-270m-it-ONNX',
    name: 'FunctionGemma 270M (ONNX WebGPU)',
    size: '~140 MB',
    vram: '~350 MB',
    recommended: true,
  },
];
