import type { Rubro } from "../types";

export interface AppointmentLabels {
  listSubtitle: string;
  editorSubtitle: string;
  titleLabel: string;
  titlePlaceholder: string;
  resourceLabel: string;
  resourcePlaceholder: string;
  subjectLabel: string;
  subjectPlaceholder: string;
  vehicleDetailsLabel: string;
  vehicleDetailsPlaceholder: string;
  notesPlaceholder: string;
  resourceFilterAll: string;
}

const DEFAULT_LABELS: AppointmentLabels = {
  listSubtitle: "Agendá citas y reservas para tu comercio.",
  editorSubtitle: "Completá los datos del turno.",
  titleLabel: "Servicio / motivo",
  titlePlaceholder: "Ej. Consulta, Reparación, Corte…",
  resourceLabel: "Profesional / recurso",
  resourcePlaceholder: "Ej. Juan, Box 1, Sillón 2",
  subjectLabel: "Detalle adicional",
  subjectPlaceholder: "Ej. Patente, mascota, notas del cliente…",
  vehicleDetailsLabel: "Detalle del vehículo",
  vehicleDetailsPlaceholder: "Estado general, golpes, luces, ruidos, pericia…",
  notesPlaceholder: "Recordatorios para el equipo…",
  resourceFilterAll: "Todos los recursos",
};

const BY_RUBRO: Partial<Record<Rubro, AppointmentLabels>> = {
  taller: {
    listSubtitle: "Turnos de taller: alineación, frenos, service y reparaciones.",
    editorSubtitle: "Reservá horario en el taller para el vehículo del cliente.",
    titleLabel: "Trabajo / servicio",
    titlePlaceholder: "Ej. Alineación, Cambio de aceite, Frenos, Tren delantero…",
    resourceLabel: "Mecánico / box",
    resourcePlaceholder: "Ej. Juan, Box 2, Elevador 1",
    subjectLabel: "Vehículo / patente",
    subjectPlaceholder: "Ej. Fiat Cronos · ABC123, Hilux · AF 123 CD",
    vehicleDetailsLabel: "Detalle del vehículo / pericia",
    vehicleDetailsPlaceholder:
      "Estado general, golpes, luces, ruidos, pericia judicial, observaciones de ingreso…",
    notesPlaceholder: "Repuestos a pedir, observaciones del vehículo…",
    resourceFilterAll: "Todos los mecánicos / boxes",
  },
  estetica: {
    listSubtitle: "Agenda de peluquería, barbería y estética.",
    editorSubtitle: "Reservá sillón o profesional para el servicio.",
    titleLabel: "Servicio",
    titlePlaceholder: "Ej. Corte, Coloración, Barba, Peinado, Manicura…",
    resourceLabel: "Profesional / sillón",
    resourcePlaceholder: "Ej. María, Sillón 2, Barbero 1",
    subjectLabel: "Detalle del servicio",
    subjectPlaceholder: "Ej. Color #7, Cabellero largo, Degradado bajo…",
    notesPlaceholder: "Productos a usar, preferencias del cliente…",
    resourceFilterAll: "Todos los profesionales",
  },
  clinica: {
    listSubtitle: "Turnos de consultorio: controles, prácticas y seguimiento.",
    editorSubtitle: "Programá la atención del paciente.",
    titleLabel: "Consulta / práctica",
    titlePlaceholder: "Ej. Control, Limpieza, Radiografía, Sesión…",
    resourceLabel: "Profesional / consultorio",
    resourcePlaceholder: "Ej. Dr. López, Consultorio 2, Odontología",
    subjectLabel: "Paciente / motivo",
    subjectPlaceholder: "Ej. Dolor molar, Control anual, Seguimiento…",
    notesPlaceholder: "Antecedentes, estudios previos, indicaciones…",
    resourceFilterAll: "Todos los profesionales",
  },
  petshop: {
    listSubtitle: "Turnos de peluquería canina, baños y consultas veterinarias.",
    editorSubtitle: "Reservá horario para la mascota del cliente.",
    titleLabel: "Servicio",
    titlePlaceholder: "Ej. Baño, Baño y corte, Vacunación, Consulta…",
    resourceLabel: "Profesional / sector",
    resourcePlaceholder: "Ej. Laura, Peluquería, Consultorio vet.",
    subjectLabel: "Mascota / especie",
    subjectPlaceholder: "Ej. Firulais (can), Michi (felino), Rocky (bulldog)",
    notesPlaceholder: "Alergias, comportamiento, productos especiales…",
    resourceFilterAll: "Todos los sectores",
  },
};

export function getAppointmentLabels(rubro: Rubro): AppointmentLabels {
  return { ...DEFAULT_LABELS, ...BY_RUBRO[rubro] };
}
