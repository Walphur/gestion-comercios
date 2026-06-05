import type { Rubro } from "../types";

export interface CustomerLabels {
  listSubtitle: string;
  newTitle: string;
  editTitle: string;
  searchPlaceholder: string;
  emptyMessage: string;
  nameLabel: string;
  namePlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  documentLabel: string;
  documentPlaceholder: string;
  emailLabel: string;
  notesLabel: string;
  notesPlaceholder: string;
  creditLimitLabel: string;
  vehicleSectionTitle: string | null;
  vehiclePlateLabel: string;
  vehiclePlatePlaceholder: string;
  vehicleBrandPlaceholder: string;
  vehicleModelPlaceholder: string;
}

const DEFAULT_LABELS: CustomerLabels = {
  listSubtitle: "Clientes, cuenta corriente y cobros.",
  newTitle: "Nuevo cliente",
  editTitle: "Editar cliente",
  searchPlaceholder: "Buscar por nombre, teléfono o documento…",
  emptyMessage: "No hay clientes. Creá uno para registrar ventas o cuenta corriente.",
  nameLabel: "Nombre *",
  namePlaceholder: "Nombre o razón social",
  phoneLabel: "Teléfono",
  phonePlaceholder: "Ej. 11 2345-6789",
  documentLabel: "Documento (DNI/CUIT)",
  documentPlaceholder: "",
  emailLabel: "Email",
  notesLabel: "Notas",
  notesPlaceholder: "",
  creditLimitLabel: "Límite de crédito (0 = sin límite)",
  vehicleSectionTitle: null,
  vehiclePlateLabel: "Patente",
  vehiclePlatePlaceholder: "ABC123",
  vehicleBrandPlaceholder: "Marca",
  vehicleModelPlaceholder: "Modelo",
};

const BY_RUBRO: Partial<Record<Rubro, Partial<CustomerLabels>>> = {
  taller: {
    listSubtitle: "Clientes del taller: vehículos, trabajos, cuenta corriente y cobros.",
    newTitle: "Nuevo cliente del taller",
    editTitle: "Editar cliente del taller",
    searchPlaceholder: "Buscar por nombre, teléfono, DNI o patente…",
    emptyMessage: "No hay clientes. Creá uno y cargá su vehículo para turnos y órdenes.",
    nameLabel: "Nombre del titular *",
    namePlaceholder: "Ej. Juan Pérez",
    phoneLabel: "Teléfono / WhatsApp",
    phonePlaceholder: "Ej. 11 2345-6789",
    documentLabel: "DNI / CUIT (opcional)",
    notesPlaceholder: "Ej. prefiere contacto por WhatsApp, horario…",
    creditLimitLabel: "Límite cuenta corriente (0 = sin límite)",
    vehicleSectionTitle: "Vehículo (opcional al crear)",
    vehiclePlatePlaceholder: "Ej. ABC123",
    vehicleBrandPlaceholder: "Ej. Fiat",
    vehicleModelPlaceholder: "Ej. Cronos",
  },
  kiosco: {
    listSubtitle: "Clientes de mostrador y ventas a fiado.",
    emptyMessage: "No hay clientes. Creá uno para vender a fiado.",
    namePlaceholder: "Ej. María López",
    phonePlaceholder: "Para avisos de fiado",
  },
  farmacia: {
    listSubtitle: "Clientes habituales y cuenta corriente.",
    documentLabel: "DNI / obra social (opcional)",
  },
  estetica: {
    listSubtitle: "Clientes, turnos y cuenta corriente.",
    newTitle: "Nuevo cliente",
    namePlaceholder: "Ej. Laura Gómez",
    phoneLabel: "Teléfono / WhatsApp",
    notesPlaceholder: "Preferencias de corte, color, alergias…",
    searchPlaceholder: "Buscar por nombre o teléfono…",
  },
  clinica: {
    listSubtitle: "Pacientes, turnos y cobros.",
    newTitle: "Nuevo paciente",
    editTitle: "Editar paciente",
    nameLabel: "Nombre del paciente *",
    documentLabel: "DNI / obra social",
    notesPlaceholder: "Antecedentes, contacto de emergencia…",
    searchPlaceholder: "Buscar paciente por nombre o documento…",
    emptyMessage: "No hay pacientes cargados.",
  },
  petshop: {
    listSubtitle: "Dueños de mascotas, turnos y cuenta corriente.",
    nameLabel: "Nombre del dueño *",
    notesPlaceholder: "Mascotas, alergias, preferencias…",
    searchPlaceholder: "Buscar por nombre o teléfono…",
  },
  ferreteria: {
    listSubtitle: "Clientes, obras y cuenta corriente mayorista.",
    namePlaceholder: "Cliente o empresa",
    documentLabel: "CUIT / DNI",
    notesPlaceholder: "Obra, referencia, condiciones de pago…",
  },
};

export function getCustomerLabels(rubro: Rubro): CustomerLabels {
  return { ...DEFAULT_LABELS, ...BY_RUBRO[rubro] };
}
