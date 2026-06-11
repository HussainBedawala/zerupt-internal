#!/usr/bin/env node

/**
 * Abu Khalid Auto Parts — KSA Test Data Generator
 * Riyadh / Al-Olaya — B2B-heavy auto-parts wholesaler + retail
 * Seed: 44 (mulberry32 PRNG) — deterministic, byte-identical on every run
 *
 * node generate.mjs
 *
 * Edge cases exercised (ZATCA Z-ids):
 *   Z3  — VAT-registered B2B buyer with blank TRN (customer C012)
 *   Z6  — taxGroup "Standard Rate 15%" (no parens) on ~10 SKUs
 *   Z12 — B2B standard invoices → clearance data (all B2B customers)
 *   Z17 — dirty trial balance off by ~SAR 890; clean variant balances exactly
 *   Z18 — one BOUNCED PDC cheque (PDC-IN-007)
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// MULBERRY32 PRNG  (same convention as yousef/noura/umm-faisal)
// ============================================================================

function mulberry32(seed) {
  let s = seed >>> 0;
  return {
    next() {
      s += 0x6D2B79F5;
      let z = s;
      z = Math.imul(z ^ (z >>> 15), z | 1);
      z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
      return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
    },
    int(min, max) { return Math.floor(this.next() * (max - min + 1)) + min; },
    choice(arr) { return arr[this.int(0, arr.length - 1)]; },
    float(min, max) { return this.next() * (max - min) + min; },
  };
}

const rng = mulberry32(44);

// ============================================================================
// UTILITIES
// ============================================================================

function sar(v) { return (Math.round(v * 100) / 100).toFixed(2); }

function escapeCSV(v) {
  const s = v === null || v === undefined ? '' : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const BOM = '﻿';

function writeCSV(filepath, headers, rows) {
  const lines = [
    BOM + headers.map(escapeCSV).join(','),
    ...rows.map(r => headers.map(h => escapeCSV(r[h] ?? '')).join(',')),
  ];
  fs.writeFileSync(filepath, lines.join('\n'), 'utf8');
  const name = path.basename(filepath);
  console.log(`  ✓ ${name}  (${rows.length} data rows)`);
}

const OUT = path.dirname(new URL(import.meta.url).pathname);

// ============================================================================
// REFERENCE DATA
// ============================================================================

const CATEGORIES = [
  { name: 'Suspension & Steering',    ar: 'التعليق والتوجيه' },
  { name: 'Engine Parts',             ar: 'قطع المحرك' },
  { name: 'Brakes',                   ar: 'الفرامل' },
  { name: 'Filters',                  ar: 'الفلاتر' },
  { name: 'Electrical & Ignition',    ar: 'الكهرباء والإشعال' },
  { name: 'Transmission & Clutch',    ar: 'ناقل الحركة والكلتش' },
  { name: 'Cooling System',           ar: 'نظام التبريد' },
  { name: 'Exhaust & Emissions',      ar: 'العادم والانبعاثات' },
  { name: 'Body & Trim',              ar: 'الهيكل والتشطيب' },
  { name: 'Lubricants & Fluids',      ar: 'زيوت وسوائل' },
  { name: 'Batteries & Accessories',  ar: 'البطاريات والملحقات' },
  { name: 'Tyres & Wheels',           ar: 'الإطارات والعجلات' },
];

const BRANDS = [
  'MONROE', 'KYB', 'DENSO', 'NGK', 'BOSCH', 'VALEO', 'SACHS',
  'AISIN', 'GATES', 'CASTROL', 'MOBIL', 'SHELL', 'EXIDE', 'VARTA',
  'BREMBO', 'MAHLE', 'MANN', 'HELLA', 'PHILIPS', 'MIDAS',
];

// OEM cross-ref patterns injected into names (ALL-CAPS mess)
const OEM_SUFFIXES = [
  '/MONROE', '/KYB', '/DENSO', '/OEM-48510', '/OEM-4351012', '/90311-35006',
  '/MD012345', '/31521-SA5-003', '/1K0407151E', '/ACS',
];

const MODELS_BY_CAT = {
  'Suspension & Steering': [
    'SHOCK ABSORBER-FR-CAMRY-{Y}',
    'SHOCK ABSORBER-RR-CAMRY-{Y}',
    'SHOCK ABSORBER-FR-COROLLA-{Y}',
    'SHOCK ABR-RR-PRADO-{Y}',
    'SHOCK ABSORBER FR LANDCRUISER-{Y}',
    'STRUT ASSY-FR-ALTIMA-{Y}',
    'STRUT MOUNT-CAMRY-{Y}',
    'LINK STAB-FR-FORTUNER-{Y}',
    'TIE ROD END-CAMRY-{Y}',
    'BALL JOINT-FR-HILUX-{Y}',
    'RACK END-COROLLA-{Y}',
    'POWER STEERING PUMP-LAND CRUISER-{Y}',
    'LOWER ARM BUSH-CAMRY-{Y}',
    'INNER TIE ROD-YARIS-{Y}',
    'STRUT TOP MOUNT-ALTIMA-{Y}',
    'STABILIZER BAR LINK-FORTUNER-{Y}',
    'WHEEL HUB BEARING-CAMRY-{Y}',
    'CV JOINT OUTER-SUNNY-{Y}',
  ],
  'Engine Parts': [
    'TIMING BELT-COROLLA-{Y}',
    'TIMING CHAIN KIT-CAMRY-V6-{Y}',
    'VALVE COVER GASKET-HILUX-{Y}',
    'HEAD GASKET SET-PATROL-{Y}',
    'OIL SEAL-CAMSHAFT-{Y}',
    'CRANKSHAFT PULLEY-FORTUNER-{Y}',
    'ENGINE MOUNT-CAMRY-{Y}',
    'PISTON RING SET-COROLLA-{Y}',
    'CONNECTING ROD BEARING-{Y}',
    'CAM FOLLOWER-DIESEL-{Y}',
    'FUEL PUMP-COROLLA-{Y}',
    'INTAKE MANIFOLD GASKET-CAMRY-{Y}',
    'WATER PUMP-HILUX-{Y}',
    'THERMOSTAT-CAMRY-{Y}',
    'ROCKER ARM-PRADO-{Y}',
  ],
  'Brakes': [
    'BRAKE PAD-FR-CAMRY-{Y}',
    'BRAKE PAD-RR-CAMRY-{Y}',
    'BRAKE DISC-FR-COROLLA-{Y}',
    'BRAKE DISC-RR-LANDCRUISER-{Y}',
    'BRAKE DRUM-RR-HILUX-{Y}',
    'WHEEL CYLINDER-RR-{Y}',
    'MASTER CYLINDER-CAMRY-{Y}',
    'BRAKE HOSE-FR-SUNNY-{Y}',
    'CALIPER REPAIR KIT-{Y}',
    'BRAKE SHOE-RR-FORTUNER-{Y}',
  ],
  'Filters': [
    'OIL FILTER-CAMRY-{Y}',
    'AIR FILTER-COROLLA-{Y}',
    'FUEL FILTER-PRADO-{Y}',
    'CABIN FILTER-CAMRY-{Y}',
    'OIL FILTER-HILUX-DIESEL-{Y}',
    'AIR FILTER-LANDCRUISER-{Y}',
    'FUEL FILTER-DIESEL-PATROL-{Y}',
    'TRANSMISSION FILTER-CAMRY-{Y}',
  ],
  'Electrical & Ignition': [
    'SPARK PLUG-CAMRY-{Y}',
    'GLOW PLUG-HILUX-DIESEL-{Y}',
    'IGNITION COIL-COROLLA-{Y}',
    'ALTERNATOR-CAMRY-{Y}',
    'STARTER MOTOR-HILUX-{Y}',
    'ABS SENSOR-FR-FORTUNER-{Y}',
    'LAMBDA SENSOR-O2-CAMRY-{Y}',
    'CRANKSHAFT SENSOR-ALTIMA-{Y}',
    'RELAY-STARTER-{Y}',
    'FUSE BOX-COROLLA-{Y}',
  ],
  'Transmission & Clutch': [
    'CLUTCH KIT-COROLLA-{Y}',
    'CLUTCH DISC-HILUX-{Y}',
    'PRESSURE PLATE-PATROL-{Y}',
    'RELEASE BEARING-SUNNY-{Y}',
    'GEARBOX MOUNT-CAMRY-{Y}',
    'ATF COOLER-LANDCRUISER-{Y}',
  ],
  'Cooling System': [
    'RADIATOR-CAMRY-{Y}',
    'RADIATOR-PRADO-{Y}',
    'FAN BELT-COROLLA-{Y}',
    'COOLANT HOSE-UPPER-HILUX-{Y}',
    'EXPANSION TANK-CAMRY-{Y}',
    'HEATER CORE-LANDCRUISER-{Y}',
  ],
  'Exhaust & Emissions': [
    'CATALYTIC CONVERTER-CAMRY-{Y}',
    'OXYGEN SENSOR-FRONT-COROLLA-{Y}',
    'EXHAUST GASKET-HILUX-{Y}',
    'FLEX PIPE-ALTIMA-{Y}',
  ],
  'Body & Trim': [
    'HOOD STRUT-CAMRY-{Y}',
    'DOOR HINGE-COROLLA-{Y}',
    'MIRROR GLASS-PRADO-{Y}',
    'WIPER BLADE-CAMRY-{Y}',
  ],
  'Lubricants & Fluids': [
    'ENGINE OIL 5W-30 4L',
    'ENGINE OIL 10W-40 4L',
    'GEAR OIL 75W-90 1L',
    'ATF DEXRON VI 1L',
    'POWER STEERING FLUID 1L',
    'BRAKE FLUID DOT4 500ML',
    'COOLANT 50/50 1L',
    'GREASE WHEEL BEARING 500G',
  ],
  'Batteries & Accessories': [
    'BATTERY 60AH-DIN60',
    'BATTERY 70AH-DIN70',
    'BATTERY 100AH-DIN100',
    'BATTERY TERMINAL-CLAMP',
    'JUMPER CABLE 400AMP',
  ],
  'Tyres & Wheels': [
    'TYRE 205/65R15',
    'TYRE 225/60R17',
    'TYRE 265/70R16',
    'WHEEL NUT-HEX-M12',
  ],
};

const YEAR_RANGES = ['98-07', '00-06', '01-07', '02-08', '03-09', '05-12', '06-12', '08-14', '10-16', '12-18'];

// Customers — KSA garages/workshops (B2B, VAT-registered) + walk-ins
const CUSTOMER_DATA = [
  // B2B garages with TRN
  { code: 'C001', name: 'Cash Customer',                      ar: 'زبون نقدي',                    trn: '',               crLimit: 0,      crDays: 0,  pmtTerms: 'Cash',    vatReg: 'No',  balance: 0,      balType: 'Dr', notes: 'generic walk-in' },
  { code: 'C002', name: 'Cash Customer / MAHMMUD SURI / 553', ar: '',                               trn: '',               crLimit: 0,      crDays: 0,  pmtTerms: 'Cash',    vatReg: 'No',  balance: 0,      balType: 'Dr', notes: 'embedded ref in name — mess' },
  { code: 'C003', name: 'GARAGE AL-WATAN / 101',              ar: 'مرمة الوطن',                   trn: '310012345600003', crLimit: 15000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 8500,   balType: 'Dr', notes: 'B2B key account' },
  { code: 'C004', name: 'MUSSAED AUTO REPAIR / 102',          ar: 'ورشة مساعد',                   trn: '310098765400001', crLimit: 10000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 3200,   balType: 'Dr', notes: '' },
  { code: 'C005', name: 'RASHID BROTHERS / 113',              ar: 'إخوان راشد',                   trn: '311045678900003', crLimit: 20000,  crDays: 45, pmtTerms: 'Net 45',  vatReg: 'Yes', balance: 12400,  balType: 'Dr', notes: '' },
  { code: 'C006', name: 'NOMAN FLEET SERVICE / 120',          ar: 'خدمات نعمان للأسطول',           trn: '310087654300003', crLimit: 50000,  crDays: 45, pmtTerms: 'Net 45',  vatReg: 'Yes', balance: 31500,  balType: 'Dr', notes: 'fleet account; large PDC' },
  { code: 'C007', name: 'JUMA FLEET SOLUTIONS / 138',         ar: 'حلول جمعة للأسطول',            trn: '310076543200003', crLimit: 40000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 22000,  balType: 'Dr', notes: '' },
  { code: 'C008', name: 'MARZOUQ MOTORS / 145',               ar: 'مرزوق موتورز',                 trn: '310065432100003', crLimit: 8000,   crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 4750,   balType: 'Dr', notes: '' },
  { code: 'C009', name: 'AL-SAHEL WORKSHOP / 149',            ar: 'ورشة الساحل',                  trn: '311023456700003', crLimit: 5000,   crDays: 15, pmtTerms: 'Net 15',  vatReg: 'Yes', balance: 1200,   balType: 'Dr', notes: '' },
  { code: 'C010', name: 'SULTAN AUTO WORKSHOP / 155',         ar: 'ورشة سلطان للسيارات',           trn: '310054321000003', crLimit: 12000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 6800,   balType: 'Dr', notes: '' },
  { code: 'C011', name: 'HANI GENERAL TRADING / 162',         ar: 'هاني للتجارة العامة',           trn: '311034567800003', crLimit: 25000,  crDays: 45, pmtTerms: 'Net 45',  vatReg: 'Yes', balance: 15600,  balType: 'Dr', notes: 'reseller — bulk orders' },
  // Z3: VAT-registered B2B with blank TRN — should block standard invoice
  { code: 'C012', name: 'KHALED WORKSHOP / 170',              ar: 'ورشة خالد',                    trn: '',               crLimit: 5000,   crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 2900,   balType: 'Dr', notes: 'Z3: VAT-registered but TRN blank — will block ZATCA clearance' },
  { code: 'C013', name: 'ABD-RAHMAN AUTO PARTS / 175',        ar: 'عبدالرحمن لقطع السيارات',      trn: '310043210900003', crLimit: 18000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 9300,   balType: 'Dr', notes: '' },
  { code: 'C014', name: 'HAMAD FLEET MGMT / 180',             ar: 'حمد لإدارة الأسطول',           trn: '311012345600003', crLimit: 35000,  crDays: 45, pmtTerms: 'Net 45',  vatReg: 'Yes', balance: 18700,  balType: 'Dr', notes: '' },
  { code: 'C015', name: 'FARHAN MOTORS / 188',                ar: 'فرحان موتورز',                 trn: '310032109800003', crLimit: 6000,   crDays: 15, pmtTerms: 'Net 15',  vatReg: 'Yes', balance: 3100,   balType: 'Dr', notes: '' },
  { code: 'C016', name: 'TURKI AUTO SERVICE / 192',           ar: 'خدمات تركي للسيارات',          trn: '311098765400003', crLimit: 9000,   crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 4200,   balType: 'Dr', notes: '' },
  { code: 'C017', name: 'WALEED & SONS GARAGE / 200',         ar: 'وليد وأبناءه للسيارات',        trn: '310021098700003', crLimit: 22000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 11500,  balType: 'Dr', notes: '' },
  { code: 'C018', name: 'SABRI PARTS TRADING / 210',          ar: 'صبري لتجارة قطع الغيار',       trn: '311087654300003', crLimit: 30000,  crDays: 45, pmtTerms: 'Net 45',  vatReg: 'Yes', balance: 20100,  balType: 'Dr', notes: '' },
  { code: 'C019', name: 'AL-YAMAMAH WORKSHOP / 215',          ar: 'ورشة اليمامة',                 trn: '310010987600003', crLimit: 4000,   crDays: 15, pmtTerms: 'Net 15',  vatReg: 'Yes', balance: 1800,   balType: 'Dr', notes: '' },
  { code: 'C020', name: 'MANSOUR TRADING EST / 220',          ar: 'مؤسسة منصور للتجارة',          trn: '311076543200003', crLimit: 28000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 14200,  balType: 'Dr', notes: 'Z12: standard invoice → clearance' },
  // Small B2C / retail individuals
  { code: 'C021', name: 'AHMED AL-DOSARI',                    ar: 'أحمد الدوسري',                 trn: '',               crLimit: 0,      crDays: 0,  pmtTerms: 'Cash',    vatReg: 'No',  balance: 0,      balType: 'Dr', notes: '' },
  { code: 'C022', name: 'FAISAL AL-HARBI',                    ar: 'فيصل الحربي',                  trn: '',               crLimit: 0,      crDays: 0,  pmtTerms: 'Cash',    vatReg: 'No',  balance: 0,      balType: 'Dr', notes: '' },
  { code: 'C023', name: 'OMAR AL-QAHTANI',                    ar: 'عمر القحطاني',                 trn: '',               crLimit: 0,      crDays: 0,  pmtTerms: 'Cash',    vatReg: 'No',  balance: 0,      balType: 'Dr', notes: '' },
  { code: 'C024', name: 'SALEH MOTORS WORKSHOP / 230',        ar: 'ورشة صالح موتورز',             trn: '311065432100003', crLimit: 7000,   crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 3600,   balType: 'Dr', notes: '' },
  { code: 'C025', name: 'IBRAHIM FLEET CARE / 235',           ar: 'إبراهيم لصيانة الأسطول',       trn: '310054320900003', crLimit: 16000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 8900,   balType: 'Dr', notes: '' },
  // Customers with credit balance (overpayment)
  { code: 'C026', name: 'NASSER GARAGE / 245',                ar: 'ورشة ناصر',                    trn: '311043210800003', crLimit: 5000,   crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 1450,   balType: 'Cr', notes: 'credit balance — overpayment' },
  { code: 'C027', name: 'ZIAD BROTHERS WORKSHOP / 250',       ar: 'ورشة إخوان زياد',              trn: '310032109700003', crLimit: 12000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 5200,   balType: 'Dr', notes: '' },
  { code: 'C028', name: 'TAWFIQ AUTO CENTER / 260',           ar: 'توفيق لصيانة السيارات',         trn: '311021098600003', crLimit: 20000,  crDays: 45, pmtTerms: 'Net 45',  vatReg: 'Yes', balance: 10800,  balType: 'Dr', notes: '' },
  { code: 'C029', name: 'KHALIFAH MOTORS / 268',              ar: 'خليفة موتورز',                 trn: '310010987500003', crLimit: 8000,   crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 4300,   balType: 'Dr', notes: '' },
  { code: 'C030', name: 'YOUSUF TRADING CO / 275',            ar: 'شركة يوسف للتجارة',            trn: '311087654200003', crLimit: 40000,  crDays: 45, pmtTerms: 'Net 45',  vatReg: 'Yes', balance: 24600,  balType: 'Dr', notes: '' },
  { code: 'C031', name: 'BADAWI FLEET SERVICE / 280',         ar: 'خدمات بدوي للأسطول',           trn: '310076543100003', crLimit: 35000,  crDays: 45, pmtTerms: 'Net 45',  vatReg: 'Yes', balance: 19200,  balType: 'Dr', notes: '' },
  { code: 'C032', name: 'ABDULLAH AL-SHAMMARI',               ar: 'عبدالله الشمري',               trn: '',               crLimit: 0,      crDays: 0,  pmtTerms: 'Cash',    vatReg: 'No',  balance: 0,      balType: 'Dr', notes: '' },
  { code: 'C033', name: 'MUHANNAD WORKSHOP / 290',            ar: 'ورشة محنّد',                   trn: '311065432000003', crLimit: 6000,   crDays: 15, pmtTerms: 'Net 15',  vatReg: 'Yes', balance: 2700,   balType: 'Dr', notes: '' },
  { code: 'C034', name: 'FAHAD AL-OTAIBI',                    ar: 'فهد العتيبي',                  trn: '',               crLimit: 0,      crDays: 0,  pmtTerms: 'Cash',    vatReg: 'No',  balance: 0,      balType: 'Dr', notes: '' },
  { code: 'C035', name: 'SULAIMAN AUTO PARTS / 300',          ar: 'سليمان لقطع السيارات',          trn: '310054320800003', crLimit: 14000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 7100,   balType: 'Dr', notes: '' },
  { code: 'C036', name: 'AL-RASHEED GARAGE / 310',            ar: 'ورشة الراشد',                  trn: '311043210700003', crLimit: 10000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 5400,   balType: 'Dr', notes: '' },
  { code: 'C037', name: 'MOHSIN TRADING / 315',               ar: 'محسن للتجارة',                 trn: '310032109600003', crLimit: 22000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 13200,  balType: 'Dr', notes: '' },
  { code: 'C038', name: 'HATEM MOTORS / 320',                 ar: 'هاتم موتورز',                  trn: '311021098500003', crLimit: 9000,   crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 4900,   balType: 'Dr', notes: '' },
  { code: 'C039', name: 'REYADH FLEET MGMT / 325',            ar: 'رياض لإدارة الأسطول',          trn: '310010987400003', crLimit: 45000,  crDays: 45, pmtTerms: 'Net 45',  vatReg: 'Yes', balance: 28300,  balType: 'Dr', notes: '' },
  { code: 'C040', name: 'WAFA AUTO TRADING / 330',            ar: 'وفاء لتجارة السيارات',          trn: '311098765300003', crLimit: 18000,  crDays: 30, pmtTerms: 'Net 30',  vatReg: 'Yes', balance: 9800,   balType: 'Dr', notes: '' },
];

const SUPPLIER_DATA = [
  // Local KSA suppliers
  { code: 'S001', name: 'DENSO GULF FZE / RIYADH DIST',        ar: 'دينسو الخليج',          trn: '300012345600003', country: 'KSA',    area: 'Riyadh',   payDays: 30,  blacklist: 'No',  balance: 16500, notes: '' },
  { code: 'S002', name: 'MOBIL / SAUDI ARAMCO DISTRIBTR',      ar: 'موبيل / سابك',          trn: '300098765400003', country: 'KSA',    area: 'Jubail',   payDays: 30,  blacklist: 'No',  balance: 21200, notes: 'Aramco affiliate — long credit terms' },
  { code: 'S003', name: 'CASTROL DISTRIBTR RIYADH',            ar: 'كاسترول ريض',           trn: '301045678900003', country: 'KSA',    area: 'Riyadh',   payDays: 30,  blacklist: 'No',  balance: 9900,  notes: '' },
  { code: 'S004', name: 'SHELL LUBRICANTS / KSA',              ar: 'شل 润滑油 KSA',          trn: '300087654300003', country: 'KSA',    area: 'Jeddah',   payDays: 45,  blacklist: 'No',  balance: 4800,  notes: '' },
  { code: 'S005', name: 'NGK SPARK PLUGS GULF / 201',          ar: 'NGK الخليج',            trn: '301076543200003', country: 'KSA',    area: 'Riyadh',   payDays: 30,  blacklist: 'No',  balance: 4000,  notes: '' },
  { code: 'S006', name: 'AISIN SEIKI / GULF DIST',             ar: 'ايسن سيكي',             trn: '300065432100003', country: 'KSA',    area: 'Riyadh',   payDays: 45,  blacklist: 'No',  balance: 11100, notes: '' },
  { code: 'S007', name: 'GATES BELTS / AL-BUHAIRI TRDG',       ar: 'جيتس بيلتس',            trn: '301054321000003', country: 'KSA',    area: 'Riyadh',   payDays: 30,  blacklist: 'No',  balance: 4600,  notes: '' },
  { code: 'S008', name: 'KYB SHOCK ABSORBERS / KSA',           ar: 'كي واي بي',             trn: '300043210900003', country: 'KSA',    area: 'Riyadh',   payDays: 30,  blacklist: 'No',  balance: 8200,  notes: '' },
  { code: 'S009', name: 'MONROE / TENNECO KSA',                ar: 'مونرو تينيكو',          trn: '301032109800003', country: 'KSA',    area: 'Riyadh',   payDays: 30,  blacklist: 'No',  balance: 6700,  notes: '' },
  { code: 'S010', name: 'BOSCH AUTO PARTS RIYADH',             ar: 'بوش',                   trn: '300021098700003', country: 'KSA',    area: 'Riyadh',   payDays: 45,  blacklist: 'No',  balance: 19400, notes: '' },
  // Blacklisted supplier
  { code: 'S011', name: 'ABD HUSSAIN TRDG (Sulabiya) / 314',   ar: 'عبد حسين للتجارة',      trn: '301010987600003', country: 'KSA',    area: 'Riyadh',   payDays: 0,   blacklist: 'Yes', balance: 4400,  notes: 'BLACKLISTED — payment dispute, do not order' },
  // Overseas — UAE (import VAT / reverse-charge)
  { code: 'S012', name: 'JORDAN PARTS IMPORT / AMMAN',         ar: 'استيراد قطع الأردن',    trn: '',               country: 'Jordan', area: 'Amman',    payDays: 60,  blacklist: 'No',  balance: 9600,  notes: 'Overseas — Jordan; import VAT / reverse-charge on import' },
  { code: 'S013', name: 'AL-BUSTAN TRADING FZE / DUBAI',       ar: 'البستان للتجارة دبي',   trn: '',               country: 'UAE',    area: 'Dubai',    payDays: 30,  blacklist: 'No',  balance: 12300, notes: 'Overseas — UAE; import VAT applies' },
  { code: 'S014', name: 'MAHLE GERMANY / DUBAI BRANCH',        ar: 'ماهلي دبي',             trn: '',               country: 'UAE',    area: 'Dubai',    payDays: 45,  blacklist: 'No',  balance: 7800,  notes: 'Overseas — via UAE FZ; import VAT' },
  { code: 'S015', name: 'EXIDE BATTERIES / RIYADH',            ar: 'إكسايد للبطاريات',      trn: '300098765300003', country: 'KSA',    area: 'Riyadh',   payDays: 30,  blacklist: 'No',  balance: 5100,  notes: '' },
];

// ============================================================================
// 01 — CATEGORIES
// ============================================================================

function genCategories() {
  return CATEGORIES.map(c => ({
    'Category Name': c.name,
    'Arabic Name':   c.ar,
    'Parent Category': '',
  }));
}

// ============================================================================
// 02 — PRODUCTS  (~200 rows)
// ============================================================================

function genProducts() {
  const rows = [];
  const usedCodes = new Set();
  let seqMap = {};

  // Pre-select a few OEM cross-ref jam positions and the Z6 "no-parens" taxGroup SKUs
  const z6Positions = new Set();
  while (z6Positions.size < 10) z6Positions.add(rng.int(0, 199));

  // Duplicate item codes — inject 4 intentional collisions
  const dupCodeTargets = new Set();

  for (const [cat, templates] of Object.entries(MODELS_BY_CAT)) {
    const isLubs   = cat === 'Lubricants & Fluids';
    const isBatt   = cat === 'Batteries & Accessories';
    const isTyres  = cat === 'Tyres & Wheels';

    for (const tmpl of templates) {
      const yr    = rng.choice(YEAR_RANGES);
      const name  = isLubs || isBatt || isTyres ? tmpl : tmpl.replace('{Y}', yr);

      // Item code
      const catAbbr = cat.split(' ')[0].substring(0, 3).toUpperCase();
      if (!seqMap[catAbbr]) seqMap[catAbbr] = 1;
      let code = `${catAbbr}-${String(seqMap[catAbbr]++).padStart(3, '0')}`;

      // Inject OEM cross-ref in name ALL-CAPS (mess flavor)
      const brand  = rng.choice(BRANDS);
      let finalName = name;
      if (rng.int(0, 9) < 7) {
        finalName = name + rng.choice(OEM_SUFFIXES);
      }

      // Intentional duplicate code — ~4 items
      if (usedCodes.size > 10 && rng.int(0, 199) < 4 && dupCodeTargets.size < 4) {
        code = Array.from(usedCodes)[rng.int(0, usedCodes.size - 1)];
        dupCodeTargets.add(code);
      }
      usedCodes.add(code);

      const costBase  = rng.float(15, 400);
      const cost      = rng.int(0, 199) < 3 ? '' : sar(costBase);      // blank cost trap
      const selling   = sar(costBase * rng.float(1.25, 1.65));

      // taxGroup: Z6 = "Standard Rate 15%" (no parens); others = "Standard Rate (15%)"
      const idx = rows.length;
      const taxGroup = z6Positions.has(idx % 200)
        ? 'Standard Rate 15%'        // Z6 — mismatch, no parens
        : 'Standard Rate (15%)';

      // WAC=0 trap: a couple of items with 0.00 cost
      const wacTrap = rng.int(0, 199) < 3;

      rows.push({
        'Item Code':      code,
        'Item Name':      finalName,
        'Arabic Name':    rng.int(0, 9) < 4 ? '' : `قطعة ${brand}`,
        'Barcode':        rng.int(0, 9) < 2 ? '' : code + '/' + brand.substring(0, 3),  // ~20% blank barcode
        'Brand':          brand,
        'Category':       cat,
        'Unit':           isLubs ? 'L' : (isTyres ? 'Piece' : rng.choice(['Pcs', 'pcs', 'Set', 'Piece'])),  // unit case inconsistency
        'Cost Price (SAR)': wacTrap ? '0.00' : (cost === '' ? '' : cost),
        'Selling Price (SAR)': selling,
        'VAT Applicable': 'Yes',
        'taxGroup':       taxGroup,
      });

      if (rows.length >= 200) break;
    }
    if (rows.length >= 200) break;
  }

  // Inject 1 blank row (mess)
  rows.splice(rng.int(50, 150), 0, {
    'Item Code': '', 'Item Name': '', 'Arabic Name': '', 'Barcode': '', 'Brand': '',
    'Category': '', 'Unit': '', 'Cost Price (SAR)': '', 'Selling Price (SAR)': '',
    'VAT Applicable': '', 'taxGroup': '',
  });

  return rows.slice(0, 201);
}

// ============================================================================
// 03 — CUSTOMERS
// ============================================================================

function genCustomers() {
  return CUSTOMER_DATA.map(c => ({
    'Acct Code':        c.code,
    'Customer Name':    c.name,
    'Arabic Name':      c.ar,
    'TRN':              c.trn,
    'Mobile':           c.code === 'C001' ? '' : `+966 ${rng.int(50,59)}${rng.int(1000000,9999999)}`,
    'Credit Limit (SAR)': c.crLimit === 0 ? '' : String(c.crLimit),
    'Credit Days':      c.crDays === 0 ? '' : String(c.crDays),
    'Payment Terms':    c.pmtTerms,
    'Opening Balance (SAR)': c.balance === 0 ? '0.00' : sar(c.balance),
    'Balance Type':     c.balType,
    'VAT Registered':   c.vatReg,
    'Notes':            c.notes,
  }));
}

// ============================================================================
// 03b — CUSTOMER OUTSTANDING AGING
// ============================================================================

function genCustomerAging() {
  const rows = [];
  let sr = 1;
  const baseDate = new Date(2026, 5, 11); // 11 Jun 2026

  const entries = [
    { cust: 'GARAGE AL-WATAN / 101',         inv: 'INV-2401-0042', days: 145, bill: 2300, paid: 2300 },
    { cust: 'GARAGE AL-WATAN / 101',         inv: 'INV-2401-0078', days: 132, bill: 3800, paid: 2000 },
    { cust: 'GARAGE AL-WATAN / 101',         inv: 'INV-2402-0021', days: 119, bill: 4200, paid: 3500 },
    { cust: 'GARAGE AL-WATAN / 101',         inv: 'INV-2402-0055', days: 114, bill: 5600, paid: 5600 },
    { cust: 'GARAGE AL-WATAN / 101',         inv: 'INV-2403-0011', days:  93, bill: 8200, paid:    0 },
    { cust: 'GARAGE AL-WATAN / 101',         inv: 'INV-2403-0089', days:  76, bill: 2100, paid:  300 },
    { cust: 'MUSSAED AUTO REPAIR / 102',     inv: 'INV-2401-0031', days: 150, bill: 1800, paid: 1800 },
    { cust: 'MUSSAED AUTO REPAIR / 102',     inv: 'INV-2402-0068', days: 109, bill: 2600, paid: 1000 },
    { cust: 'MUSSAED AUTO REPAIR / 102',     inv: 'INV-2403-0044', days:  77, bill: 2900, paid:    0 },
    { cust: 'RASHID BROTHERS / 113',         inv: 'INV-2403-0060', days:  65, bill: 6000, paid: 1000 },
    { cust: 'RASHID BROTHERS / 113',         inv: 'INV-2404-0010', days:  50, bill: 5000, paid:    0 },
    { cust: 'RASHID BROTHERS / 113',         inv: 'INV-2404-0025', days:  40, bill: 3200, paid:  800 },
    { cust: 'NOMAN FLEET SERVICE / 120',     inv: 'INV-2404-0033', days:  55, bill: 15000, paid:    0 },
    { cust: 'NOMAN FLEET SERVICE / 120',     inv: 'INV-2404-0088', days:  30, bill: 10000, paid:    0 },
    { cust: 'NOMAN FLEET SERVICE / 120',     inv: 'INV-2405-0012', days:  18, bill: 9000,  paid: 2500 },
    { cust: 'JUMA FLEET SOLUTIONS / 138',    inv: 'INV-2403-0046', days:  80, bill: 10000, paid: 4000 },
    { cust: 'JUMA FLEET SOLUTIONS / 138',    inv: 'INV-2404-0055', days:  45, bill: 8000,  paid: 4000 },
    { cust: 'JUMA FLEET SOLUTIONS / 138',    inv: 'INV-2405-0008', days:  22, bill: 6000,  paid: 2000 },
    { cust: 'HANI GENERAL TRADING / 162',    inv: 'INV-2404-0070', days:  48, bill: 9000,  paid:    0 },
    { cust: 'HANI GENERAL TRADING / 162',    inv: 'INV-2405-0030', days:  15, bill: 6600,  paid:    0 },
    { cust: 'KHALED WORKSHOP / 170',         inv: 'INV-2405-0044', days:  20, bill: 2900,  paid:    0 },  // Z3
    { cust: 'ABD-RAHMAN AUTO PARTS / 175',   inv: 'INV-2403-0100', days:  70, bill: 4500,  paid:    0 },
    { cust: 'ABD-RAHMAN AUTO PARTS / 175',   inv: 'INV-2405-0020', days:  25, bill: 5500,  paid:  700 },
    { cust: 'MANSOUR TRADING EST / 220',     inv: 'INV-2404-0090', days:  42, bill: 7200,  paid:    0 },
    { cust: 'MANSOUR TRADING EST / 220',     inv: 'INV-2405-0050', days:  12, bill: 7000,  paid:    0 },
    { cust: 'SULTAN AUTO WORKSHOP / 155',    inv: 'INV-2404-0065', days:  50, bill: 4000,  paid:    0 },
    { cust: 'SULTAN AUTO WORKSHOP / 155',    inv: 'INV-2405-0035', days:  16, bill: 3000,  paid:  200 },
    { cust: 'MARZOUQ MOTORS / 145',          inv: 'INV-2405-0055', days:  10, bill: 4750,  paid:    0 },
    { cust: 'WALEED & SONS GARAGE / 200',    inv: 'INV-2404-0080', days:  38, bill: 6000,  paid:    0 },
    { cust: 'WALEED & SONS GARAGE / 200',    inv: 'INV-2405-0065', days:   8, bill: 5500,  paid:    0 },
  ];

  let runningByCust = {};
  for (const e of entries) {
    const bal   = e.bill - e.paid;
    if (!runningByCust[e.cust]) runningByCust[e.cust] = 0;
    runningByCust[e.cust] += bal;

    const d = new Date(baseDate);
    d.setDate(d.getDate() - e.days);
    const ddmmyyyy = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

    rows.push({
      'Sr':             sr++,
      'Date':           ddmmyyyy,         // DD/MM/YYYY — import mess
      'Invoice No':     e.inv,
      'Customer Name':  e.cust,
      'Bill Amount (SAR)': sar(e.bill),
      'Paid (SAR)':     sar(e.paid),
      'Balance (SAR)':  sar(bal),
      'Total Balance (SAR)': sar(runningByCust[e.cust]),   // running-total col — import should ignore
      'Aging Days':     e.days,
      'Remarks':        bal === 0 ? 'paid' : (e.paid > 0 ? 'partial' : 'unpaid'),
    });
  }
  return rows;
}

// ============================================================================
// 04 — SUPPLIERS
// ============================================================================

function genSuppliers() {
  return SUPPLIER_DATA.map(s => ({
    'Acct Code':        s.code,
    'Supplier Name':    s.name,
    'Arabic Name':      s.ar,
    'TRN':              s.trn,
    'Country':          s.country,
    'Area':             s.area,
    'Payment Days':     s.payDays,
    'Opening Balance (SAR)': s.balance === 0 ? '0.00' : sar(s.balance),
    'Blacklist':        s.blacklist,
    'Notes':            s.notes,
  }));
}

// ============================================================================
// 04b — SUPPLIER OUTSTANDING AGING
// ============================================================================

function genSupplierAging() {
  const rows = [];
  let sr = 1;
  const baseDate = new Date(2026, 5, 11);

  const entries = [
    { supp: 'DENSO GULF FZE / RIYADH DIST',    inv: 'SUPP-INV-240301', days:  95, bill: 12000, paid:  0 },
    { supp: 'DENSO GULF FZE / RIYADH DIST',    inv: 'SUPP-INV-240502', days:  30, bill:  8500, paid:  4000 },
    { supp: 'MOBIL / SAUDI ARAMCO DISTRIBTR',  inv: 'SUPP-INV-240210', days: 120, bill: 21200, paid:  0 },
    { supp: 'CASTROL DISTRIBTR RIYADH',        inv: 'SUPP-INV-240315', days:  88, bill:  9900, paid:  0 },
    { supp: 'NGK SPARK PLUGS GULF / 201',      inv: 'SUPP-INV-240401', days:  71, bill:  4000, paid:  0 },
    { supp: 'AISIN SEIKI / GULF DIST',         inv: 'SUPP-INV-240220', days: 111, bill: 11100, paid:  0 },
    { supp: 'GATES BELTS / AL-BUHAIRI TRDG',   inv: 'SUPP-INV-240410', days:  62, bill:  4600, paid:  0 },
    { supp: 'KYB SHOCK ABSORBERS / KSA',       inv: 'SUPP-INV-240325', days:  78, bill:  8200, paid:  0 },
    { supp: 'MONROE / TENNECO KSA',            inv: 'SUPP-INV-240408', days:  64, bill:  6700, paid:  0 },
    { supp: 'BOSCH AUTO PARTS RIYADH',         inv: 'SUPP-INV-240218', days: 113, bill: 19400, paid:  0 },
    { supp: 'ABD HUSSAIN TRDG (Sulabiya) / 314', inv: 'SUPP-INV-240130', days: 132, bill: 4400, paid:  0 },
    { supp: 'JORDAN PARTS IMPORT / AMMAN',     inv: 'SUPP-INV-240305', days:  98, bill:  9600, paid:  0 },
    { supp: 'AL-BUSTAN TRADING FZE / DUBAI',   inv: 'SUPP-INV-240412', days:  60, bill: 12300, paid:  0 },
    { supp: 'MAHLE GERMANY / DUBAI BRANCH',    inv: 'SUPP-INV-240420', days:  52, bill:  7800, paid:  0 },
    { supp: 'EXIDE BATTERIES / RIYADH',        inv: 'SUPP-INV-240501', days:  41, bill:  5100, paid:  0 },
    { supp: 'SHELL LUBRICANTS / KSA',          inv: 'SUPP-INV-240330', days:  73, bill:  4800, paid:  0 },
  ];

  let runningBySupp = {};
  for (const e of entries) {
    const bal = e.bill - e.paid;
    if (!runningBySupp[e.supp]) runningBySupp[e.supp] = 0;
    runningBySupp[e.supp] += bal;

    const d = new Date(baseDate);
    d.setDate(d.getDate() - e.days);
    const ddmmyyyy = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;

    rows.push({
      'Sr':              sr++,
      'Date':            ddmmyyyy,
      'Invoice No':      e.inv,
      'Supplier Name':   e.supp,
      'Bill Amount (SAR)': sar(e.bill),
      'Paid (SAR)':      sar(e.paid),
      'Balance (SAR)':   sar(bal),
      'Total Balance (SAR)': sar(runningBySupp[e.supp]),  // running-total — import should ignore
      'Aging Days':      e.days,
      'Remarks':         bal === 0 ? 'paid' : (e.paid > 0 ? 'partial' : 'outstanding'),
    });
  }
  return rows;
}

// ============================================================================
// 05 — OPENING STOCK
// ============================================================================

function genOpeningStock(products) {
  const rows = [];
  const validProds = products.filter(p => p['Item Code']);

  // Most products get stock at AL-OLAYA
  for (const prod of validProds) {
    if (!prod['Item Code']) continue;
    const costStr = prod['Cost Price (SAR)'];
    const cost    = costStr === '' || costStr === '0.00' ? 0 : parseFloat(costStr);
    let   qty     = rng.int(2, 40);

    // WAC=0 trap: keep it zero so importer must handle
    const wac = cost === 0 ? '0.00' : sar(cost);

    rows.push({
      'Item Code':  prod['Item Code'],
      'Item Name':  prod['Item Name'],
      'Location':   'AL-OLAYA',
      'Unit':       prod['Unit'],
      'Opening Qty': qty,
      'WAC Cost (SAR)': wac,
      'Stock Value (SAR)': sar(qty * (cost || 0)),
    });
  }

  // Inject negative qty row (real mess from Tally export)
  rows.splice(rng.int(10, 50), 0, {
    'Item Code':  'SUS-012',
    'Item Name':  'STRUT ASSY-FR-ALTIMA-00-06/OEM-48510',
    'Location':   'AL-OLAYA',
    'Unit':       'Set',
    'Opening Qty': -3,
    'WAC Cost (SAR)': '185.00',
    'Stock Value (SAR)': '-555.00',
  });

  // Inject a duplicate item code row
  rows.push({
    'Item Code':  rows[5]['Item Code'],
    'Item Name':  rows[5]['Item Name'] + '  ',   // trailing spaces = duplicate trap
    'Location':   'AL-OLAYA',
    'Unit':       'Pcs',
    'Opening Qty': 4,
    'WAC Cost (SAR)': rows[5]['WAC Cost (SAR)'],
    'Stock Value (SAR)': sar(4 * (parseFloat(rows[5]['WAC Cost (SAR)']) || 0)),
  });

  // Inject non-existent SKU
  rows.push({
    'Item Code':  'XXX-INVALID-9999',
    'Item Name':  'ORPHAN PART / OLD STOCK / NO MASTER',
    'Location':   'AL-OLAYA',
    'Unit':       'Pcs',
    'Opening Qty': 2,
    'WAC Cost (SAR)': '55.00',
    'Stock Value (SAR)': '110.00',
  });

  return rows;
}

// ============================================================================
// 06 — PDC REGISTER  (Z18: one BOUNCED cheque)
// ============================================================================

function genPDC() {
  return [
    { ref: 'PDC-IN-001', type: 'RECEIVED',  chq: 'CH-004521',         bank: 'AL RAJHI BANK', party: 'RASHID BROTHERS / 113',       amt: 4000,  issue: '10/03/2026', future: '30/04/2026', status: 'Pending Deposit', invoice: 'INV-2403-0055',         remarks: 'in safe - not yet deposited' },
    { ref: 'PDC-IN-002', type: 'RECEIVED',  chq: 'CH-NOMAN-001',      bank: 'RIYAD BANK',    party: 'NOMAN FLEET SERVICE / 120',   amt: 10000, issue: '01/04/2026', future: '15/05/2026', status: 'Pending Deposit', invoice: 'INV-2404-0033 + prior',  remarks: 'large PDC - phone confirm before deposit' },
    { ref: 'PDC-IN-003', type: 'RECEIVED',  chq: 'CH-JUMA-MULTI-01',  bank: 'AL RAJHI BANK', party: 'JUMA FLEET SOLUTIONS / 138',  amt: 4000,  issue: '25/03/2026', future: '20/04/2026', status: 'Deposited',       invoice: 'INV-2403-0046',         remarks: 'cleared' },
    { ref: 'PDC-IN-004', type: 'RECEIVED',  chq: 'CH-JUMA-MULTI-02',  bank: 'AL RAJHI BANK', party: 'JUMA FLEET SOLUTIONS / 138',  amt: 4000,  issue: '25/03/2026', future: '20/05/2026', status: 'Pending Deposit', invoice: 'balance',               remarks: 'second cheque same batch' },
    { ref: 'PDC-IN-005', type: 'RECEIVED',  chq: 'CH-HANI-001',       bank: 'SNB',           party: 'HANI GENERAL TRADING / 162',  amt: 6600,  issue: '05/05/2026', future: '05/06/2026', status: 'Pending Deposit', invoice: 'INV-2404-0070',         remarks: '' },
    { ref: 'PDC-IN-006', type: 'RECEIVED',  chq: 'CH-MANSOUR-002',    bank: 'RIYAD BANK',    party: 'MANSOUR TRADING EST / 220',   amt: 7200,  issue: '10/04/2026', future: '10/06/2026', status: 'Pending Deposit', invoice: 'INV-2404-0090',         remarks: '' },
    // Z18 — BOUNCED
    { ref: 'PDC-IN-007', type: 'RECEIVED',  chq: 'CH-MARZOUQ-001',    bank: 'AL RAJHI BANK', party: 'MARZOUQ MOTORS / 145',        amt: 4750,  issue: '01/05/2026', future: '01/06/2026', status: 'BOUNCED',         invoice: 'INV-2405-0055',         remarks: 'Z18: RETURNED BY BANK - INSUFFICIENT FUNDS - follow up urgent' },
    { ref: 'PDC-IN-008', type: 'RECEIVED',  chq: 'CH-REYADH-001',     bank: 'RIYADH BANK',   party: 'REYADH FLEET MGMT / 325',     amt: 15000, issue: '15/04/2026', future: '15/07/2026', status: 'Pending Deposit', invoice: 'multiple',              remarks: 'post-dated 3 months' },
    { ref: 'PDC-OUT-001', type: 'ISSUED',   chq: 'CH-AK-OUT-0021',    bank: 'AL RAJHI BANK', party: 'DENSO GULF FZE / RIYADH DIST', amt: 8000,  issue: '01/04/2026', future: '01/06/2026', status: 'Issued',          invoice: 'SUPP-INV-240301+240502', remarks: 'supplier payment' },
    { ref: 'PDC-OUT-002', type: 'ISSUED',   chq: 'CH-AK-OUT-0022',    bank: 'AL RAJHI BANK', party: 'BOSCH AUTO PARTS RIYADH',     amt: 10000, issue: '05/04/2026', future: '05/07/2026', status: 'Issued',          invoice: 'SUPP-INV-240218',       remarks: '' },
    { ref: 'PDC-OUT-003', type: 'ISSUED',   chq: 'CH-AK-OUT-0023',    bank: 'RIYAD BANK',    party: 'CASTROL DISTRIBTR RIYADH',    amt: 5000,  issue: '10/05/2026', future: '10/06/2026', status: 'Issued',          invoice: 'SUPP-INV-240315',       remarks: 'partial payment' },
  ].map(r => ({
    'PDC Ref':         r.ref,
    'Type':            r.type,
    'Cheque No':       r.chq,
    'Bank (Drawer)':   r.bank,
    'Party Name':      r.party,
    'Amount (SAR)':    sar(r.amt),
    'Issue Date':      r.issue,
    'Cheque Date (Future)': r.future,
    'Status':          r.status,
    'Linked Invoice(s)': r.invoice,
    'Remarks':         r.remarks,
  }));
}

// ============================================================================
// 07 — TRIAL BALANCE  (Tally 6-col; dirty version off ~SAR 890)
// ============================================================================

// Compute AR + AP from master data
const AR_TOTAL = CUSTOMER_DATA.filter(c => c.balType === 'Dr').reduce((s, c) => s + c.balance, 0);
const AP_TOTAL = SUPPLIER_DATA.reduce((s, s2) => s + s2.balance, 0);

// Fixed stock value (deterministic; a round number for TB purposes)
const STOCK_VALUE = 312450.00;

const TB_ACCOUNTS = [
  // Group: Capital & Liabilities
  { name: 'ABU KHALID - CAPITAL ACCOUNT',           group: 'Capital Account',   opDr: 0,         opCr: 450000.00 },
  { name: 'ABU KHALID - DRAWINGS',                  group: 'Capital Account',   opDr: 12000.00,  opCr: 0 },
  { name: 'RETAINED EARNINGS',                      group: 'Reserves & Surplus',opDr: 0,         opCr: 125000.00 },
  { name: 'AL RAJHI BANK LOAN - 100234567890',       group: 'Bank Loan',         opDr: 0,         opCr: 80000.00 },
  { name: 'Sundry Creditors',                       group: 'Sundry Creditors',  opDr: 0,         opCr: AP_TOTAL },
  // Group: Assets
  { name: 'Cash in Hand - AL-OLAYA',               group: 'Cash',              opDr: 42000.00,  opCr: 0 },
  { name: 'Bank - AL RAJHI CURRENT',               group: 'Bank',              opDr: 198500.00, opCr: 0 },
  { name: 'Bank - RIYAD BANK',                     group: 'Bank',              opDr: 87350.00,  opCr: 0 },
  { name: 'Sundry Debtors',                        group: 'Sundry Debtors',    opDr: AR_TOTAL,  opCr: 0 },
  { name: 'Inventory - AL-OLAYA',                  group: 'Inventory',         opDr: STOCK_VALUE,opCr: 0 },
  { name: 'Prepaid Rent (مدفوع مقدما)',            group: 'Current Assets',    opDr: 15000.00,  opCr: 0 },
  { name: 'Furniture & Fixtures',                  group: 'Fixed Assets',      opDr: 28500.00,  opCr: 0 },
  // Plug row — will be imbalanced in dirty version
  { name: 'Owner Capital / Suspense',              group: 'Capital Account',   opDr: 0,         opCr: 0 },  // index 12
];

function genTrialBalanceDirty() {
  // Calculate totals without plug
  let totDr = 0, totCr = 0;
  for (let i = 0; i < TB_ACCOUNTS.length - 1; i++) {
    totDr += TB_ACCOUNTS[i].opDr;
    totCr += TB_ACCOUNTS[i].opCr;
  }
  // Intentionally OFF by ~890 — Z17: add a period-debit typo on the suspense row
  const IMBALANCE = 890.00;
  const suspenseDr = Math.abs(totDr - totCr) + IMBALANCE;

  return TB_ACCOUNTS.map((a, i) => {
    const dr = i === 12 ? (totDr < totCr ? suspenseDr : 0) : a.opDr;
    const cr = i === 12 ? (totDr >= totCr ? suspenseDr : 0) : a.opCr;
    return {
      'Particulars':           a.name,
      'Group':                 a.group,
      'Opening Debit (SAR)':   dr > 0 ? sar(dr) : '',
      'Opening Credit (SAR)':  cr > 0 ? sar(cr) : '',
      'Period Debit (SAR)':    '',
      'Period Credit (SAR)':   '',
      'Closing Balance (SAR)': dr > 0 ? sar(dr) : sar(cr),
      'Dr/Cr':                 dr > 0 ? 'Dr' : 'Cr',
    };
  });
}

function genTrialBalanceClean() {
  let totDr = 0, totCr = 0;
  for (let i = 0; i < TB_ACCOUNTS.length - 1; i++) {
    totDr += TB_ACCOUNTS[i].opDr;
    totCr += TB_ACCOUNTS[i].opCr;
  }
  const diff = totDr - totCr;

  return TB_ACCOUNTS.map((a, i) => {
    let dr = a.opDr, cr = a.opCr;
    if (i === 12) {
      if (diff < 0) { dr = Math.abs(diff); cr = 0; }
      else          { dr = 0; cr = diff; }
    }
    return {
      'Particulars':           a.name,
      'Group':                 a.group,
      'Opening Debit (SAR)':   dr > 0 ? sar(dr) : '',
      'Opening Credit (SAR)':  cr > 0 ? sar(cr) : '',
      'Period Debit (SAR)':    '',
      'Period Credit (SAR)':   '',
      'Closing Balance (SAR)': dr > 0 ? sar(dr) : sar(cr),
      'Dr/Cr':                 dr > 0 ? 'Dr' : 'Cr',
    };
  });
}

// ============================================================================
// 08 — CUSTOMERS WINDOWS-1256 (encoding trap)
// ============================================================================

function genCustomersWin1256(customerRows) {
  const headers = ['Acct Code', 'Customer Name', 'Arabic Name', 'TRN', 'Mobile', 'Opening Balance (SAR)', 'Balance Type'];
  const subset  = customerRows.slice(0, 30);
  const lines   = [
    headers.map(escapeCSV).join(','),
    ...subset.map(r => headers.map(h => escapeCSV(r[h] ?? '')).join(',')),
  ];
  const csvContent = lines.join('\n') + '\n';
  const win1256Path = path.join(OUT, '08-customers-windows1256.csv');
  const tmpPath     = win1256Path + '.utf8.tmp';
  fs.writeFileSync(tmpPath, csvContent, 'utf8');
  execSync(`iconv -f UTF-8 -t WINDOWS-1256//TRANSLIT ${JSON.stringify(tmpPath)} > ${JSON.stringify(win1256Path)}`);
  fs.unlinkSync(tmpPath);
  console.log(`  ✓ 08-customers-windows1256.csv  (${subset.length} data rows, Windows-1256, no BOM)`);
}

// ============================================================================
// MAIN
// ============================================================================

console.log('\n🚗  Generating Abu Khalid Auto Parts — KSA test data (seed 44)\n');

const categories     = genCategories();
const products       = genProducts();
const customers      = genCustomers();
const customerAging  = genCustomerAging();
const suppliers      = genSuppliers();
const supplierAging  = genSupplierAging();
const openingStock   = genOpeningStock(products);
const pdc            = genPDC();
const tbDirty        = genTrialBalanceDirty();
const tbClean        = genTrialBalanceClean();

const TB_HEADERS = ['Particulars', 'Group', 'Opening Debit (SAR)', 'Opening Credit (SAR)',
                    'Period Debit (SAR)', 'Period Credit (SAR)', 'Closing Balance (SAR)', 'Dr/Cr'];

writeCSV(path.join(OUT, '01-categories.csv'),      ['Category Name', 'Arabic Name', 'Parent Category'], categories);
writeCSV(path.join(OUT, '02-products.csv'),        ['Item Code', 'Item Name', 'Arabic Name', 'Barcode', 'Brand', 'Category', 'Unit', 'Cost Price (SAR)', 'Selling Price (SAR)', 'VAT Applicable', 'taxGroup'], products);
writeCSV(path.join(OUT, '03-customers.csv'),       ['Acct Code', 'Customer Name', 'Arabic Name', 'TRN', 'Mobile', 'Credit Limit (SAR)', 'Credit Days', 'Payment Terms', 'Opening Balance (SAR)', 'Balance Type', 'VAT Registered', 'Notes'], customers);
writeCSV(path.join(OUT, '03b-customer-outstanding-aging.csv'), ['Sr', 'Date', 'Invoice No', 'Customer Name', 'Bill Amount (SAR)', 'Paid (SAR)', 'Balance (SAR)', 'Total Balance (SAR)', 'Aging Days', 'Remarks'], customerAging);
writeCSV(path.join(OUT, '04-suppliers.csv'),       ['Acct Code', 'Supplier Name', 'Arabic Name', 'TRN', 'Country', 'Area', 'Payment Days', 'Opening Balance (SAR)', 'Blacklist', 'Notes'], suppliers);
writeCSV(path.join(OUT, '04b-supplier-outstanding-aging.csv'), ['Sr', 'Date', 'Invoice No', 'Supplier Name', 'Bill Amount (SAR)', 'Paid (SAR)', 'Balance (SAR)', 'Total Balance (SAR)', 'Aging Days', 'Remarks'], supplierAging);
writeCSV(path.join(OUT, '05-opening-stock.csv'),   ['Item Code', 'Item Name', 'Location', 'Unit', 'Opening Qty', 'WAC Cost (SAR)', 'Stock Value (SAR)'], openingStock);
writeCSV(path.join(OUT, '06-pdc-register.csv'),    ['PDC Ref', 'Type', 'Cheque No', 'Bank (Drawer)', 'Party Name', 'Amount (SAR)', 'Issue Date', 'Cheque Date (Future)', 'Status', 'Linked Invoice(s)', 'Remarks'], pdc);
writeCSV(path.join(OUT, '07-trial-balance.csv'),   TB_HEADERS, tbDirty);
writeCSV(path.join(OUT, '07-trial-balance-clean.csv'), TB_HEADERS, tbClean);
genCustomersWin1256(customers);

// ============================================================================
// VALIDATION REPORT
// ============================================================================

console.log('\n📊  VALIDATION\n');

// Trial balance check (dirty)
let dDr = 0, dCr = 0;
for (const r of tbDirty) {
  dDr += parseFloat(r['Opening Debit (SAR)']  || 0);
  dCr += parseFloat(r['Opening Credit (SAR)'] || 0);
}
console.log('07-trial-balance.csv (dirty — Z17):');
console.log(`  Total Debit : SAR ${sar(dDr)}`);
console.log(`  Total Credit: SAR ${sar(dCr)}`);
console.log(`  Gap         : SAR ${sar(Math.abs(dDr - dCr))}  ← expected ~890.00`);
console.log(`  Balanced    : ${Math.abs(dDr - dCr) < 0.01 ? 'YES ✓' : 'NO ✗ (intentional)'}`);

let cDr = 0, cCr = 0;
for (const r of tbClean) {
  cDr += parseFloat(r['Opening Debit (SAR)']  || 0);
  cCr += parseFloat(r['Opening Credit (SAR)'] || 0);
}
console.log('\n07-trial-balance-clean.csv:');
console.log(`  Total Debit : SAR ${sar(cDr)}`);
console.log(`  Total Credit: SAR ${sar(cCr)}`);
console.log(`  Balanced    : ${Math.abs(cDr - cCr) < 0.01 ? 'YES ✓' : 'NO ✗'}`);

console.log('\nCustomers:');
console.log(`  Total: ${customers.length}`);
const b2bVatCount  = customers.filter(c => c['VAT Registered'] === 'Yes').length;
const blankTrnZ3   = customers.filter(c => c['VAT Registered'] === 'Yes' && !c['TRN']).length;
console.log(`  VAT-registered: ${b2bVatCount} | Blank TRN (Z3): ${blankTrnZ3}`);

console.log('\nProducts:');
console.log(`  Total: ${products.length}`);
const z6Count = products.filter(p => p['taxGroup'] === 'Standard Rate 15%').length;
const wac0    = products.filter(p => p['Cost Price (SAR)'] === '0.00').length;
const blankCost = products.filter(p => p['Cost Price (SAR)'] === '').length;
console.log(`  Z6 (no-parens taxGroup): ${z6Count}`);
console.log(`  WAC=0 traps: ${wac0} | Blank cost: ${blankCost}`);

console.log('\nStock:');
const negQty = openingStock.filter(r => parseInt(r['Opening Qty']) < 0).length;
const wac0Stock = openingStock.filter(r => r['WAC Cost (SAR)'] === '0.00').length;
console.log(`  Rows: ${openingStock.length} | Negative qty: ${negQty} | WAC=0: ${wac0Stock}`);

console.log('\nPDC:');
const bounced = pdc.filter(r => r['Status'] === 'BOUNCED').length;
console.log(`  Rows: ${pdc.length} | BOUNCED (Z18): ${bounced}`);

console.log('\nSuppliers:');
const blacklisted = suppliers.filter(s => s['Blacklist'] === 'Yes').length;
const overseas    = suppliers.filter(s => s['Country'] !== 'KSA').length;
console.log(`  Total: ${suppliers.length} | Blacklisted: ${blacklisted} | Overseas: ${overseas}`);

console.log('\n✅  Done.\n');
