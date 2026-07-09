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
  sectionTitle: "Profesionales",
  sectionSubtitle: "Personas o puestos de trabajo para asignar en los turnos.",
  listEmpty: "Todavía no hay profesionales cargados.",
  newButton: "Nuevo profesional",
  newTitle: "Nuevo profesional",
  editTitle: "Editar profesional",
  nameLabel: "Nombre *",
  namePlaceholder: "Ej. Juan, Sillón 2",
  notesLabel: "Notas",
  notesPlaceholder: "Horario, especialidad…",
  pickerLabel: "Profesional / recurso",
  pickerPlaceholder: "Buscar por nombre…",
  pickerEmpty: "— Sin asignar —",
  pickerNewButton: "Nuevo profesional",
  deactivateTitle: "Desactivar profesional",
};

const BY_RUBRO: Partial<Record<Rubro, Partial<ResourceLabels>>> = {
  taller: {
    sectionTitle: "Mecánicos y boxes",
    sectionSubtitle: "Equipo del taller para saber con quién tiene turno cada cliente.",
    listEmpty: "Cargá mecánicos o boxes para asignarlos en los turnos.",
    newButton: "Nuevo mecánico",
    newTitle: "Nuevo mecánico / box",
    editTitle: "Editar mecánico / box",
    nameLabel: "Nombre *",
    namePlaceholder: "Ej. Juan, Box 2, Elevador 1",
    notesLabel: "Notas",
    notesPlaceholder: "Especialidad, turno, box habitual…",
    pickerLabel: "Mecánico / box",
    pickerPlaceholder: "Buscar mecánico o box…",
    pickerEmpty: "— Sin asignar —",
    pickerNewButton: "Nuevo mecánico",
    deactivateTitle: "Desactivar mecánico",
  },
  estetica: {
    sectionTitle: "Profesionales",
    sectionSubtitle: "Peluqueros, esteticistas o sillones para la agenda de turnos.",
    listEmpty: "Cargá profesionales o sillones para asignarlos en los turnos.",
    newButton: "Nuevo profesional",
    newTitle: "Nuevo profesional / sillón",
    editTitle: "Editar profesional",
    nameLabel: "Nombre *",
    namePlaceholder: "Ej. María, Sillón 2, Barbero 1",
    notesLabel: "Notas",
    notesPlaceholder: "Servicios que hace, horario…",
    pickerLabel: "Profesional / sillón",
    pickerPlaceholder: "Buscar profesional o sillón…",
    pickerEmpty: "— Sin asignar —",
    pickerNewButton: "Nuevo profesional",
    deactivateTitle: "Desactivar profesional",
  },
};

export function getResourceLabels(rubro: Rubro): ResourceLabels {
  return { ...DEFAULT_LABELS, ...BY_RUBRO[rubro] };
}
