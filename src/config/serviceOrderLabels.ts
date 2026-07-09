import type { Rubro, ServiceOrderStatus } from "../types";

export interface ServiceOrderLabels {
  listSubtitle: string;
  editorSubtitle: string;
  newTitle: string;
  titleLabel: string;
  titlePlaceholder: string;
  subjectLabel: string;
  subjectPlaceholder: string;
  vehicleDetailsLabel: string;
  vehicleDetailsPlaceholder: string;
  notesPlaceholder: string;
  productSearchPlaceholder: string;
  laborButton: string;
  laborDefaultName: string;
  workColumnHeader: string;
  startWorkButton: string;
  waitingPartsButton: string;
  resumeWorkButton: string;
  markReadyButton: string;
  statusInProgress: string;
  statusWaitingParts: string;
}

const DEFAULT_LABELS: ServiceOrderLabels = {
  listSubtitle: "Seguimiento de trabajos: repuestos, servicios y entrega.",
  editorSubtitle: "Registrá el trabajo y los ítems a cobrar.",
  newTitle: "Nueva orden de servicio",
  titleLabel: "Trabajo / servicio",
  titlePlaceholder: "Ej. Reparación, Instalación, Servicio…",
  subjectLabel: "Detalle / referencia",
  subjectPlaceholder: "Ej. Patente, cliente, equipo…",
  vehicleDetailsLabel: "Detalle del vehículo",
  vehicleDetailsPlaceholder: "Estado general, observaciones de ingreso, pericia…",
  notesPlaceholder: "Observaciones internas del equipo…",
  productSearchPlaceholder: "Buscar producto o repuesto…",
  laborButton: "Mano de obra",
  laborDefaultName: "Mano de obra",
  workColumnHeader: "Trabajo",
  startWorkButton: "Iniciar trabajo",
  waitingPartsButton: "Espera insumos",
  resumeWorkButton: "Retomar trabajo",
  markReadyButton: "Marcar lista",
  statusInProgress: "En curso",
  statusWaitingParts: "Espera insumos",
};

const BY_RUBRO: Partial<Record<Rubro, ServiceOrderLabels>> = {
  taller: {
    listSubtitle: "Órdenes de taller: repuestos, mano de obra y seguimiento del vehículo.",
    editorSubtitle: "Registrá la reparación o service del vehículo.",
    newTitle: "Nueva orden de servicio",
    titleLabel: "Trabajo / reparación",
    titlePlaceholder: "Ej. Tren delantero, Frenos, Service 10.000 km…",
    subjectLabel: "Vehículo / patente",
    subjectPlaceholder: "Ej. Fiat Cronos · ABC123, Hilux · AF 123 CD",
    vehicleDetailsLabel: "Detalle del vehículo / pericia",
    vehicleDetailsPlaceholder:
      "Estado general, golpes, luces, ruidos, pericia judicial, daños preexistentes…",
    notesPlaceholder: "Repuestos pendientes, observaciones internas del equipo…",
    productSearchPlaceholder: "Buscar repuesto…",
    laborButton: "Mano de obra mecánica",
    laborDefaultName: "Mano de obra",
    workColumnHeader: "Trabajo",
    startWorkButton: "Iniciar reparación",
    waitingPartsButton: "Espera repuestos",
    resumeWorkButton: "Retomar reparación",
    markReadyButton: "Marcar lista para entrega",
    statusInProgress: "En reparación",
    statusWaitingParts: "Espera repuestos",
  },
  estetica: {
    listSubtitle: "Órdenes de trabajo: servicios, productos y seguimiento del cliente.",
    editorSubtitle: "Registrá el servicio de peluquería, barbería o estética.",
    newTitle: "Nueva orden de trabajo",
    titleLabel: "Servicio",
    titlePlaceholder: "Ej. Corte + coloración, Barba, Manicura completa…",
    subjectLabel: "Detalle del servicio",
    subjectPlaceholder: "Ej. Color #7, Cabellero largo, Degradado…",
    notesPlaceholder: "Productos usados, preferencias, próxima sesión…",
    productSearchPlaceholder: "Buscar producto o insumo…",
    laborButton: "Servicio adicional",
    laborDefaultName: "Servicio",
    workColumnHeader: "Servicio",
    startWorkButton: "Iniciar servicio",
    waitingPartsButton: "Espera productos",
    resumeWorkButton: "Retomar servicio",
    markReadyButton: "Marcar finalizado",
    statusInProgress: "En curso",
    statusWaitingParts: "Espera productos",
  },
  clinica: {
    listSubtitle: "Órdenes de práctica: tratamientos, materiales y seguimiento del paciente.",
    editorSubtitle: "Registrá la práctica o tratamiento del paciente.",
    newTitle: "Nueva orden de práctica",
    titleLabel: "Práctica / tratamiento",
    titlePlaceholder: "Ej. Limpieza, Endodoncia, Sesión de kinesiología…",
    subjectLabel: "Paciente / indicación",
    subjectPlaceholder: "Ej. Dolor molar, Control post-operatorio…",
    notesPlaceholder: "Antecedentes, materiales usados, indicaciones…",
    productSearchPlaceholder: "Buscar insumo o material…",
    laborButton: "Honorarios profesionales",
    laborDefaultName: "Honorarios",
    workColumnHeader: "Práctica",
    startWorkButton: "Iniciar tratamiento",
    waitingPartsButton: "Espera materiales",
    resumeWorkButton: "Retomar tratamiento",
    markReadyButton: "Marcar finalizado",
    statusInProgress: "En tratamiento",
    statusWaitingParts: "Espera materiales",
  },
  petshop: {
    listSubtitle: "Órdenes de servicio: baños, consultas y tratamientos para mascotas.",
    editorSubtitle: "Registrá el servicio o tratamiento de la mascota.",
    newTitle: "Nueva orden de servicio",
    titleLabel: "Servicio",
    titlePlaceholder: "Ej. Baño y corte, Vacunación, Consulta veterinaria…",
    subjectLabel: "Mascota / especie",
    subjectPlaceholder: "Ej. Firulais (can), Michi (felino)…",
    notesPlaceholder: "Alergias, comportamiento, productos especiales…",
    productSearchPlaceholder: "Buscar producto o insumo…",
    laborButton: "Servicio veterinario / baño",
    laborDefaultName: "Servicio",
    workColumnHeader: "Servicio",
    startWorkButton: "Iniciar servicio",
    waitingPartsButton: "Espera insumos",
    resumeWorkButton: "Retomar servicio",
    markReadyButton: "Listo para retiro",
    statusInProgress: "En curso",
    statusWaitingParts: "Espera insumos",
  },
  ferreteria: {
    listSubtitle: "Órdenes de trabajo: armados, cortes y entregas de materiales.",
    editorSubtitle: "Registrá el pedido o trabajo para el cliente.",
    newTitle: "Nueva orden de trabajo",
    titleLabel: "Trabajo / pedido",
    titlePlaceholder: "Ej. Corte de varilla, Armado de estructura, Entrega obra…",
    subjectLabel: "Obra / referencia",
    subjectPlaceholder: "Ej. Obra Calle 123, Cliente mayorista…",
    notesPlaceholder: "Medidas, plazos de entrega, observaciones…",
    productSearchPlaceholder: "Buscar material o herraje…",
    laborButton: "Mano de obra / flete",
    laborDefaultName: "Mano de obra",
    workColumnHeader: "Trabajo",
    startWorkButton: "Iniciar trabajo",
    waitingPartsButton: "Espera materiales",
    resumeWorkButton: "Retomar trabajo",
    markReadyButton: "Listo para retiro",
    statusInProgress: "En curso",
    statusWaitingParts: "Espera materiales",
  },
};

export function getServiceOrderLabels(rubro: Rubro): ServiceOrderLabels {
  return { ...DEFAULT_LABELS, ...BY_RUBRO[rubro] };
}

export function getServiceOrderStatusLabels(rubro: Rubro): Record<ServiceOrderStatus, string> {
  const l = getServiceOrderLabels(rubro);
  return {
    pending: "Pendiente",
    in_progress: l.statusInProgress,
    waiting_parts: l.statusWaitingParts,
    ready: "Lista",
    delivered: "Entregada",
    cancelled: "Cancelada",
  };
}
