#!/usr/bin/env node

/**
 * Al-Faisaliah Mobiles Test Data Generator
 * Generates realistic (and intentionally messy) migration data for a mixed
 * B2C+B2B electronics / mobile shop in Dammam, Saudi Arabia.
 *
 * Deterministic: seeded PRNG (seed=46) ensures byte-identical reproducibility.
 * Currency: SAR 2dp · VAT 15% · ZATCA Fatoora mandatory
 *
 * ZATCA edge cases in this dataset:
 *   Z1  – 2 customers with 14-digit TRN (invalid)
 *   Z2  – 1 customer TRN that does NOT start with 3 (fails 3..3 rule)
 *   Z3  – 3 customers marked VAT Registered=Yes but blank TRN
 *   Z10 – 1 corporate sale row priced in USD (ZATCA must reject non-SAR)
 *   Z12 – B2B standard sales with valid 15-digit buyer TRN → clearance path
 *   Z13 – Credit-note / return rows (07-sales-history) referencing original Invoice No
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  seed: 46,
  categoryCount: 18,
  productCount: 500,   // ~120 phones + ~380 accessories
  phoneCount: 120,
  customerCount: 160,
  supplierCount: 12,
  stockLines: 280,
  imeiCount: 200,
  salesHistoryCount: 140, // includes credit notes and USD row
};

// ============================================================================
// SEEDED PRNG (mulberry32-style linear congruential)
// ============================================================================

class SeededRandom {
  constructor(seed) { this.seed = seed; }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; }
  choice(arr) { return arr[this.int(0, arr.length - 1)]; }
}

const rng = new SeededRandom(CONFIG.seed);

// ============================================================================
// CONSTANTS
// ============================================================================

const CATEGORIES_BASE = [
  { name: 'Smartphones',              ar: 'هواتف ذكية' },
  { name: 'Feature Phones',           ar: 'هواتف عادية' },
  { name: 'Tablets',                  ar: 'أجهزة لوحية' },
  { name: 'Smart Watches',            ar: 'ساعات ذكية' },
  { name: 'Earphones & Headsets',     ar: 'سماعات الرأس' },
  { name: 'Chargers & Adapters',      ar: 'الشواحن والمحولات' },
  { name: 'USB Cables',               ar: 'أسلاك يو إس بي' },
  { name: 'Cases & Covers',           ar: 'الأغطية والحقائب' },
  { name: 'Screen Protectors',        ar: 'حماية الشاشة' },
  { name: 'Power Banks',              ar: 'بطاريات إضافية' },
  { name: 'Speakers',                 ar: 'السماعات الخارجية' },
  { name: 'Memory & Storage',         ar: 'الذاكرة والتخزين' },
  { name: 'Tempered Glass',           ar: 'الزجاج المقسى' },
  { name: 'Phone Stands',             ar: 'حوامل الهاتف' },
  { name: 'Repair Parts',             ar: 'قطع الصيانة' },
  { name: 'Wireless Chargers',        ar: 'الشواحن اللاسلكية' },
  { name: 'Game Accessories',         ar: 'ملحقات الألعاب' },
  { name: 'Car Mounts',               ar: 'حوامل السيارة' },
];

const PHONE_MODELS = [
  { brand: 'Apple',   model: 'IPHONE 16 PRO MAX',  storages: [256, 512], basePrice: 4999.00 },
  { brand: 'Apple',   model: 'IPHONE 16 PRO',       storages: [256, 512], basePrice: 4299.00 },
  { brand: 'Apple',   model: 'IPHONE 16',            storages: [128, 256], basePrice: 3299.00 },
  { brand: 'Apple',   model: 'IPHONE 15 PRO MAX',   storages: [256, 512], basePrice: 4499.00 },
  { brand: 'Apple',   model: 'IPHONE 15',            storages: [128, 256], basePrice: 2799.00 },
  { brand: 'Samsung', model: 'GALAXY S25 ULTRA',    storages: [256, 512], basePrice: 5499.00 },
  { brand: 'Samsung', model: 'GALAXY S25+',         storages: [256, 512], basePrice: 4199.00 },
  { brand: 'Samsung', model: 'GALAXY S25',          storages: [128, 256], basePrice: 3499.00 },
  { brand: 'Samsung', model: 'GALAXY A55',          storages: [128, 256], basePrice: 1499.00 },
  { brand: 'Samsung', model: 'GALAXY A35',          storages: [128, 256], basePrice: 1099.00 },
  { brand: 'Xiaomi',  model: 'REDMI NOTE 14 PRO',   storages: [128, 256], basePrice: 1299.00 },
  { brand: 'Xiaomi',  model: 'POCO F6',             storages: [256, 512], basePrice: 1599.00 },
  { brand: 'Huawei',  model: 'MATE 60 PRO',         storages: [256, 512], basePrice: 4299.00 },
  { brand: 'Oppo',    model: 'FIND X8 PRO',         storages: [256, 512], basePrice: 3999.00 },
  { brand: 'OnePlus', model: '13',                  storages: [256, 512], basePrice: 2899.00 },
];

const ACCESSORY_TEMPLATES = [
  { name: 'Silicone Case for {phone}',       ar: 'كفر سيليكون لـ {phone}', price: 29.00,  cat: 'Cases & Covers' },
  { name: 'Hard Bumper Case for {phone}',    ar: 'كفر صلب لـ {phone}',     price: 39.00,  cat: 'Cases & Covers' },
  { name: 'Tempered Glass for {phone}',      ar: 'حماية زجاج لـ {phone}',  price: 19.00,  cat: 'Tempered Glass' },
  { name: 'Screen Protector Film',           ar: 'حماية شاشة فيلم',        price: 9.00,   cat: 'Screen Protectors' },
  { name: 'USB-C Fast Charger 65W',          ar: 'شاحن سريع 65 واط',        price: 89.00,  cat: 'Chargers & Adapters' },
  { name: 'USB-C to USB-C Cable 2M',         ar: 'كابل USB-C 2 متر',        price: 29.00,  cat: 'USB Cables' },
  { name: 'Lightning Cable 1M',              ar: 'كابل لايتنينج 1 متر',      price: 19.00,  cat: 'USB Cables' },
  { name: 'Power Bank 20000mAh',             ar: 'بطارية إضافية 20000',      price: 149.00, cat: 'Power Banks' },
  { name: 'Wireless Earbuds Pro',            ar: 'سماعات بلوتوث برو',        price: 199.00, cat: 'Earphones & Headsets' },
  { name: 'Micro SD 256GB',                  ar: 'بطاقة ميموري 256',         price: 119.00, cat: 'Memory & Storage' },
  { name: 'Car Phone Mount',                 ar: 'حامل سيارة للهاتف',        price: 49.00,  cat: 'Car Mounts' },
  { name: 'Wireless Charging Pad 15W',       ar: 'شاحن لاسلكي 15 واط',      price: 79.00,  cat: 'Wireless Chargers' },
];

const SUPPLIER_NAMES = [
  { en: 'Jarir Bookstore Wholesale',     ar: 'مستودع المكتبة جرير' },
  { en: 'Extra Electronics Distribution', ar: 'توزيع اكسترا للإلكترونيات' },
  { en: 'Axiom Telecom KSA',            ar: 'أكسيوم تيليكوم السعودية' },
  { en: 'GCC Mobile Wholesale FZE',     ar: 'الجملة الموحدة للهواتف' },
  { en: 'Dubai Mobile Traders',         ar: 'تجار الهواتف دبي' },
  { en: 'Samsung Electronics KSA',      ar: 'سامسونج إلكترونيكس السعودية' },
  { en: 'Apple Distribution MENA',      ar: 'توزيع أبل الشرق الأوسط' },
  { en: 'Huawei Technologies KSA',      ar: 'هواوي تقنية السعودية' },
  { en: 'Arabian Electronics Co.',      ar: 'الإلكترونيات العربية' },
  { en: 'Gulf Tech Traders',            ar: 'تجار الخليج للتقنية' },
  { en: 'STC Wholesale',               ar: 'الاتصالات السعودية جملة' },
  { en: 'Ooredoo Distribution',        ar: 'توزيع أوريدو' },
];

// KSA customer names (Saudi nationals + expats + corporates)
const CUSTOMER_NAMES = [
  // Saudi nationals (with Arabic)
  { en: 'Mohammed Al-Qahtani',   ar: 'محمد القحطاني',   type: 'B2C' },
  { en: 'Ahmed Al-Qahtani',      ar: 'أحمد القحطاني',   type: 'B2C' },
  { en: 'Fahad Al-Dosari',       ar: 'فهد الدوسري',     type: 'B2C' },
  { en: 'Abdullah Al-Dosari',    ar: 'عبدالله الدوسري', type: 'B2C' },
  { en: 'Nasser Al-Otaibi',      ar: 'ناصر العتيبي',    type: 'B2C' },
  { en: 'Salem Al-Otaibi',       ar: 'سالم العتيبي',    type: 'B2C' },
  { en: 'Ibrahim Al-Harbi',      ar: 'إبراهيم الحربي',  type: 'B2C' },
  { en: 'Omar Al-Harbi',         ar: 'عمر الحربي',      type: 'B2C' },
  { en: 'Khalid Al-Shammari',    ar: 'خالد الشمري',     type: 'B2C' },
  { en: 'Abdulrahman Al-Shammari', ar: 'عبدالرحمن الشمري', type: 'B2C' },
  { en: 'Yousef Al-Ghamdi',      ar: 'يوسف الغامدي',   type: 'B2C' },
  { en: 'Turki Al-Ghamdi',       ar: 'تركي الغامدي',    type: 'B2C' },
  { en: 'Waleed Al-Zahrani',     ar: 'وليد الزهراني',   type: 'B2C' },
  { en: 'Bader Al-Zahrani',      ar: 'بدر الزهراني',    type: 'B2C' },
  { en: 'Saad Al-Anzi',          ar: 'سعد العنزي',      type: 'B2C' },
  { en: 'Rayan Al-Anzi',         ar: 'ريان العنزي',     type: 'B2C' },
  { en: 'Hassan Al-Mutairi',     ar: 'حسن المطيري',     type: 'B2C' },
  { en: 'Ali Al-Mutairi',        ar: 'علي المطيري',     type: 'B2C' },
  { en: 'Tariq Al-Asiri',        ar: 'طارق العسيري',    type: 'B2C' },
  { en: 'Majed Al-Asiri',        ar: 'ماجد العسيري',    type: 'B2C' },
  { en: 'Faisal Al-Subai',       ar: 'فيصل السبيعي',    type: 'B2C' },
  { en: 'Mansour Al-Subai',      ar: 'منصور السبيعي',   type: 'B2C' },
  { en: 'Saud Al-Rashidi',       ar: 'سعود الرشيدي',    type: 'B2C' },
  { en: 'Nora Al-Rashidi',       ar: 'نورة الرشيدي',    type: 'B2C' },
  { en: 'Sara Al-Qahtani',       ar: 'سارة القحطاني',   type: 'B2C' },
  { en: 'Fatima Al-Otaibi',      ar: 'فاطمة العتيبي',   type: 'B2C' },
  { en: 'Aisha Al-Harbi',        ar: 'عائشة الحربي',    type: 'B2C' },
  { en: 'Mariam Al-Shammari',    ar: 'مريم الشمري',     type: 'B2C' },
  // Expats (no Arabic)
  { en: 'Rajesh Kumar',          ar: '',                 type: 'B2C' },
  { en: 'Amit Sharma',           ar: '',                 type: 'B2C' },
  { en: 'Jomar Santos',          ar: '',                 type: 'B2C' },
  { en: 'Ahmed Hassan',          ar: 'أحمد حسن',         type: 'B2C' },
  { en: 'Mohammed Ibrahim',      ar: 'محمد إبراهيم',    type: 'B2C' },
  // Walk-in / cash customers
  { en: 'Walk-In Customer',      ar: 'عميل نقدي',        type: 'B2C' },
  { en: 'Cash Sale',             ar: 'بيع نقدي',         type: 'B2C' },
  // Corporate B2B customers (will get TRN)
  { en: 'Dammam Tech Solutions Co.',      ar: 'شركة الدمام للحلول التقنية',  type: 'B2B' },
  { en: 'Eastern Province IT Ltd',        ar: 'شركة المنطقة الشرقية للمعلوماتية', type: 'B2B' },
  { en: 'Al-Khobar Trading & Telecom',    ar: 'شركة الخبر للتجارة والاتصالات', type: 'B2B' },
  { en: 'Qatif Business Solutions',       ar: 'حلول الأعمال قطيف',            type: 'B2B' },
  { en: 'Jubail Industrial Supplies',     ar: 'مستلزمات الجبيل الصناعية',     type: 'B2B' },
  { en: 'Aramco Contractor Services',     ar: 'خدمات متعاقدي أرامكو',         type: 'B2B' },
  { en: 'SABIC IT Procurement',           ar: 'مشتريات تقنية سابك',           type: 'B2B' },
  { en: 'Gulf Bridge Telecom LLC',        ar: 'شركة الجسر الخليجي للاتصالات', type: 'B2B' },
  { en: 'Dammam Municipality Dept.',      ar: 'إدارة بلدية الدمام',           type: 'B2B' },
  { en: 'Al-Rashid Mall Retail Group',    ar: 'مجموعة الراشد مول للبيع بالتجزئة', type: 'B2B' },
];

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function sar(value) {
  // SAR 2dp with half-up rounding
  return (Math.round(value * 100) / 100).toFixed(2);
}

function escapeCSV(str) {
  if (str === null || str === undefined) return '';
  str = String(str);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const BOM = '﻿';

function writeCSV(filename, rows, headers) {
  const lines = [
    BOM + headers.map(escapeCSV).join(','),
    ...rows.map(row => headers.map(h => escapeCSV(row[h] ?? '')).join(',')),
  ];
  fs.writeFileSync(filename, lines.join('\n'), 'utf8');
  console.log(`  ✓ ${path.basename(filename)} (${rows.length} rows)`);
}

function generateIMEI15() {
  let s = '';
  for (let i = 0; i < 15; i++) s += rng.int(0, 9);
  return s;
}

function generateIMEI14() {
  // Deliberately invalid (14 digits instead of 15) — ZATCA/serial mess
  let s = '';
  for (let i = 0; i < 14; i++) s += rng.int(0, 9);
  return s;
}

function saudiPhone() {
  // Saudi mobile: 05XXXXXXXX or +966 5X XXX XXXX
  const suffix = Array.from({ length: 8 }, () => rng.int(0, 9)).join('');
  const styles = [
    `05${suffix}`,
    `+966 5${suffix.slice(0, 1)} ${suffix.slice(1, 4)} ${suffix.slice(4)}`,
    `966-5${suffix}`,
  ];
  return rng.choice(styles);
}

function saudiDate(daysAgoMin, daysAgoMax) {
  const base = new Date(2026, 5, 1); // 2026-06-01
  const daysAgo = rng.int(daysAgoMin, daysAgoMax);
  base.setDate(base.getDate() - daysAgo);
  return base.toISOString().split('T')[0];
}

function invoiceNo(prefix, idx) {
  return `${prefix}-${String(idx).padStart(5, '0')}`;
}

// Valid KSA TRN: 15 digits, starts with 3, ends with 3 — pattern ^3\d{13}3$
function validTRN() {
  let mid = '';
  for (let i = 0; i < 13; i++) mid += rng.int(0, 9);
  return `3${mid}3`;
}

// ============================================================================
// GENERATORS
// ============================================================================

function generateCategories() {
  return CATEGORIES_BASE.map((cat, i) => ({
    'Category Name': cat.name,
    'Parent Category': i < 4 ? '' : CATEGORIES_BASE[rng.int(0, 3)].name,
    'Description': `${cat.name} and related items`,
  }));
}

function generateProducts() {
  const rows = [];
  const allSkus = [];

  // --- Phones (Track Serial=Yes) ---
  let phoneIdx = 0;
  const colors = ['Black', 'White', 'Gold', 'Blue', 'Silver'];

  for (const spec of PHONE_MODELS) {
    for (const storage of spec.storages) {
      for (const color of colors) {
        if (phoneIdx >= CONFIG.phoneCount) break;

        const brandCode = spec.brand.slice(0, 2).toUpperCase();
        const modelCode = spec.model.replace(/\s+/g, '').slice(0, 8);
        const skuBase = `PH-${brandCode}-${modelCode}-${storage}-${color.slice(0, 3).toUpperCase()}`;

        // ~5 duplicate SKUs (mess)
        let sku = skuBase;
        if (allSkus.length > 5 && rng.int(1, 100) <= 3) {
          sku = rng.choice(allSkus.slice(0, Math.min(10, allSkus.length)));
        }
        allSkus.push(sku);

        const sellingPrice = spec.basePrice + (storage - 128) * 2.5 + rng.int(-50, 50);
        const purchaseRate = rng.int(1, 20) <= 2 ? '' : sar(sellingPrice * 0.72); // ~2 rows blank

        // ~3 ALL-CAPS model names (already set above as const — they're all-caps by convention)
        const itemName = `${spec.brand} ${spec.model} ${storage}GB ${color}`;

        rows.push({
          'Item Name':      itemName,
          'Arabic Name':    rng.int(0, 9) < 7 ? `${spec.brand} ${spec.model} ${storage} جيجا ${color}` : '',
          'SKU':            sku,
          'Barcode':        rng.int(1, 20) > 1 ? String(rng.int(1000000000000, 9999999999999)) : '',
          'Category':       'Smartphones',
          'Brand':          spec.brand,
          'Unit':           'Piece',
          'Purchase Rate':  purchaseRate,
          'Selling Price':  sar(sellingPrice),
          'Reorder Level':  rng.int(1, 5),
          'Track Serial':   'Yes',
          'VAT Applicable': 'Yes',
          'taxGroup':       'Standard Rate (15%)',
          'Status':         'Active',
        });

        phoneIdx++;
      }
    }
  }

  // --- Accessories (Track Serial=No) ---
  let accIdx = phoneIdx;
  while (accIdx < CONFIG.productCount) {
    const tmpl = rng.choice(ACCESSORY_TEMPLATES);
    const phone = rng.choice(PHONE_MODELS);
    const itemName = tmpl.name.includes('{phone}')
      ? tmpl.name.replace('{phone}', `${phone.brand} ${phone.model}`)
      : tmpl.name;
    const arabicName = tmpl.ar && rng.int(0, 9) < 7
      ? (tmpl.ar.includes('{phone}') ? tmpl.ar.replace('{phone}', phone.brand) : tmpl.ar)
      : '';

    const price = tmpl.price * (1 + (rng.next() * 0.2 - 0.1));
    const sku = `ACC-${String(accIdx - phoneIdx).padStart(5, '0')}`;

    // ~3 rows with SAR prefix mess
    const purchaseRaw = sar(price * 0.6);
    const purchaseRate = rng.int(1, 200) <= 2 ? `SAR ${purchaseRaw}` : purchaseRaw;

    rows.push({
      'Item Name':      itemName + (rng.int(1, 100) <= 3 ? '  ' : ''), // trailing spaces
      'Arabic Name':    arabicName,
      'SKU':            sku,
      'Barcode':        rng.int(1, 20) > 2 ? String(rng.int(1000000000000, 9999999999999)) : '',
      'Category':       tmpl.cat,
      'Brand':          '',
      'Unit':           'Piece',
      'Purchase Rate':  purchaseRate,
      'Selling Price':  sar(price),
      'Reorder Level':  rng.int(5, 50),
      'Track Serial':   'No',
      'VAT Applicable': 'Yes',
      'taxGroup':       'Standard Rate (15%)',
      'Status':         'Active',
    });

    accIdx++;
  }

  // One blank row (mess)
  rows.splice(rng.int(50, 100), 0, {
    'Item Name': '', 'Arabic Name': '', 'SKU': '', 'Barcode': '', 'Category': '',
    'Brand': '', 'Unit': '', 'Purchase Rate': '', 'Selling Price': '', 'Reorder Level': '',
    'Track Serial': '', 'VAT Applicable': '', 'taxGroup': '', 'Status': '',
  });

  return rows.slice(0, CONFIG.productCount);
}

function generateCustomers() {
  const rows = [];

  // Index of corporates in CUSTOMER_NAMES: indices 36-45 (B2B)
  const b2bStartIdx = CUSTOMER_NAMES.findIndex(c => c.type === 'B2B');

  // We assign TRNs to B2B customers, then inject the ZATCA edge cases
  const b2bCustomers = CUSTOMER_NAMES.filter(c => c.type === 'B2B');
  let b2bTrnIdx = 0;

  // Pre-generate valid TRNs for each B2B customer
  const b2bTrns = b2bCustomers.map(() => validTRN());

  // --- ZATCA edge cases ---
  // Z1: customers at index 0 and 1 of b2b get 14-digit TRN (invalid length)
  // Z2: customer at index 2 gets TRN that doesn't start with 3
  // Z3: customers at index 3, 4, 5 get VAT Registered=Yes but blank TRN

  // TRN for Z1 (14-digit)
  const z1Trn1 = (() => { let s = ''; for (let i = 0; i < 14; i++) s += rng.int(0,9); return s; })();
  const z1Trn2 = (() => { let s = ''; for (let i = 0; i < 14; i++) s += rng.int(0,9); return s; })();

  // TRN for Z2: valid 15-digit but does NOT start with 3
  // First digit will be 4, last digit will be 5 (neither matches 3..3)
  const z2Trn = (() => {
    let mid = '';
    for (let i = 0; i < 13; i++) mid += rng.int(0, 9);
    return `4${mid}5`;
  })();

  let customerIdx = 0;

  for (const nameEntry of CUSTOMER_NAMES) {
    const isB2B = nameEntry.type === 'B2B';
    const b2bLocalIdx = isB2B ? b2bCustomers.indexOf(nameEntry) : -1;

    // Determine TRN and VAT flags
    let trn = '';
    let vatRegistered = 'No';
    let creditLimit = '';
    let creditDays = '';

    if (isB2B) {
      vatRegistered = 'Yes';
      creditLimit = sar(rng.int(10000, 100000));
      creditDays = String(rng.choice([30, 45, 60, 90]));

      if (b2bLocalIdx === 0) {
        // Z1 case 1: 14-digit TRN
        trn = z1Trn1;
      } else if (b2bLocalIdx === 1) {
        // Z1 case 2: 14-digit TRN
        trn = z1Trn2;
      } else if (b2bLocalIdx === 2) {
        // Z2: TRN not starting/ending with 3
        trn = z2Trn;
      } else if (b2bLocalIdx === 3 || b2bLocalIdx === 4 || b2bLocalIdx === 5) {
        // Z3: VAT Registered=Yes but blank TRN
        trn = '';
      } else {
        // Valid TRN for remaining corporates (Z12 path)
        trn = b2bTrns[b2bLocalIdx];
      }
    }

    // Opening balance
    let openingBalance = '0.00';
    if (isB2B && rng.int(0, 100) < 70) {
      openingBalance = sar(rng.int(5000, 80000));
    } else if (!isB2B && rng.int(0, 100) < 8) {
      // Tally-style negative for a couple retail customers
      const amt = sar(rng.int(100, 2000));
      openingBalance = rng.int(0, 100) < 30 ? `(${amt})` : amt;
    }

    rows.push({
      'Ledger Name':      nameEntry.en,
      'Name in Arabic':   nameEntry.ar,
      'Mobile':           saudiPhone(),
      'Email':            rng.int(0, 9) < 5 ? `customer.${customerIdx}@gmail.com` : '',
      'VAT Registered':   vatRegistered,
      'TRN':              trn,
      'Credit Limit (SAR)': creditLimit,
      'Credit Days':      creditDays,
      'Opening Balance (SAR)': openingBalance,
      'Notes':            isB2B ? 'B2B Corporate' : '',
    });

    customerIdx++;
  }

  // Add a few duplicate walk-in rows (mess)
  rows.push({
    'Ledger Name': 'Walk-In Customer',
    'Name in Arabic': 'عميل نقدي',
    'Mobile': '0500000000',
    'Email': '',
    'VAT Registered': 'No',
    'TRN': '',
    'Credit Limit (SAR)': '',
    'Credit Days': '',
    'Opening Balance (SAR)': '0.00',
    'Notes': 'DUPLICATE — intentional mess',
  });

  return rows;
}

function generateSuppliers() {
  return SUPPLIER_NAMES.map((s, i) => ({
    'Supplier Name':          s.en,
    'Arabic Name':            s.ar,
    'Phone':                  saudiPhone(),
    'Email':                  `supplier.${i}@trade.sa`,
    'TRN':                    validTRN(),
    'Payment Terms (Days)':   rng.choice([0, 30, 45, 60]),
    'Opening Balance (SAR)':  rng.int(0, 100) < 60 ? sar(rng.int(5000, 50000)) : '0.00',
  }));
}

function generateOpeningStock(products) {
  const rows = [];
  const phoneProds = products.filter(p => p['Track Serial'] === 'Yes');
  const accProds   = products.filter(p => p['Track Serial'] === 'No');
  const warehouse  = 'Dammam Main';

  for (let i = 0; i < CONFIG.stockLines; i++) {
    const isPhone = i < CONFIG.stockLines * 0.35;
    const prod = isPhone ? rng.choice(phoneProds) : rng.choice(accProds);
    if (!prod || !prod['SKU']) continue;

    const qty = isPhone ? rng.int(1, 6) : rng.int(3, 60);
    const finalQty = rng.int(1, 200) <= 3 ? 0 : qty; // ~3 zero-qty rows

    const sellingPrice = parseFloat(prod['Selling Price']) || 100;
    const unitCost = sar(sellingPrice * 0.72);

    rows.push({
      'SKU':       prod['SKU'],
      'Warehouse': warehouse,
      'Quantity':  finalQty,
      'Unit Cost': unitCost,
    });
  }

  // ~4 invalid SKU rows (mess)
  for (let i = 0; i < 4; i++) {
    rows.push({
      'SKU':       `INVALID-${rng.int(10000, 99999)}`,
      'Warehouse': 'Dammam Main',
      'Quantity':  rng.int(1, 5),
      'Unit Cost': sar(rng.int(50, 300)),
    });
  }

  return rows;
}

function generateIMEIRegister(products, stockRows) {
  const rows = [];
  const phoneProds = products.filter(p => p['Track Serial'] === 'Yes');

  for (let i = 0; i < CONFIG.imeiCount; i++) {
    const prod = rng.choice(phoneProds);
    const isInvalid14 = rng.int(1, 100) <= 4; // ~4% 14-digit IMEI (mess)
    const isDuplicate = rows.length > 10 && rng.int(1, 100) <= 3; // ~3% duplicate IMEI

    let imei;
    if (isInvalid14) {
      imei = generateIMEI14();
    } else if (isDuplicate) {
      imei = rng.choice(rows).IMEI;
    } else {
      imei = generateIMEI15();
    }

    const isWarrantyExchange = rng.int(1, 100) <= 8; // ~8% warranty rows
    const notes = isWarrantyExchange ? `WARRANTY EXCHANGE — replaced ${generateIMEI15()}` : '';

    rows.push({
      'SKU':           prod['SKU'],
      'Item Name':     prod['Item Name'],
      'IMEI':          imei,
      'Warehouse':     'Dammam Main',
      'Purchase Date': saudiDate(30, 365),
      'Supplier':      rng.choice(SUPPLIER_NAMES).en,
      'Notes':         notes,
    });
  }

  return rows;
}

function generateSalesHistory(customers, products) {
  const rows = [];
  const phoneProds = products.filter(p => p['Track Serial'] === 'Yes' && p['Selling Price']);
  const accProds   = products.filter(p => p['Track Serial'] === 'No' && p['Selling Price']);
  const b2bCustomers = customers.filter(c => c['VAT Registered'] === 'Yes');
  const b2cCustomers = customers.filter(c => c['VAT Registered'] === 'No');

  let invoiceCounter = 1000;
  // Track original invoice numbers for credit notes
  const originalInvoiceNos = [];

  // --- Regular sales rows (B2C simplified + B2B standard) ---
  const regularCount = CONFIG.salesHistoryCount - 8; // reserve 8 rows for credit notes + USD

  for (let i = 0; i < regularCount; i++) {
    invoiceCounter++;
    const invNo = invoiceNo('INV', invoiceCounter);

    const isB2B = rng.int(0, 100) < 30; // ~30% B2B
    const customer = isB2B
      ? rng.choice(b2bCustomers.filter(c => c.TRN && c.TRN.length === 15 && c.TRN.startsWith('3') && c.TRN.endsWith('3')))
      : rng.choice(b2cCustomers);

    if (!customer) continue;

    const prod = rng.int(0, 100) < 60 ? rng.choice(phoneProds) : rng.choice(accProds);
    if (!prod) continue;

    const qty = isB2B ? rng.int(2, 20) : rng.int(1, 3);
    const sellingPrice = parseFloat(prod['Selling Price']);

    // ~5% price override rows (mess)
    const isPriceOverride = rng.int(1, 100) <= 5;
    const unitPrice = isPriceOverride ? sar(sellingPrice * (0.85 + rng.next() * 0.2)) : sar(sellingPrice);

    const subtotal = parseFloat(unitPrice) * qty;
    const discount = rng.int(0, 100) < 15 ? sar(subtotal * rng.int(2, 10) / 100) : '0.00';
    const taxableAmount = subtotal - parseFloat(discount);
    const vatAmount = sar(taxableAmount * 0.15);
    const totalWithVat = sar(taxableAmount + parseFloat(vatAmount));

    const dateStr = saudiDate(1, 180);
    const invoiceType = isB2B ? 'Standard Tax Invoice' : 'Simplified Tax Invoice';
    const buyerTrn = isB2B ? customer.TRN : '';

    rows.push({
      'Invoice No':         invNo,
      'Invoice Date':       dateStr,
      'Invoice Type':       invoiceType,
      'Document Type':      '380',
      'Customer Name':      customer['Ledger Name'],
      'Buyer TRN':          buyerTrn,
      'SKU':                prod['SKU'],
      'Item Name':          prod['Item Name'],
      'IMEI / Serial':      prod['Track Serial'] === 'Yes' ? generateIMEI15() : '',
      'Qty':                qty,
      'Unit Price (SAR)':   unitPrice,
      'Discount (SAR)':     discount,
      'Taxable Amt (SAR)':  sar(taxableAmount),
      'VAT 15% (SAR)':      vatAmount,
      'Total incl VAT (SAR)': totalWithVat,
      'Currency':           'SAR',
      'Original Invoice No': '',
      'Notes':              isPriceOverride ? 'PRICE OVERRIDE — manager approved' : '',
    });

    // Remember some invoice numbers for credit notes
    if (isB2B && originalInvoiceNos.length < 10) {
      originalInvoiceNos.push({ invNo, customer, prod, unitPrice, qty, invoiceType, buyerTrn, dateStr });
    }
  }

  // --- Z13: Credit note / return rows (ZATCA 381) ---
  // These reference an original invoice and reverse the VAT
  const creditNoteCount = 6;
  for (let i = 0; i < creditNoteCount; i++) {
    invoiceCounter++;
    const cnNo = invoiceNo('CN', invoiceCounter);
    const orig = rng.choice(originalInvoiceNos);

    const returnQty = rng.int(1, Math.min(2, orig.qty));
    const subtotal = parseFloat(orig.unitPrice) * returnQty;
    const vatAmount = sar(subtotal * 0.15);
    const total = sar(subtotal + parseFloat(vatAmount));

    rows.push({
      'Invoice No':         cnNo,
      'Invoice Date':       saudiDate(1, 30),
      'Invoice Type':       orig.invoiceType,
      'Document Type':      '381',  // ZATCA credit note
      'Customer Name':      orig.customer['Ledger Name'],
      'Buyer TRN':          orig.buyerTrn,
      'SKU':                orig.prod['SKU'],
      'Item Name':          orig.prod['Item Name'],
      'IMEI / Serial':      orig.prod['Track Serial'] === 'Yes' ? generateIMEI15() : '',
      'Qty':                -returnQty,
      'Unit Price (SAR)':   orig.unitPrice,
      'Discount (SAR)':     '0.00',
      'Taxable Amt (SAR)':  sar(-subtotal),
      'VAT 15% (SAR)':      sar(-parseFloat(vatAmount)),
      'Total incl VAT (SAR)': sar(-parseFloat(total)),
      'Currency':           'SAR',
      'Original Invoice No': orig.invNo,
      'Notes':              `CREDIT NOTE — partial return ref ${orig.invNo} (ZATCA 381 BillingReference)`,
    });
  }

  // --- Z10: USD-priced corporate sale (ZATCA must reject) ---
  invoiceCounter++;
  const usdInvNo = invoiceNo('INV', invoiceCounter);
  const usdCustomer = b2bCustomers.find(c => c.TRN && c.TRN.length === 15 && c.TRN.startsWith('3')) || b2bCustomers[0];
  const usdProd = rng.choice(phoneProds);
  const usdUnitPrice = '1349.99'; // USD price — NOT SAR
  const usdQty = 10;
  const usdSubtotal = parseFloat(usdUnitPrice) * usdQty;
  const usdVat = sar(usdSubtotal * 0.15);
  const usdTotal = sar(usdSubtotal + parseFloat(usdVat));

  rows.push({
    'Invoice No':         usdInvNo,
    'Invoice Date':       saudiDate(5, 45),
    'Invoice Type':       'Standard Tax Invoice',
    'Document Type':      '380',
    'Customer Name':      usdCustomer ? usdCustomer['Ledger Name'] : 'SABIC IT Procurement',
    'Buyer TRN':          usdCustomer ? usdCustomer['TRN'] : validTRN(),
    'SKU':                usdProd ? usdProd['SKU'] : 'PH-AP-IPHONE16PM-256-BLK',
    'Item Name':          usdProd ? usdProd['Item Name'] : 'Apple IPHONE 16 PRO MAX 256GB Black',
    'IMEI / Serial':      generateIMEI15(),
    'Qty':                usdQty,
    'Unit Price (SAR)':   usdUnitPrice,
    'Discount (SAR)':     '0.00',
    'Taxable Amt (SAR)':  sar(usdSubtotal),
    'VAT 15% (SAR)':      usdVat,
    'Total incl VAT (SAR)': usdTotal,
    'Currency':           'USD',
    'Original Invoice No': '',
    'Notes':              'Z10 — USD corporate quote; ZATCA must reject non-SAR invoice',
  });

  return rows;
}

function generateTrialBalance(customers, suppliers, stockRows) {
  // AR sum (debit balances only)
  let arSum = 0;
  for (const c of customers) {
    const b = c['Opening Balance (SAR)'];
    if (b && !b.startsWith('(') && b !== '0.00') {
      arSum += parseFloat(b.replace(/,/g, '')) || 0;
    }
  }

  // AP sum
  let apSum = 0;
  for (const s of suppliers) {
    const b = s['Opening Balance (SAR)'];
    if (b && b !== '0.00') apSum += parseFloat(b) || 0;
  }

  // Stock value
  let stockValue = 0;
  for (const r of stockRows) {
    stockValue += (parseInt(r['Quantity']) || 0) * (parseFloat(r['Unit Cost']) || 0);
  }

  const accounts = [
    { name: 'Cash in Hand',                     debit: 28450.00,  credit: 0 },
    { name: 'Bank - Al Rajhi Current',           debit: 185300.00, credit: 0 },
    { name: 'Bank - SNB',                        debit: 94750.00,  credit: 0 },
    { name: 'Sundry Debtors (مدينون متنوعون)',   debit: arSum,     credit: 0 },
    { name: 'Inventory - Dammam Main',           debit: stockValue, credit: 0 },
    { name: 'Furniture & Fixtures',              debit: 18500.00,  credit: 0 },
    { name: 'Prepaid Rent (إيجار مدفوع مقدماً)', debit: 12000.00,  credit: 0 },
    { name: 'Sundry Creditors (دائنون متنوعون)', debit: 0, credit: apSum },
    { name: 'VAT Payable (ضريبة القيمة المضافة)',debit: 0, credit: 8350.00 },
    { name: 'Loan from Owner (قرض من الشريك)',   debit: 0, credit: 45000.00 },
    { name: 'Owner Capital',                     debit: 0, credit: 0 }, // plug
    { name: 'Retained Earnings',                 debit: 0, credit: 95420.00 },
  ];

  let totalD = 0, totalC = 0;
  for (let i = 0; i < accounts.length; i++) {
    if (i === 10) continue;
    totalD += accounts[i].debit;
    totalC += accounts[i].credit;
  }
  const diff = totalD - totalC;
  if (diff >= 0) accounts[10].credit = diff;
  else accounts[10].debit = -diff;

  return accounts;
}

// ============================================================================
// MAIN
// ============================================================================

console.log('Generating Al-Faisaliah Mobiles test data (seed=46)...\n');

const categories = generateCategories();
const products   = generateProducts();
console.log(`  categories: ${categories.length}, products: ${products.length}`);

const customers  = generateCustomers();
const suppliers  = generateSuppliers();
console.log(`  customers: ${customers.length}, suppliers: ${suppliers.length}`);

const stockRows  = generateOpeningStock(products);
const imeiRows   = generateIMEIRegister(products, stockRows);
console.log(`  stock lines: ${stockRows.length}, IMEI rows: ${imeiRows.length}`);

const salesRows  = generateSalesHistory(customers, products);
console.log(`  sales history rows: ${salesRows.length}`);

const tbAccts    = generateTrialBalance(customers, suppliers, stockRows);

const outDir = '/Users/hus3ain/Development/Zerupt/agent-os/product/user-journeys/test-data/al-faisaliah';
console.log(`\nWriting CSVs to ${outDir}:\n`);

writeCSV(
  path.join(outDir, '01-categories.csv'),
  categories,
  ['Category Name', 'Parent Category', 'Description'],
);

writeCSV(
  path.join(outDir, '02-products.csv'),
  products,
  ['Item Name', 'Arabic Name', 'SKU', 'Barcode', 'Category', 'Brand', 'Unit',
   'Purchase Rate', 'Selling Price', 'Reorder Level', 'Track Serial', 'VAT Applicable', 'taxGroup', 'Status'],
);

writeCSV(
  path.join(outDir, '03-customers.csv'),
  customers,
  ['Ledger Name', 'Name in Arabic', 'Mobile', 'Email', 'VAT Registered', 'TRN',
   'Credit Limit (SAR)', 'Credit Days', 'Opening Balance (SAR)', 'Notes'],
);

writeCSV(
  path.join(outDir, '04-suppliers.csv'),
  suppliers,
  ['Supplier Name', 'Arabic Name', 'Phone', 'Email', 'TRN', 'Payment Terms (Days)', 'Opening Balance (SAR)'],
);

writeCSV(
  path.join(outDir, '05-opening-stock.csv'),
  stockRows,
  ['SKU', 'Warehouse', 'Quantity', 'Unit Cost'],
);

writeCSV(
  path.join(outDir, '06-imei-register.csv'),
  imeiRows,
  ['SKU', 'Item Name', 'IMEI', 'Warehouse', 'Purchase Date', 'Supplier', 'Notes'],
);

writeCSV(
  path.join(outDir, '07-sales-history.csv'),
  salesRows,
  ['Invoice No', 'Invoice Date', 'Invoice Type', 'Document Type', 'Customer Name', 'Buyer TRN',
   'SKU', 'Item Name', 'IMEI / Serial', 'Qty', 'Unit Price (SAR)', 'Discount (SAR)',
   'Taxable Amt (SAR)', 'VAT 15% (SAR)', 'Total incl VAT (SAR)', 'Currency', 'Original Invoice No', 'Notes'],
);

// Trial balance
const tbRows = tbAccts.map(a => ({
  'Account Name':    a.name,
  'Debit (SAR)':     a.debit > 0 ? sar(a.debit) : '',
  'Credit (SAR)':    a.credit > 0 ? sar(a.credit) : '',
}));
writeCSV(
  path.join(outDir, '08-trial-balance.csv'),
  tbRows,
  ['Account Name', 'Debit (SAR)', 'Credit (SAR)'],
);

// Windows-1256 customers (Arabic encoding trap)
const custSubset = customers.slice(0, 50);
const headerLine = 'Ledger Name,Name in Arabic,Mobile,Email,VAT Registered,TRN,Opening Balance (SAR),Notes';
const csvLines = [headerLine, ...custSubset.map(r =>
  [r['Ledger Name'], r['Name in Arabic'], r['Mobile'], r['Email'],
   r['VAT Registered'], r['TRN'], r['Opening Balance (SAR)'], r['Notes']].map(escapeCSV).join(',')
)];
const csvContent = csvLines.join('\n') + '\n';
const win1256Path = path.join(outDir, '09-customers-windows1256.csv');
const tmpPath = `${win1256Path}.tmp`;
fs.writeFileSync(tmpPath, csvContent, 'utf8');
execSync(`iconv -f UTF-8 -t WINDOWS-1256//TRANSLIT ${JSON.stringify(tmpPath)} > ${JSON.stringify(win1256Path)}`);
fs.unlinkSync(tmpPath);
console.log(`  ✓ 09-customers-windows1256.csv (${custSubset.length} rows)`);

// ============================================================================
// VALIDATION REPORT
// ============================================================================

console.log('\n=== VALIDATION ===\n');

let tbD = 0, tbC = 0;
for (const a of tbAccts) { tbD += a.debit; tbC += a.credit; }
console.log(`Trial Balance: Debits SAR ${sar(tbD)} | Credits SAR ${sar(tbC)} | ${Math.abs(tbD - tbC) < 0.01 ? 'BALANCED ✓' : 'NOT BALANCED ✗'}`);

// AR reconciliation
let arSum = 0;
for (const c of customers) {
  const b = c['Opening Balance (SAR)'];
  if (b && !b.startsWith('(') && b !== '0.00') arSum += parseFloat(b.replace(/,/g,'')) || 0;
}
console.log(`AR (customer debit balances): SAR ${sar(arSum)}`);

// ZATCA edge-case spot check
const b2b0 = customers.find(c => c['Ledger Name'] === 'Dammam Tech Solutions Co.');
const b2b1 = customers.find(c => c['Ledger Name'] === 'Eastern Province IT Ltd');
const b2b2 = customers.find(c => c['Ledger Name'] === 'Al-Khobar Trading & Telecom');
const b2b3 = customers.find(c => c['Ledger Name'] === 'Qatif Business Solutions');
console.log('\n=== ZATCA EDGE CASES ===\n');
console.log(`Z1 (14-digit TRN):`);
console.log(`  Dammam Tech Solutions Co. TRN="${b2b0?.TRN}" len=${b2b0?.TRN?.length}`);
console.log(`  Eastern Province IT Ltd   TRN="${b2b1?.TRN}" len=${b2b1?.TRN?.length}`);
console.log(`Z2 (TRN not starting/ending with 3):`);
console.log(`  Al-Khobar Trading & Telecom TRN="${b2b2?.TRN}" starts=${b2b2?.TRN?.[0]} ends=${b2b2?.TRN?.slice(-1)}`);
console.log(`Z3 (VAT Registered=Yes, blank TRN):`);
console.log(`  Qatif Business Solutions    TRN="${b2b3?.TRN}"`);
const b2b4 = customers.find(c => c['Ledger Name'] === 'Jubail Industrial Supplies');
const b2b5 = customers.find(c => c['Ledger Name'] === 'Aramco Contractor Services');
console.log(`  Jubail Industrial Supplies  TRN="${b2b4?.TRN}"`);
console.log(`  Aramco Contractor Services  TRN="${b2b5?.TRN}"`);

const usdRow = salesRows.find(r => r['Currency'] === 'USD');
console.log(`Z10 (USD sale): Invoice=${usdRow?.['Invoice No']} Currency=${usdRow?.['Currency']} Notes=${usdRow?.['Notes']?.slice(0, 50)}`);

const creditNotes = salesRows.filter(r => r['Document Type'] === '381');
console.log(`Z13 (Credit notes 381): ${creditNotes.length} rows`);
for (const cn of creditNotes.slice(0, 3)) {
  console.log(`  ${cn['Invoice No']} → Original=${cn['Original Invoice No']} Qty=${cn['Qty']}`);
}

const validB2bSales = salesRows.filter(r => r['Document Type'] === '380' && r['Buyer TRN']?.length === 15 && r['Buyer TRN'].startsWith('3'));
console.log(`Z12 (B2B standard with valid TRN): ${validB2bSales.length} rows`);

console.log('\nGeneration complete.\n');
