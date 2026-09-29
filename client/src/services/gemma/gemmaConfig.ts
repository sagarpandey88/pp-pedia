import type { AppConfig } from '@mlc-ai/web-llm';

export const DEFAULT_GEMMA_MODEL = 'functiongemma-270m-it';

export const GEMMA_MODELS = [
  {
    id: 'functiongemma-270m-it',
    name: 'FunctionGemma 270M (Fast Tool Calling)',
    size: '~145 MB',
    vram: '~500 MB',
    recommended: true,
  },
];

export const FUNCTIONGEMMA_APP_CONFIG: AppConfig = {
  model_list: [
    {
      model: 'https://huggingface.co/conceptcodes/txpilot-functiongemma-270m-it-q4f32_1-mlc/resolve/main/mlc-q4f32_1/',
      model_id: 'functiongemma-270m-it',
      model_lib:
        'https://huggingface.co/conceptcodes/txpilot-functiongemma-270m-it-q4f32_1-mlc/resolve/main/libs/functiongemma-270m-q4f32_1-webgpu.wasm',
      vram_required_MB: 500,
    },
  ],
};
