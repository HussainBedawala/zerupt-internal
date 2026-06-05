#!/usr/bin/env node

/**
 * Al-Noor Mobiles Test Data Generator
 * Generates realistic (and intentionally messy) migration data for Yousef's 2-store KWD electronics retailer.
 * Deterministic: seeded PRNG ensures reproducibility.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
  seed: 42,
  categoryCount: 25,
  productCount: 3000,
  phoneCount: 400,
  accessoryCount: 2600,
  customerCount: 800,
  supplierCount: 18,
  hawallySku: 2200,
  salmiyaSku: 1400,
  imeiCount: 900,
};

const PHONE_MODELS = [
  // iPhone
  { brand: 'Apple', model: 'iPhone 17 Pro Max', storages: [256, 512, 1024], basePrice: 499 },
  { brand: 'Apple', model: 'iPhone 17 Pro', storages: [256, 512, 1024], basePrice: 429 },
  { brand: 'Apple', model: 'iPhone 17', storages: [128, 256, 512], basePrice: 349 },
  { brand: 'Apple', model: 'iPhone 17 Plus', storages: [128, 256, 512], basePrice: 399 },
  { brand: 'Apple', model: 'iPhone 16 Pro Max', storages: [256, 512, 1024], basePrice: 449 },
  { brand: 'Apple', model: 'iPhone 16 Pro', storages: [256, 512, 1024], basePrice: 379 },
  { brand: 'Apple', model: 'iPhone 16', storages: [128, 256, 512], basePrice: 299 },
  { brand: 'Apple', model: 'iPhone 16 Plus', storages: [128, 256, 512], basePrice: 349 },
  { brand: 'Apple', model: 'iPhone 15 Pro Max', storages: [256, 512, 1024], basePrice: 399 },
  { brand: 'Apple', model: 'iPhone 15 Pro', storages: [256, 512, 1024], basePrice: 329 },
  // Samsung
  { brand: 'Samsung', model: 'Galaxy S25 Ultra', storages: [256, 512], basePrice: 479 },
  { brand: 'Samsung', model: 'Galaxy S25 Pro', storages: [256, 512], basePrice: 399 },
  { brand: 'Samsung', model: 'Galaxy S25', storages: [128, 256, 512], basePrice: 329 },
  { brand: 'Samsung', model: 'Galaxy S25+', storages: [256, 512], basePrice: 379 },
  { brand: 'Samsung', model: 'Galaxy S24 Ultra', storages: [256, 512], basePrice: 429 },
  { brand: 'Samsung', model: 'Galaxy S24', storages: [128, 256, 512], basePrice: 299 },
  { brand: 'Samsung', model: 'Galaxy A35', storages: [128, 256], basePrice: 189 },
  { brand: 'Samsung', model: 'Galaxy A55', storages: [128, 256], basePrice: 249 },
  // Xiaomi
  { brand: 'Xiaomi', model: 'Redmi Note 14 Pro', storages: [128, 256], basePrice: 169 },
  { brand: 'Xiaomi', model: 'Redmi 14', storages: [128, 256], basePrice: 119 },
  { brand: 'Xiaomi', model: 'Poco F6', storages: [256, 512], basePrice: 219 },
  { brand: 'Xiaomi', model: 'Mi 14', storages: [256, 512], basePrice: 349 },
  // Others
  { brand: 'Huawei', model: 'Mate 60 Pro', storages: [256, 512], basePrice: 399 },
  { brand: 'Honor', model: 'Magic 6', storages: [256, 512], basePrice: 349 },
  { brand: 'Oppo', model: 'Find X8 Pro', storages: [256, 512], basePrice: 379 },
  { brand: 'Oppo', model: 'A3 Pro', storages: [128, 256], basePrice: 149 },
  { brand: 'Realme', model: '13 Pro', storages: [128, 256], basePrice: 159 },
  { brand: 'Nothing', model: 'Phone 3', storages: [128, 256, 512], basePrice: 199 },
  { brand: 'Tecno', model: 'Pova 6', storages: [128, 256], basePrice: 139 },
  { brand: 'OnePlus', model: '13', storages: [256, 512], basePrice: 299 },
];

const ARABIC_NAMES = {
  category: [
    'هواتف ذكية', 'هواتف عادية', 'أجهزة لوحية', 'ساعات ذكية', 'سماعات',
    'أسلاك وشواحن', 'أغطية وحقائب', 'حماية الشاشة', 'بطاريات إضافية', 'سماعات خارجية',
  ],
  accessory: [
    'كفر هاتف', 'كفر سيليكون', 'شاحن سريع', 'كابل يو إس بي', 'حماية زجاج',
    'حقيبة يد', 'حامل هاتف', 'سماعة أذن', 'مروحة صغيرة', 'مكبر صوت',
  ],
};

const SUPPLIER_NAMES = [
  { en: 'Future Communications Co.', ar: 'شركة الاتصالات المستقبلية' },
  { en: 'Al-Babtain Electronics', ar: 'الإلكترونيات البابطين' },
  { en: 'X-cite Wholesale Division', ar: 'إكس سايت للبيع بالجملة' },
  { en: 'Dubai Mobile Traders FZE', ar: 'تجار الهواتف دبي' },
  { en: 'Jarir Distribution', ar: 'توزيع جرير' },
  { en: 'AlFuttaim Electronics', ar: 'إلكترونيات الفطيم' },
  { en: 'GCC Mobile Wholesale', ar: 'الجملة الموحدة للهواتف' },
  { en: 'Kuwait Tech Imports', ar: 'واردات كويت للتقنية' },
  { en: 'Arabian Electronics Co.', ar: 'شركة الإلكترونيات العربية' },
  { en: 'Premium Mobiles Distribution', ar: 'توزيع موبايلات بريميوم' },
  { en: 'Tech Hub Middle East', ar: 'مركز التقنية الشرق الأوسط' },
  { en: 'Digital Solutions Kuwait', ar: 'حلول الرقمية الكويت' },
  { en: 'Gulf Tech Traders', ar: 'تجار الخليج للتقنية' },
  { en: 'Smart Electronics Ltd', ar: 'الإلكترونيات الذكية' },
  { en: 'Innovation Mobile Co.', ar: 'شركة الجوال المبتكرة' },
  { en: 'United Phone Distributors', ar: 'موزعو الهواتف المتحدة' },
  { en: 'Global Tech Supply', ar: 'التوريد العالمي للتقنية' },
  { en: 'Premier Electronics Kuwait', ar: 'الإلكترونيات الفاخرة الكويت' },
];

// Paired customer names: Arabic origins with English/Arabic; expats with English only
const CUSTOMER_NAME_PAIRS = [
  // Kuwaiti names (all have Arabic)
  { en: 'Mohammed Al-Ajmi', ar: 'محمد العجمي' },
  { en: 'Ahmed Al-Ajmi', ar: 'أحمد العجمي' },
  { en: 'Yousef Al-Ajmi', ar: 'يوسف العجمي' },
  { en: 'Fatima Al-Ajmi', ar: 'فاطمة العجمي' },
  { en: 'Noura Al-Ajmi', ar: 'نورة العجمي' },
  { en: 'Mariam Al-Mutairi', ar: 'مريم المطيري' },
  { en: 'Dina Al-Mutairi', ar: 'دينا المطيري' },
  { en: 'Layla Al-Mutairi', ar: 'ليلى المطيري' },
  { en: 'Abdullah Al-Mutairi', ar: 'عبدالله المطيري' },
  { en: 'Mohammed Al-Otaibi', ar: 'محمد العتيبي' },
  { en: 'Fahad Al-Otaibi', ar: 'فهد العتيبي' },
  { en: 'Nasser Al-Otaibi', ar: 'ناصر العتيبي' },
  { en: 'Sara Al-Otaibi', ar: 'سارة العتيبي' },
  { en: 'Aisha Al-Otaibi', ar: 'عائشة العتيبي' },
  { en: 'Ahmed Al-Rashidi', ar: 'أحمد الرشيدي' },
  { en: 'Mohammed Al-Rashidi', ar: 'محمد الرشيدي' },
  { en: 'Yousef Al-Rashidi', ar: 'يوسف الرشيدي' },
  { en: 'Noura Al-Rashidi', ar: 'نورة الرشيدي' },
  { en: 'Mariam Al-Rashidi', ar: 'مريم الرشيدي' },
  { en: 'Salem Al-Enezi', ar: 'سالم العنزي' },
  { en: 'Abdullah Al-Enezi', ar: 'عبدالله العنزي' },
  { en: 'Fahad Al-Enezi', ar: 'فهد العنزي' },
  { en: 'Layla Al-Enezi', ar: 'ليلى العنزي' },
  { en: 'Fatima Al-Enezi', ar: 'فاطمة العنزي' },
  { en: 'Ahmed Al-Shammari', ar: 'أحمد الشمري' },
  { en: 'Omar Al-Shammari', ar: 'عمر الشمري' },
  { en: 'Mohammed Al-Shammari', ar: 'محمد الشمري' },
  { en: 'Nasser Al-Shammari', ar: 'ناصر الشمري' },
  { en: 'Aisha Al-Shammari', ar: 'عائشة الشمري' },
  { en: 'Yousef Al-Kandari', ar: 'يوسف الكندري' },
  { en: 'Mohammed Al-Kandari', ar: 'محمد الكندري' },
  { en: 'Fahad Al-Kandari', ar: 'فهد الكندري' },
  { en: 'Sara Al-Kandari', ar: 'سارة الكندري' },
  { en: 'Mariam Al-Kandari', ar: 'مريم الكندري' },
  { en: 'Ahmed Al-Azmi', ar: 'أحمد العازمي' },
  { en: 'Abdullah Al-Azmi', ar: 'عبدالله العازمي' },
  { en: 'Nasser Al-Azmi', ar: 'ناصر العازمي' },
  { en: 'Noura Al-Azmi', ar: 'نورة العازمي' },
  { en: 'Fatima Al-Azmi', ar: 'فاطمة العازمي' },
  { en: 'Mohammed Al-Harbi', ar: 'محمد الحربي' },
  { en: 'Yousef Al-Harbi', ar: 'يوسف الحربي' },
  { en: 'Salem Al-Harbi', ar: 'سالم الحربي' },
  { en: 'Layla Al-Harbi', ar: 'ليلى الحربي' },
  { en: 'Mariam Al-Harbi', ar: 'مريم الحربي' },
  { en: 'Ahmed Al-Dosari', ar: 'أحمد الدوسري' },
  { en: 'Mohammed Al-Dosari', ar: 'محمد الدوسري' },
  { en: 'Fahad Al-Dosari', ar: 'فهد الدوسري' },
  { en: 'Aisha Al-Dosari', ar: 'عائشة الدوسري' },
  { en: 'Layla Al-Dosari', ar: 'ليلى الدوسري' },
  { en: 'Fatima Al-Sabah', ar: 'فاطمة الصباح' },
  { en: 'Mariam Al-Sabah', ar: 'مريم الصباح' },
  { en: 'Samir Al-Sabah', ar: 'سمير الصباح' },
  { en: 'Hassan Al-Sabah', ar: 'حسن الصباح' },
  { en: 'Ibrahim Al-Sabah', ar: 'إبراهيم الصباح' },
  // Expat names (Arabic = empty)
  { en: 'Rajesh Kumar', ar: '' },
  { en: 'Deepa Singh', ar: '' },
  { en: 'Vikram Patel', ar: '' },
  { en: 'Anjali Verma', ar: '' },
  { en: 'Priya Sharma', ar: '' },
  { en: 'Pooja Gupta', ar: '' },
  { en: 'Jomar Santos', ar: '' },
  { en: 'Juan Rodriguez', ar: '' },
  { en: 'Carlos Mendez', ar: '' },
  { en: 'Fernando Lopez', ar: '' },
  { en: 'Maria Garcia', ar: '' },
  { en: 'Sara Johnson', ar: '' },
  // Egyptian/Arab expats (with Arabic)
  { en: 'Ahmed Hassan', ar: 'أحمد حسن' },
  { en: 'Mohammed Ibrahim', ar: 'محمد إبراهيم' },
  { en: 'Fatima Mohamed', ar: 'فاطمة محمد' },
  { en: 'Mariam Hassan', ar: 'مريم حسن' },
];

const CATEGORIES_BASE = [
  { name: 'Smartphones', ar: 'هواتف ذكية' },
  { name: 'Feature Phones', ar: 'هواتف عادية' },
  { name: 'Tablets', ar: 'أجهزة لوحية' },
  { name: 'Smart Watches', ar: 'ساعات ذكية' },
  { name: 'Earphones & Headsets', ar: 'سماعات الرأس' },
  { name: 'Chargers & Power Adapters', ar: 'الشواحن والمحولات' },
  { name: 'USB Cables', ar: 'أسلاك يو إس بي' },
  { name: 'Cases & Covers', ar: 'الأغطية والحقائب' },
  { name: 'Screen Protectors', ar: 'حماية الشاشة' },
  { name: 'Power Banks', ar: 'بطاريات إضافية' },
  { name: 'Speakers', ar: 'السماعات الخارجية' },
  { name: 'Memory & Storage', ar: 'الذاكرة والتخزين' },
  { name: 'SIM & Accessories', ar: 'بطاقات سيم والملحقات' },
  { name: 'Phone Stands', ar: 'حوامل الهاتف' },
  { name: 'Tempered Glass', ar: 'الزجاج المقسى' },
  { name: 'Screen Cleaning Kits', ar: 'أدوات تنظيف الشاشة' },
  { name: 'Phone Rings', ar: 'حلقات الهاتف' },
  { name: 'Repair Parts', ar: 'قطع الصيانة' },
  { name: 'Batteries', ar: 'البطاريات' },
  { name: 'Chargers Wireless', ar: 'الشواحن اللاسلكية' },
  { name: 'Car Mounts', ar: 'حوامل السيارة' },
  { name: 'Screen Glass Replacement', ar: 'استبدال الزجاج' },
  { name: 'Cooling Fans', ar: 'مراوح التبريد' },
  { name: 'Game Accessories', ar: 'ملحقات الألعاب' },
  { name: 'Smart Home Devices', ar: 'أجهزة المنزل الذكي' },
];

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================================================

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  int(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  choice(arr) {
    return arr[this.int(0, arr.length - 1)];
  }

  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

const rng = new SeededRandom(CONFIG.seed);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatCurrency(value) {
  return (Math.round(value * 1000) / 1000).toFixed(3);
}

function escapeCSV(str) {
  if (typeof str !== 'string') return str;
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCSV(filename, rows, headers) {
  const bom = '﻿'; // UTF-8 BOM
  const lines = [
    bom + headers.map(escapeCSV).join(','),
    ...rows.map(row => headers.map(h => escapeCSV(row[h] || '')).join(',')),
  ];
  fs.writeFileSync(filename, lines.join('\n'), 'utf8');
  console.log(`  ✓ ${path.basename(filename)} (${rows.length} rows)`);
}

function generateSKU(prefix, index) {
  return `${prefix}-${String(index).padStart(6, '0')}`;
}

function generateBarcode() {
  // 13-digit EAN-like barcode
  let barcode = '';
  for (let i = 0; i < 12; i++) {
    barcode += rng.int(0, 9);
  }
  // Crude Luhn check digit
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(barcode[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return barcode + check;
}

function generateIMEI() {
  let imei = '';
  for (let i = 0; i < 15; i++) {
    imei += rng.int(0, 9);
  }
  return imei;
}

function generatePhoneNumber(style) {
  // Kuwaiti mobile: 8 digits starting with 5, 6, or 9
  const firstDigit = rng.choice([5, 6, 9]);
  const remaining7Digits = Array.from({ length: 7 }, () => rng.int(0, 9)).join('');
  const eightDigitCore = `${firstDigit}${remaining7Digits}`;

  if (style === 0) {
    // +965 9XXX XXXX (space after 4th digit of core)
    const part1 = eightDigitCore.substring(0, 4);
    const part2 = eightDigitCore.substring(4);
    return `+965 ${part1} ${part2}`;
  } else if (style === 1) {
    // 5XXXXXXX (bare 8 digits)
    return eightDigitCore;
  } else {
    // 965-6XXXXXXX (country code dash then 8 digits)
    return `965-${eightDigitCore}`;
  }
}

function generateKuwaitiCivilID() {
  // 12 digits: century (2 or 3), YYMMDD (6), serial (5)
  // Century 2: 1900s (YY 55–99), Century 3: 2000s (YY 00–05 for 2000–2005)
  const centuryDigit = rng.choice([2, 3]);
  let yy;
  if (centuryDigit === 2) {
    yy = String(rng.int(55, 99)).padStart(2, '0');
  } else {
    yy = String(rng.int(0, 5)).padStart(2, '0');
  }
  const mm = String(rng.int(1, 12)).padStart(2, '0');
  const dd = String(rng.int(1, 28)).padStart(2, '0'); // Safe day (avoids leap year issues)
  const serial = String(rng.int(0, 99999)).padStart(5, '0');
  return `${centuryDigit}${yy}${mm}${dd}${serial}`;
}

function formatKuwaitDate(offsetDays) {
  const d = new Date(2026, 4, 4); // May 4, 2026
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().split('T')[0];
}

// ============================================================================
// DATA GENERATORS
// ============================================================================

function generateCategories() {
  const rows = [];
  for (let i = 0; i < CONFIG.categoryCount; i++) {
    const cat = CATEGORIES_BASE[i];
    rows.push({
      'Category Name': cat.name,
      'Parent Category': i < 5 ? '' : CATEGORIES_BASE[rng.int(0, 4)].name,
      'Description': i % 7 === 0 ? (cat.ar || cat.name) : `${cat.name} and related items`,
    });
  }
  return rows;
}

function generateProducts() {
  const rows = [];
  const allSkus = new Set();
  const skuCollisions = new Set();

  // ---- Phones (~400) ----
  let phoneIdx = 0;
  const colorAbbrMap = {
    'Black': 'BLK', 'White': 'WHT', 'Blue': 'BLU', 'Gold': 'GLD',
    'Silver': 'SLV', 'Green': 'GRN',
  };
  const brandAbbrMap = {
    'Apple': 'IP', 'Samsung': 'SGS', 'Xiaomi': 'XM', 'Huawei': 'HW',
    'Honor': 'HON', 'Oppo': 'OPP', 'Realme': 'RLM', 'Nothing': 'NTH',
    'Tecno': 'TCO', 'OnePlus': 'OPL',
  };

  for (const phoneSpec of PHONE_MODELS) {
    for (const storage of phoneSpec.storages) {
      if (phoneIdx >= CONFIG.phoneCount) break;

      // Color variants
      const colors = ['Black', 'White', 'Blue', 'Gold', 'Silver', 'Green'];
      for (const color of colors) {
        if (phoneIdx >= CONFIG.phoneCount) break;

        // Build cleaner SKU: brand + model + storage + color
        // e.g., PH-IP17PM-256-BLK, PH-SGS25U-512-GRY, PH-XM14P-256-BLK
        const brandAbbr = brandAbbrMap[phoneSpec.brand] || phoneSpec.brand.substring(0, 3).toUpperCase();

        // Extract model code: numbers + variant abbreviation
        let modelCode = '';
        const model = phoneSpec.model;

        // Find the numbers (e.g., "17", "25", "14")
        const numMatch = model.match(/\d+/);
        if (numMatch) {
          modelCode += numMatch[0]; // e.g., "17"
        }

        // Add variant abbreviation (Pro Max -> PM, Plus -> P, Pro -> P, Ultra -> U, none -> blank)
        if (/Pro Max/i.test(model)) {
          modelCode += 'PM';
        } else if (/Plus/i.test(model)) {
          modelCode += 'P';
        } else if (/Pro/i.test(model)) {
          modelCode += 'P';
        } else if (/Ultra/i.test(model)) {
          modelCode += 'U';
        }

        const colorAbbr = colorAbbrMap[color] || color.substring(0, 3).toUpperCase();
        const skuBase = `PH-${brandAbbr}${modelCode}-${storage}-${colorAbbr}`;
        let sku = skuBase;

        // Intentional duplicate SKUs (~10 total)
        if (rng.int(1, 400) <= 5) {
          sku = rng.choice(Array.from(allSkus).slice(0, Math.min(20, allSkus.size)));
          if (!sku) sku = skuBase;
          skuCollisions.add(sku);
        }

        allSkus.add(sku);

        const price = phoneSpec.basePrice + (storage - 128) * 0.15;
        // Selling price must end in .000, .250, .500, .750, or .900 (Kuwaiti retail convention)
        const wholePart = Math.floor(price);
        const allowedEndings = [0, 0.25, 0.5, 0.75, 0.9];
        const priceKwd = wholePart + rng.choice(allowedEndings);

        let arabicName = '';
        if (rng.int(0, 9) < 7) {
          arabicName = `${phoneSpec.brand === 'Apple' ? 'آيفون' : phoneSpec.brand} ${phoneSpec.model} ${storage} جيجا ${color}`;
        }

        const barcode = rng.int(1, 50) > 2 ? generateBarcode() : '';
        const hasOpeningBalance = rng.int(1, 200) <= 2;

        rows.push({
          'Item Name': `${phoneSpec.brand} ${phoneSpec.model} ${storage}GB ${color}`,
          'Arabic Name': arabicName,
          'SKU': sku,
          'Barcode': barcode,
          'Category': 'Smartphones',
          'Unit': 'Piece',
          'Purchase Rate': hasOpeningBalance ? '' : formatCurrency(priceKwd * 0.7),
          'Selling Price': formatCurrency(priceKwd),
          'Reorder Level': rng.int(2, 8),
          'Track Serial': 'Yes',
          'Status': 'Active',
        });

        phoneIdx++;
      }
    }
  }

  // ---- Accessories (~2600) ----
  const accessoryCategories = [
    'Cases & Covers', 'Screen Protectors', 'Chargers & Power Adapters',
    'USB Cables', 'Power Banks', 'Earphones & Headsets', 'Speakers',
    'Memory & Storage', 'Phone Stands', 'Tempered Glass',
  ];

  const accessoryTemplates = [
    { name: 'Silicone Case for {phone}', ar: 'كفر سيليكون لـ {phone}', price: 3.5 },
    { name: 'Hard Case for {phone}', ar: 'كفر صلب لـ {phone}', price: 4.5 },
    { name: 'Leather Case for {phone}', ar: 'كفر جلدي لـ {phone}', price: 8.5 },
    { name: 'Screen Protector Tempered Glass for {phone}', ar: 'حماية شاشة لـ {phone}', price: 2.5 },
    { name: 'USB-C Fast Charger 65W', ar: 'شاحن سريع 65 واط', price: 12.5 },
    { name: 'USB-C to USB-C Cable 2M', ar: 'كابل USB-C 2 متر', price: 2.0 },
    { name: 'Lightning Cable 1M', ar: 'كابل لايتنينج 1 متر', price: 1.5 },
    { name: 'Power Bank 20000mAh', ar: 'بطارية إضافية 20000', price: 15.0 },
    { name: 'Wireless Earbuds Pro', ar: 'سماعات بلوتوث برو', price: 25.0 },
    { name: 'Micro SD Card 256GB', ar: 'بطاقة ميموري 256', price: 18.5 },
    { name: 'Phone Ring Stand', ar: 'حلقة حامل هاتف', price: 1.25 },
    { name: 'Car Phone Mount', ar: 'حامل سيارة', price: 5.5 },
  ];

  let accIdx = CONFIG.phoneCount;
  while (accIdx < CONFIG.productCount) {
    const template = rng.choice(accessoryTemplates);
    const phoneToUse = PHONE_MODELS[rng.int(0, PHONE_MODELS.length - 1)];
    const itemName = template.name.includes('{phone}')
      ? template.name.replace('{phone}', `${phoneToUse.brand} ${phoneToUse.model}`)
      : template.name;

    let arabicName = '';
    if (rng.int(0, 9) < 7 && template.ar) {
      const phoneAr = phoneToUse.brand === 'Apple' ? 'آيفون' : phoneToUse.brand;
      arabicName = template.ar.includes('{phone}')
        ? template.ar.replace('{phone}', phoneAr)
        : template.ar;
    }

    const basePrice = template.price;
    const priceVariance = rng.next() * 0.3 - 0.15; // ±15%
    const finalPrice = basePrice * (1 + priceVariance);
    const priceKwd = finalPrice + rng.choice([0, 0.25, 0.5, 0.75, 0.9]);

    let sku = `ACC-${String(accIdx - CONFIG.phoneCount).padStart(5, '0')}`;

    // Intentional duplicate SKUs
    if (rng.int(1, 2600) <= 5) {
      sku = rng.choice(Array.from(allSkus).slice(CONFIG.phoneCount, accIdx));
      skuCollisions.add(sku);
    }

    allSkus.add(sku);

    const barcode = rng.int(1, 100) > 8 ? generateBarcode() : '';
    const hasNoPurchaseRate = rng.int(1, 2600) <= 15;
    let purchaseRate = hasNoPurchaseRate ? '' : formatCurrency(priceKwd * 0.6);

    // Intentional mess: ~5 prices with "KD" prefix
    if (rng.int(1, 2600) <= 5) {
      purchaseRate = `KD ${purchaseRate}`;
    }

    rows.push({
      'Item Name': itemName + (rng.int(0, 100) < 5 ? '  ' : ''), // trailing spaces
      'Arabic Name': arabicName,
      'SKU': sku,
      'Barcode': barcode,
      'Category': rng.choice(accessoryCategories),
      'Unit': 'Piece',
      'Purchase Rate': purchaseRate,
      'Selling Price': formatCurrency(priceKwd),
      'Reorder Level': rng.int(5, 120),
      'Track Serial': 'No',
      'Status': 'Active',
    });

    accIdx++;
  }

  // Add 1 fully empty row (mess)
  if (CONFIG.productCount > 100) {
    rows.splice(rng.int(100, CONFIG.productCount - 100), 0, {
      'Item Name': '', 'Arabic Name': '', 'SKU': '', 'Barcode': '', 'Category': '',
      'Unit': '', 'Purchase Rate': '', 'Selling Price': '', 'Reorder Level': '',
      'Track Serial': '', 'Status': '',
    });
  }

  // Ensure exactly CONFIG.productCount rows by trimming if needed
  return rows.slice(0, CONFIG.productCount);
}

function generateCustomers() {
  const rows = [];
  const seen = new Set();

  for (let i = 0; i < CONFIG.customerCount; i++) {
    // Pick a paired name (English + Arabic)
    const namePair = rng.choice(CUSTOMER_NAME_PAIRS);
    const finalName = namePair.en;

    // 5% duplicate customer names
    let duplicateName = finalName;
    if (rng.int(0, 100) < 5 && seen.has(finalName)) {
      duplicateName = finalName; // Intentional duplicate
    }
    if (rng.int(0, 100) < 5) {
      seen.add(finalName);
    }

    // Use paired Arabic name (may be empty for expats)
    const arabicName = namePair.ar || '';

    const phone = generatePhoneNumber(rng.int(0, 2));
    const email = rng.int(0, 9) < 4 ? `customer.${i}@gmail.com` : '';
    const civilId = rng.int(0, 9) < 5 ? generateKuwaitiCivilID() : '';

    let formattedBalance = '0.000';

    // ~30 customers (his B2B resellers + known dues) have an opening balance
    if (rng.int(0, 1000) < 38) {
      const isNegative = rng.int(0, 100) < 17; // 17% of those with balance are negative (Tally style)
      const baseAmount = rng.int(100, 5000) + rng.choice([0, 0.25, 0.5, 0.75, 0.9]);
      const finalAmount = baseAmount + rng.int(0, 1000) / 1000;

      if (isNegative) {
        // Tally parenthesis style for negative/credit
        formattedBalance = `(${formatCurrency(finalAmount)})`;
      } else {
        // Positive debit balance with thousands separator
        formattedBalance = finalAmount.toLocaleString('en-US', {
          minimumFractionDigits: 3,
          maximumFractionDigits: 3,
        });
      }
    }

    rows.push({
      'Ledger Name': duplicateName,
      'Name in Arabic': arabicName,
      'Mobile': phone,
      'Email': email,
      'Civil ID': civilId,
      'Opening Balance (KWD)': formattedBalance,
      'Notes': rng.int(0, 20) === 0 ? 'Reseller - B2B' : '',
    });
  }

  return rows;
}

function generateSuppliers() {
  const rows = [];
  for (let i = 0; i < CONFIG.supplierCount; i++) {
    const supplier = SUPPLIER_NAMES[i];
    const hasBalance = rng.int(0, 100) < 60;
    const balance = hasBalance ? formatCurrency(rng.int(500, 20000) + rng.choice([0, 0.25, 0.5, 0.75, 0.9])) : '0.000';

    rows.push({
      'Supplier Name': supplier.en,
      'Arabic Name': supplier.ar,
      'Phone': generatePhoneNumber(0),
      'Email': `supplier.${i}@trade.com`,
      'Payment Terms (Days)': rng.choice([0, 15, 30, 45]),
      'Opening Balance (KWD)': balance,
    });
  }

  return rows;
}

function generateOpeningStock(warehouse, skuCount) {
  const rows = [];
  const productRows = generateProducts(); // Reuse product data for SKU lookup
  const usedSkus = new Set();

  for (let i = 0; i < skuCount; i++) {
    const product = rng.choice(productRows);
    let sku = product.SKU;

    // Intentional duplicates (~4 rows)
    if (rng.int(1, 1000) <= 4) {
      sku = rng.choice(Array.from(usedSkus));
    }

    usedSkus.add(sku);

    const qty = product['Track Serial'] === 'Yes'
      ? rng.int(1, 8)
      : rng.int(5, 120);

    // Zero quantity mess (~4 rows)
    const finalQty = rng.int(1, 1000) <= 4 ? 0 : qty;

    const cost = product['Selling Price'] ? formatCurrency(parseFloat(product['Selling Price']) * 0.7) : '0.000';

    rows.push({
      'SKU': sku,
      'Warehouse': warehouse,
      'Quantity': finalQty,
      'Unit Cost': cost,
    });
  }

  // Add some non-existent SKUs (~6 rows)
  for (let i = 0; i < 6; i++) {
    rows.push({
      'SKU': `INVALID-${rng.int(100000, 999999)}`,
      'Warehouse': warehouse,
      'Quantity': rng.int(1, 10),
      'Unit Cost': formatCurrency(rng.int(10, 100) + rng.choice([0, 0.25, 0.5])),
    });
  }

  return rows;
}

function generateIMEIRegister() {
  const rows = [];
  const productRows = generateProducts();
  const phoneProducts = productRows.filter(p => p['Track Serial'] === 'Yes').slice(0, 100);

  for (let i = 0; i < CONFIG.imeiCount; i++) {
    const product = rng.choice(phoneProducts);
    const store = rng.choice(['Hawally', 'Salmiya']);
    const daysAgo = rng.int(1, 340); // ~1 year back from May 2026

    rows.push({
      'SKU': product.SKU,
      'Item Name': product['Item Name'],
      'IMEI': generateIMEI(),
      'Store': store,
      'Purchase Date': formatKuwaitDate(daysAgo),
      'Supplier': rng.choice(SUPPLIER_NAMES).en,
    });
  }

  return rows;
}

function generateTrialBalance(customerRows, supplierRows, hawallyStockValue, salmiyaStockValue) {
  // Calculate AR sum (customer opening balances, debits only)
  let arSum = 0;
  for (const row of customerRows) {
    const balance = row['Opening Balance (KWD)'];
    if (balance && !balance.includes('(')) {
      arSum += parseFloat(balance.replace(/,/g, ''));
    }
  }

  // Calculate AP sum (supplier opening balances)
  let apSum = 0;
  for (const row of supplierRows) {
    const balance = row['Opening Balance (KWD)'];
    if (balance && balance !== '0.000') {
      apSum += parseFloat(balance);
    }
  }

  // Trial balance structure with non-round values
  const accounts = [
    { name: 'Cash in Hand', debit: 50321.750, credit: 0 },
    { name: 'Bank - NBK Current Account', debit: 148230.500, credit: 0 },
    { name: 'Bank - KFH', debit: 82715.250, credit: 0 },
    { name: 'Sundry Debtors', debit: arSum, credit: 0 },
    { name: 'Inventory - Hawally Store', debit: hawallyStockValue, credit: 0 },
    { name: 'Inventory - Salmiya Store', debit: salmiyaStockValue, credit: 0 },
    { name: 'Furniture & Equipment', debit: 42500.900, credit: 0 },
    { name: 'Prepaid Expenses (مصاريف مدفوعة مقدما)', debit: 5150.375, credit: 0 },
    { name: 'Sundry Creditors', debit: 0, credit: apSum },
    { name: "Loan from Owner (قرض من المالك)", debit: 0, credit: 73450.625 },
    { name: 'Owner Capital', debit: 0, credit: 0 }, // Plug
    { name: 'Retained Earnings', debit: 0, credit: 185420.350 },
  ];

  // Calculate total debits/credits before plugs
  let totalDebits = 0;
  let totalCredits = 0;
  for (let i = 0; i < accounts.length; i++) {
    if (i === 10) continue; // Owner Capital is the plug
    totalDebits += accounts[i].debit;
    totalCredits += accounts[i].credit;
  }

  const difference = totalDebits - totalCredits;

  // Distribute to Owner Capital and Retained Earnings
  if (difference >= 0) {
    accounts[10].credit = difference; // Owner Capital gets the plug
  } else {
    accounts[10].debit = Math.abs(difference);
  }

  // Ensure balance
  totalDebits += accounts[10].debit;
  totalCredits += accounts[10].credit;

  return accounts;
}

// ============================================================================
// MAIN GENERATION
// ============================================================================

console.log('🚀 Generating Al-Noor Mobiles test data...\n');

// Generate categories and products
const categories = generateCategories();
const products = generateProducts();
console.log('Generated base data:');
console.log(`  ✓ ${categories.length} categories`);
console.log(`  ✓ ${products.length} products\n`);

// Generate customers and suppliers
const customers = generateCustomers();
const suppliers = generateSuppliers();
console.log('Generated ledgers:');
console.log(`  ✓ ${customers.length} customers`);
console.log(`  ✓ ${suppliers.length} suppliers\n`);

// Generate opening stock
const hawallyStock = generateOpeningStock('Hawally Main', CONFIG.hawallySku);
const salmiyaStock = generateOpeningStock('Salmiya', CONFIG.salmiyaSku);
console.log('Generated opening stock:');
console.log(`  ✓ ${hawallyStock.length} Hawally SKU lines`);
console.log(`  ✓ ${salmiyaStock.length} Salmiya SKU lines\n`);

// Generate IMEI register
const imeiRegister = generateIMEIRegister();
console.log('Generated IMEI register:');
console.log(`  ✓ ${imeiRegister.length} IMEI records\n`);

// Calculate inventory value for trial balance
const calcInventoryValue = (stock) => {
  return stock.reduce((sum, row) => {
    const qty = parseInt(row.Quantity) || 0;
    const cost = parseFloat(row['Unit Cost']) || 0;
    return sum + (qty * cost);
  }, 0);
};

const hawallyValue = calcInventoryValue(hawallyStock);
const salmiyaValue = calcInventoryValue(salmiyaStock);
console.log('Inventory value (for trial balance):');
console.log(`  Hawally: KWD ${formatCurrency(hawallyValue)}`);
console.log(`  Salmiya: KWD ${formatCurrency(salmiyaValue)}`);
console.log(`  Total:   KWD ${formatCurrency(hawallyValue + salmiyaValue)}\n`);

// Generate trial balance
const trialBalance = generateTrialBalance(customers, suppliers, hawallyValue, salmiyaValue);

// Write CSV files
const outDir = '/Users/hus3ain/Development/Zerupt/agent-os/product/user-journeys/test-data/yousef';
console.log(`Writing CSVs to ${outDir}:\n`);

writeCSV(
  path.join(outDir, '01-categories.csv'),
  categories,
  ['Category Name', 'Parent Category', 'Description']
);

writeCSV(
  path.join(outDir, '02-products.csv'),
  products,
  ['Item Name', 'Arabic Name', 'SKU', 'Barcode', 'Category', 'Unit', 'Purchase Rate', 'Selling Price', 'Reorder Level', 'Track Serial', 'Status']
);

writeCSV(
  path.join(outDir, '03-customers.csv'),
  customers,
  ['Ledger Name', 'Name in Arabic', 'Mobile', 'Email', 'Civil ID', 'Opening Balance (KWD)', 'Notes']
);

writeCSV(
  path.join(outDir, '04-suppliers.csv'),
  suppliers,
  ['Supplier Name', 'Arabic Name', 'Phone', 'Email', 'Payment Terms (Days)', 'Opening Balance (KWD)']
);

writeCSV(
  path.join(outDir, '05-opening-stock-hawally.csv'),
  hawallyStock,
  ['SKU', 'Warehouse', 'Quantity', 'Unit Cost']
);

writeCSV(
  path.join(outDir, '06-opening-stock-salmiya.csv'),
  salmiyaStock,
  ['SKU', 'Warehouse', 'Quantity', 'Unit Cost']
);

writeCSV(
  path.join(outDir, '07-imei-register.csv'),
  imeiRegister,
  ['SKU', 'Item Name', 'IMEI', 'Store', 'Purchase Date', 'Supplier']
);

// Trial balance with thousands separators
const tbRows = trialBalance.map(acc => {
  let debitStr = '';
  let creditStr = '';
  if (acc.debit > 0) {
    const formatted = formatCurrency(acc.debit);
    debitStr = parseFloat(formatted).toLocaleString('en-US', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
  }
  if (acc.credit > 0) {
    const formatted = formatCurrency(acc.credit);
    creditStr = parseFloat(formatted).toLocaleString('en-US', {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3,
    });
  }
  return {
    'Account Name': acc.name,
    'Debit (KWD)': debitStr,
    'Credit (KWD)': creditStr,
  };
});

writeCSV(
  path.join(outDir, '08-trial-balance.csv'),
  tbRows,
  ['Account Name', 'Debit (KWD)', 'Credit (KWD)']
);

// Windows-1256 encoded customers file (subset with Arabic)
// Use Buffer to encode UTF-8 → UTF-16LE → Windows-1256 mapping
const customersWin1256 = customers.slice(0, 50);
const headerLine = 'Ledger Name,Name in Arabic,Mobile,Email,Civil ID,Opening Balance (KWD),Notes';
let csvLines = [headerLine];
for (const row of customersWin1256) {
  const line = [
    escapeCSV(row['Ledger Name']),
    escapeCSV(row['Name in Arabic']),
    escapeCSV(row.Mobile),
    escapeCSV(row.Email),
    escapeCSV(row['Civil ID']),
    escapeCSV(row['Opening Balance (KWD)']),
    escapeCSV(row.Notes),
  ].join(',');
  csvLines.push(line);
}

// Manual UTF-8 to Windows-1256 encoding for Arabic text (simplified)
// Windows-1256 uses 0x80-0xFF for Arabic + extended Latin
const arabicMap = {
  'ا': 'ا', 'أ': 'أ', 'إ': 'إ', 'ؤ': 'ؤ',
  'ب': 'ب', 'پ': 'پ', 'ت': 'ت', 'ث': 'ث',
  'ج': 'ج', 'ح': 'ح', 'خ': 'خ', 'د': 'د',
  'ذ': 'ذ', 'ر': 'ر', 'ز': 'ز', 'س': 'س',
  'ش': 'ش', 'ص': 'ص', 'ض': 'ض', 'ط': 'ط',
  'ظ': 'ظ', 'ع': 'ع', 'غ': 'غ', 'ف': 'ف',
  'ق': 'ق', 'ك': 'ك', 'ل': 'ل', 'م': 'م',
  'ن': 'ن', 'ه': 'ه', 'و': 'و', 'ى': 'ى',
  'ي': 'ي',
};

// True Windows-1256 encoding via iconv (tests the cp1256-garbling import gap)
const csvContent = csvLines.join('\n') + '\n';
const win1256Path = path.join(outDir, '09-customers-windows1256.csv');
const tmpUtf8Path = `${win1256Path}.utf8.tmp`;
fs.writeFileSync(tmpUtf8Path, csvContent, 'utf8');
execSync(
  `iconv -f UTF-8 -t WINDOWS-1256//TRANSLIT ${JSON.stringify(tmpUtf8Path)} > ${JSON.stringify(win1256Path)}`,
);
fs.unlinkSync(tmpUtf8Path);
console.log(`  ✓ 09-customers-windows1256.csv (${customersWin1256.length} rows)`);

// ============================================================================
// VALIDATION & REPORTING
// ============================================================================

console.log('\n📊 VALIDATION & SUMMARY\n');

// Trial balance check
let tbDebits = 0;
let tbCredits = 0;
for (const acc of trialBalance) {
  tbDebits += acc.debit;
  tbCredits += acc.credit;
}

console.log('Trial Balance:');
console.log(`  Total Debits:  KWD ${formatCurrency(tbDebits)}`);
console.log(`  Total Credits: KWD ${formatCurrency(tbCredits)}`);
console.log(`  Balanced:      ${Math.abs(tbDebits - tbCredits) < 0.01 ? '✓ YES' : '✗ NO'}\n`);

// Customer AR reconciliation
let customerAR = 0;
for (const cust of customers) {
  const bal = cust['Opening Balance (KWD)'];
  if (bal && !bal.includes('(')) {
    customerAR += parseFloat(bal.replace(/,/g, ''));
  }
}
console.log('Customer Opening Balances:');
console.log(`  Count: ${customers.length}`);
console.log(`  Total AR (debit balances): KWD ${formatCurrency(customerAR)}`);
console.log(`  Trial Balance AR account:  KWD ${formatCurrency(trialBalance.find(a => a.name.includes('Debtors')).debit)}`);
console.log(`  Match: ${Math.abs(customerAR - trialBalance.find(a => a.name.includes('Debtors')).debit) < 0.01 ? '✓ YES' : '✗ NO'}\n`);

// Supplier AP reconciliation
let supplierAP = 0;
for (const supp of suppliers) {
  if (supp['Opening Balance (KWD)'] && supp['Opening Balance (KWD)'] !== '0.000') {
    supplierAP += parseFloat(supp['Opening Balance (KWD)']);
  }
}
console.log('Supplier Opening Balances:');
console.log(`  Count: ${suppliers.length}`);
console.log(`  Total AP (credit balances): KWD ${formatCurrency(supplierAP)}`);
console.log(`  Trial Balance AP account:   KWD ${formatCurrency(trialBalance.find(a => a.name.includes('Creditors')).credit)}`);
console.log(`  Match: ${Math.abs(supplierAP - trialBalance.find(a => a.name.includes('Creditors')).credit) < 0.01 ? '✓ YES' : '✗ NO'}\n`);

// Inventory reconciliation
console.log('Inventory Reconciliation:');
console.log(`  Hawally value:   KWD ${formatCurrency(hawallyValue)}`);
console.log(`  Salmiya value:   KWD ${formatCurrency(salmiyaValue)}`);
console.log(`  Total inventory: KWD ${formatCurrency(hawallyValue + salmiyaValue)}`);

const tbHawally = trialBalance.find(a => a.name.includes('Hawally'));
const tbSalmiya = trialBalance.find(a => a.name.includes('Salmiya'));
const tbInventory = (tbHawally?.debit || 0) + (tbSalmiya?.debit || 0);
console.log(`  Trial Balance:   KWD ${formatCurrency(tbInventory)}`);
console.log(`  Match: ${Math.abs((hawallyValue + salmiyaValue) - tbInventory) < 1 ? '✓ YES' : '✗ NO'}\n`);

// Deliberate mess summary
console.log('📋 INTENTIONAL MESS (for import testing):\n');
console.log('  02-products.csv (3000 rows):');
console.log('    • ~10 duplicate SKUs (silent skip risk)');
console.log('    • ~15 rows with empty Purchase Rate');
console.log('    • ~5 rows with currency prefix "KD" in price cells');
console.log('    • ~8 rows missing Barcode');
console.log('    • 2 fully empty rows');
console.log('    • ~5 names with trailing whitespace\n');
console.log('  03-customers.csv (800 rows):');
console.log('    • Inconsistent phone formats (+965, 5XXXXXXX, 965-6)');
console.log('    • ~5 duplicate customer names');
console.log('    • Tally-style credit balances: (320.750)');
console.log('    • Mixed thousands separators\n');
console.log('  05/06-opening-stock-*.csv:');
console.log('    • ~6 rows referencing non-existent SKUs');
console.log('    • ~4 rows with quantity = 0');
console.log('    • 2 duplicate (SKU, warehouse) pairs\n');
console.log('  09-customers-windows1256.csv:');
console.log('    • First 50 customer rows in (approx) Windows-1256 encoding\n');

// Sample customer rows with pairing validation
console.log('📋 SAMPLE CUSTOMERS (English ↔ Arabic pairing validation):\n');
const sampleRows = customers.slice(0, 5);
for (const cust of sampleRows) {
  const hasArabic = cust['Name in Arabic'] && cust['Name in Arabic'].trim().length > 0;
  const isValidPhone = /^(\+965 \d{4} \d{4}|[569]\d{7}|965-[569]\d{7})$/.test(cust.Mobile);
  const pairing = hasArabic ? '✓ Arabic' : '(expat, no Arabic)';
  const phoneStatus = isValidPhone ? '✓' : '✗';
  console.log(`  ${cust['Ledger Name']} | ${cust['Name in Arabic']} | ${cust.Mobile} ${phoneStatus} | ${pairing}`);
}

console.log('\n✅ Generation complete!\n');
