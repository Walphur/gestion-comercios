import type { Rubro } from "../types";

export interface DeliveryNoteLabels {
  listSubtitle: string;
  editorSubtitle: string;
  destinationLabel: string;
  destinationPlaceholder: string;
  notesPlaceholder: string;
  productSearchPlaceholder: string;
  manualLineButton: string;
  manualLineDefaultName: string;
  itemColumnHeader: string;
  destinationColumnHeader: string;
  emptyListMessage: string;
  issueConfirmTitle: string;
  issueConfirmMessage: string;
  issueConfirmDetail: string;
}

const DEFAULT_LABELS: DeliveryNoteLabels = {
  listSubtitle: "Salida de mercadería sin factura inmediata.",
  editorSubtitle: "Registrá la mercadería que sale del depósito.",
  destinationLabel: "Destino / sucursal",
  destinationPlaceholder: "Ej. Sucursal norte, Cliente mayorista…",
  notesPlaceholder: "Observaciones del envío, transporte, referencia…",
  productSearchPlaceholder: "Buscar producto…",
  manualLineButton: "Línea sin producto",
  manualLineDefaultName: "Ítem manual",
  itemColumnHeader: "Artículo",
  destinationColumnHeader: "Cliente / destino",
  emptyListMessage: "Sin remitos.",
  issueConfirmTitle: "Emitir remito",
  issueConfirmMessage: "¿Confirmar salida de mercadería?",
  issueConfirmDetail: "Se descontará el stock de los productos del remito.",
};

const BY_RUBRO: Partial<Record<Rubro, DeliveryNoteLabels>> = {
  taller: {
    listSubtitle: "Salida de repuestos: depósito, otro box o taller externo.",
    editorSubtitle: "Registrá repuestos que salen del depósito del taller.",
    destinationLabel: "Destino / box / patente",
    destinationPlaceholder: "Ej. Box 2, Taller externo, Fiat Cronos · ABC123",
    notesPlaceholder: "Repuestos pendientes de facturar, observaciones del vehículo…",
    productSearchPlaceholder: "Buscar repuesto…",
    manualLineButton: "Repuesto sin código en stock",
    manualLineDefaultName: "Repuesto",
    itemColumnHeader: "Repuesto",
    destinationColumnHeader: "Cliente / destino",
    emptyListMessage: "Sin remitos de repuestos.",
    issueConfirmTitle: "Emitir remito de repuestos",
    issueConfirmMessage: "¿Confirmar salida de repuestos?",
    issueConfirmDetail: "Se descontará el stock de repuestos del depósito.",
  },
  estetica: {
    listSubtitle: "Salida de productos e insumos entre sucursal y cliente.",
    editorSubtitle: "Registrá productos o insumos que salen del local.",
    destinationLabel: "Cliente / sucursal",
    destinationPlaceholder: "Ej. Cliente a domicilio, Sucursal centro…",
    notesPlaceholder: "Productos incluidos, turno asociado, observaciones…",
    productSearchPlaceholder: "Buscar producto o insumo…",
    manualLineButton: "Insumo sin producto cargado",
    manualLineDefaultName: "Insumo",
    itemColumnHeader: "Producto / insumo",
    destinationColumnHeader: "Cliente / destino",
    emptyListMessage: "Sin remitos de productos.",
    issueConfirmTitle: "Emitir remito",
    issueConfirmMessage: "¿Confirmar salida de productos?",
    issueConfirmDetail: "Se descontará el stock de productos e insumos.",
  },
  clinica: {
    listSubtitle: "Salida de materiales e insumos del consultorio.",
    editorSubtitle: "Registrá materiales que salen del depósito o consultorio.",
    destinationLabel: "Consultorio / destino",
    destinationPlaceholder: "Ej. Consultorio 2, Paciente, Laboratorio externo…",
    notesPlaceholder: "Práctica asociada, lote, indicaciones…",
    productSearchPlaceholder: "Buscar insumo o material…",
    manualLineButton: "Material sin código",
    manualLineDefaultName: "Material",
    itemColumnHeader: "Material / insumo",
    destinationColumnHeader: "Paciente / destino",
    emptyListMessage: "Sin remitos de materiales.",
    issueConfirmTitle: "Emitir remito de materiales",
    issueConfirmMessage: "¿Confirmar salida de materiales?",
    issueConfirmDetail: "Se descontará el stock de materiales del depósito.",
  },
  petshop: {
    listSubtitle: "Entrega de alimentos, accesorios o insumos al cliente.",
    editorSubtitle: "Registrá productos que salen para entrega o retiro.",
    destinationLabel: "Cliente / dirección",
    destinationPlaceholder: "Ej. María López, Retiro en mostrador, Delivery…",
    notesPlaceholder: "Mascota, peso del pedido, observaciones de entrega…",
    productSearchPlaceholder: "Buscar alimento, accesorio o insumo…",
    manualLineButton: "Producto sin código",
    manualLineDefaultName: "Producto",
    itemColumnHeader: "Producto",
    destinationColumnHeader: "Cliente / destino",
    emptyListMessage: "Sin remitos de entrega.",
    issueConfirmTitle: "Emitir remito de entrega",
    issueConfirmMessage: "¿Confirmar salida de productos?",
    issueConfirmDetail: "Se descontará el stock de los productos del remito.",
  },
  ferreteria: {
    listSubtitle: "Entrega de materiales y herrajes a obra o cliente.",
    editorSubtitle: "Registrá materiales que salen del depósito.",
    destinationLabel: "Obra / cliente / dirección",
    destinationPlaceholder: "Ej. Obra Calle 123, Cliente mayorista, Flete…",
    notesPlaceholder: "Medidas, plazo de entrega, referencia de obra…",
    productSearchPlaceholder: "Buscar material o herraje…",
    manualLineButton: "Material sin código",
    manualLineDefaultName: "Material",
    itemColumnHeader: "Material",
    destinationColumnHeader: "Cliente / obra",
    emptyListMessage: "Sin remitos de materiales.",
    issueConfirmTitle: "Emitir remito de materiales",
    issueConfirmMessage: "¿Confirmar salida de materiales?",
    issueConfirmDetail: "Se descontará el stock de materiales del depósito.",
  },
  farmacia: {
    listSubtitle: "Salida de medicamentos o insumos a cliente o sucursal.",
    editorSubtitle: "Registrá productos que salen del depósito.",
    destinationLabel: "Cliente / sucursal",
    destinationPlaceholder: "Ej. Cliente habitual, Sucursal, Obra social…",
    notesPlaceholder: "Receta, lote, observaciones de entrega…",
    productSearchPlaceholder: "Buscar medicamento o insumo…",
    manualLineButton: "Ítem sin código",
    manualLineDefaultName: "Ítem",
    itemColumnHeader: "Producto",
    destinationColumnHeader: "Cliente / destino",
    emptyListMessage: "Sin remitos.",
    issueConfirmTitle: "Emitir remito",
    issueConfirmMessage: "¿Confirmar salida de productos?",
    issueConfirmDetail: "Se descontará el stock de los productos del remito.",
  },
};

export function getDeliveryNoteLabels(rubro: Rubro): DeliveryNoteLabels {
  return { ...DEFAULT_LABELS, ...BY_RUBRO[rubro] };
}
