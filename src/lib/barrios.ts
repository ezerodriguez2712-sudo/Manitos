/** Barrios y localidades más buscados de Córdoba capital y Gran Córdoba. */
export const BARRIOS = [
  "Centro", "Nueva Córdoba", "Güemes", "Alberdi", "Alto Alberdi", "Observatorio", "Cofico", "Alta Córdoba",
  "General Paz", "Juniors", "Pueyrredón", "San Vicente", "Barrio Jardín", "Jardín Espinosa", "Parque Vélez Sarsfield",
  "Bajo Palermo", "Cerro de las Rosas", "Villa Belgrano", "Urca", "Arguello", "Granja de Funes", "Villa Cabrera",
  "Las Rosas", "Parque Chacabuco", "Rogelio Martínez", "Villa Rivera Indarte", "Poeta Lugones", "Los Paraísos",
  "Marqués de Sobremonte", "Residencial América", "Yofre", "Talleres", "San Martín", "Providencia", "Bella Vista",
  "Santa Isabel", "Villa El Libertador", "Ituzaingó", "Empalme", "Maldonado", "Altamira", "Colón", "Las Palmas",
  "Alto Verde", "Villa Allende Parque", "Quebrada de las Rosas", "Barrio Inaudi", "Valle Escondido", "Manantiales",
  "Country Jockey", "Villa Siburu", "Ampliación Rosedal", "Parque Liceo", "Liceo General Paz", "Ameghino",
  "Villa Azalais", "Los Boulevares", "Guiñazú", "Matienzo", "Villa Revol", "Parque Atlántica", "Zumarán",
  "Villa Allende", "Mendiolaza", "Saldán", "La Calera", "Unquillo", "Río Ceballos", "Malagueño", "Villa Carlos Paz",
  "Alta Gracia", "Estación Juárez Celman", "Malvinas Argentinas",
].sort((a, b) => a.localeCompare(b, "es"));

/** Compara barrios sin importar mayúsculas ni tildes. */
export const normalizar = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const mismoBarrio = (a?: string | null, b?: string | null) =>
  !!a && !!b && normalizar(a) === normalizar(b);
