import { invoke } from "@tauri-apps/api/core";

export interface MpQrOrderResult {
  order_id: string;
  external_reference: string;
  qr_data: string;
  simulated: boolean;
}

export interface MpPaymentStatus {
  status: string;
  status_detail?: string | null;
  payment_id?: string | null;
}

export interface MpConfigStatus {
  enabled: boolean;
  configured: boolean;
  simulation: boolean;
  oauth_connected: boolean;
  oauth_available: boolean;
  nickname: string | null;
}

export interface MpConnectResult {
  user_id: string;
  nickname: string;
  external_store_id: string;
  external_pos_id: string;
}

export interface ReceiptPrintResult {
  printed: boolean;
  drawer_opened: boolean;
  mode: string;
  message: string;
}

export function getMpConfigStatus(): Promise<MpConfigStatus> {
  return invoke<MpConfigStatus>("get_mp_config_status");
}

export function connectMpOauth(): Promise<MpConnectResult> {
  return invoke<MpConnectResult>("connect_mp_oauth");
}

export function disconnectMpOauth(): Promise<void> {
  return invoke<void>("disconnect_mp_oauth");
}

export function createMpQrOrder(
  amount: number,
  description: string,
  externalReference: string,
): Promise<MpQrOrderResult> {
  return invoke<MpQrOrderResult>("create_mp_qr_order", {
    amount,
    description,
    externalReference,
  });
}

export function checkMpOrderStatus(
  orderId: string,
  simulated: boolean,
): Promise<MpPaymentStatus> {
  return invoke<MpPaymentStatus>("check_mp_order_status", {
    orderId,
    simulated,
  });
}

export function printSaleReceipt(
  saleId: number,
  openDrawer: boolean,
): Promise<ReceiptPrintResult> {
  return invoke<ReceiptPrintResult>("print_sale_receipt", {
    saleId,
    openDrawer,
  });
}

export function testPrinterConnection(): Promise<string> {
  return invoke<string>("test_printer_connection");
}

export interface PaywayQrOrderResult {
  payment_id: string;
  intention_id?: string | null;
  external_reference: string;
  qr_data: string;
  simulated: boolean;
}

export interface PaywayPaymentStatus {
  status: string;
  status_detail?: string | null;
  payment_id?: string | null;
}

export interface PaywayConfigStatus {
  enabled: boolean;
  configured: boolean;
  simulation: boolean;
  sandbox: boolean;
}

export interface PaywayConnectionTest {
  ok: boolean;
  message: string;
}

export const PAYWAY_QR_MIN_AMOUNT = 10;

export function getPaywayConfigStatus(): Promise<PaywayConfigStatus> {
  return invoke<PaywayConfigStatus>("get_payway_config_status");
}

export function testPaywayConnection(): Promise<PaywayConnectionTest> {
  return invoke<PaywayConnectionTest>("test_payway_connection");
}

export function createPaywayQrOrder(
  amount: number,
  description: string,
  externalReference: string,
): Promise<PaywayQrOrderResult> {
  return invoke<PaywayQrOrderResult>("create_payway_qr_order", {
    amount,
    description,
    externalReference,
  });
}

export function checkPaywayPaymentStatus(
  paymentId: string,
  simulated: boolean,
): Promise<PaywayPaymentStatus> {
  return invoke<PaywayPaymentStatus>("check_payway_payment_status", {
    paymentId,
    simulated,
  });
}
