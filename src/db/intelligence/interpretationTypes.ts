/** Resultado de interpretación IA (Fase 4). */

export interface BusinessInterpretation {
  summary: string;
  insights: string[];
  priorities: string[];
  caveats: string[];
  engine?: "openai" | "workers-ai";
  model?: string;
  generated_at: string;
}

export interface BusinessInterpretationRequest {
  payload: unknown;
}
