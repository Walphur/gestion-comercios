/** Resultado de interpretación IA (Fase 4 hardened). */

export interface ActionExplanation {
  action_index: number;
  explanation: string;
}

export interface BusinessInterpretation {
  summary: string;
  insights: string[];
  action_explanations: ActionExplanation[];
  caveats: string[];
  engine?: "openai" | "workers-ai";
  model?: string;
  generated_at: string;
}

export interface CachedInterpretation {
  payload_hash: string;
  computed_at: string;
  interpretation: BusinessInterpretation;
}

export interface BusinessInterpretationRequest {
  payload: unknown;
  machine_id: string;
  show_profits: boolean;
}
