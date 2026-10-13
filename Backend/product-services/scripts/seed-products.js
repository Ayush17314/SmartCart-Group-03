require("dotenv").config();
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  sku: { type: String, trim: true, uppercase: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 5000 },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, required: true, trim: true, maxlength: 100 },
  brand: { type: String, trim: true, maxlength: 100 },
  images: { type: [String], default: [] },
  stock: { type: Number, default: 0, min: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  specifications: mongoose.Schema.Types.Mixed,
  archivedAt: { type: Date, default: null },
}, { timestamps: true });

const Product = mongoose.models.Product || mongoose.model("Product", ProductSchema);

const sampleProducts = [
  {
    name: "Aura Noise-Cancelling Wireless Headphones",
    sku: "ELEC-AURA-01",
    category: "Electronics",
    brand: "AuraSound",
    price: 14999,
    stock: 28,
    rating: 4.8,
    description: "Industry-leading active noise cancellation with 40mm titanium drivers. 35-hour battery life, plush memory foam earcups, and dual beamforming microphones for crystal-clear calls.",
    images: [
      "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
      "https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=800&q=80"
    ],
    specifications: {
      "Battery Life": "35 Hours",
      "Connectivity": "Bluetooth 5.3 + 3.5mm AUX",
      "Noise Cancellation": "Hybrid Active ANC (4-mic)",
      "Weight": "250g"
    }
  },
  {
    name: "Nova Ultra HD 4K Action Camera",
    sku: "ELEC-NOVA-02",
    category: "Electronics",
    brand: "NovaCam",
    price: 19499,
    stock: 14,
    rating: 4.6,
    description: "Capture extreme moments in breathtaking 4K 60FPS with 6-axis gyro stabilization. Waterproof up to 30 meters with included housing and dual touchscreens.",
    images: [
      "https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80"
    ],
    specifications: {
      "Resolution": "4K at 60fps / 20MP Photos",
      "Waterproof": "30m with case",
      "Display": "2.0-inch Touch LCD + 1.4-inch Front",
      "Battery": "1350mAh Li-ion"
    }
  },
  {
    name: "Lumina Tactile Mechanical Keyboard",
    sku: "ELEC-LUMI-03",
    category: "Electronics",
    brand: "LuminaTech",
    price: 7999,
    stock: 45,
    rating: 4.9,
    description: "Compact 75% layout with hot-swappable pre-lubed switches and gasket-mount sound dampening. Per-key RGB backlighting and seamless multi-device Bluetooth switching.",
    images: [
      "https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80"
    ],
    specifications: {
      "Layout": "75% Compact (84 Keys)",
      "Switch Type": "Gateron Pro Yellow (Tactile)",
      "Connectivity": "Tri-mode: 2.4G / BT 5.1 / Type-C",
      "Keycaps": "Double-shot PBT"
    }
  },
  {
    name: "Urban Explorer Water-Resistant Commuter Backpack",
    sku: "FASH-URBN-04",
    category: "Fashion",
    brand: "NomadCraft",
    price: 4499,
    stock: 35,
    rating: 4.7,
    description: "Designed for modern commuters and weekend travelers. Features a padded 16-inch laptop compartment, weather-sealed zippers, hidden RFID security pocket, and ergonomic airflow back panel.",
    images: [
      "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80"
    ],
    specifications: {
      "Capacity": "24 Liters",
      "Laptop Sleeve": "Fits up to 16-inch MacBook Pro",
      "Material": "900D Cordura Nylon",
      "Dimensions": "48 x 30 x 18 cm"
    }
  },
  {
    name: "Minimalist Chronograph Minimalist Watch",
    sku: "FASH-TIME-05",
    category: "Fashion",
    brand: "Krono",
    price: 8999,
    stock: 19,
    rating: 4.5,
    description: "Sapphire crystal glass casing enclosing Japanese quartz movement. Genuine Italian full-grain leather strap and 50m water resistance. Timeless everyday luxury.",
    images: [
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80"
    ],
    specifications: {
      "Movement": "Japanese Quartz Chronograph",
      "Case Diameter": "40mm",
      "Glass": "Anti-reflective Sapphire",
      "Strap": "Full-grain Italian Leather (20mm)"
    }
  },
  {
    name: "Artisan Ceramic Pour-Over Coffee Maker",
    sku: "HOME-ARTC-06",
    category: "Home",
    brand: "BaristaHome",
    price: 2999,
    stock: 40,
    rating: 4.8,
    description: "Handcrafted high-fired ceramic dripper with internal spiral ribs for optimal extraction and flow rate. Includes heat-resistant borosilicate glass carafe (600ml).",
    images: [
      "https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80"
    ],
    specifications: {
      "Capacity": "600ml (2-4 Cups)",
      "Material": "Glazed Stoneware & Borosilicate Glass",
      "Filter Size": "Standard V60 02 Filters",
      "Dishwasher Safe": "Yes"
    }
  },
  {
    name: "Nordic Minimalist Oak Desk Lamp",
    sku: "HOME-LAMP-07",
    category: "Home",
    brand: "ScandiLiving",
    price: 3499,
    stock: 22,
    rating: 4.6,
    description: "Solid natural white oak base with matte aluminum shade. Features stepless touch dimmer, 3 color temperatures (warm, natural, cool white), and 45-degree angle adjustment.",
    images: [
      "https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80"
    ],
    specifications: {
      "Light Source": "Flicker-free Eye-Care LED (10W)",
      "Color Temp": "2700K - 6500K",
      "Materials": "FSC Certified Oak + Powder-coated Steel",
      "Power": "USB-C Powered (Adapter Included)"
    }
  },
  {
    name: "PureBotanics Restorative Night Serum",
    sku: "BEAU-SERM-08",
    category: "Beauty",
    brand: "PureBotanics",
    price: 2499,
    stock: 50,
    rating: 4.9,
    description: "Concentrated botanical elixir with cold-pressed rosehip seed oil, bakuchiol, and hyaluronic acid. Deeply hydrates and rejuvenates the skin barrier overnight.",
    images: [
      "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=800&q=80"
    ],
    specifications: {
      "Volume": "30ml / 1.0 fl oz",
      "Skin Type": "All Skin Types (Cruelty-Free)",
      "Key Ingredients": "Bakuchiol, Rosehip Oil, Squalane",
      "Packaging": "UV-protective Amber Glass Bottle"
    }
  }
];

async function seed() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  const dbName = process.env.MONGODB_DB || "smartcart_product";
  await mongoose.connect(uri, { dbName });
  console.log("Connected to MongoDB:", dbName);

  const existing = await Product.countDocuments();
  if (existing > 0) {
    console.log(`Database already has ${existing} products. Skipping initial seed.`);
    return;
  }

  console.log("Seeding sample products...");
  await Product.insertMany(sampleProducts);
  console.log(`Successfully seeded ${sampleProducts.length} products!`);
}

seed()
  .catch((err) => {
    console.error("Seeding failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
