import type { Rubro, ServiceOrderStatus } from "../types";

export interface ServiceOrderLabels {
  listTitle: string;
  listSubtitle: string;
  emptyTitle: string;
  emptyDescription: string;
  sectionTitle: string;
  sectionDescription: string;
  itemsEmpty: string;
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
  listTitle: "Órdenes",
  listSubtitle: "Seguimiento de trabajos: repuestos, servicios y entrega.",
  emptyTitle: "Sin órdenes",
  emptyDescription: "Creá una orden para anotar el trabajo, los productos y el seguimiento.",
  sectionTitle: "Datos de la orden",
  sectionDescription: "Cliente y notas",
  itemsEmpty: "Agregá los ítems a cobrar.",
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

const BY_RUBRO: Partial<Record<Rubro, Partial<ServiceOrderLabels>>> = {
  taller: {
    listTitle: "Órdenes de servicio",
    listSubtitle: "Órdenes de taller: repuestos, mano de obra y seguimiento del vehículo.",
    emptyTitle: "Sin órdenes de servicio",
    emptyDescription: "Creá órdenes para seguir reparaciones, repuestos y entregas en el taller.",
    sectionTitle: "Datos de la orden",
    sectionDescription: "Cliente, vehículo y notas",
    itemsEmpty: "Agregá repuestos o mano de obra a la orden.",
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
    listTitle: "Trabajos",
    listSubtitle: "Servicios del salón, productos usados y seguimiento del cliente.",
    emptyTitle: "Sin trabajos",
    emptyDescription: "Cuando atiendas a un cliente, abrí un trabajo para anotar el servicio y lo que se usó.",
    sectionTitle: "Datos del trabajo",
    sectionDescription: "Cliente y notas",
    itemsEmpty: "Agregá el servicio o los productos que se usaron.",
    editorSubtitle: "Registrá el servicio de peluquería, barbería o estética.",
    newTitle: "Nuevo trabajo",
    titleLabel: "Servicio",
    titlePlaceholder: "Ej. Corte + coloración, Barba, Manicura completa…",
    subjectLabel: "Detalle del servicio",
    subjectPlaceholder: "Ej. Color #7, Cabello largo, Degradado…",
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
    listTitle: "Atenciones",
    listSubtitle: "Prácticas, materiales y seguimiento del paciente.",
    emptyTitle: "Sin atenciones",
    emptyDescription: "Abrí una atención para anotar la práctica, lo que se usó y el seguimiento del paciente.",
    sectionTitle: "Datos de la atención",
    sectionDescription: "Paciente y notas",
    itemsEmpty: "Agregá la práctica o los materiales.",
    editorSubtitle: "Registrá la práctica o tratamiento del paciente.",
    newTitle: "Nueva atención",
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
    listTitle: "Servicios",
    listSubtitle: "Baños, consultas y tratamientos para mascotas.",
    emptyTitle: "Sin servicios",
    emptyDescription: "Abrí un servicio para anotar el baño, la consulta o el tratamiento de la mascota.",
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
    listTitle: "Trabajos",
    listSubtitle: "Armados, cortes y entregas de materiales.",
    emptyTitle: "Sin trabajos",
    emptyDescription: "Abrí un trabajo para anotar el corte, el armado o la entrega.",
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
