import { invoke } from "@tauri-apps/api/core";

export interface ArcaConfigDto {
  cuit: string;
  punto_venta: number;
  ambiente: string; // "homo" | "prod"
  cert_cargado: boolean;
  key_cargada: boolean;
  configurado: boolean;
}

export interface ArcaPickedFile {
  file_name: string;
  pem: string;
}

export interface ArcaTestResult {
  ok: boolean;
  ambiente: string | null;
  servidores_ok: boolean;
  ta_expira: string | null;
  mensaje: string;
  detalle: string | null;
}

export function arcaObtenerConfig(): Promise<ArcaConfigDto> {
  return invoke<ArcaConfigDto>("arca_obtener_configuracion");
}

export function arcaGuardarConfig(params: {
  cuit: string;
  puntoVenta: number;
  ambiente: string;
  certPem: string | null;
  keyPem: string | null;
}): Promise<void> {
  return invoke("arca_guardar_configuracion", {
    cuit: params.cuit,
    puntoVenta: params.puntoVenta,
    ambiente: params.ambiente,
    certPem: params.certPem,
    keyPem: params.keyPem,
  });
}

export function arcaPickPemFile(kind: "cert" | "key"): Promise<ArcaPickedFile | null> {
  return invoke<ArcaPickedFile | null>("arca_pick_pem_file", { kind });
}

export function arcaProbarConexion(): Promise<ArcaTestResult> {
  return invoke<ArcaTestResult>("arca_probar_conexion");
}

export interface ArcaCheckStep {
  nombre: string;
  ok: boolean | null; // true = ok, false = falló, null = no ejecutado
  detalle: string | null;
}

export interface ArcaInstallReport {
  ok: boolean;
  fallo_en: string | null;
  pasos: ArcaCheckStep[];
}

export function arcaValidarInstalacion(): Promise<ArcaInstallReport> {
  return invoke<ArcaInstallReport>("arca_validar_instalacion");
}

export interface ArcaEstado {
  conectado: boolean;
  ambiente: string;
  cuit: string;
  cuit_formateado: string;
  punto_venta: number;
  token_valido: boolean;
  token_expira: string | null;
  cert_valido: boolean;
  cert_dias_restantes: number | null;
  ultimo_cae: string | null;
  ultima_comunicacion_label: string;
  simulacion: boolean;
}

export function arcaObtenerEstado(): Promise<ArcaEstado> {
  return invoke<ArcaEstado>("arca_obtener_estado");
}

export function arcaRenovarToken(): Promise<string> {
  return invoke<string>("arca_renovar_token");
}

export function arcaConsultarUltimoComprobante(cbteTipo?: number): Promise<string> {
  return invoke<string>("arca_consultar_ultimo_comprobante", { cbteTipo: cbteTipo ?? null });
}

export function arcaSetSimulacion(enabled: boolean): Promise<void> {
  return invoke("arca_set_simulacion", { enabled });
}
