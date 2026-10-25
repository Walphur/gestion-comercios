/** Catálogos de ejemplo del primer arranque, uno por rubro. Sin fotos. */

export interface DemoVariant {
  attributes: Record<string, string>;
  stock: number;
}

export interface DemoItem {
  name: string;
  category: string;
  price: number;
  cost?: number;
  stock?: number;
  min_stock?: number;
  /** Por defecto «unidad»; los servicios toman la unidad de servicio del rubro. */
  unit?: string;
  tax_rate?: number;
  barcode?: string;
  brand?: string;
  supplier?: string;
  /** Mano de obra, práctica o servicio de salón: sin stock. */
  service?: boolean;
  duration_min?: number;
  /** Plato de la carta que se hace al momento: sin stock. */
  prepared?: boolean;
  variants?: DemoVariant[];
}

export interface DemoCatalog {
  /** Título de la opción en el primer arranque. */
  title: string;
  description: string;
  /** Cómo se nombra lo cargado en los avisos. */
  noun: string;
  /** En orden de importancia: si no entra todo, se cargan los primeros. */
  items: DemoItem[];
}

const KIOSCO: DemoItem[] = [
  { barcode: "7790895000011", name: "Coca-Cola 500 ml", category: "Bebidas", brand: "Coca-Cola", supplier: "Refrescos del Sur", cost: 900, price: 1800, stock: 48, min_stock: 12 },
  { barcode: "7790895000028", name: "Coca-Cola 1.5 L", category: "Bebidas", brand: "Coca-Cola", supplier: "Refrescos del Sur", cost: 2200, price: 3800, stock: 24, min_stock: 6 },
  { barcode: "7798065000015", name: "Agua Villavicencio 2 L", category: "Bebidas", brand: "Villavicencio", supplier: "Refrescos del Sur", cost: 1100, price: 2200, stock: 36, min_stock: 10 },
  { barcode: "7799312000010", name: "Cerveza Quilmes 1 L", category: "Bebidas", brand: "Quilmes", supplier: "Distribuidora Norte", cost: 2100, price: 3500, stock: 18, min_stock: 6 },
  { barcode: "7790315980012", name: "Alfajor Havanna", category: "Golosinas", brand: "Havanna", supplier: "Mayorista Centro", cost: 1400, price: 2500, stock: 22, min_stock: 8 },
  { barcode: "7790315980029", name: "Chicles Beldent 10 u.", category: "Golosinas", brand: "Mondelez", supplier: "Mayorista Centro", cost: 400, price: 800, stock: 30, min_stock: 8 },
  { barcode: "7790733001024", name: "Papas fritas Lay's 85 g", category: "Golosinas", brand: "Lay's", supplier: "Mayorista Centro", cost: 1800, price: 3200, stock: 14, min_stock: 6 },
  { barcode: "7790748000010", name: "Chocolate con leche 100 g", category: "Golosinas", brand: "Arcor", supplier: "Mayorista Centro", cost: 1200, price: 2200, stock: 28, min_stock: 8 },
  { barcode: "7798154000011", name: "Leche entera 1 L", category: "Lácteos", brand: "La Serenísima", supplier: "Distribuidora Norte", cost: 1400, price: 2400, stock: 30, min_stock: 10 },
  { barcode: "7798154000028", name: "Yogur bebible frutilla", category: "Lácteos", brand: "La Serenísima", supplier: "Distribuidora Norte", cost: 700, price: 1300, stock: 20, min_stock: 6 },
  { barcode: "7798154000035", name: "Queso cremoso 290 g", category: "Lácteos", brand: "La Serenísima", supplier: "Distribuidora Norte", cost: 3200, price: 5200, stock: 8, min_stock: 3 },
  { barcode: "7791132000015", name: "Detergente líquido 750 ml", category: "Limpieza", brand: "Ala", supplier: "Distribuidora Norte", cost: 1800, price: 3200, stock: 15, min_stock: 4 },
  { barcode: "7791132000022", name: "Lavandina 1 L", category: "Limpieza", brand: "Ayudín", supplier: "Distribuidora Norte", cost: 900, price: 1600, stock: 20, min_stock: 5 },
  { barcode: "7791132000039", name: "Esponja multiuso x3", category: "Limpieza", brand: "Virulana", supplier: "Mayorista Centro", cost: 700, price: 1200, stock: 25, min_stock: 6 },
  { barcode: "7790741000010", name: "Jamón cocido 200 g", category: "Fiambres", brand: "Paladini", supplier: "Distribuidora Norte", cost: 2200, price: 3500, stock: 12, min_stock: 4 },
  { barcode: "7790741000027", name: "Salchichas 6 u.", category: "Fiambres", brand: "Paladini", supplier: "Distribuidora Norte", cost: 1400, price: 2400, stock: 14, min_stock: 4 },
  { barcode: "7790741000034", name: "Pan lactal 390 g", category: "Panadería", brand: "Bimbo", supplier: "Mayorista Centro", cost: 1800, price: 3200, stock: 10, min_stock: 3 },
  { barcode: "7790315000018", name: "Arroz largo fino 1 kg", category: "Almacén", brand: "Gallo", supplier: "Mayorista Centro", cost: 1600, price: 2800, stock: 28, min_stock: 8 },
  { barcode: "7790315000025", name: "Yerba mate 500 g", category: "Almacén", brand: "Taragüi", supplier: "Mayorista Centro", cost: 3200, price: 5200, stock: 9, min_stock: 4 },
  { barcode: "7799001000012", name: "Red Bull 250 ml", category: "Bebidas", brand: "Red Bull", supplier: "Refrescos del Sur", cost: 2400, price: 4200, stock: 5, min_stock: 8 },
  { barcode: "7790001999999", name: "Chicles Beldent (stock bajo)", category: "Golosinas", brand: "Mondelez", supplier: "Mayorista Centro", cost: 400, price: 800, stock: 4, min_stock: 8 },
];

const SUPERMERCADO: DemoItem[] = [
  { name: "Yerba mate 1 kg", category: "Almacén", cost: 4300, price: 5900, stock: 20, min_stock: 6 },
  { name: "Fideos secos 500 g", category: "Almacén", cost: 1200, price: 1800, stock: 30, min_stock: 10 },
  { name: "Arroz largo fino 1 kg", category: "Almacén", cost: 1600, price: 2500, stock: 25, min_stock: 8 },
  { name: "Aceite de girasol 1.5 L", category: "Almacén", cost: 3600, price: 5200, stock: 18, min_stock: 6 },
  { name: "Azúcar 1 kg", category: "Almacén", cost: 1050, price: 1500, stock: 20, min_stock: 8 },
  { name: "Harina 0000 1 kg", category: "Almacén", cost: 900, price: 1400, stock: 24, min_stock: 8 },
  { name: "Gaseosa cola 2.25 L", category: "Bebidas", cost: 3000, price: 4200, stock: 24, min_stock: 6 },
  { name: "Agua mineral 2 L", category: "Bebidas", cost: 1400, price: 2100, stock: 30, min_stock: 10 },
  { name: "Cerveza 1 L", category: "Bebidas", cost: 2300, price: 3300, stock: 24, min_stock: 12 },
  { name: "Leche entera 1 L", category: "Lácteos", cost: 1150, price: 1650, stock: 30, min_stock: 12 },
  { name: "Yogur bebible 1 L", category: "Lácteos", cost: 1800, price: 2700, stock: 12, min_stock: 6 },
  { name: "Manteca 200 g", category: "Lácteos", cost: 2100, price: 3100, stock: 10, min_stock: 4 },
  { name: "Queso cremoso", category: "Fiambrería", unit: "kg", cost: 8000, price: 12500, stock: 6, min_stock: 2 },
  { name: "Jamón cocido", category: "Fiambrería", unit: "kg", cost: 9000, price: 14000, stock: 5, min_stock: 2 },
  { name: "Asado", category: "Carnicería", unit: "kg", cost: 8200, price: 11900, stock: 20, min_stock: 6 },
  { name: "Carne picada común", category: "Carnicería", unit: "kg", cost: 5200, price: 7900, stock: 15, min_stock: 5 },
  { name: "Pollo entero", category: "Carnicería", unit: "kg", cost: 2600, price: 3900, stock: 20, min_stock: 6 },
  { name: "Papa", category: "Verdulería", unit: "kg", cost: 600, price: 1100, stock: 60, min_stock: 20 },
  { name: "Tomate redondo", category: "Verdulería", unit: "kg", cost: 1500, price: 2600, stock: 25, min_stock: 10 },
  { name: "Banana", category: "Verdulería", unit: "kg", cost: 1300, price: 2200, stock: 25, min_stock: 8 },
  { name: "Lavandina 1 L", category: "Limpieza", cost: 900, price: 1400, stock: 30, min_stock: 10 },
  { name: "Detergente 750 ml", category: "Limpieza", cost: 1500, price: 2300, stock: 15, min_stock: 6 },
  { name: "Papel higiénico x4", category: "Perfumería", cost: 2400, price: 3600, stock: 18, min_stock: 8 },
  { name: "Shampoo 400 ml", category: "Perfumería", cost: 3800, price: 5900, stock: 10, min_stock: 4 },
  { name: "Hamburguesas congeladas x4", category: "Congelados", cost: 3500, price: 5200, stock: 12, min_stock: 4 },
];

const FARMACIA: DemoItem[] = [
  { name: "Ibuprofeno 400 mg x10", category: "Venta libre", cost: 2200, price: 3500, stock: 30, min_stock: 10 },
  { name: "Paracetamol 500 mg x10", category: "Venta libre", cost: 1700, price: 2800, stock: 30, min_stock: 10 },
  { name: "Pastillas para la garganta x16", category: "Venta libre", cost: 1900, price: 3000, stock: 20, min_stock: 6 },
  { name: "Sales de rehidratación", category: "Venta libre", cost: 900, price: 1500, stock: 20, min_stock: 6 },
  { name: "Curitas x20", category: "Primeros auxilios", cost: 1500, price: 2500, stock: 25, min_stock: 8 },
  { name: "Gasas estériles x10", category: "Primeros auxilios", cost: 1100, price: 1800, stock: 20, min_stock: 6 },
  { name: "Alcohol en gel 250 ml", category: "Primeros auxilios", cost: 2000, price: 3200, stock: 18, min_stock: 6 },
  { name: "Algodón 140 g", category: "Primeros auxilios", cost: 1600, price: 2600, stock: 15, min_stock: 5 },
  { name: "Termómetro digital", category: "Primeros auxilios", cost: 5500, price: 9000, stock: 6, min_stock: 2 },
  { name: "Protector solar FPS 50 200 ml", category: "Dermocosmética", cost: 14000, price: 22000, stock: 8, min_stock: 3 },
  { name: "Crema hidratante 200 ml", category: "Dermocosmética", cost: 6500, price: 10500, stock: 8, min_stock: 3 },
  { name: "Pasta dental 90 g", category: "Higiene", cost: 2000, price: 3200, stock: 24, min_stock: 8 },
  { name: "Cepillo dental", category: "Higiene", cost: 1700, price: 2800, stock: 20, min_stock: 6 },
  { name: "Desodorante en aerosol", category: "Higiene", cost: 3000, price: 4800, stock: 15, min_stock: 5 },
  { name: "Preservativos x3", category: "Higiene", cost: 2800, price: 4500, stock: 20, min_stock: 6 },
  { name: "Pañales talle M x30", category: "Bebés", cost: 12000, price: 18000, stock: 10, min_stock: 4 },
  { name: "Toallitas húmedas x50", category: "Bebés", cost: 2200, price: 3500, stock: 15, min_stock: 5 },
];

const sizes = (list: string[], color: string, each: number): DemoVariant[] =>
  list.map((talle) => ({ attributes: { Talle: talle, Color: color }, stock: each }));

const ROPA: DemoItem[] = [
  { name: "Remera básica negra", category: "Remeras", cost: 6000, price: 14900, variants: sizes(["S", "M", "L", "XL"], "Negro", 4) },
  { name: "Remera básica blanca", category: "Remeras", cost: 6000, price: 14900, variants: sizes(["S", "M", "L", "XL"], "Blanco", 4) },
  { name: "Remera oversize", category: "Remeras", cost: 7500, price: 18900, variants: sizes(["M", "L"], "Gris", 3) },
  { name: "Jean mom celeste", category: "Pantalones", cost: 16000, price: 39900, variants: sizes(["36", "38", "40", "42"], "Celeste", 2) },
  { name: "Jean recto azul", category: "Pantalones", cost: 17000, price: 42900, variants: sizes(["40", "42", "44"], "Azul", 2) },
  { name: "Jogger de frisa", category: "Pantalones", cost: 11000, price: 27900, variants: sizes(["S", "M", "L"], "Negro", 3) },
  { name: "Buzo canguro", category: "Abrigos", cost: 15000, price: 36900, variants: sizes(["M", "L", "XL"], "Beige", 2) },
  { name: "Campera rompeviento", category: "Abrigos", cost: 24000, price: 58900, variants: sizes(["M", "L"], "Negro", 2) },
  { name: "Vestido corto", category: "Vestidos", cost: 14000, price: 34900, variants: sizes(["S", "M", "L"], "Verde", 2) },
  { name: "Zapatillas urbanas", category: "Calzado", cost: 30000, price: 69900, variants: sizes(["38", "39", "40", "41", "42"], "Blanco", 2) },
  { name: "Medias pack x3", category: "Accesorios", cost: 2500, price: 6900, stock: 20, min_stock: 6 },
  { name: "Gorra lisa", category: "Accesorios", cost: 4000, price: 11900, stock: 8, min_stock: 3 },
  { name: "Cinturón de cuero", category: "Accesorios", cost: 6000, price: 15900, stock: 6, min_stock: 2 },
];

const FERRETERIA: DemoItem[] = [
  { name: "Tornillo autoperforante 8x1\" (x100)", category: "Tornillería", cost: 3800, price: 6200, stock: 25, min_stock: 8 },
  { name: "Tarugo 8 mm (x50)", category: "Tornillería", cost: 2200, price: 3900, stock: 30, min_stock: 10 },
  { name: "Clavos 2\"", category: "Tornillería", unit: "kg", cost: 3000, price: 4800, stock: 18, min_stock: 5 },
  { name: "Cable unipolar 2.5 mm", category: "Electricidad", unit: "metro", cost: 450, price: 750, stock: 300, min_stock: 100 },
  { name: "Cinta aisladora", category: "Electricidad", cost: 600, price: 1200, stock: 40, min_stock: 10 },
  { name: "Lámpara LED 12 W", category: "Electricidad", cost: 1400, price: 2600, stock: 30, min_stock: 10 },
  { name: "Toma doble con tierra", category: "Electricidad", cost: 1800, price: 3200, stock: 15, min_stock: 5 },
  { name: "Látex interior 4 L", category: "Pinturería", cost: 17000, price: 26500, stock: 9, min_stock: 3 },
  { name: "Rodillo antigota 22 cm", category: "Pinturería", cost: 3200, price: 5600, stock: 7, min_stock: 3 },
  { name: "Pincel N° 20", category: "Pinturería", cost: 1500, price: 2800, stock: 12, min_stock: 4 },
  { name: "Lija al agua N° 120", category: "Pinturería", cost: 400, price: 800, stock: 50, min_stock: 15 },
  { name: "Taladro percutor 650 W", category: "Herramientas", cost: 48000, price: 72000, stock: 4, min_stock: 2 },
  { name: "Cinta métrica 5 m", category: "Herramientas", cost: 3000, price: 5200, stock: 8, min_stock: 4 },
  { name: "Juego de destornilladores x6", category: "Herramientas", cost: 7000, price: 12500, stock: 6, min_stock: 2 },
  { name: "Llave francesa 10\"", category: "Herramientas", cost: 6500, price: 11000, stock: 5, min_stock: 2 },
  { name: "Guantes de trabajo", category: "Herramientas", cost: 1800, price: 3500, stock: 20, min_stock: 6 },
  { name: "Teflón 3/4\"", category: "Plomería", cost: 450, price: 900, stock: 50, min_stock: 10 },
  { name: "Canilla de bronce 1/2\"", category: "Plomería", cost: 6000, price: 10500, stock: 6, min_stock: 2 },
  { name: "Silicona transparente 280 ml", category: "Plomería", cost: 2800, price: 4900, stock: 12, min_stock: 4 },
  { name: "Candado 40 mm", category: "Seguridad", cost: 4000, price: 7200, stock: 8, min_stock: 3 },
];

const PETSHOP: DemoItem[] = [
  { name: "Alimento perro adulto 15 kg", category: "Alimento perro", cost: 38000, price: 52000, stock: 8, min_stock: 3 },
  { name: "Alimento cachorro 3 kg", category: "Alimento perro", cost: 11000, price: 15500, stock: 6, min_stock: 3 },
  { name: "Alimento perro suelto", category: "Alimento perro", unit: "kg", cost: 2600, price: 3900, stock: 45, min_stock: 10 },
  { name: "Snacks para perro 200 g", category: "Alimento perro", cost: 1800, price: 3200, stock: 15, min_stock: 5 },
  { name: "Alimento gato adulto 7.5 kg", category: "Alimento gato", cost: 26000, price: 36000, stock: 6, min_stock: 3 },
  { name: "Alimento gato suelto", category: "Alimento gato", unit: "kg", cost: 3400, price: 5200, stock: 30, min_stock: 8 },
  { name: "Alimento húmedo gato 85 g", category: "Alimento gato", cost: 700, price: 1300, stock: 40, min_stock: 12 },
  { name: "Piedras sanitarias 4 kg", category: "Higiene", cost: 3500, price: 5400, stock: 14, min_stock: 5 },
  { name: "Pipeta antipulgas mediana", category: "Higiene", cost: 5200, price: 8200, stock: 10, min_stock: 4 },
  { name: "Shampoo para perro 250 ml", category: "Higiene", cost: 2800, price: 4800, stock: 8, min_stock: 3 },
  { name: "Collar regulable", category: "Accesorios", cost: 2500, price: 4900, stock: 12, min_stock: 4 },
  { name: "Correa de paseo", category: "Accesorios", cost: 3500, price: 6500, stock: 10, min_stock: 3 },
  { name: "Comedero de acero", category: "Accesorios", cost: 2200, price: 4200, stock: 10, min_stock: 3 },
  { name: "Pelota de goma", category: "Accesorios", cost: 1100, price: 2400, stock: 20, min_stock: 5 },
  { name: "Cama mediana", category: "Accesorios", cost: 15000, price: 26000, stock: 3, min_stock: 2 },
  { name: "Rascador para gato", category: "Accesorios", cost: 12000, price: 21000, stock: 3, min_stock: 1 },
];

const PANADERIA: DemoItem[] = [
  { name: "Pan francés", category: "Panes", unit: "kg", cost: 1500, price: 3000, stock: 20, min_stock: 5 },
  { name: "Pan de campo", category: "Panes", cost: 1500, price: 3200, stock: 10, min_stock: 3 },
  { name: "Pan de molde casero", category: "Panes", cost: 1800, price: 3800, stock: 6, min_stock: 2 },
  { name: "Chipá", category: "Panes", unit: "kg", cost: 5000, price: 11000, stock: 4, min_stock: 1 },
  { name: "Medialunas de manteca", category: "Facturas", unit: "docena", cost: 3500, price: 7800, stock: 10, min_stock: 3 },
  { name: "Facturas surtidas", category: "Facturas", unit: "docena", cost: 3800, price: 8400, stock: 10, min_stock: 3 },
  { name: "Bizcochitos de grasa", category: "Facturas", unit: "kg", cost: 3500, price: 7500, stock: 5, min_stock: 2 },
  { name: "Torta selva negra", category: "Tortas y postres", cost: 12000, price: 26000, stock: 2, min_stock: 1 },
  { name: "Lemon pie", category: "Tortas y postres", cost: 9000, price: 19000, stock: 2, min_stock: 1 },
  { name: "Alfajores de maicena x6", category: "Tortas y postres", cost: 2500, price: 5500, stock: 8, min_stock: 3 },
  { name: "Budín de limón", category: "Tortas y postres", cost: 2200, price: 4800, stock: 6, min_stock: 2 },
  { name: "Sándwiches de miga x12", category: "Salados", cost: 6000, price: 13500, stock: 5, min_stock: 2 },
  { name: "Prepizza x2", category: "Salados", cost: 1800, price: 3900, stock: 8, min_stock: 3 },
  { name: "Tarta de jamón y queso", category: "Salados", cost: 4500, price: 9500, stock: 3, min_stock: 1 },
  { name: "Café con leche", category: "Cafetería", cost: 700, price: 2800, prepared: true, unit: "unidad" },
];

const GASTRONOMIA: DemoItem[] = [
  { name: "Empanada de carne", category: "Pizzas / Empanadas", price: 1800, cost: 650, prepared: true, unit: "unidad" },
  { name: "Docena de empanadas", category: "Pizzas / Empanadas", price: 19000, cost: 7000, prepared: true },
  { name: "Pizza muzzarella", category: "Pizzas / Empanadas", price: 13000, cost: 4500, prepared: true },
  { name: "Pizza napolitana", category: "Pizzas / Empanadas", price: 15000, cost: 5200, prepared: true },
  { name: "Fugazzeta", category: "Pizzas / Empanadas", price: 15500, cost: 5400, prepared: true },
  { name: "Provoleta", category: "Entradas", price: 8500, cost: 3000, prepared: true },
  { name: "Rabas", category: "Entradas", price: 14000, cost: 5000, prepared: true },
  { name: "Milanesa con papas fritas", category: "Principales", price: 14000, cost: 5000, prepared: true },
  { name: "Milanesa napolitana con papas", category: "Principales", price: 16500, cost: 5800, prepared: true },
  { name: "Bife de chorizo con guarnición", category: "Principales", price: 19500, cost: 7500, prepared: true },
  { name: "Hamburguesa completa con papas", category: "Principales", price: 12500, cost: 4400, prepared: true },
  { name: "Sorrentinos con salsa", category: "Principales", price: 13500, cost: 4500, prepared: true },
  { name: "Ñoquis con tuco", category: "Principales", price: 11000, cost: 3500, prepared: true },
  { name: "Papas fritas", category: "Guarniciones", price: 6000, cost: 1800, prepared: true },
  { name: "Ensalada mixta", category: "Guarniciones", price: 5500, cost: 1700, prepared: true },
  { name: "Flan casero con dulce de leche", category: "Postres", price: 5500, cost: 1600, prepared: true },
  { name: "Tiramisú", category: "Postres", price: 6800, cost: 2300, prepared: true },
  { name: "Helado 2 bochas", category: "Postres", price: 4500, cost: 1500, prepared: true },
  { name: "Gaseosa 500 ml", category: "Bebidas", price: 2500, cost: 1200, stock: 24, min_stock: 8 },
  { name: "Agua mineral 500 ml", category: "Bebidas", price: 2000, cost: 800, stock: 24, min_stock: 8 },
  { name: "Cerveza lata 473 ml", category: "Bebidas", price: 3500, cost: 1700, stock: 24, min_stock: 8 },
  { name: "Pinta de cerveza tirada", category: "Bebidas", price: 5000, cost: 1600, prepared: true, unit: "unidad" },
  { name: "Limonada 1 L", category: "Bebidas", price: 6000, cost: 1500, prepared: true, unit: "unidad" },
  { name: "Café", category: "Bebidas", price: 2800, cost: 600, prepared: true, unit: "unidad" },
];

const VERDULERIA: DemoItem[] = [
  { name: "Tomate redondo", category: "Verduras", unit: "kg", cost: 1500, price: 2600, stock: 40, min_stock: 10 },
  { name: "Papa negra", category: "Verduras", unit: "kg", cost: 600, price: 1100, stock: 120, min_stock: 30 },
  { name: "Cebolla", category: "Verduras", unit: "kg", cost: 700, price: 1300, stock: 60, min_stock: 15 },
  { name: "Zapallo anco", category: "Verduras", unit: "kg", cost: 800, price: 1500, stock: 30, min_stock: 8 },
  { name: "Zanahoria", category: "Verduras", unit: "kg", cost: 700, price: 1200, stock: 25, min_stock: 8 },
  { name: "Morrón rojo", category: "Verduras", unit: "kg", cost: 3000, price: 5200, stock: 10, min_stock: 3 },
  { name: "Batata", category: "Verduras", unit: "kg", cost: 900, price: 1700, stock: 30, min_stock: 8 },
  { name: "Ajo (cabeza)", category: "Verduras", cost: 300, price: 600, stock: 40, min_stock: 10 },
  { name: "Lechuga criolla", category: "Hojas", cost: 900, price: 1500, stock: 20, min_stock: 6 },
  { name: "Acelga", category: "Hojas", unit: "atado", cost: 800, price: 1400, stock: 15, min_stock: 5 },
  { name: "Perejil", category: "Hojas", unit: "atado", cost: 400, price: 800, stock: 15, min_stock: 5 },
  { name: "Banana", category: "Frutas", unit: "kg", cost: 1300, price: 2200, stock: 35, min_stock: 10 },
  { name: "Manzana roja", category: "Frutas", unit: "kg", cost: 1600, price: 2800, stock: 28, min_stock: 10 },
  { name: "Naranja para jugo", category: "Frutas", unit: "kg", cost: 700, price: 1300, stock: 50, min_stock: 15 },
  { name: "Mandarina", category: "Frutas", unit: "kg", cost: 900, price: 1600, stock: 30, min_stock: 10 },
  { name: "Limón", category: "Frutas", unit: "kg", cost: 1000, price: 1900, stock: 15, min_stock: 5 },
  { name: "Pera", category: "Frutas", unit: "kg", cost: 1500, price: 2600, stock: 20, min_stock: 6 },
  { name: "Frutilla", category: "Frutas", unit: "kg", cost: 4000, price: 6500, stock: 6, min_stock: 3 },
  { name: "Palta", category: "Frutas", cost: 1200, price: 2200, stock: 20, min_stock: 6 },
  { name: "Huevos maple x30", category: "Almacén", cost: 6500, price: 8900, stock: 12, min_stock: 4 },
];

const LIBRERIA: DemoItem[] = [
  { name: "Cuaderno A4 rayado 84 h", category: "Cuadernos", cost: 2500, price: 4200, stock: 20, min_stock: 6 },
  { name: "Cuaderno tapa dura 48 h", category: "Cuadernos", cost: 2200, price: 3800, stock: 20, min_stock: 6 },
  { name: "Repuesto hojas N° 3 x96", category: "Cuadernos", cost: 2800, price: 4800, stock: 15, min_stock: 5 },
  { name: "Carpeta N° 3 con anillos", category: "Cuadernos", cost: 3000, price: 5200, stock: 10, min_stock: 3 },
  { name: "Resma A4 500 hojas", category: "Papelería", unit: "resma", cost: 6500, price: 9500, stock: 15, min_stock: 5 },
  { name: "Cartulina color", category: "Papelería", cost: 300, price: 700, stock: 50, min_stock: 15 },
  { name: "Birome azul", category: "Escritura", cost: 300, price: 700, stock: 60, min_stock: 20 },
  { name: "Birome negra", category: "Escritura", cost: 300, price: 700, stock: 40, min_stock: 15 },
  { name: "Lápiz negro HB", category: "Escritura", cost: 250, price: 600, stock: 50, min_stock: 15 },
  { name: "Goma de borrar", category: "Escritura", cost: 250, price: 600, stock: 40, min_stock: 10 },
  { name: "Corrector en cinta", category: "Escritura", cost: 1200, price: 2400, stock: 15, min_stock: 5 },
  { name: "Resaltadores x4", category: "Escritura", cost: 2000, price: 3800, stock: 12, min_stock: 4 },
  { name: "Lápices de colores x12", category: "Arte y escolar", cost: 2200, price: 4200, stock: 15, min_stock: 5 },
  { name: "Marcadores x12", category: "Arte y escolar", cost: 2600, price: 4900, stock: 12, min_stock: 4 },
  { name: "Plasticola 40 g", category: "Arte y escolar", cost: 600, price: 1200, stock: 25, min_stock: 8 },
  { name: "Tijera escolar", category: "Arte y escolar", cost: 900, price: 1900, stock: 15, min_stock: 5 },
  { name: "Regla 30 cm", category: "Arte y escolar", cost: 400, price: 900, stock: 20, min_stock: 6 },
  { name: "Sacapuntas", category: "Arte y escolar", cost: 200, price: 500, stock: 30, min_stock: 10 },
];

const ELECTRONICA: DemoItem[] = [
  { name: "Vidrio templado 9H", category: "Protección", cost: 1500, price: 6000, stock: 40, min_stock: 10 },
  { name: "Funda silicona iPhone 13", category: "Protección", cost: 5000, price: 12000, stock: 15, min_stock: 4 },
  { name: "Funda transparente Galaxy A55", category: "Protección", cost: 3000, price: 8500, stock: 12, min_stock: 4 },
  { name: "Cargador 20 W USB-C", category: "Carga", cost: 8000, price: 18000, stock: 10, min_stock: 3 },
  { name: "Cargador rápido 25 W", category: "Carga", cost: 7000, price: 16000, stock: 10, min_stock: 3 },
  { name: "Cable USB-C a USB-C 1 m", category: "Carga", cost: 2500, price: 6500, stock: 20, min_stock: 6 },
  { name: "Cable USB a Lightning 1 m", category: "Carga", cost: 3000, price: 7500, stock: 15, min_stock: 5 },
  { name: "Cargador para auto doble USB", category: "Carga", cost: 3500, price: 8500, stock: 8, min_stock: 3 },
  { name: "Power bank 10.000 mAh", category: "Carga", cost: 14000, price: 28000, stock: 6, min_stock: 2 },
  { name: "Auriculares Bluetooth", category: "Audio", cost: 12000, price: 25000, stock: 6, min_stock: 2 },
  { name: "Auriculares con cable", category: "Audio", cost: 3000, price: 7500, stock: 12, min_stock: 4 },
  { name: "Parlante Bluetooth portátil", category: "Audio", cost: 18000, price: 35000, stock: 4, min_stock: 2 },
  { name: "Memoria microSD 64 GB", category: "Almacenamiento", cost: 6000, price: 12500, stock: 10, min_stock: 3 },
  { name: "Pendrive 32 GB", category: "Almacenamiento", cost: 4000, price: 8500, stock: 10, min_stock: 3 },
  { name: "Soporte de celular para auto", category: "Accesorios", cost: 3500, price: 8000, stock: 8, min_stock: 3 },
  { name: "Smartwatch básico", category: "Accesorios", cost: 20000, price: 42000, stock: 3, min_stock: 1 },
];

const TALLER: DemoItem[] = [
  { name: "Cambio de aceite y filtro", category: "Mano de obra", service: true, price: 18000, duration_min: 45 },
  { name: "Service completo", category: "Mano de obra", service: true, price: 65000, duration_min: 180 },
  { name: "Cambio de pastillas de freno", category: "Mano de obra", service: true, price: 25000, duration_min: 60 },
  { name: "Alineación y balanceo", category: "Mano de obra", service: true, price: 30000, duration_min: 60 },
  { name: "Diagnóstico con escáner", category: "Mano de obra", service: true, price: 15000, duration_min: 30 },
  { name: "Revisión de tren delantero", category: "Mano de obra", service: true, price: 20000, duration_min: 60 },
  { name: "Cambio de amortiguadores (par)", category: "Mano de obra", service: true, price: 45000, duration_min: 120 },
  { name: "Cambio de correa de distribución", category: "Mano de obra", service: true, price: 90000, duration_min: 240 },
  { name: "Filtro de aceite", category: "Repuestos", cost: 6500, price: 11000, stock: 14, min_stock: 4 },
  { name: "Aceite 10W40 x 4 L", category: "Repuestos", cost: 28000, price: 42000, stock: 9, min_stock: 3 },
  { name: "Filtro de aire", category: "Repuestos", cost: 7000, price: 12500, stock: 8, min_stock: 3 },
  { name: "Pastillas de freno delanteras", category: "Repuestos", cost: 22000, price: 36000, stock: 6, min_stock: 2 },
  { name: "Bujías x4", category: "Repuestos", cost: 16000, price: 26000, stock: 8, min_stock: 2 },
  { name: "Kit de distribución", category: "Repuestos", cost: 45000, price: 72000, stock: 2, min_stock: 1 },
  { name: "Líquido de frenos 500 ml", category: "Repuestos", cost: 4500, price: 7500, stock: 10, min_stock: 3 },
  { name: "Refrigerante 1 L", category: "Repuestos", cost: 4000, price: 6800, stock: 10, min_stock: 3 },
  { name: "Lámpara H4", category: "Repuestos", cost: 2500, price: 4500, stock: 12, min_stock: 4 },
  { name: "Escobillas limpiaparabrisas (par)", category: "Repuestos", cost: 6000, price: 10500, stock: 6, min_stock: 2 },
];

const CLINICA: DemoItem[] = [
  { name: "Primera consulta", category: "Consultas", service: true, price: 30000, duration_min: 40, tax_rate: 0 },
  { name: "Consulta de control", category: "Consultas", service: true, price: 22000, duration_min: 20, tax_rate: 0 },
  { name: "Consulta pediátrica", category: "Consultas", service: true, price: 25000, duration_min: 30, tax_rate: 0 },
  { name: "Consulta odontológica", category: "Odontología", service: true, price: 25000, duration_min: 30, tax_rate: 0 },
  { name: "Limpieza dental", category: "Odontología", service: true, price: 30000, duration_min: 40, tax_rate: 0 },
  { name: "Arreglo de caries", category: "Odontología", service: true, price: 45000, duration_min: 45, tax_rate: 0 },
  { name: "Extracción", category: "Odontología", service: true, price: 50000, duration_min: 45, tax_rate: 0 },
  { name: "Sesión de kinesiología", category: "Kinesiología", service: true, unit: "sesión", price: 18000, duration_min: 45, tax_rate: 0 },
  { name: "Sesión de psicología", category: "Psicología", service: true, unit: "sesión", price: 28000, duration_min: 50, tax_rate: 0 },
  { name: "Consulta nutricional", category: "Nutrición", service: true, price: 26000, duration_min: 40, tax_rate: 0 },
  { name: "Aplicación de inyectable", category: "Enfermería", service: true, price: 5000, duration_min: 10, tax_rate: 0 },
  { name: "Curación", category: "Enfermería", service: true, price: 8000, duration_min: 15, tax_rate: 0 },
  { name: "Apto físico", category: "Certificados", service: true, price: 15000, duration_min: 20, tax_rate: 0 },
];

const ESTETICA: DemoItem[] = [
  { name: "Corte de pelo", category: "Servicios", service: true, price: 8000, duration_min: 30 },
  { name: "Corte y barba", category: "Servicios", service: true, price: 11000, duration_min: 45 },
  { name: "Coloración", category: "Servicios", service: true, price: 25000, duration_min: 90 },
  { name: "Lavado y peinado", category: "Servicios", service: true, price: 7000, duration_min: 30 },
  { name: "Shampoo 400 ml", category: "Productos", price: 8000, cost: 4000, stock: 10, min_stock: 3 },
  { name: "Arreglo de barba", category: "Servicios", service: true, price: 5000, duration_min: 20 },
  { name: "Corte niño", category: "Servicios", service: true, price: 6500, duration_min: 30 },
  { name: "Esmaltado semipermanente", category: "Servicios", service: true, price: 12000, duration_min: 60 },
  { name: "Cera para peinar 100 g", category: "Productos", price: 7000, cost: 3500, stock: 12, min_stock: 4 },
  { name: "Aceite para barba 30 ml", category: "Productos", price: 9000, cost: 4500, stock: 8, min_stock: 3 },
];

const PRODUCTS_TEXT = "Para probar ventas y stock.";

export const DEMO_CATALOGS: Record<string, DemoCatalog> = {
  general: { title: "Productos de ejemplo", description: PRODUCTS_TEXT, noun: "productos", items: KIOSCO },
  kiosco: {
    title: "Productos de ejemplo (bebidas, golosinas, almacén…)",
    description: PRODUCTS_TEXT,
    noun: "productos",
    items: KIOSCO,
  },
  supermercado: {
    title: "Góndolas de ejemplo (almacén, carnicería, verdulería…)",
    description: "Productos por unidad y por kilo, ordenados por sección.",
    noun: "productos",
    items: SUPERMERCADO,
  },
  farmacia: {
    title: "Productos de ejemplo (venta libre, higiene, bebés…)",
    description: "Solo productos de venta libre, para probar ventas y stock.",
    noun: "productos",
    items: FARMACIA,
  },
  ropa: {
    title: "Prendas de ejemplo (remeras, jeans, abrigos…)",
    description: "Con talles y colores, cada uno con su stock.",
    noun: "prendas",
    items: ROPA,
  },
  ferreteria: {
    title: "Artículos de ejemplo (tornillería, electricidad, pintura…)",
    description: "Por unidad, por kilo y por metro.",
    noun: "artículos",
    items: FERRETERIA,
  },
  petshop: {
    title: "Productos de ejemplo (alimento, higiene, accesorios…)",
    description: "Alimento en bolsa y suelto por kilo.",
    noun: "productos",
    items: PETSHOP,
  },
  panaderia: {
    title: "Productos de ejemplo (pan, facturas, tortas…)",
    description: "Por kilo, por docena y por unidad.",
    noun: "productos",
    items: PANADERIA,
  },
  gastronomia: {
    title: "Carta de ejemplo (minutas, pizzas, bebidas, postres…)",
    description: "Platos que se hacen al momento y bebidas con stock, ordenados por categoría.",
    noun: "platos y bebidas",
    items: GASTRONOMIA,
  },
  verduleria: {
    title: "Frutas y verduras de ejemplo",
    description: "La mayoría por kilo, para probar la venta por peso o por monto.",
    noun: "productos",
    items: VERDULERIA,
  },
  libreria: {
    title: "Artículos de ejemplo (cuadernos, escritura, escolar…)",
    description: PRODUCTS_TEXT,
    noun: "artículos",
    items: LIBRERIA,
  },
  electronica: {
    title: "Accesorios de ejemplo (fundas, cargadores, audio…)",
    description: "Solo accesorios. Los celulares por IMEI los cargás vos en Celulares.",
    noun: "accesorios",
    items: ELECTRONICA,
  },
  taller: {
    title: "Servicios y repuestos de ejemplo (service, frenos, alineación…)",
    description: "Mano de obra con su duración y repuestos con stock, para probar órdenes y turnos.",
    noun: "servicios y repuestos",
    items: TALLER,
  },
  clinica: {
    title: "Servicios de ejemplo (consultas, odontología, kinesiología…)",
    description: "Prácticas con su duración, para probar la agenda. No se cargan pacientes.",
    noun: "servicios",
    items: CLINICA,
  },
  estetica: {
    title: "Servicios de ejemplo (corte, barba, color…)",
    description: "Servicios con su duración y un producto de reventa, para probar turnos y cobros.",
    noun: "servicios",
    items: ESTETICA,
  },
};

export function demoCatalogFor(rubro: string | null | undefined): DemoCatalog {
  return DEMO_CATALOGS[rubro ?? ""] ?? DEMO_CATALOGS.general;
}

/** Códigos de los ejemplos viejos de kiosco (los nuevos se marcan con catalog_source = 'demo'). */
export const DEMO_BARCODES = KIOSCO.flatMap((p) => (p.barcode ? [p.barcode] : []));
