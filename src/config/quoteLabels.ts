import type { Rubro } from "../types";

export interface QuoteLabels {
  listSubtitle: string;
  editorSubtitle: string;
  notesPlaceholder: string;
  addItemsTitle: string;
  productSearchPlaceholder: string;
  manualLineButton: string;
  manualLineDefaultName: string;
  manualLinePlaceholder: string;
  emptyItemsMessage: string;
  convertStockNote: string;
}

const DEFAULT_LABELS: QuoteLabels = {
  listSubtitle: "Cotizaciones para ventas grandes o trabajos a medida.",
  editorSubtitle: "Armá la cotización y guardala como borrador.",
  notesPlaceholder: "Ej. precios sujetos a variación, plazo de entrega, condiciones…",
  addItemsTitle: "Agregar ítems",
  productSearchPlaceholder: "Buscar producto (mín. 2 letras)…",
  manualLineButton: "Línea manual",
  manualLineDefaultName: "",
  manualLinePlaceholder: "Ej. descripción del ítem…",
  emptyItemsMessage: "Sin ítems. Buscá productos o agregá una línea manual.",
  convertStockNote: "Se registrará la venta y se descontará el stock.",
};

const BY_RUBRO: Partial<Record<Rubro, QuoteLabels>> = {
  taller: {
    listSubtitle: "Presupuestos de taller: repuestos, mano de obra y trabajos mecánicos.",
    editorSubtitle: "Cotizá el trabajo para el vehículo del cliente.",
    notesPlaceholder: "Ej. repuestos sujetos a disponibilidad, plazo de entrega, garantía…",
    addItemsTitle: "Repuestos y mano de obra",
    productSearchPlaceholder: "Buscar repuesto (mín. 2 letras)…",
    manualLineButton: "Línea manual",
    manualLineDefaultName: "",
    manualLinePlaceholder: "Ej. cazoletas, frenos, bujes…",
    emptyItemsMessage: "Sin ítems. Buscá repuestos del stock o agregá líneas manuales.",
    convertStockNote: "Se registrará la venta y se descontará el stock de repuestos.",
  },
  estetica: {
    listSubtitle: "Presupuestos de peluquería, barbería y estética.",
    editorSubtitle: "Cotizá el servicio y productos para el cliente.",
    notesPlaceholder: "Ej. incluye productos, sesiones adicionales, validez del presupuesto…",
    addItemsTitle: "Servicios y productos",
    productSearchPlaceholder: "Buscar producto o insumo…",
    manualLineButton: "Línea manual",
    manualLineDefaultName: "",
    manualLinePlaceholder: "Ej. corte, color, tratamiento…",
    emptyItemsMessage: "Sin ítems. Buscá productos o agregá un servicio.",
    convertStockNote: "Se registrará la venta y se descontará el stock de productos.",
  },
  clinica: {
    listSubtitle: "Presupuestos de consultorio: prácticas, tratamientos y materiales.",
    editorSubtitle: "Cotizá la atención o práctica para el paciente.",
    notesPlaceholder: "Ej. sesiones incluidas, materiales, cobertura médica, validez…",
    addItemsTitle: "Prácticas y materiales",
    productSearchPlaceholder: "Buscar insumo o material…",
    manualLineButton: "Línea manual",
    manualLineDefaultName: "",
    manualLinePlaceholder: "Ej. práctica, honorarios…",
    emptyItemsMessage: "Sin ítems. Buscá materiales o agregá una práctica.",
    convertStockNote: "Se registrará la venta y se descontará el stock de materiales.",
  },
  petshop: {
    listSubtitle: "Presupuestos veterinarios y de peluquería canina.",
    editorSubtitle: "Cotizá el servicio o tratamiento para la mascota.",
    notesPlaceholder: "Ej. productos especiales, turnos de seguimiento, validez…",
    addItemsTitle: "Servicios y productos",
    productSearchPlaceholder: "Buscar alimento, accesorio o insumo…",
    manualLineButton: "Línea manual",
    manualLineDefaultName: "",
    manualLinePlaceholder: "Ej. baño, consulta, vacuna…",
    emptyItemsMessage: "Sin ítems. Buscá productos o agregá un servicio.",
    convertStockNote: "Se registrará la venta y se descontará el stock.",
  },
  ferreteria: {
    listSubtitle: "Presupuestos de ferretería: materiales, herrajes y obras.",
    editorSubtitle: "Cotizá materiales y trabajos para el cliente.",
    notesPlaceholder: "Ej. plazo de entrega, flete, condiciones de obra, validez…",
    addItemsTitle: "Materiales y servicios",
    productSearchPlaceholder: "Buscar material o herraje…",
    manualLineButton: "Línea manual",
    manualLineDefaultName: "",
    manualLinePlaceholder: "Ej. flete, instalación, mano de obra…",
    emptyItemsMessage: "Sin ítems. Buscá materiales o agregá un servicio.",
    convertStockNote: "Se registrará la venta y se descontará el stock.",
  },
};

export function getQuoteLabels(rubro: Rubro): QuoteLabels {
  return { ...DEFAULT_LABELS, ...BY_RUBRO[rubro] };
}
