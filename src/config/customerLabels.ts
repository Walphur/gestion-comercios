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
  listTitle: string;
  emailLabel: string;
  addressLabel: string | null;
  organizationLabel: string | null;
  birthLabel: string | null;
  insuranceLabel: string | null;
  genderLabel: string | null;
  affiliateLabel: string | null;
  notesLabel: string;
  notesPlaceholder: string;
  creditLimitLabel: string;
  initialDebtLabel: string;
  initialDebtHint: string;
  vehicleSectionTitle: string | null;
  vehiclePlateLabel: string;
  vehiclePlatePlaceholder: string;
  vehicleBrandPlaceholder: string;
  vehicleModelPlaceholder: string;
}

const DEFAULT_LABELS: CustomerLabels = {
  listTitle: "Clientes",
  listSubtitle: "Clientes, cuenta corriente y cobros.",
  newTitle: "Nuevo cliente",
  editTitle: "Editar cliente",
  searchPlaceholder: "Buscar por nombre, teléfono, DNI, domicilio u organismo…",
  emptyMessage: "No hay clientes. Creá uno para registrar ventas o cuenta corriente.",
  nameLabel: "Nombre y apellido *",
  namePlaceholder: "Ej. María López (o razón social)",
  phoneLabel: "Teléfono",
  phonePlaceholder: "Ej. 11 2345-6789",
  documentLabel: "DNI / CUIT",
  documentPlaceholder: "Ej. 30123456",
  emailLabel: "Email",
  addressLabel: "Domicilio",
  organizationLabel: "Organismo / empresa",
  birthLabel: null,
  insuranceLabel: null,
  genderLabel: null,
  affiliateLabel: null,
  notesLabel: "Notas",
  notesPlaceholder: "",
  creditLimitLabel: "Límite de crédito (0 = sin límite)",
  initialDebtLabel: "Deuda inicial",
  initialDebtHint:
    "Si ya te debía plata antes de usar WalQo, cargala acá. Queda como saldo de cuenta corriente.",
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
    nameLabel: "Nombre y apellido del titular *",
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
    documentLabel: "DNI",
    documentPlaceholder: "Ej. 30123456",
    insuranceLabel: "Obra social",
  },
  estetica: {
    listSubtitle: "Clientes del salón, turnos y preferencias.",
    newTitle: "Nuevo cliente",
    namePlaceholder: "Ej. Laura Gómez",
    phoneLabel: "Teléfono / WhatsApp",
    documentLabel: "DNI",
    documentPlaceholder: "Ej. 30123456",
    addressLabel: "Domicilio",
    birthLabel: "Fecha de nacimiento",
    notesPlaceholder: "Corte, color, alergias, preferencias…",
    searchPlaceholder: "Buscar por nombre, teléfono o DNI…",
  },
  clinica: {
    listTitle: "Pacientes",
    listSubtitle: "Pacientes del consultorio: contacto, documento y obra social.",
    newTitle: "Nuevo paciente",
    editTitle: "Editar paciente",
    nameLabel: "Nombre del paciente *",
    documentLabel: "DNI",
    documentPlaceholder: "Ej. 30123456",
    addressLabel: "Domicilio",
    birthLabel: "Fecha de nacimiento",
    insuranceLabel: "Obra social",
    genderLabel: "Género",
    affiliateLabel: "Número de afiliado",
    organizationLabel: null,
    notesPlaceholder: "Antecedentes, contacto de emergencia…",
    searchPlaceholder: "Buscar paciente por nombre, DNI u obra social…",
    emptyMessage: "No hay pacientes cargados.",
  },
  petshop: {
    listSubtitle: "Dueños de mascotas, turnos y cuenta corriente.",
    nameLabel: "Nombre y apellido del dueño *",
    notesPlaceholder: "Mascotas, alergias, preferencias…",
    searchPlaceholder: "Buscar por nombre, teléfono o DNI…",
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
