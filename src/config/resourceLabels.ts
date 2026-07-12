import type { Rubro } from "../types";

export interface ResourceLabels {
  sectionTitle: string;
  sectionSubtitle: string;
  listEmpty: string;
  newButton: string;
  newTitle: string;
  editTitle: string;
  nameLabel: string;
  namePlaceholder: string;
  notesLabel: string;
  notesPlaceholder: string;
  pickerLabel: string;
  pickerPlaceholder: string;
  pickerEmpty: string;
  pickerNewButton: string;
  deactivateTitle: string;
}

const DEFAULT_LABELS: ResourceLabels = {
  sectionTitle: "Personal",
  sectionSubtitle: "Profesionales o puestos de trabajo para asignar en los turnos.",
  listEmpty: "Cargá personal para asignarlo en la agenda.",
  newButton: "Nueva persona",
  newTitle: "Nuevo personal",
  editTitle: "Editar personal",
  nameLabel: "Nombre *",
  namePlaceholder: "Ej. Juan, Consultorio 2",
  notesLabel: "Notas",
  notesPlaceholder: "Horario, especialidad…",
  pickerLabel: "Profesional",
  pickerPlaceholder: "Buscar por nombre…",
  pickerEmpty: "— Sin asignar —",
  pickerNewButton: "Nuevo",
  deactivateTitle: "Desactivar",
};

const BY_RUBRO: Partial<Record<Rubro, Partial<ResourceLabels>>> = {
  taller: {
    sectionSubtitle: "Mecánicos, boxes o elevadores del taller.",
    namePlaceholder: "Ej. Juan, Box 2, Elevador 1",
    pickerLabel: "Mecánico / box",
    pickerPlaceholder: "Buscar mecánico o box…",
    pickerNewButton: "Nuevo mecánico",
    deactivateTitle: "Desactivar mecánico",
  },
  estetica: {
    sectionSubtitle: "Peluqueros, esteticistas o sillones para la agenda.",
    namePlaceholder: "Ej. María, Sillón 2",
    pickerLabel: "Profesional / sillón",
    pickerPlaceholder: "Buscar profesional…",
    pickerNewButton: "Nuevo profesional",
  },
  clinica: {
    sectionSubtitle: "Médicos, kinesiólogos o consultorios para los turnos.",
    namePlaceholder: "Ej. Dr. López, Consultorio 2",
    pickerLabel: "Profesional / consultorio",
    pickerPlaceholder: "Buscar profesional…",
    pickerNewButton: "Nuevo profesional",
  },
  petshop: {
    sectionSubtitle: "Veterinarios, peluqueros caninos o sectores de atención.",
    namePlaceholder: "Ej. Laura, Consultorio vet.",
    pickerLabel: "Profesional / sector",
    pickerPlaceholder: "Buscar profesional…",
    pickerNewButton: "Nuevo profesional",
  },
};

export function getResourceLabels(rubro: Rubro): ResourceLabels {
  return { ...DEFAULT_LABELS, ...BY_RUBRO[rubro] };
}
