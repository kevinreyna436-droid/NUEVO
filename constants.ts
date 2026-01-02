
import { Fabric, FurnitureTemplate } from './types';

// The Master Database for cross-referencing AI results.
export const MASTER_FABRIC_DB: Record<string, string[]> = {
  "Alanis": ["Ash", "Beige", "Curry", "Dove", "Indigo", "Ivory", "Steel"],
  "Alba": ["Brick"],
  // ... (El resto de MASTER_FABRIC_DB se mantiene igual, es referencia para la IA)
};

// Data of validated stock provided by the user
// Esta lista se mantiene SOLO para lógica de negocio (Punto Verde de Stock), 
// pero NO genera datos visuales si no están en la Nube.
export const IN_STOCK_DB: Record<string, string[]> = {
  "Aberdin": ["Gris", "Lino", "Natural", "Oxford"],
  "Alanis": ["Ash", "Beige", "Ivory", "Steel"],
  "Alpino": ["Acero", "Arena", "Gris", "Marfil"],
  "Arles": ["Beige", "Gris", "Plata", "Taupe", "Marengo"], // Added Arles
  "Atlantis": ["Blue", "Charcoal", "Cloud", "Indigo", "Mineral", "Olive"],
  "Basket": ["Ash", "Beige", "Camel", "Graphite", "Grey", "Mocha", "Silver"],
  "Beckon": ["Cement", "Indigo", "Metal", "Poppy", "Reed", "Salt", "Shell"],
  "Belucci": ["Black", "Brick", "Ecru", "Fog", "Fossil", "Grey", "Metal", "Navy", "Ocean", "Olive", "Rose", "Serenity", "Steel"],
  "Blend": ["Black", "Cobalt", "Flax", "Mineral", "Natural", "Teal"],
  "Bloom": ["Black", "Chocolate", "Grey", "Mica", "Mustard", "Sand", "Smoke", "White"],
  "Cambridge": ["Beige", "Dove", "Olive", "Snow"],
  "Copenhagen": ["Charcoal", "Cream", "Latte", "Linen", "Natural", "Smoke", "Snow"],
  "Corsica": ["Amber", "Beige", "Blue", "Choco", "Coffee", "Domino", "Grey", "Red Brick", "Rose", "Spa"],
  "Distraction": ["Domino", "Midnight", "Mocha", "Natural"],
  "Doby": ["Aqua", "Azul", "Fresa", "Indigo", "Lavanda", "Lino", "Malva", "Manzana", "Marfil", "Marmol", "Menta", "Nuez", "Palo de Rosa", "Piedra", "Topo", "Turquesa"],
  "Drill": ["Beige", "Charcoal", "Coffee", "Darkgrey", "Granite", "Latte", "Natural", "Pearl", "Platinum", "Slate"],
  "Element": ["Cobalt", "Cocoa", "Darkgrey", "Emerald", "Grey", "Mustard", "Poppy", "Stone", "Tusk", "Zinc"],
  "Elite": ["Darkgrey", "Flax", "Grey", "Pewter", "Royal", "Silver", "Spa", "Stone"],
  "Enigma": ["Acero", "Aqua", "Beige", "Café", "Cereza", "Fossil", "Grey", "Iron", "Lavanda", "Marfil", "Marino", "Mink", "Mustard", "Natural", "Navy", "Oro", "Piedra", "Rey", "Rojo", "Topo", "Uva", "Verde", "Zinc"],
  "Enora": ["Cream", "Flax", "Grey", "Ivory", "Silver"],
  "Fancy": ["Bark", "Ivory", "Metal", "Mineral", "Pewter", "Tusk", "Zinc"],
  "Fashion": ["Beige", "Black", "Bone", "Capuchino", "Grey", "Platinum"],
  "Fiora": ["Ash", "Choco", "Coral", "Ecru", "Grey", "Linen", "Pearl", "Soldier", "Spa", "Turquoise"],
  "Freedom": ["Granite", "Gravel", "Linen", "Sky", "Stone", "Turquesa"],
  "Gellar": ["Jute", "Linen", "Marble"],
  "Genova": ["Bark", "Black Vintage", "Electric Blue", "Mauve", "Mercury", "Midnight", "Navy", "Seafoam", "Seagreen", "Serenity", "Silver", "Topaz", "Vintage", "Violet", "White"],
  "Harmony": ["Charcoal", "Coffee", "Cream", "Flax", "Grey", "Pearl", "Silver", "Taupe", "Titanium", "Ultramarine"],
  "High Living": ["Charcoal", "Linen", "Natural", "White"],
  "Holland Velvet": ["Beige", "Blush", "Deepgrey", "Emerald", "Lime", "Midnight", "Mocha", "Mustard", "Platinum", "Terracota", "Wine"],
  "Imperio": ["Camel", "Cinnabar", "Emerald", "Fudge", "Grey", "Lilac", "Smokeblue", "Tan", "Red", "Shell", "Yellow"],
  "Kalahari": ["Baltic", "Champagne", "Eclipse", "Metal", "Mist", "Rose", "Sand", "Silver", "Sterling"],
  "Kiba": ["Domino", "Ebony", "Flaxen", "Linen", "Mist", "Onix", "Pool", "Quarry", "Rose", "Titanium"],
  "Linus": ["Cement", "Charcoal", "Indigo", "Tomato"],
  "Lotus": ["Beige", "Blue", "Champagne", "Graphite", "Grey", "Mica", "Red", "Silver"],
  "Lullaby": ["Bark", "Black", "Cream", "Fossil", "Ivory", "Mustard", "Olive", "Oyster", "Silver"],
  "Maq Artell": ["Akron Beige", "Albany Azul", "Camel Aqua", "Camel Azafran", "Draco Cemento", "Draco Ceniza", "Silex Arena", "Silex Gris", "Silex Humo"],
  "Malibu": ["Bone", "Champagne", "Charcoal", "Cream", "Darkgrey", "Grey", "Ivory", "Snow"],
  "Monique": ["Bluestone", "Cotton", "Domino", "Dove", "Ecru", "Pebble", "Porcelain", "Steel", "Twine"],
  "Monument": ["Beige", "Ecru", "Mica", "Mineral", "Silver", "Slate", "Smoke", "Stone"],
  "Nude Beach": ["Apple", "Blue", "Carbon", "Dark Navy", "Grey", "Linen", "Navy", "Orange", "Overcast", "Sky", "Teal", "Yellow"],
  "Ocala": ["Gravel", "Latte", "Pearl", "Teal", "Zinc"],
  "Odyssey": ["Fawn", "Jute", "Shell", "Smoke", "Steel"],
  "Omni": ["Dove", "Ivory", "Sand"],
  "Outrigger": ["Cream", "Ecru", "Pacific", "White"],
  "Point": ["Admiral", "Camel", "Domino", "Dove", "Dune", "Grey", "Ivory", "Linen", "Pebble", "Pool", "Sky", "White"],
  "Presto": ["Charcoal", "Flax", "Stone"],
  "Prohibition": ["Ivory", "Pearl", "Snow"],
  "Reflect": ["Charcoal", "Dove", "Fossil", "Nature"],
  "Ron": ["01 Natural", "02 Lino", "05 Sand", "10 Gris", "12 Plomo", "15 Mostaza", "20 Azul"], // Added Ron
  "Ronda": ["Beige", "Blue", "Grey", "Ivory", "Mustard", "Silver", "Sky", "Stone", "Taupe"],
  "Sahara": ["Bluegrey", "Celestial", "Flax", "Linen", "Opal", "Snow", "Storm"],
  "Sapphire": ["Beige", "Black", "Blue", "Bone", "Deepgrey", "Gold", "Green", "Magenta", "Orange", "Persimon", "Rosequartz", "Serenity", "Silvergrey", "Smoke", "Wine"],
  "Seaport": ["Charcoal", "Grey", "Sail"],
  "Shetland": ["Black", "Brick", "Grey", "Mist", "Mustard", "Natural"],
  "Siena": ["Black", "Ivory", "Light Grey", "Linen", "Navy", "Red Brick", "Rose"],
  "Soho": ["Beige", "Ivory", "Metal", "Pewter", "Silver", "Smokeblue", "Steel", "Taupe", "Toffe"],
  "Spark": ["Beige", "Bloosom", "Dune", "Linen", "Sand"],
  "Stella": ["Buff", "Cobalt", "Latte", "Nickel", "Orange", "Pacific", "Red", "Smoke"],
  "Sugarshack": ["Bone", "Denim", "Gravel", "Metal"],
  "Tessa": ["Dove", "Ebony", "Ivory", "Khaki", "Midnight", "Oyster", "Shadow", "Vanilla"],
  "Topaz": ["Bittersweet", "Black", "Burlap", "Cream", "Greenery", "Iron", "Ocean"],
  "Trixie": ["Charcoal", "Chocolate", "Indigo", "Linen", "Pewter", "Platinum", "Praline", "Sand"],
  "Turino": ["Ash", "Fog", "Linen", "Snow"],
  "Valentina": ["Ash", "Beige", "Copper", "Ferrari", "Royal", "Saddle", "Shark", "Taupe"],
  "Victory": ["Beige", "Capuchino", "Flint", "Grey", "Ivory", "Orion Blue", "Sky", "Straw", "Teal", "Thunder"],
  "Waikiki": ["Denim", "Natural", "Pearl", "Snow"],
  "Windsor": ["Bark", "Cream", "Ecru", "Latte", "Pewter"],
  "Zenith": ["Aqua", "Black", "Brick", "Buttercup", "Cobalt", "Cocoa", "Coral", "Emerald", "Grape", "Marine", "Mineral", "Natural", "Ocean", "Red", "Snow", "Stone", "Toffe", "Tusk", "Zinc"]
};

// Templates for the Visualizer
export const FURNITURE_TEMPLATES: FurnitureTemplate[] = [
  {
    id: 'sofa-01',
    name: 'Sofá Chesterfield',
    category: 'sofa',
    imageUrl: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?ixlib=rb-4.0.3&auto=format&fit=crop&w=1770&q=80'
  },
  {
    id: 'chair-01',
    name: 'Silla Eames',
    category: 'chair',
    imageUrl: 'https://images.unsplash.com/photo-1598300042247-d088f8ab3a91?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80'
  },
  {
    id: 'armchair-01',
    name: 'Butaca Moderna',
    category: 'armchair',
    imageUrl: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80'
  },
   {
    id: 'sofa-02',
    name: 'Sofá Minimalista',
    category: 'sofa',
    imageUrl: 'https://images.unsplash.com/photo-1550254478-ead40cc54513?ixlib=rb-4.0.3&auto=format&fit=crop&w=1000&q=80'
  },
  {
    id: 'rug-01',
    name: 'Habitación Vacía (Concreto)',
    category: 'rug',
    // Using the requested image: Empty room, concrete floor, curtains
    imageUrl: 'https://images.unsplash.com/photo-1634712282287-14ed57ef99df?q=80&w=2000&auto=format&fit=crop',
    supplier: 'CREATA RUGS'
  }
];

// --- DATOS DE DEMOSTRACIÓN (FALLBACK) ---
// Estos datos se cargan automáticamente si la nube está vacía o falla.
export const MOCK_FABRICS: Fabric[] = [
    {
        id: 'mock-001',
        name: 'Alanis',
        supplier: 'FORMATEX',
        technicalSummary: 'Tejido suave de alta resistencia con acabado antimanchas. Ideal para uso residencial intenso.',
        specs: { composition: '100% Poliéster', martindale: '50,000 Ciclos', usage: 'Heavy Duty', weight: '380g/m2' },
        colors: ["Ash", "Beige", "Ivory", "Steel"],
        colorImages: {
            "Ash": "https://images.unsplash.com/photo-1616627561950-9f84a1c78021?w=800&auto=format&fit=crop&q=60",
            "Beige": "https://images.unsplash.com/photo-1520699697851-3dc68aa3a474?w=800&auto=format&fit=crop&q=60",
            "Ivory": "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800&auto=format&fit=crop&q=60"
        },
        mainImage: "https://images.unsplash.com/photo-1520699697851-3dc68aa3a474?w=800&auto=format&fit=crop&q=60",
        category: 'model'
    },
    {
        id: 'mock-002',
        name: 'Belucci',
        supplier: 'FORMATEX',
        technicalSummary: 'Chenille de textura rica y tacto aterciopelado. Aporta elegancia y calidez.',
        specs: { composition: '90% PES 10% Cot', martindale: '40,000 Ciclos', usage: 'General', weight: '420g/m2' },
        colors: ["Black", "Brick", "Grey", "Navy", "Olive"],
        colorImages: {
             "Navy": "https://images.unsplash.com/photo-1528459801416-a9e53bbf4e17?w=800&auto=format&fit=crop&q=60",
             "Brick": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&auto=format&fit=crop&q=60"
        },
        mainImage: "https://images.unsplash.com/photo-1507149833265-60c372daea22?w=800&auto=format&fit=crop&q=60",
        category: 'model'
    },
    {
        id: 'mock-003',
        name: 'Ronda',
        supplier: 'ARTEX',
        technicalSummary: 'Lino sintético de trama abierta. Aspecto natural con la durabilidad del poliéster.',
        specs: { composition: '100% PES', martindale: '35,000 Ciclos', usage: 'Decorativo', weight: '300g/m2' },
        colors: ["Beige", "Blue", "Grey", "Ivory"],
        mainImage: "https://images.unsplash.com/photo-1598532163257-ae3c6b2524b6?w=800&auto=format&fit=crop&q=60",
        category: 'model'
    },
    {
        id: 'mock-rug-01',
        name: 'Persa Azul Vintage',
        supplier: 'CREATA RUGS',
        technicalSummary: 'Alfombra de estilo persa con acabado desgastado moderno.',
        specs: { composition: 'Lana/Sintético', martindale: 'N/A', usage: 'Piso', weight: '1200g/m2' },
        dimensions: "200x300 cm",
        colors: ["Azul"],
        mainImage: "https://images.unsplash.com/photo-1575414723300-3009842462e3?w=800&auto=format&fit=crop&q=60",
        category: 'rug'
    },
    {
        id: 'mock-wood-01',
        name: 'Nogal Americano',
        supplier: 'MADERAS',
        technicalSummary: 'Madera oscura con veta pronunciada.',
        specs: { composition: 'Madera Natural', martindale: '', usage: 'Estructura' },
        colors: ["Nogal"],
        mainImage: "https://images.unsplash.com/photo-1549419266-419b679a6157?w=800&auto=format&fit=crop&q=60",
        category: 'wood'
    }
];
