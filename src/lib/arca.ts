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
