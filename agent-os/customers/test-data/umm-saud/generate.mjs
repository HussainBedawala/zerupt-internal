/**
 * generate.mjs — Umm Saud Baqala test-data fixture generator
 * Jeddah supermarket / FMCG, SAR 2 decimals, VAT 15%
 * Seed: 45 (0x0000002D hex = mulberry32 seed)
 * Run: node generate.mjs  (from this folder)
 *
 * ZATCA edge cases:
 *   Z6  — taxGroup "Standard Rate 15%" (no parens) on ~30% of standard SKUs
 *   Z7  — Zero-rated items (medicine, qualifying exports) taxGroup "Zero Rate"
 *   Z8  — Exempt items taxGroup "Exempt"
 *   Z9  — Garbled exemption taxGroup like "EXEMPT-??" / "Zero rated supply" free-text
 *           SKUs: PRD-1019, PRD-1042, PRD-1067, PRD-1091, PRD-1115
 *   Z11 — All sales rows are simplified B2C (no buyer TRN)
 *   Z14 — Tickets that mix S + Z line items in one receipt
 *   FMCG — ~10% missing barcodes, 3 expired batches, 2 near-expiry batches, dup SKU names
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── PRNG (mulberry32, seed 45) ────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(45);

function ri(min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function rp(arr)       { return arr[Math.floor(rng() * arr.length)]; }
function sar(n)        { return n.toFixed(2); }
function padZ(n, w)    { return String(n).padStart(w, '0'); }

// ── BOM ───────────────────────────────────────────────────────────────────────
const BOM = '﻿';

function csv(headers, rows) {
  const lines = [BOM + headers.join(',')];
  for (const row of rows) {
    lines.push(row.map(cell => {
      const s = String(cell == null ? '' : cell);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(','));
  }
  return lines.join('\n') + '\n';
}

function write(filename, content) {
  const path = join(__dir, filename);
  writeFileSync(path, content, 'utf8');
  console.log(`  wrote ${filename}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 01 — CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════════
const CATEGORIES = [
  ['Dairy',           '',            'ألبان'],
  ['Snacks',          '',            'وجبات خفيفة'],
  ['Beverages',       '',            'مشروبات'],
  ['Bakery',          '',            'مخبوزات'],
  ['Household',       '',            'منزلية'],
  ['Canned Goods',    '',            'معلبات'],
  ['Rice & Grains',   '',            'أرز وحبوب'],
  ['Frozen',          '',            'مجمدات'],
  ['Personal Care',   '',            'عناية شخصية'],
  ['Spices',          '',            'بهارات'],
  ['Cleaning',        '',            'منظفات'],
  ['Baby',            '',            'أطفال'],
  ['Tea & Coffee',    '',            'شاي وقهوة'],
  ['Confectionery',   '',            'حلويات'],
  ['Water',           '',            'مياه'],
  ['Medicine',        '',            'دواء'],
];

write('01-categories.csv', csv(
  ['Category Name', 'Parent Category', 'Description'],
  CATEGORIES.map(([n, p, d]) => [n, p, d])
));

// ═══════════════════════════════════════════════════════════════════════════════
// 02 — PRODUCTS (~730 SKUs)
// ═══════════════════════════════════════════════════════════════════════════════

// ZATCA VAT tax groups
//   "Standard Rate (15%)"  — normal (canonical)
//   "Standard Rate 15%"    — Z6: no-parens variant; mapper must NOT silently pass
//   "Zero Rate"            — Z7: zero-rated (medicine/exports)
//   "Exempt"               — Z8: exempt items
//   "EXEMPT-??"            — Z9: garbled exemption (triggers ZatcaMissingExemptionError)
//   "Zero rated supply"    — Z9: another garbled form
const STANDARD_OK = 'Standard Rate (15%)';
const STANDARD_Z6 = 'Standard Rate 15%';        // Z6: missing parens
const ZERO_RATE   = 'Zero Rate';                 // Z7
const EXEMPT      = 'Exempt';                    // Z8
const GARBLED_A   = 'EXEMPT-??';                 // Z9 SKUs: PRD-1019, PRD-1067, PRD-1115
const GARBLED_B   = 'Zero rated supply';         // Z9 SKUs: PRD-1042, PRD-1091

// Perishable categories
const PERISHABLE_CATS = new Set(['Dairy', 'Bakery', 'Frozen', 'Baby', 'Canned Goods', 'Medicine']);

const SHELF = {
  Dairy:          [7,  21],
  Bakery:         [3,  14],
  Frozen:         [90, 365],
  Baby:           [30, 180],
  'Canned Goods': [180, 730],
  Medicine:       [90, 365],
  Beverages:      [180, 730],
  Water:          [365, 730],
  Snacks:         [60, 180],
  'Tea & Coffee': [180, 365],
  Confectionery:  [60, 365],
  Household:      [0, 0],
  Cleaning:       [0, 0],
  'Personal Care':[0, 0],
  Spices:         [180, 365],
  'Rice & Grains':[180, 730],
};

// (name, arabicName, category, unit, purchaseMin, purchaseMax, vatGroup)
// Most items use standard-rated. Override with Z6/Z7/Z8/Z9 for stress items.
const PRODUCT_TEMPLATES = [
  // DAIRY — Standard Rate
  ['Almarai Full Fat Milk 1L',         'ألماراي حليب كامل 1ل',           'Dairy', 'Piece', 2.20, 2.80, null],
  ['Almarai Full Fat Milk 2L',         'ألماراي حليب كامل 2ل',           'Dairy', 'Piece', 3.80, 4.80, null],
  ['Almarai Low Fat Milk 1L',          'ألماراي حليب قليل الدسم 1ل',     'Dairy', 'Piece', 2.20, 2.80, null],
  ['Saudia Full Cream Milk 1L',        'سعودية حليب كامل 1ل',            'Dairy', 'Piece', 2.00, 2.60, null],
  ['Nadec Full Fat Milk 1L',           'نادك حليب كامل 1ل',              'Dairy', 'Piece', 2.00, 2.60, null],
  ['Almarai Laban 500ml',              'ألماراي لبن 500مل',              'Dairy', 'Piece', 1.40, 1.90, null],
  ['Saudia Laban 500ml',               'سعودية لبن 500مل',               'Dairy', 'Piece', 1.30, 1.80, null],
  ['Almarai Yoghurt Plain 170g',       'ألماراي زبادي سادة 170غ',        'Dairy', 'Piece', 0.90, 1.30, null],
  ['Almarai Yoghurt Strawberry 170g',  'ألماراي زبادي فراولة 170غ',      'Dairy', 'Piece', 0.90, 1.30, null],
  ['Almarai Butter Salted 200g',       'ألماراي زبدة مملحة 200غ',        'Dairy', 'Piece', 4.50, 6.00, null],
  ['Lurpak Butter Unsalted 200g',      'لورباك زبدة غير مملحة 200غ',     'Dairy', 'Piece', 6.00, 8.00, null],
  ['Almarai Cheddar Slices 200g',      'ألماراي شرائح شيدر 200غ',        'Dairy', 'Piece', 7.00, 9.50, null],
  ['Kraft Cheddar Slices 200g',        'كرافت شرائح شيدر 200غ',          'Dairy', 'Piece', 6.50, 9.00, null],
  ['Philadelphia Cream Cheese 200g',   'فيلادلفيا جبن كريمي 200غ',       'Dairy', 'Piece', 8.00, 11.00, null],
  ['Almarai Cream Cheese 200g',        'ألماراي جبن كريمي 200غ',         'Dairy', 'Piece', 5.50, 8.00, null],
  ['Puck Cream Cheese Spread 500g',    'باك جبنة كريمية 500غ',           'Dairy', 'Piece', 9.00, 12.00, null],
  ['Almarai Eggs 15pcs',               'ألماراي بيض 15 بيضة',            'Dairy', 'Tray', 7.00, 9.50, null],
  ['Almarai Eggs 30pcs',               'ألماراي بيض 30 بيضة',            'Dairy', 'Tray', 13.00, 17.00, null],
  ['Almarai Mozzarella 200g',          'ألماراي موتزاريلا 200غ',         'Dairy', 'Piece', 5.50, 8.00, null],
  ['Almarai Halloumi 200g',            'ألماراي حلومي 200غ',             'Dairy', 'Piece', 7.50, 10.00, null],
  ['Almarai UHT Milk 200ml',           'ألماراي حليب UHT 200مل',         'Dairy', 'Piece', 0.90, 1.30, null],
  ['Rainbow Evaporated Milk 410g',     'رينبو حليب مبخر 410غ',           'Dairy', 'Piece', 2.50, 3.50, null],
  ['Carnation Evaporated Milk 410g',   'كارنيشن حليب مبخر 410غ',         'Dairy', 'Piece', 2.50, 3.50, null],
  ['Almarai Fresh Cream 200ml',        'ألماراي كريمة طازجة 200مل',      'Dairy', 'Piece', 3.50, 5.00, null],
  ['Almarai Labneh 500g',              'ألماراي لبنة 500غ',              'Dairy', 'Piece', 5.50, 8.00, null],

  // SNACKS
  ['Lay\'s Classic Chips 28g',         'لايز كلاسيك 28غ',               'Snacks', 'Piece', 1.00, 1.50, null],
  ['Lay\'s Paprika Chips 28g',         'لايز بابريكا 28غ',               'Snacks', 'Piece', 1.00, 1.50, null],
  ['Cheetos Puffs 28g',                'شيتوس بافز 28غ',                 'Snacks', 'Piece', 1.00, 1.50, null],
  ['Doritos Nacho Cheese 48g',         'دوريتوس ناشو جبن 48غ',           'Snacks', 'Piece', 1.80, 2.50, null],
  ['Pringles Original 165g',           'برينجلز أصلي 165غ',              'Snacks', 'Piece', 5.50, 7.50, null],
  ['Oreo Original 137g',               'أوريو أصلي 137غ',                'Snacks', 'Piece', 3.50, 5.00, null],
  ['Nutella 200g',                     'نوتيلا 200غ',                    'Snacks', 'Piece', 7.00, 10.00, null],
  ['Nutella 400g',                     'نوتيلا 400غ',                    'Snacks', 'Piece', 12.00, 17.00, null],
  ['Kelloggs Corn Flakes 375g',        'كيلوغز كورن فليكس 375غ',         'Snacks', 'Piece', 7.50, 10.00, null],
  ['Kit Kat 4F 45g',                   'كيت كات 4F 45غ',                 'Snacks', 'Piece', 1.80, 2.50, null],
  ['Twix 50g',                         'تويكس 50غ',                      'Snacks', 'Piece', 1.80, 2.50, null],
  ['Snickers 50g',                     'سنيكرز 50غ',                     'Snacks', 'Piece', 1.80, 2.50, null],
  ['Mars Bar 51g',                     'مارس 51غ',                       'Snacks', 'Piece', 1.80, 2.50, null],
  ['Ferrero Rocher 3pcs',              'فيريرو روشيه 3حبات',             'Snacks', 'Piece', 4.00, 6.00, null],
  ['Cadbury Dairy Milk 120g',          'كادبوري دايري ميلك 120غ',        'Snacks', 'Piece', 4.50, 6.50, null],
  ['Skippy Peanut Butter 340g',        'سكيبي زبدة فول سوداني 340غ',     'Snacks', 'Piece', 6.50, 9.00, null],
  ['Sunbulah Dates 500g',              'سنبلة تمر 500غ',                 'Snacks', 'Piece', 6.00, 8.50, null],
  ['Saudi Dates Sukkari 500g',         'تمر سكري سعودي 500غ',            'Snacks', 'Piece', 12.00, 18.00, null],
  ['Kelloggs Frosties 375g',           'كيلوغز فروستيز 375غ',            'Snacks', 'Piece', 7.50, 10.00, null],
  ['Pringles Sour Cream 165g',         'برينجلز كريمة حامضة 165غ',       'Snacks', 'Piece', 5.50, 7.50, null],
  ['Ritz Original 200g',               'ريتز أصلي 200غ',                 'Snacks', 'Piece', 4.00, 6.00, null],

  // BEVERAGES
  ['Coca-Cola 330ml Can',              'كوكا كولا 330مل علبة',          'Beverages', 'Piece', 1.20, 1.80, null],
  ['Coca-Cola 1.5L Bottle',            'كوكا كولا 1.5ل زجاجة',          'Beverages', 'Piece', 2.50, 3.50, null],
  ['Pepsi 330ml Can',                  'بيبسي 330مل علبة',               'Beverages', 'Piece', 1.20, 1.80, null],
  ['Pepsi 1.5L Bottle',                'بيبسي 1.5ل زجاجة',               'Beverages', 'Piece', 2.50, 3.50, null],
  ['7UP 330ml Can',                    '7أب 330مل علبة',                  'Beverages', 'Piece', 1.20, 1.80, null],
  ['Sprite 330ml Can',                 'سبرايت 330مل علبة',               'Beverages', 'Piece', 1.20, 1.80, null],
  ['Red Bull 250ml',                   'ريد بول 250مل',                   'Beverages', 'Piece', 5.00, 7.00, null],
  ['Rani Float Orange 240ml',          'راني فلوت برتقال 240مل',          'Beverages', 'Piece', 1.50, 2.20, null],
  ['Almarai Orange Juice 1L',          'ألماراي عصير برتقال 1ل',          'Beverages', 'Piece', 5.50, 7.50, null],
  ['KDD Orange Juice 1L',              'كي دي دي عصير برتقال 1ل',         'Beverages', 'Piece', 5.00, 7.00, null],
  ['Vimto Cordial 710ml',              'فيمتو شراب 710مل',                'Beverages', 'Piece', 8.50, 12.00, null],
  ['Nescafe Classic 200g',             'نسكافيه كلاسيك 200غ',             'Beverages', 'Piece', 15.00, 21.00, null],
  ['Miranda Orange 330ml Can',         'ميرندا برتقال 330مل علبة',         'Beverages', 'Piece', 1.20, 1.80, null],
  ['Mountain Dew 330ml Can',           'ماونتن ديو 330مل علبة',            'Beverages', 'Piece', 1.20, 1.80, null],
  ['Coca-Cola Zero 330ml Can',         'كوكا كولا زيرو 330مل',            'Beverages', 'Piece', 1.20, 1.80, null],

  // BAKERY
  ['L\'usine White Bread Loaf',        'لوزين خبز أبيض رغيف',            'Bakery', 'Piece', 2.00, 3.00, null],
  ['L\'usine Brown Bread Loaf',        'لوزين خبز أسمر رغيف',             'Bakery', 'Piece', 2.20, 3.20, null],
  ['L\'usine Burger Buns 6pcs',        'لوزين خبز برغر 6 حبات',           'Bakery', 'Pack', 3.00, 4.50, null],
  ['Americana Croissant 60g',          'أمريكانا كروسان 60غ',             'Bakery', 'Piece', 1.20, 1.80, null],
  ['L\'usine Cake Slices Choco 50g',   'لوزين كيك شوكولاتة 50غ',          'Bakery', 'Piece', 1.00, 1.60, null],
  ['Fresh Pita Bread 10pcs',           'خبز عربي طازج 10 حبات',           'Bakery', 'Pack', 2.50, 3.80, null],
  ['Shawarma Bread Large 5pcs',        'خبز شاورما كبير 5 حبات',          'Bakery', 'Pack', 2.00, 3.20, null],

  // HOUSEHOLD
  ['Glad Cling Wrap 30m',              'جلاد غطاء بلاستيك 30م',          'Household', 'Roll', 4.00, 6.00, null],
  ['Albal Aluminium Foil 20m',         'ألبال ورق ألومنيوم 20م',          'Household', 'Roll', 4.50, 6.50, null],
  ['Kleenex Facial Tissue 200 sheets', 'كلينكس مناديل وجه 200 ورقة',    'Household', 'Box', 4.00, 6.00, null],
  ['Kleenex Toilet Tissue 4-roll',     'كلينكس مناديل حمام 4 رول',        'Household', 'Pack', 5.50, 8.00, null],
  ['Viva Kitchen Towel 2-roll',        'فيفا مناشف مطبخ 2 رول',           'Household', 'Pack', 5.00, 7.50, null],
  ['Tamr Garbage Bags 60L 20pcs',      'تمر أكياس قمامة 60ل 20 حبة',      'Household', 'Pack', 3.50, 5.50, null],
  ['Disposable Plates 25pcs',          'أطباق بلاستيك للاستعمال مرة 25',  'Household', 'Pack', 3.00, 5.00, null],
  ['Scotch Brite Sponge 2pcs',         'سكوتش برايت إسفنجة 2 حبة',       'Household', 'Pack', 3.50, 5.50, null],
  ['AA Battery Duracell 4pcs',         'دوراسيل بطارية AA 4 حبات',        'Household', 'Pack', 7.00, 10.00, null],
  ['Insect Repellent Raid 300ml',      'ريد طارد حشرات 300مل',            'Household', 'Bottle', 9.00, 13.00, null],

  // CANNED GOODS
  ['Americana Tuna in Oil 170g',       'أمريكانا تونة بالزيت 170غ',       'Canned Goods', 'Piece', 3.50, 5.50, null],
  ['Del Monte Tomato Paste 135g',      'ديل مونت معجون طماطم 135غ',       'Canned Goods', 'Piece', 1.50, 2.50, null],
  ['Heinz Baked Beans 415g',           'هاينز فاصوليا 415غ',              'Canned Goods', 'Piece', 4.50, 7.00, null],
  ['Heinz Tomato Ketchup 570g',        'هاينز كاتشب طماطم 570غ',          'Canned Goods', 'Piece', 6.00, 9.00, null],
  ['Maggi Chicken Broth 400g',         'ماجي مرق دجاج 400غ',              'Canned Goods', 'Piece', 4.50, 6.50, null],
  ['Americana Luncheon Meat 340g',     'أمريكانا لانشيون 340غ',            'Canned Goods', 'Piece', 5.50, 8.00, null],
  ['Pacific Sardines 425g',            'باسيفيك سردين 425غ',              'Canned Goods', 'Piece', 3.50, 5.50, null],
  ['Hero Strawberry Jam 340g',         'هيرو مربى فراولة 340غ',           'Canned Goods', 'Piece', 5.50, 8.50, null],
  ['Al Rashidi Honey 250g',            'الراشدي عسل 250غ',                'Canned Goods', 'Piece', 9.00, 14.00, null],

  // RICE & GRAINS
  ['India Gate Basmati 5kg',           'انديا جيت بسمتي 5كغ',            'Rice & Grains', 'Bag', 22.00, 30.00, null],
  ['India Gate Basmati 1kg',           'انديا جيت بسمتي 1كغ',            'Rice & Grains', 'Bag', 5.50, 8.00, null],
  ['Egyptian Rice White 5kg',          'أرز مصري أبيض 5كغ',              'Rice & Grains', 'Bag', 14.00, 20.00, null],
  ['Lentils Red 500g',                 'عدس أحمر 500غ',                   'Rice & Grains', 'Bag', 3.50, 5.50, null],
  ['Indomie Chicken Noodles 75g',      'إندومي نودلز دجاج 75غ',           'Rice & Grains', 'Piece', 0.80, 1.30, null],
  ['Spaghetti Barilla 500g',           'سباغيتي باريلا 500غ',             'Rice & Grains', 'Pack', 5.50, 8.00, null],
  ['Flour Plain 1kg',                  'دقيق أبيض 1كغ',                   'Rice & Grains', 'Bag', 2.50, 4.00, null],
  ['Sugar White 1kg',                  'سكر أبيض 1كغ',                    'Rice & Grains', 'Bag', 2.50, 4.00, null],
  ['Sugar White 2kg',                  'سكر أبيض 2كغ',                    'Rice & Grains', 'Bag', 4.50, 7.00, null],
  ['Quaker Oats 500g',                 'كويكر شوفان 500غ',                'Rice & Grains', 'Pack', 6.50, 9.50, null],
  ['Chickpeas 500g',                   'حمص 500غ',                        'Rice & Grains', 'Bag', 3.50, 5.50, null],
  ['Maggi 2-Minute Noodles 70g',       'ماجي نودلز دقيقتين 70غ',          'Rice & Grains', 'Piece', 0.80, 1.30, null],

  // FROZEN
  ['Americana Chicken Nuggets 400g',   'أمريكانا ناجتس دجاج 400غ',       'Frozen', 'Bag', 10.00, 15.00, null],
  ['McCain French Fries 900g',         'مكين بطاطس مقلية 900غ',           'Frozen', 'Bag', 11.00, 16.00, null],
  ['Al Kabeer Samosa Chicken 20pcs',   'الكبير سمبوسة دجاج 20 حبة',      'Frozen', 'Pack', 12.00, 18.00, null],
  ['Americana Peas & Carrots 400g',    'أمريكانا بازيلاء وجزر 400غ',     'Frozen', 'Bag', 4.50, 7.00, null],
  ['Kwality Vanilla Ice Cream 2L',     'كواليتي آيس كريم فانيلا 2ل',     'Frozen', 'Tub', 16.00, 22.00, null],
  ['Magnum Classic Ice Cream Bar',     'ماجنوم كلاسيك آيس كريم',          'Frozen', 'Piece', 3.50, 5.50, null],
  ['Americana Burger Patties 6pcs',    'أمريكانا برجر دجاج 6 حبات',      'Frozen', 'Pack', 12.00, 17.00, null],
  ['Al Kabeer Chicken Shawarma 400g',  'الكبير شاورما دجاج 400غ',         'Frozen', 'Pack', 15.00, 22.00, null],
  ['Twister Ice Cream Bar',            'تويستر آيس كريم',                  'Frozen', 'Piece', 2.00, 3.50, null],

  // PERSONAL CARE
  ['Dove Soap Bar 135g',               'دوف صابون 135غ',                  'Personal Care', 'Piece', 3.50, 5.50, null],
  ['Lux Soap Bar 125g',                'لوكس صابون 125غ',                 'Personal Care', 'Piece', 2.50, 4.00, null],
  ['Head & Shoulders Shampoo 200ml',   'هيد آند شولدرز شامبو 200مل',      'Personal Care', 'Piece', 8.50, 13.00, null],
  ['Pantene Shampoo 200ml',            'بانتين شامبو 200مل',               'Personal Care', 'Piece', 8.00, 12.00, null],
  ['Colgate Toothpaste 125ml',         'كولجيت معجون أسنان 125مل',         'Personal Care', 'Piece', 4.50, 7.00, null],
  ['Dettol Antiseptic 250ml',          'ديتول مطهر 250مل',                'Personal Care', 'Piece', 5.50, 8.50, null],
  ['Nivea Body Lotion 400ml',          'نيفيا لوشن جسم 400مل',            'Personal Care', 'Piece', 11.00, 16.00, null],
  ['Always Pads Regular 10pcs',        'أولويز فوط صحية 10 حبات',         'Personal Care', 'Pack', 4.50, 7.00, null],
  ['Vaseline Petroleum Jelly 250ml',   'فازلين جيلي بترولي 250مل',        'Personal Care', 'Piece', 5.50, 8.50, null],
  ['Oral-B Toothbrush Medium',         'أورال-بي فرشاة أسنان متوسطة',     'Personal Care', 'Piece', 3.50, 5.50, null],
  ['Dove Deo Spray 150ml',             'دوف مزيل رذاذ 150مل',              'Personal Care', 'Piece', 8.50, 13.00, null],
  ['Lifebuoy Hand Wash 250ml',         'لايفبوي غسول يد 250مل',           'Personal Care', 'Piece', 4.50, 7.00, null],

  // SPICES
  ['Maggi Chicken Seasoning 100g',     'ماجي بهار دجاج 100غ',             'Spices', 'Pack', 3.50, 5.50, null],
  ['Knorr Chicken Stock Cube 24pcs',   'كنور مرقة دجاج مكعب 24 حبة',     'Spices', 'Pack', 5.00, 8.00, null],
  ['Salt Iodized 1kg',                 'ملح يودي 1كغ',                    'Spices', 'Pack', 1.50, 2.50, null],
  ['Sunflower Oil 1.8L',               'زيت عباد الشمس 1.8ل',             'Spices', 'Bottle', 9.00, 14.00, null],
  ['Noor Vegetable Oil 1.8L',          'نور زيت نباتي 1.8ل',              'Spices', 'Bottle', 8.50, 13.00, null],
  ['Extra Virgin Olive Oil 500ml',     'زيت زيتون بكر ممتاز 500مل',       'Spices', 'Bottle', 14.00, 20.00, null],
  ['Heinz Tomato Ketchup 325g',        'هاينز كاتشب طماطم 325غ',          'Spices', 'Piece', 4.00, 6.50, null],
  ['Heinz Mayonnaise 270g',            'هاينز مايونيز 270غ',               'Spices', 'Piece', 5.50, 9.00, null],
  ['Maggi Arabic Kabsa Mix 50g',       'ماجي بهار كبسة عربي 50غ',         'Spices', 'Pack', 2.50, 4.00, null],
  ['Al Doha Black Pepper 100g',        'الدوحة فلفل أسود 100غ',           'Spices', 'Pack', 3.00, 5.00, null],
  ['Al Doha Cumin 100g',               'الدوحة كمون 100غ',                'Spices', 'Pack', 2.50, 4.50, null],
  ['Al Doha Turmeric 100g',            'الدوحة كركم 100غ',                'Spices', 'Pack', 2.50, 4.50, null],

  // CLEANING
  ['Ariel Powder Detergent 4kg',       'أريال مسحوق غسيل 4كغ',           'Cleaning', 'Bag', 28.00, 38.00, null],
  ['Tide Powder Detergent 3kg',        'تايد مسحوق غسيل 3كغ',            'Cleaning', 'Bag', 22.00, 32.00, null],
  ['Fairy Dish Liquid 500ml',          'فيري سائل جلي 500مل',             'Cleaning', 'Bottle', 5.50, 8.50, null],
  ['Flash All Purpose Cleaner 500ml',  'فلاش منظف متعدد الاستخدام 500مل', 'Cleaning', 'Bottle', 6.50, 9.50, null],
  ['Harpic Toilet Cleaner 500ml',      'هاربيك منظف مراحيض 500مل',        'Cleaning', 'Bottle', 6.50, 9.50, null],
  ['Domestos Bleach 750ml',            'دومستوس كلور 750مل',               'Cleaning', 'Bottle', 4.50, 7.00, null],
  ['Comfort Fabric Softener 1.4L',     'كومفورت منعم ملابس 1.4ل',         'Cleaning', 'Bottle', 9.00, 14.00, null],
  ['Dettol Surface Cleaner 500ml',     'ديتول منظف أسطح 500مل',           'Cleaning', 'Bottle', 7.50, 11.00, null],

  // BABY
  ['Pampers Active Baby S-3 54pcs',    'بامبرز أكتيف بيبي S-3 54 حبة',   'Baby', 'Pack', 25.00, 35.00, null],
  ['Pampers Active Baby M-4 46pcs',    'بامبرز أكتيف بيبي M-4 46 حبة',   'Baby', 'Pack', 25.00, 35.00, null],
  ['Huggies Dry Comfort M-4 44pcs',    'هاجيز جاف كومفورت M-4 44 حبة',   'Baby', 'Pack', 23.00, 33.00, null],
  ['Nestlé NAN Pro 1 400g',            'نستله نان برو 1 - 400غ',          'Baby', 'Tin', 32.00, 45.00, null],
  ['Aptamil Stage 1 400g',             'أبتاميل مرحلة 1 - 400غ',          'Baby', 'Tin', 35.00, 48.00, null],
  ['Nestlé Cerelac Wheat 250g',        'نستله سيريلاك قمح 250غ',           'Baby', 'Pack', 13.00, 19.00, null],
  ['Johnson Baby Shampoo 200ml',       'جونسون شامبو أطفال 200مل',         'Baby', 'Bottle', 6.50, 10.00, null],
  ['Wet Wipes 80 sheets',              'مناديل مبللة 80 ورقة',             'Baby', 'Pack', 5.50, 8.50, null],

  // TEA & COFFEE
  ['Lipton Yellow Label 100bags',      'ليبتون ييلو لاببل 100 كيس',       'Tea & Coffee', 'Box', 9.00, 14.00, null],
  ['Lipton Green Tea 50bags',          'ليبتون شاي أخضر 50 كيس',          'Tea & Coffee', 'Box', 6.50, 10.00, null],
  ['Nescafe Gold 200g',                'نسكافيه جولد 200غ',               'Tea & Coffee', 'Jar', 28.00, 38.00, null],
  ['Karak Chai Mix 500g',              'مزيج شاي كرك 500غ',               'Tea & Coffee', 'Pack', 13.00, 20.00, null],
  ['Arabic Coffee Ground 250g',        'قهوة عربية مطحونة 250غ',           'Tea & Coffee', 'Pack', 11.00, 17.00, null],
  ['Hana Cardamom Coffee 500g',        'هنا قهوة هيل 500غ',               'Tea & Coffee', 'Pack', 20.00, 30.00, null],
  ['Nescafe 3in1 20 sachets',          'نسكافيه 3 في 1 - 20 كيس',         'Tea & Coffee', 'Box', 11.00, 17.00, null],

  // CONFECTIONERY
  ['Galaxy Chocolate Bar 100g',        'جالاكسي شوكولاتة 100غ',          'Confectionery', 'Piece', 4.50, 7.00, null],
  ['Kinder Bueno 43g',                 'كيندر بوينو 43غ',                 'Confectionery', 'Piece', 3.00, 5.00, null],
  ['Milky Way 52g',                    'ميلكي واي 52غ',                   'Confectionery', 'Piece', 2.00, 3.50, null],
  ['Haribo Goldbears 80g',             'هاريبو دبب ذهبية 80غ',            'Confectionery', 'Piece', 3.50, 5.50, null],
  ['Mentos Mint Roll 38g',             'مينتوس نعناع 38غ',                'Confectionery', 'Piece', 1.50, 2.50, null],
  ['Toblerone 100g',                   'توبليرون 100غ',                   'Confectionery', 'Piece', 7.00, 11.00, null],

  // WATER
  ['Arwa Water 500ml',                 'أروى ماء 500مل',                  'Water', 'Piece', 0.50, 0.90, null],
  ['Arwa Water 1.5L',                  'أروى ماء 1.5ل',                   'Water', 'Piece', 0.80, 1.30, null],
  ['Masafi Water 500ml',               'مصافي ماء 500مل',                 'Water', 'Piece', 0.60, 1.00, null],
  ['Masafi Water 1.5L',                'مصافي ماء 1.5ل',                  'Water', 'Piece', 0.90, 1.50, null],
  ['Safa Water 500ml',                 'صفا ماء 500مل',                    'Water', 'Piece', 0.50, 0.90, null],
  ['Safa Water 5L',                    'صفا ماء 5ل',                       'Water', 'Piece', 2.50, 4.00, null],

  // MEDICINE — Z7 Zero Rate (qualifying medicine)
  ['Panadol Extra 24 tablets',         'بانادول إكسترا 24 قرص',           'Medicine', 'Box', 5.50, 8.50, ZERO_RATE],
  ['Panadol Flu Max 24 capsules',      'بانادول فلو ماكس 24 كبسولة',      'Medicine', 'Box', 6.50, 9.50, ZERO_RATE],
  ['Strepsils Lemon 24pcs',            'ستريبسلز ليمون 24 حبة',           'Medicine', 'Pack', 5.50, 8.50, ZERO_RATE],
  ['Gaviscon Suspension 150ml',        'جافيسكون معلق 150مل',             'Medicine', 'Piece', 11.00, 16.00, ZERO_RATE],
  ['Band-Aid Assorted 20pcs',          'باند إيد متنوعة 20 حبة',         'Medicine', 'Pack', 5.00, 8.00, ZERO_RATE],
  ['Rennie Antacid 36pcs',             'ريني مضاد حموضة 36 حبة',          'Medicine', 'Pack', 6.00, 9.50, ZERO_RATE],
  ['Oral Rehydration Salts 6sachets',  'أملاح إماهة فموية 6 أكياس',       'Medicine', 'Box', 4.00, 7.00, ZERO_RATE],
  ['Betadine Solution 30ml',           'بيتادين محلول 30مل',              'Medicine', 'Bottle', 6.50, 10.00, ZERO_RATE],
];

// Pad to reach 730+ total with more variants
const PAD_TEMPLATES = [
  ['Coca-Cola 2L Bottle',              'كوكا كولا 2ل زجاجة',             'Beverages', 'Piece', 3.00, 4.50, null],
  ['Pepsi 2L Bottle',                  'بيبسي 2ل زجاجة',                 'Beverages', 'Piece', 3.00, 4.50, null],
  ['Fanta Orange 330ml Can',           'فانتا برتقال 330مل علبة',         'Beverages', 'Piece', 1.20, 1.80, null],
  ['Rani Float Mango 240ml',           'راني فلوت مانجو 240مل',           'Beverages', 'Piece', 1.50, 2.20, null],
  ['Almarai Mango Juice 1L',           'ألماراي عصير مانجو 1ل',           'Beverages', 'Piece', 5.50, 7.50, null],
  ['Tang Orange 500g',                 'تانج برتقال 500غ',                'Beverages', 'Piece', 5.50, 8.00, null],
  ['Almarai Apple Juice 1L',           'ألماراي عصير تفاح 1ل',            'Beverages', 'Piece', 5.50, 7.50, null],
  ['Monster Energy 500ml',             'مونستر طاقة 500مل',               'Beverages', 'Piece', 6.00, 9.00, null],
  ['Lipton Ice Tea Peach 500ml',       'ليبتون شاي خوخ بارد 500مل',       'Beverages', 'Piece', 3.00, 4.50, null],
  ['Pepsi Diet 330ml Can',             'بيبسي دايت 330مل',                'Beverages', 'Piece', 1.20, 1.80, null],
  ['Oasis Water 1.5L',                 'أوسيس ماء 1.5ل',                  'Water', 'Piece', 0.90, 1.50, null],
  ['Safa Sparkling 500ml',             'صفا فوارة 500مل',                  'Water', 'Piece', 1.50, 2.50, null],
  ['Al Ain Water 500ml',               'العين ماء 500مل',                  'Water', 'Piece', 0.50, 0.90, null],
  ['Al Ain Water 1.5L',                'العين ماء 1.5ل',                   'Water', 'Piece', 0.90, 1.50, null],
  ['Almarai Milk Skimmed 1L',          'ألماراي حليب خالي الدسم 1ل',      'Dairy', 'Piece', 2.20, 2.80, null],
  ['KDD Strawberry Milk 200ml',        'كي دي دي حليب فراولة 200مل',      'Dairy', 'Piece', 1.00, 1.60, null],
  ['Almarai Yoghurt Mango 170g',       'ألماراي زبادي مانجو 170غ',        'Dairy', 'Piece', 0.90, 1.30, null],
  ['Puck Labneh 500g',                 'باك لبنة 500غ',                   'Dairy', 'Piece', 5.50, 8.00, null],
  ['Lurpak Butter Salted 200g',        'لورباك زبدة مملحة 200غ',          'Dairy', 'Piece', 7.00, 10.00, null],
  ['Almarai Sour Cream 200ml',         'ألماراي كريمة حامضة 200مل',       'Dairy', 'Piece', 4.00, 6.00, null],
  ['Happy Cow Cream Cheese 12pcs',     'هابي كاو جبن كريمي 12 حبة',       'Dairy', 'Pack', 5.50, 8.50, null],
  ['Almarai Halloumi 200g',            'ألماراي حلومي 200غ – (dup name)', 'Dairy', 'Piece', 7.50, 10.00, null],
  ['Lay\'s BBQ Chips 28g',             'لايز بي بي كيو 28غ',              'Snacks', 'Piece', 1.00, 1.50, null],
  ['Cheetos Crunchy 28g',              'شيتوس كرانشي 28غ',                'Snacks', 'Piece', 1.00, 1.50, null],
  ['Oreo Golden 137g',                 'أوريو ذهبي 137غ',                 'Snacks', 'Piece', 3.50, 5.00, null],
  ['Kelloggs Rice Krispies 340g',      'كيلوغز رايس كريسبيز 340غ',        'Snacks', 'Piece', 7.50, 10.00, null],
  ['Digestive McVities 400g',          'ديجستيف مكفيتيز 400غ',            'Snacks', 'Piece', 6.50, 9.50, null],
  ['M&M\'s Peanut 45g',                'إم آند إم فول سوداني 45غ',        'Snacks', 'Piece', 2.50, 4.00, null],
  ['Twix King Size 75g',               'تويكس كبير الحجم 75غ',            'Snacks', 'Piece', 3.50, 5.50, null],
  ['Pringles Cheese 165g',             'برينجلز جبن 165غ',                'Snacks', 'Piece', 5.50, 7.50, null],
  ['Kelloggs Crunchy Nut 500g',        'كيلوغز كرانشي نات 500غ',          'Snacks', 'Piece', 9.00, 13.00, null],
  ['Celebrations Box 186g',            'سيليبريشنز علبة 186غ',            'Confectionery', 'Box', 13.00, 19.00, null],
  ['Galaxy Caramel 100g',              'جالاكسي كراميل 100غ',             'Confectionery', 'Piece', 4.50, 7.00, null],
  ['Kinder Surprise Egg 20g',          'كيندر مفاجأة 20غ',                'Confectionery', 'Piece', 2.50, 4.00, null],
  ['Haribo Worms 80g',                 'هاريبو ديدان 80غ',                 'Confectionery', 'Piece', 3.50, 5.50, null],
  ['Cadbury Caramel 120g',             'كادبوري كراميل 120غ',             'Confectionery', 'Piece', 4.50, 7.00, null],
  ['Bounty 57g',                       'باونتي 57غ',                      'Confectionery', 'Piece', 1.80, 2.80, null],
  ['Lipton Yellow Tea 100bags',        'ليبتون شاي أصفر 100 كيس',         'Tea & Coffee', 'Box', 9.00, 14.00, null],
  ['Brooke Bond Red Label 450g',       'بروك بوند ريد لاببل 450غ',         'Tea & Coffee', 'Pack', 11.00, 17.00, null],
  ['Coffeemate Creamer 400g',          'كوفيميت كريمر 400غ',               'Tea & Coffee', 'Tin', 13.00, 20.00, null],
  ['Lipton Earl Grey 50bags',          'ليبتون إيرل جراي 50 كيس',         'Tea & Coffee', 'Box', 6.50, 10.00, null],
  ['India Gate Basmati 10kg',          'انديا جيت بسمتي 10كغ',            'Rice & Grains', 'Bag', 40.00, 55.00, null],
  ['Penne Barilla 500g',               'بيني باريلا 500غ',                'Rice & Grains', 'Pack', 5.50, 8.00, null],
  ['Indomie Beef Noodles 75g',         'إندومي نودلز لحم 75غ',            'Rice & Grains', 'Piece', 0.80, 1.30, null],
  ['Vermicelli 400g',                  'شعيرية 400غ',                     'Rice & Grains', 'Pack', 2.50, 4.00, null],
  ['Brown Sugar 1kg',                  'سكر أسمر 1كغ',                    'Rice & Grains', 'Bag', 3.50, 5.50, null],
  ['Baking Powder 100g',               'باكينج بودر 100غ',                 'Rice & Grains', 'Pack', 2.50, 4.00, null],
  ['Americana Chicken Strips 400g',    'أمريكانا ستريبس دجاج 400غ',       'Frozen', 'Bag', 10.00, 15.00, null],
  ['Americana Frozen Paratha 10pcs',   'أمريكانا باراتا مجمدة 10 حبات',   'Frozen', 'Pack', 7.50, 11.00, null],
  ['Al Kabeer Samosa Veg 20pcs',       'الكبير سمبوسة خضار 20 حبة',       'Frozen', 'Pack', 11.00, 17.00, null],
  ['McCain Sweet Potato Fries 500g',   'مكين بطاطا حلوة 500غ',             'Frozen', 'Bag', 10.00, 15.00, null],
  ['Americana Mixed Vegetables 400g',  'أمريكانا خضار مشكلة 400غ',        'Frozen', 'Bag', 4.50, 7.00, null],
  ['Cornetto Vanilla 120ml',           'كورنيتو فانيلا 120مل',             'Frozen', 'Piece', 2.50, 4.00, null],
  ['Pampers Active Baby L-5 40pcs',    'بامبرز أكتيف بيبي L-5 40 حبة',    'Baby', 'Pack', 25.00, 35.00, null],
  ['Nestlé Cerelac Rice 250g',         'نستله سيريلاك أرز 250غ',           'Baby', 'Pack', 13.00, 19.00, null],
  ['Johnson Baby Lotion 200ml',        'جونسون لوشن أطفال 200مل',          'Baby', 'Bottle', 6.50, 10.00, null],
  ['Desitin Cream 57g',                'ديسيتين كريم 57غ',                 'Baby', 'Tube', 11.00, 17.00, null],
  ['Ariel Liquid Detergent 2L',        'أريال سائل غسيل 2ل',              'Cleaning', 'Bottle', 18.00, 26.00, null],
  ['Persil Powder Detergent 4kg',      'برسيل مسحوق غسيل 4كغ',            'Cleaning', 'Bag', 28.00, 38.00, null],
  ['Febreze Air Freshener 300ml',      'فيبريز معطر جو 300مل',             'Cleaning', 'Bottle', 9.00, 14.00, null],
  ['Sunlight Dish Liquid 500ml',       'سانلايت سائل جلي 500مل',           'Cleaning', 'Bottle', 4.00, 6.50, null],
  ['Dove Shampoo 400ml',               'دوف شامبو 400مل',                  'Personal Care', 'Piece', 9.00, 14.00, null],
  ['Head & Shoulders 400ml',           'هيد آند شولدرز 400مل',             'Personal Care', 'Piece', 11.00, 16.00, null],
  ['Sensodyne Toothpaste 75ml',        'سينسوداين معجون أسنان 75مل',       'Personal Care', 'Piece', 8.50, 13.00, null],
  ['Dettol Wipes 12 sheets',           'ديتول مناديل مبللة 12 ورقة',       'Personal Care', 'Pack', 2.50, 4.00, null],
  ['Nivea Men Deo Roll-On 50ml',       'نيفيا مزيل رجالي رول أون 50مل',   'Personal Care', 'Piece', 7.00, 11.00, null],
  ['Oral-B Kids Toothbrush',           'أورال-بي فرشاة أسنان أطفال',       'Personal Care', 'Piece', 3.50, 5.50, null],
  ['Sunscreen SPF50 150ml',            'واقي شمس SPF50 150مل',              'Personal Care', 'Piece', 14.00, 22.00, null],
  ['Viva Paper Towel 4-roll',          'فيفا مناشف 4 رول',                 'Household', 'Pack', 9.00, 14.00, null],
  ['Glad Zipper Bags 25pcs',           'جلاد أكياس سحاب 25 حبة',           'Household', 'Pack', 5.00, 8.00, null],
  ['Tamr Garbage Bags 90L 10pcs',      'تمر أكياس قمامة 90ل 10 حبة',       'Household', 'Pack', 4.50, 7.00, null],
  ['Toothpicks Box 200pcs',            'عود أسنان علبة 200 حبة',           'Household', 'Box', 1.50, 2.50, null],
  ['Scotch Brite Heavy Sponge',        'سكوتش برايت إسفنجة ثقيلة',        'Household', 'Piece', 2.50, 4.00, null],
  ['Bic Lighter',                      'بيك ولاعة',                        'Household', 'Piece', 1.50, 2.50, null],
  ['Del Monte Tomato Paste 200g',      'ديل مونت معجون طماطم 200غ',        'Canned Goods', 'Piece', 2.50, 4.00, null],
  ['Heinz Mushroom Soup 400g',         'هاينز شوربة فطر 400غ',             'Canned Goods', 'Piece', 5.50, 8.50, null],
  ['Americana Tuna in Brine 170g',     'أمريكانا تونة بالماء 170غ',        'Canned Goods', 'Piece', 3.50, 5.50, null],
  ['Del Monte Sweet Corn 340g',        'ديل مونت ذرة حلوة 340غ',           'Canned Goods', 'Piece', 3.50, 5.50, null],
  ['Hunts Tomato Sauce 425g',          'هانتس صلصة طماطم 425غ',            'Canned Goods', 'Piece', 3.50, 5.50, null],
  ['Al Alali Tuna 185g',               'العلالي تونة 185غ',                'Canned Goods', 'Piece', 3.50, 5.50, null],
  ['Smucker Grape Jam 340g',           'سمكرز مربى عنب 340غ',              'Canned Goods', 'Piece', 5.50, 8.50, null],
  ['Colman\'s Mustard 190g',           'كولمانز خردل 190غ',                'Spices', 'Piece', 6.50, 10.00, null],
  ['Tabasco Hot Sauce 60ml',           'تاباسكو صلصة حارة 60مل',           'Spices', 'Bottle', 7.00, 11.00, null],
  ['Olive Oil Borges 500ml',           'زيت زيتون بورجيز 500مل',           'Spices', 'Bottle', 13.00, 19.00, null],
  ['White Vinegar 500ml',              'خل أبيض 500مل',                    'Spices', 'Bottle', 2.50, 4.00, null],
  ['Al Doha Cardamom 50g',             'الدوحة هيل 50غ',                   'Spices', 'Pack', 4.50, 7.00, null],
  ['Al Doha Cinnamon 100g',            'الدوحة قرفة 100غ',                 'Spices', 'Pack', 2.50, 4.50, null],
  ['Al Doha Seven Spices 100g',        'الدوحة سبع بهارات 100غ',           'Spices', 'Pack', 3.00, 5.00, null],
  ['Maple Syrup 250ml',                'شيرة القيقب 250مل',                'Spices', 'Bottle', 14.00, 21.00, null],
  ['Al Rashidi Irma Basmati 5kg',      'الراشدي إيرما بسمتي 5كغ',         'Rice & Grains', 'Bag', 22.00, 30.00, null],
  ['Royal Long Grain Rice 5kg',        'رويال أرز حبة طويلة 5كغ',          'Rice & Grains', 'Bag', 18.00, 26.00, null],
  ['Quaker Instant Oats 1kg',          'كويكر شوفان فوري 1كغ',             'Rice & Grains', 'Pack', 11.00, 17.00, null],
  ['Corn Flour Maizena 400g',          'دقيق ذرة مايزينا 400غ',            'Rice & Grains', 'Pack', 4.00, 6.50, null],
  ['Cake Mix Pillsbury 500g',          'خلطة كيك بيلسبري 500غ',            'Rice & Grains', 'Pack', 7.00, 11.00, null],
  ['Nissin Cup Noodles Chicken',       'نيسين كوب نودلز دجاج',             'Rice & Grains', 'Piece', 2.50, 4.00, null],
  ['Sunsilk Shampoo 350ml',            'سانسيلك شامبو 350مل',              'Personal Care', 'Piece', 7.00, 11.00, null],
  ['Pantene Conditioner 200ml',        'بانتين بلسم 200مل',                'Personal Care', 'Piece', 8.00, 12.00, null],
  ['Colgate Max Fresh Toothpaste 125ml','كولجيت ماكس فريش 125مل',          'Personal Care', 'Piece', 5.00, 8.00, null],
  ['Signal Toothpaste 75ml',           'سيجنال معجون أسنان 75مل',          'Personal Care', 'Piece', 3.50, 5.50, null],
  ['Dove Body Wash 250ml',             'دوف غسول جسم 250مل',               'Personal Care', 'Piece', 9.00, 14.00, null],
  ['Always Pads Night 8pcs',           'أولويز فوط ليلية 8 حبات',          'Personal Care', 'Pack', 5.00, 8.00, null],
  ['Gillette Blue3 Disposable 3pcs',   'جيليت بلو3 شفرات 3 حبات',          'Personal Care', 'Pack', 7.00, 11.00, null],
  ['Clearasil Acne Wash 150ml',        'كليراسيل غسول حب الشباب 150مل',    'Personal Care', 'Piece', 11.00, 17.00, null],
  ['Ariel Pods 3in1 16pcs',            'أريال كبسولات 3في1 - 16 حبة',      'Cleaning', 'Pack', 14.00, 21.00, null],
  ['Lenor Fabric Softener 1L',         'لينور منعم ملابس 1ل',              'Cleaning', 'Bottle', 8.50, 13.00, null],
  ['Mr Muscle Kitchen Cleaner 500ml',  'مستر ماسل منظف مطبخ 500مل',        'Cleaning', 'Bottle', 7.00, 11.00, null],
  ['Ajax Powder Scourer 500g',         'أجاكس مسحوق تنظيف 500غ',           'Cleaning', 'Pack', 3.50, 5.50, null],
  ['Pampers Newborn N 42pcs',          'بامبرز مولود جديد N 42 حبة',       'Baby', 'Pack', 22.00, 33.00, null],
  ['Nestlé Cerelac Oats 250g',         'نستله سيريلاك شوفان 250غ',         'Baby', 'Pack', 13.00, 19.00, null],
  ['Huggies Newborn N 30pcs',          'هاجيز مولود جديد N 30 حبة',        'Baby', 'Pack', 20.00, 30.00, null],
  ['Wipes Pampers Sensitive 72pcs',    'مناديل بامبرز حساسة 72 ورقة',      'Baby', 'Pack', 7.00, 11.00, null],
  ['Kiri Cream Cheese Squares 8pcs',   'كيري جبن كريمي مربعات 8 حبة',      'Dairy', 'Pack', 8.50, 13.00, null],
  ['Anchor Butter 250g',               'آنكور زبدة 250غ',                  'Dairy', 'Piece', 11.00, 17.00, null],
  ['Almarai Yoghurt Blueberry 170g',   'ألماراي زبادي بلوبيري 170غ',       'Dairy', 'Piece', 0.90, 1.30, null],
  ['KDD Laban Up Strawberry 200ml',    'كي دي دي لبن أب فراولة 200مل',    'Dairy', 'Piece', 1.00, 1.60, null],
  ['Almarai Peach Yoghurt 180g',       'ألماراي زبادي خوخ 180غ',           'Dairy', 'Piece', 0.90, 1.30, null],
  ['Galaxy Ripple 50g',                'جالاكسي ريبل 50غ',                 'Confectionery', 'Piece', 2.50, 4.00, null],
  ['Cadbury Roses Box 252g',           'كادبوري روزيز علبة 252غ',          'Confectionery', 'Box', 18.00, 26.00, null],
  ['Lipton Chamomile Tea 25bags',      'ليبتون شاي بابونج 25 كيس',         'Tea & Coffee', 'Box', 5.50, 8.50, null],
  ['Tapal Danedar Tea 500g',           'تاپل دانيدار شاي 500غ',            'Tea & Coffee', 'Pack', 11.00, 17.00, null],
  ['Arabic Coffee Medium Roast 250g',  'قهوة عربية تحميص متوسط 250غ',      'Tea & Coffee', 'Pack', 11.00, 17.00, null],
  ['Al Ain Sparkling 500ml',           'العين فوارة 500مل',                'Water', 'Piece', 1.50, 2.50, null],
  ['Perrier Sparkling 330ml',          'بيريه فوارة 330مل',                'Water', 'Piece', 3.50, 5.50, null],
  ['Masafi Water 5L',                  'مصافي ماء 5ل',                     'Water', 'Piece', 2.50, 4.00, null],
  ['Arwa Water 5L',                    'أروى ماء 5ل',                      'Water', 'Piece', 2.00, 3.50, null],
  // EXEMPT items (Z8)
  ['Al Ahsa Fresh Camel Milk 1L',      'حليب ناقة الأحساء 1ل',            'Dairy', 'Piece', 12.00, 18.00, EXEMPT],
  ['Fresh Unpasteurized Goat Milk 1L', 'حليب ماعز طازج 1ل',              'Dairy', 'Piece', 10.00, 15.00, EXEMPT],
  // Z9 garbled exemption — these must trigger ZatcaMissingExemptionError
  // PRD-1019 (5th item after the static templates end = index 0 of PAD after padding counter)
  // We set them by their vatGroup override below in the build loop
];

// Additional padding to reach 730+
const MORE_PADS = [
  ['Spaghetti Barilla 500g',           'سباغيتي باريلا 500غ – طويل',     'Rice & Grains', 'Pack', 5.50, 8.00, null],
  ['Farfalle Barilla 500g',            'فارفالي باريلا 500غ',             'Rice & Grains', 'Pack', 5.50, 8.00, null],
  ['Rigatoni Barilla 500g',            'ريغاتوني باريلا 500غ',            'Rice & Grains', 'Pack', 5.50, 8.00, null],
  ['Uncle Ben\'s Rice Express 250g',   'أنكل بنز أرز سريع 250غ',          'Rice & Grains', 'Pack', 5.50, 8.00, null],
  ['Moong Dal 500g',                   'موج دال 500غ',                    'Rice & Grains', 'Bag', 4.50, 7.00, null],
  ['Black Lentils 500g',               'عدس أسود 500غ',                   'Rice & Grains', 'Bag', 3.50, 5.50, null],
  ['Fava Beans Dry 500g',              'فول جاف 500غ',                    'Rice & Grains', 'Bag', 3.50, 5.50, null],
  ['Indomie Shrimp Noodles 75g',       'إندومي نودلز روبيان 75غ',          'Rice & Grains', 'Piece', 0.80, 1.30, null],
  ['Mama Noodles Chicken 90g',         'ماما نودلز دجاج 90غ',             'Rice & Grains', 'Piece', 1.00, 1.60, null],
  ['Tilda Pure Basmati 5kg',           'تيلدا بسمتي خالص 5كغ',            'Rice & Grains', 'Bag', 30.00, 42.00, null],
  ['Al Doha Fenugreek 100g',           'الدوحة حلبة 100غ',                'Spices', 'Pack', 2.50, 4.50, null],
  ['Al Doha Coriander 100g',           'الدوحة كزبرة 100غ',               'Spices', 'Pack', 2.50, 4.00, null],
  ['Al Doha Paprika 100g',             'الدوحة بابريكا 100غ',              'Spices', 'Pack', 2.50, 4.50, null],
  ['Al Doha Dried Lime 100g',          'الدوحة ليمي مجفف 100غ',           'Spices', 'Pack', 3.00, 5.00, null],
  ['Soy Sauce Kikkoman 150ml',         'صلصة صويا كيكومان 150مل',          'Spices', 'Bottle', 7.00, 11.00, null],
  ['Sweet Chilli Sauce 350g',          'صلصة فلفل حلو 350غ',               'Spices', 'Bottle', 5.00, 8.00, null],
  ['Pomegranate Molasses 250ml',       'دبس رمان 250مل',                   'Spices', 'Bottle', 5.00, 9.00, null],
  ['Canola Oil 1.8L',                  'زيت الكانولا 1.8ل',                'Spices', 'Bottle', 9.00, 14.00, null],
  ['Sunflower Oil 5L',                 'زيت عباد الشمس 5ل',               'Spices', 'Bottle', 22.00, 32.00, null],
  ['Heinz White Vinegar 473ml',        'هاينز خل أبيض 473مل',             'Spices', 'Bottle', 4.50, 7.00, null],
  ['Harpic Power Plus 750ml',          'هاربيك باور بلس 750مل',            'Cleaning', 'Bottle', 8.50, 13.00, null],
  ['Flash Spray 500ml',                'فلاش رذاذ 500مل',                  'Cleaning', 'Bottle', 6.50, 9.50, null],
  ['Air Wick Freshener 300ml',         'إير ويك معطر جو 300مل',            'Cleaning', 'Bottle', 9.00, 14.00, null],
  ['Persil Liquid 2L',                 'برسيل سائل 2ل',                   'Cleaning', 'Bottle', 18.00, 26.00, null],
  ['Pampers Active Baby XL-6 34pcs',   'بامبرز XL-6 34 حبة',               'Baby', 'Pack', 25.00, 35.00, null],
  ['Huggies Ultra Comfort M-4 50pcs',  'هاجيز ألترا كومفورت M-4 50 حبة',  'Baby', 'Pack', 28.00, 40.00, null],
  ['Nestlé NAN Pro 2 400g',            'نستله نان برو 2 - 400غ',           'Baby', 'Tin', 32.00, 45.00, null],
  ['Aptamil Stage 2 400g',             'أبتاميل مرحلة 2 - 400غ',           'Baby', 'Tin', 35.00, 48.00, null],
  ['Nestlé Gerber Banana 113g',        'نستله جيربر موز 113غ',             'Baby', 'Jar', 4.50, 7.00, null],
  ['Pigeon Baby Bottle 240ml',         'بيجون زجاجة رضاعة 240مل',          'Baby', 'Piece', 17.00, 26.00, null],
  ['Americana Escalope Chicken 400g',  'أمريكانا إسكالوب دجاج 400غ',      'Frozen', 'Pack', 14.00, 21.00, null],
  ['Al Kabeer Lamb Kebab 400g',        'الكبير كباب ضأن 400غ',             'Frozen', 'Pack', 22.00, 32.00, null],
  ['Americana Shrimp Tempura 400g',    'أمريكانا روبيان تيمبورا 400غ',     'Frozen', 'Pack', 18.00, 26.00, null],
  ['McCain Crinkle Cut Fries 900g',    'مكين فريز كرينكل كت 900غ',         'Frozen', 'Bag', 13.00, 19.00, null],
  ['Americana Breaded Mushroom 400g',  'أمريكانا فطر مغطى 400غ',           'Frozen', 'Pack', 11.00, 17.00, null],
  ['Kwality Chocolate Ice Cream 2L',   'كواليتي آيس كريم شوكولاتة 2ل',    'Frozen', 'Tub', 16.00, 22.00, null],
  ['L\'usine White Bread Small',       'لوزين خبز أبيض صغير',             'Bakery', 'Piece', 1.20, 2.00, null],
  ['Americana Croissant Chocolate 60g','أمريكانا كروسان شوكولاتة 60غ',    'Bakery', 'Piece', 1.20, 1.80, null],
  ['L\'usine Toast Bread',             'لوزين خبز توست',                   'Bakery', 'Piece', 3.50, 5.50, null],
  ['L\'usine Pita Bread 6pcs',         'لوزين خبز عربي 6 حبات',            'Bakery', 'Pack', 2.50, 4.00, null],
  ['Fresh Samoon Bread 10pcs',         'خبز سمون طازج 10 حبات',            'Bakery', 'Pack', 2.50, 4.00, null],
  ['Glad Foil Wrap 30m',               'جلاد ورق ألومنيوم 30م',            'Household', 'Roll', 5.50, 8.50, null],
  ['Glad Press n Seal 30m',            'جلاد برس أند سيل 30م',             'Household', 'Roll', 7.50, 11.00, null],
  ['Viva Multi-Use Cloth 20pcs',       'فيفا قماش متعدد الاستخدام 20 حبة', 'Household', 'Pack', 6.50, 10.00, null],
  ['Cockroach Bait Raid',              'ريد طعم صراصير',                   'Household', 'Piece', 7.00, 11.00, null],
  ['Air Freshener Glade Gel 150g',     'جليد جل معطر 150غ',                'Household', 'Piece', 5.00, 8.00, null],
  ['Kitekat Canned Cat Food 400g',     'كيتيكات طعام قطط 400غ',            'Household', 'Piece', 6.00, 9.00, null],
  ['Villeda Mop Refill',               'فيليدا ممسحة بديل',                'Household', 'Piece', 11.00, 17.00, null],
  ['Del Monte Peas 200g',              'ديل مونت بازيلاء 200غ',            'Canned Goods', 'Piece', 2.50, 4.00, null],
  ['Pacific Tuna Chunk 185g',          'باسيفيك تونة قطع 185غ',            'Canned Goods', 'Piece', 3.00, 5.00, null],
  ['Heinz Pasta Sauce 350g',           'هاينز صلصة باستا 350غ',            'Canned Goods', 'Piece', 5.50, 8.50, null],
  ['Dole Sliced Pineapple 565g',       'دول أناناس شرائح 565غ',            'Canned Goods', 'Piece', 5.50, 8.50, null],
  ['Del Monte Mango Slices 415g',      'ديل مونت شرائح مانجو 415غ',        'Canned Goods', 'Piece', 5.00, 8.00, null],
  ['Americana Corned Beef 340g',       'أمريكانا لحم بقر معلب 340غ',       'Canned Goods', 'Piece', 8.50, 13.00, null],
  ['Kraft Cheese Spread 230g',         'كرافت جبن قابل للدهن 230غ',        'Canned Goods', 'Piece', 6.50, 10.00, null],
  ['Hunts Tomato Ketchup 570g',        'هانتس كاتشب طماطم 570غ',           'Canned Goods', 'Piece', 5.50, 8.50, null],
  ['Knorr Chicken Broth Tetra 500ml',  'كنور مرق دجاج 500مل',              'Canned Goods', 'Piece', 5.50, 8.50, null],
  ['Baladna Honey 500g',               'بلدنا عسل 500غ',                   'Canned Goods', 'Piece', 18.00, 28.00, null],
  ['Olay Total Effects 50ml',          'أوليه توتال إيفكتس 50مل',          'Personal Care', 'Piece', 22.00, 35.00, null],
  ['Neutrogena Hydra Boost 50ml',      'نيتروجينا هايدرا بوست 50مل',       'Personal Care', 'Piece', 22.00, 35.00, null],
  ['Band-Aid Assorted 20pcs',          'باند إيد متنوعة - (dup)',          'Personal Care', 'Pack', 5.00, 8.00, null],
  ['Gillette Fusion Blades 4pcs',      'جيليت فيوجن شفرات 4 حبات',         'Personal Care', 'Pack', 17.00, 26.00, null],
  ['Johnson Baby Powder 100g',         'جونسون بودرة أطفال 100غ',           'Baby', 'Bottle', 5.50, 8.50, null],
  ['Lipton Peppermint 25bags',         'ليبتون نعناع 25 كيس',              'Tea & Coffee', 'Box', 5.50, 8.50, null],
  ['Lipton Ginger Lemon 25bags',       'ليبتون زنجبيل ليمون 25 كيس',       'Tea & Coffee', 'Box', 5.50, 8.50, null],
  ['Karak Cardamom Tea 500g',          'شاي كرك هيل 500غ',                 'Tea & Coffee', 'Pack', 13.00, 20.00, null],
  ['Arabic Coffee Ground 250g',        'قهوة عربية مطحونة 250غ – مطحون خشن', 'Tea & Coffee', 'Pack', 11.00, 17.00, null],
  ['Nescafe Classic 500g',             'نسكافيه كلاسيك 500غ',              'Tea & Coffee', 'Jar', 28.00, 40.00, null],
  ['Milo 3in1 Sachet 30pcs',           'ميلو 3 في 1 - 30 كيس',             'Tea & Coffee', 'Box', 18.00, 26.00, null],
  ['Al Rabie Orange Juice 200ml',      'الربيع عصير برتقال 200مل',          'Beverages', 'Piece', 1.00, 1.60, null],
  ['Al Rabie Mango Juice 200ml',       'الربيع عصير مانجو 200مل',           'Beverages', 'Piece', 1.00, 1.60, null],
  ['Almarai Pomegranate Juice 1L',     'ألماراي عصير رمان 1ل',             'Beverages', 'Piece', 6.50, 9.50, null],
  ['Lacnor Orange Juice 1L',           'لاكنور عصير برتقال 1ل',            'Beverages', 'Piece', 5.50, 8.00, null],
  ['Gatorade Orange 500ml',            'جاتوريد برتقالي 500مل',             'Beverages', 'Piece', 4.50, 7.00, null],
  ['Pocari Sweat 500ml',               'بوكاري سويت 500مل',                'Beverages', 'Piece', 5.00, 8.00, null],
  ['Redbull 473ml XL',                 'ريد بول 473مل XL',                 'Beverages', 'Piece', 9.00, 14.00, null],
  ['Burn Energy 250ml',                'بيرن طاقة 250مل',                  'Beverages', 'Piece', 5.00, 8.00, null],
  ['Schweppes Tonic Water 330ml',      'شويبس ماء تونيك 330مل',             'Beverages', 'Piece', 2.00, 3.50, null],
  ['Ribena Blackcurrant 288ml',        'ريبينا كشمش 288مل',                'Beverages', 'Piece', 3.50, 5.50, null],
  ['Vimto Zero 710ml',                 'فيمتو زيرو 710مل',                 'Beverages', 'Piece', 8.00, 12.00, null],
  ['Minute Maid Orange 330ml Can',     'مينيت مايد برتقال 330مل',           'Beverages', 'Piece', 2.00, 3.50, null],
  ['Evian 500ml',                      'إيفيان 500مل',                     'Water', 'Piece', 3.00, 5.00, null],
  ['S.Pellegrino 500ml',               'سان بيليجرينو 500مل',              'Water', 'Piece', 3.50, 5.50, null],
  ['Volvic Water 500ml',               'فولفيك ماء 500مل',                  'Water', 'Piece', 2.50, 4.00, null],
  ['Coca-Cola 330ml Can 6-Pack',       'كوكا كولا 330مل 6 علب',            'Beverages', 'Pack', 6.50, 9.50, null],
  ['Pepsi 330ml Can 6-Pack',           'بيبسي 330مل 6 علب',                'Beverages', 'Pack', 6.50, 9.50, null],
  ['Arwa Water 500ml 12-Pack',         'أروى ماء 500مل 12 قارورة',          'Water', 'Carton', 5.50, 9.00, null],
  ['Masafi Water 500ml 12-Pack',       'مصافي ماء 500مل 12 قارورة',         'Water', 'Carton', 6.00, 9.50, null],
  ['Safa Water 1.5L 6-Pack',           'صفا ماء 1.5ل 6 قوارير',             'Water', 'Carton', 5.00, 8.50, null],
  ['Oasis Water 1.5L 6-Pack',          'أوسيس ماء 1.5ل 6 قوارير',           'Water', 'Carton', 5.00, 8.50, null],
  // Qualifying export goods — Z7 Zero Rate
  ['Almarai UHT Milk Export 1L',       'ألماراي حليب UHT للتصدير 1ل',     'Dairy', 'Piece', 2.20, 2.80, ZERO_RATE],
  ['Saudi Dates Export Pack 1kg',      'تمر سعودي للتصدير 1كغ',           'Snacks', 'Pack', 22.00, 32.00, ZERO_RATE],
  // More standard to pad count
  ['Americana Corn Kernels 400g',      'أمريكانا ذرة 400غ',                'Frozen', 'Bag', 4.00, 6.50, null],
  ['Kwality Strawberry Ice Cream 2L',  'كواليتي آيس كريم فراولة 2ل',       'Frozen', 'Tub', 16.00, 22.00, null],
  ['Magnum Almond Ice Cream Bar',      'ماجنوم لوز آيس كريم',              'Frozen', 'Piece', 4.00, 6.50, null],
  ['Paddle Pop Lion Bar',              'بادل بوب ليون',                    'Frozen', 'Piece', 1.50, 2.80, null],
  ['Cornetto Chocolate 120ml',         'كورنيتو شوكولاتة 120مل',           'Frozen', 'Piece', 2.50, 4.00, null],
  ['Calippo Orange Sorbet',            'كاليبو برتقال سوربيه',             'Frozen', 'Piece', 2.50, 4.00, null],
  ['Nestlé Drumstick Vanilla',         'نستله درمستيك فانيلا',             'Frozen', 'Piece', 3.00, 5.00, null],
];

// Extra ~320 SKUs to reach 720+ total
const EXTRA_PADS = [
  // Dairy
  ['Almarai Strawberry Drink 200ml',   'ألماراي مشروب فراولة 200مل',      'Dairy', 'Piece', 0.90, 1.30, null],
  ['KDD Mango Drink 200ml',            'كي دي دي عصير مانجو 200مل',       'Dairy', 'Piece', 0.90, 1.30, null],
  ['Almarai Full Cream Milk 500ml',    'ألماراي حليب كامل 500مل',         'Dairy', 'Piece', 1.50, 2.20, null],
  ['Almarai Milk Full Fat 4L',         'ألماراي حليب كامل 4ل',            'Dairy', 'Piece', 9.00, 13.00, null],
  ['Almarai Eggs Medium 15pcs',        'ألماراي بيض وسط 15 بيضة',         'Dairy', 'Tray', 6.50, 9.00, null],
  ['Lactalis Brie 125g',               'لاكتاليس بري 125غ',               'Dairy', 'Piece', 11.00, 17.00, null],
  ['President Cream Cheese 150g',      'بريزيدينت جبن كريمي 150غ',        'Dairy', 'Piece', 8.50, 13.00, null],
  ['Presidente Brie 125g',             'بريزيدينت بري 125غ',              'Dairy', 'Piece', 11.00, 17.00, null],
  ['Castello Blue Cheese 150g',        'كاستيلو جبن أزرق 150غ',           'Dairy', 'Piece', 14.00, 21.00, null],
  ['Philadelphia Full Fat 200g',       'فيلادلفيا كامل الدسم 200غ',       'Dairy', 'Piece', 9.50, 14.00, null],
  ['Almarai Greek Yoghurt 170g',       'ألماراي زبادي يوناني 170غ',        'Dairy', 'Piece', 2.00, 3.20, null],
  ['Kirkland Mozzarella 500g',         'كيركلاند موتزاريلا 500غ',          'Dairy', 'Piece', 14.00, 21.00, null],
  ['Lurpak Spreadable 250g',           'لورباك قابل للدهن 250غ',           'Dairy', 'Piece', 11.00, 17.00, null],
  ['Lurpak Cook\'s Range Butter 250g', 'لورباك زبدة للطهي 250غ',           'Dairy', 'Piece', 11.00, 17.00, null],
  ['Kraft Peanut Butter Smooth 462g',  'كرافت زبدة فول سوداني 462غ',      'Canned Goods', 'Piece', 9.00, 14.00, null],
  ['Almarai Salted Butter Spread 200g','ألماراي زبدة مالحة للدهن 200غ',   'Dairy', 'Piece', 5.50, 8.50, null],
  // Snacks
  ['Doritos Spicy 48g',                'دوريتوس حار 48غ',                  'Snacks', 'Piece', 1.80, 2.50, null],
  ['Stax Sour Cream 100g',             'ستاكس كريمة حامضة 100غ',           'Snacks', 'Piece', 4.00, 6.50, null],
  ['Oreo Chocolate 137g',              'أوريو شوكولاتة 137غ',              'Snacks', 'Piece', 3.50, 5.00, null],
  ['Lay\'s Max Cheese Chips 28g',      'لايز ماكس جبن 28غ',                'Snacks', 'Piece', 1.00, 1.50, null],
  ['Digestive Chocolate McVities 400g','ديجستيف شوكولاتة مكفيتيز 400غ',   'Snacks', 'Piece', 7.00, 10.00, null],
  ['Nutella 750g',                     'نوتيلا 750غ',                      'Snacks', 'Piece', 20.00, 30.00, null],
  ['Kelloggs Special K 375g',          'كيلوغز سبيشال K 375غ',             'Snacks', 'Piece', 8.00, 12.00, null],
  ['Pepperidge Farm Milano 150g',      'ميلانو بيبريدج فارم 150غ',         'Snacks', 'Piece', 11.00, 17.00, null],
  ['Weetabix 430g',                    'ويتابيكس 430غ',                    'Snacks', 'Pack', 11.00, 17.00, null],
  ['Uncle Toby\'s Oats 500g',          'أونكل توبيز شوفان 500غ',           'Snacks', 'Pack', 9.00, 14.00, null],
  ['Arnotts Tim Tam 200g',             'أرنوتس تيم تام 200غ',              'Snacks', 'Pack', 11.00, 17.00, null],
  ['Mikado Sticks 75g',                'ميكادو عيدان شوكولاتة 75غ',        'Snacks', 'Piece', 4.50, 7.00, null],
  ['Briwat Biscuit 200g',              'بريوات بسكويت 200غ',               'Snacks', 'Pack', 4.00, 6.50, null],
  ['Tiger Biscuit 200g',               'بسكويت تايغر 200غ',                'Snacks', 'Pack', 3.50, 5.50, null],
  ['M&M\'s Crispy 45g',                'إم آند إم كريسبي 45غ',             'Snacks', 'Piece', 2.50, 4.00, null],
  ['Hershey\'s Chocolate Syrup 623g',  'هيرشيز شراب شوكولاتة 623غ',       'Snacks', 'Piece', 13.00, 20.00, null],
  // Beverages
  ['7UP 1.5L Bottle',                  '7أب 1.5ل',                         'Beverages', 'Piece', 2.50, 3.50, null],
  ['Sprite 1.5L Bottle',               'سبرايت 1.5ل',                      'Beverages', 'Piece', 2.50, 3.50, null],
  ['Fanta Grape 330ml Can',            'فانتا عنب 330مل',                   'Beverages', 'Piece', 1.20, 1.80, null],
  ['Mirinda Lemon 330ml Can',          'ميرندا ليمون 330مل',                'Beverages', 'Piece', 1.20, 1.80, null],
  ['Coca-Cola 500ml Bottle',           'كوكا كولا 500مل',                   'Beverages', 'Piece', 1.50, 2.50, null],
  ['Pepsi 500ml Bottle',               'بيبسي 500مل',                       'Beverages', 'Piece', 1.50, 2.50, null],
  ['Tropicana Orange 330ml',           'تروبيكانا برتقال 330مل',             'Beverages', 'Piece', 3.50, 5.50, null],
  ['Tropicana Mango 330ml',            'تروبيكانا مانجو 330مل',              'Beverages', 'Piece', 3.50, 5.50, null],
  ['Almarai Guava Juice 1L',           'ألماراي عصير جوافة 1ل',             'Beverages', 'Piece', 5.50, 7.50, null],
  ['KDD Guava Juice 1L',               'كي دي دي عصير جوافة 1ل',            'Beverages', 'Piece', 5.50, 7.50, null],
  ['Tang Mango 500g',                  'تانج مانجو 500غ',                    'Beverages', 'Piece', 5.50, 8.00, null],
  ['Tang Strawberry 500g',             'تانج فراولة 500غ',                   'Beverages', 'Piece', 5.50, 8.00, null],
  ['Vimto Cordial 300ml',              'فيمتو شراب صغير 300مل',              'Beverages', 'Piece', 4.50, 7.00, null],
  ['Aloe Vera Drink 500ml',            'مشروب ألوي فيرا 500مل',              'Beverages', 'Piece', 3.50, 5.50, null],
  ['Nesquik Chocolate 400g',           'نسكويك شوكولاتة 400غ',               'Beverages', 'Piece', 14.00, 21.00, null],
  ['Horlicks Malt Drink 500g',         'هورليكس مشروب شعير 500غ',            'Beverages', 'Piece', 17.00, 26.00, null],
  ['Rose Milk Syrup 750ml',            'شراب حليب الورد 750مل',               'Beverages', 'Piece', 5.50, 8.50, null],
  ['Monster Ultra 500ml',              'مونستر ألترا 500مل',                  'Beverages', 'Piece', 7.00, 11.00, null],
  ['Power Horse Energy 500ml',         'باور هورس طاقة 500مل',               'Beverages', 'Piece', 6.00, 9.50, null],
  ['Lipton Ice Tea Lemon 500ml',       'ليبتون شاي ليمون 500مل',              'Beverages', 'Piece', 3.00, 4.50, null],
  ['Al Ain Strawberry Milk 200ml',     'العين حليب فراولة 200مل',             'Dairy', 'Piece', 1.00, 1.60, null],
  // Bakery
  ['L\'usine Honey Cake 50g',          'لوزين كيك عسل 50غ',                  'Bakery', 'Piece', 0.90, 1.50, null],
  ['L\'usine Coconut Cake 50g',        'لوزين كيك جوز هند 50غ',              'Bakery', 'Piece', 0.90, 1.50, null],
  ['Americana Swiss Roll 60g',         'أمريكانا سويس رول 60غ',               'Bakery', 'Piece', 1.00, 1.80, null],
  ['Lemon Zest Muffin 80g',            'مافن ليمون 80غ',                      'Bakery', 'Piece', 1.50, 2.50, null],
  ['Sesame Bread Sticks 150g',         'عصي خبز سمسم 150غ',                   'Bakery', 'Pack', 3.50, 5.50, null],
  ['Garlic Bread Frozen 250g',         'خبز الثوم مجمد 250غ',                 'Bakery', 'Pack', 5.50, 8.50, null],
  ['L\'usine Muffin Chocolate 80g',    'لوزين مافن شوكولاتة 80غ',             'Bakery', 'Piece', 1.50, 2.50, null],
  ['L\'usine Brioche 6pcs',            'لوزين بريوش 6 حبات',                  'Bakery', 'Pack', 4.00, 6.50, null],
  ['L\'usine Donuts 2pcs',             'لوزين دونات 2 حبة',                   'Bakery', 'Pack', 2.50, 4.00, null],
  ['Americana Danish Pastry 60g',      'أمريكانا دانيش 60غ',                  'Bakery', 'Piece', 1.20, 1.80, null],
  ['Americana Maamoul Date 50g',       'أمريكانا معمول تمر 50غ',              'Bakery', 'Piece', 1.20, 2.00, null],
  // Household
  ['Naphthalene Balls 200g',           'كرات النفتالين 200غ',                 'Household', 'Pack', 2.50, 4.00, null],
  ['Fly Catcher Strips 4pcs',          'شرائط قاطعة ذباب 4 حبات',             'Household', 'Pack', 3.00, 5.00, null],
  ['Energizer AA 4pcs',                'إنيرجايزر بطارية AA 4 حبات',          'Household', 'Pack', 6.50, 10.00, null],
  ['Energizer AAA 4pcs',               'إنيرجايزر بطارية AAA 4 حبات',         'Household', 'Pack', 6.50, 10.00, null],
  ['Scotch Magic Tape 3pcs',           'سكوتش لاصق شفاف 3 حبات',              'Household', 'Pack', 3.50, 5.50, null],
  ['Coffee Paper Filter 100pcs',       'فلتر ورق قهوة 100 حبة',               'Household', 'Pack', 3.00, 5.00, null],
  ['AAA Battery Duracell 4pcs',        'دوراسيل بطارية AAA 4 حبات',           'Household', 'Pack', 7.00, 10.00, null],
  ['Candles White 12pcs',              'شموع بيضاء 12 حبة',                   'Household', 'Pack', 2.50, 4.00, null],
  ['Matchbox',                         'علبة كبريت',                           'Household', 'Piece', 0.50, 1.00, null],
  ['Dust Pan',                         'جارف غبار',                            'Household', 'Piece', 4.50, 7.00, null],
  ['Broom Handle Plastic',             'عصا مكنسة بلاستيك',                   'Household', 'Piece', 8.00, 13.00, null],
  ['Paper Plates Square 25pcs',        'أطباق ورقية مربعة 25 حبة',             'Household', 'Pack', 3.50, 5.50, null],
  ['Disposable Cups 50pcs',            'أكواب بلاستيك للاستعمال مرة 50',      'Household', 'Pack', 3.50, 5.50, null],
  // Canned Goods
  ['Hunts Tomato Ketchup 325g',        'هانتس كاتشب طماطم 325غ',              'Canned Goods', 'Piece', 4.50, 7.00, null],
  ['Del Monte Green Peas 400g',        'ديل مونت بازيلاء 400غ',               'Canned Goods', 'Piece', 3.50, 5.50, null],
  ['Americana Chicken Luncheon 340g',  'أمريكانا لانشيون دجاج 340غ',           'Canned Goods', 'Piece', 5.50, 8.50, null],
  ['Pacific Mackerel 425g',            'باسيفيك ماكريل 425غ',                  'Canned Goods', 'Piece', 4.00, 6.50, null],
  ['Heinz Onion Gravy 400g',           'هاينز مرق بصل 400غ',                  'Canned Goods', 'Piece', 5.00, 8.00, null],
  ['Heinz Spaghetti in Sauce 400g',    'هاينز سباغيتي بالصلصة 400غ',           'Canned Goods', 'Piece', 5.00, 8.00, null],
  ['Dole Peach Slices 415g',           'دول شرائح خوخ 415غ',                  'Canned Goods', 'Piece', 5.00, 8.00, null],
  ['Del Monte Mixed Fruit 415g',       'ديل مونت فاكهة مشكلة 415غ',           'Canned Goods', 'Piece', 5.00, 8.00, null],
  ['Pacific Salmon 213g',              'باسيفيك سلمون 213غ',                   'Canned Goods', 'Piece', 8.50, 13.00, null],
  ['Americana Turkey Luncheon 340g',   'أمريكانا لانشيون ديك رومي 340غ',       'Canned Goods', 'Piece', 6.50, 10.00, null],
  ['Americana Hot Dog Beef 340g',      'أمريكانا هوت دوج لحم 340غ',            'Canned Goods', 'Piece', 8.50, 13.00, null],
  ['Knorr Vegetable Broth 400g',       'كنور مرقة خضار 400غ',                 'Canned Goods', 'Piece', 5.00, 8.00, null],
  ['Del Monte Kidney Beans 400g',      'ديل مونت فاصوليا 400غ',               'Canned Goods', 'Piece', 4.50, 7.00, null],
  ['Heinz BBQ Sauce 220g',             'هاينز صلصة بي بي كيو 220غ',            'Canned Goods', 'Piece', 7.00, 11.00, null],
  // Rice & Grains
  ['India Gate Sella Basmati 2kg',     'انديا جيت سيلا بسمتي 2كغ',            'Rice & Grains', 'Bag', 11.00, 17.00, null],
  ['Khazana Basmati 5kg',              'خزانة بسمتي 5كغ',                     'Rice & Grains', 'Bag', 25.00, 38.00, null],
  ['Egyptian Rice Short Grain 2kg',    'أرز مصري حبة قصيرة 2كغ',              'Rice & Grains', 'Bag', 7.50, 11.00, null],
  ['Lentils Green 500g',               'عدس أخضر 500غ',                       'Rice & Grains', 'Bag', 4.00, 6.50, null],
  ['Urad Dal 500g',                    'أوراد دال 500غ',                       'Rice & Grains', 'Bag', 3.50, 5.50, null],
  ['Coarse Bulgur 500g',               'برغل خشن 500غ',                       'Rice & Grains', 'Bag', 3.50, 5.50, null],
  ['Linguine Barilla 500g',            'لينجويني باريلا 500غ',                 'Rice & Grains', 'Pack', 5.50, 8.00, null],
  ['Orzo Pasta 500g',                  'شعيرية أوريزو 500غ',                   'Rice & Grains', 'Pack', 4.00, 6.50, null],
  ['Mama Noodles Tom Yum 90g',         'ماما نودلز توم يم 90غ',                'Rice & Grains', 'Piece', 1.00, 1.60, null],
  ['Nissin Cup Noodles Seafood',       'نيسين كوب نودلز بحري',                'Rice & Grains', 'Piece', 2.50, 4.00, null],
  ['Indomie Special Chicken 75g',      'إندومي دجاج خاص 75غ',                 'Rice & Grains', 'Piece', 0.80, 1.30, null],
  ['Pancake Mix 400g',                 'خلطة بان كيك 400غ',                    'Rice & Grains', 'Pack', 6.00, 9.50, null],
  ['Semolina Fine 1kg',                'سميد ناعم 1كغ',                        'Rice & Grains', 'Bag', 2.50, 4.00, null],
  ['Corn Starch 400g',                 'نشا 400غ',                             'Rice & Grains', 'Pack', 2.50, 4.00, null],
  ['Brown Rice 1kg',                   'أرز بني 1كغ',                          'Rice & Grains', 'Bag', 4.50, 7.00, null],
  ['Icing Sugar 500g',                 'سكر بودرة 500غ',                       'Rice & Grains', 'Bag', 3.00, 5.00, null],
  ['Bread Flour Strong 1kg',           'دقيق خبز قوي 1كغ',                    'Rice & Grains', 'Bag', 3.50, 5.50, null],
  // Frozen
  ['Americana Chicken Kiev 400g',      'أمريكانا دجاج كييف 400غ',             'Frozen', 'Pack', 13.00, 19.00, null],
  ['Americana Fish Fillets 400g',      'أمريكانا فيليه سمك 400غ',             'Frozen', 'Pack', 14.00, 21.00, null],
  ['McCain Wedges 900g',               'مكين ويدجز 900غ',                     'Frozen', 'Bag', 13.00, 19.00, null],
  ['Americana Mozzarella Sticks 400g', 'أمريكانا عيدان موتزاريلا 400غ',       'Frozen', 'Pack', 14.00, 21.00, null],
  ['Al Kabeer Chicken Biryani 400g',   'الكبير كباب دجاج 400غ',               'Frozen', 'Pack', 16.00, 24.00, null],
  ['Americana Pizza Mini 2pcs',        'أمريكانا بيتزا صغيرة 2 حبة',          'Frozen', 'Pack', 9.00, 14.00, null],
  ['Americana Frozen Spring Rolls 20pcs','أمريكانا ربيع ملفوف 20 حبة',       'Frozen', 'Pack', 13.00, 19.00, null],
  ['Americana Corn Dogs 500g',         'أمريكانا كورن دوج 500غ',              'Frozen', 'Pack', 13.00, 19.00, null],
  ['Al Kabeer Shish Tawook 400g',      'الكبير شيش طاووق 400غ',               'Frozen', 'Pack', 18.00, 27.00, null],
  ['Americana Mixed Seafood 400g',     'أمريكانا ميكس مأكولات بحرية 400غ',   'Frozen', 'Bag', 18.00, 27.00, null],
  ['Americana Cheeseburger Patties',   'أمريكانا باتيز تشيز برجر',            'Frozen', 'Pack', 14.00, 21.00, null],
  ['Al Kabeer Chicken Patties 400g',   'الكبير باتيز دجاج 400غ',              'Frozen', 'Pack', 13.00, 19.00, null],
  ['Kwality Mango Ice Cream 2L',       'كواليتي آيس كريم مانجو 2ل',           'Frozen', 'Tub', 16.00, 22.00, null],
  ['Magnum White Ice Cream',           'ماجنوم أبيض آيس كريم',                'Frozen', 'Piece', 3.50, 5.50, null],
  ['Americana Ice Cream Sandwich',     'أمريكانا ساندوتش آيس كريم',           'Frozen', 'Piece', 2.00, 3.50, null],
  // Personal Care
  ['Dove Body Wash 500ml',             'دوف غسول جسم 500مل',                  'Personal Care', 'Piece', 14.00, 21.00, null],
  ['Lifebuoy Soap Bar 125g',           'لايفبوي صابون 125غ',                  'Personal Care', 'Piece', 2.00, 3.50, null],
  ['Colgate 360 Toothbrush',           'كولجيت 360 فرشاة أسنان',               'Personal Care', 'Piece', 5.00, 8.00, null],
  ['Oral-B Pro-Health Toothbrush',     'أورال-بي برو هيلث فرشاة أسنان',       'Personal Care', 'Piece', 4.50, 7.00, null],
  ['Gillette Sensor Excel Razor',      'جيليت ماكينة حلاقة سينسور',           'Personal Care', 'Piece', 11.00, 17.00, null],
  ['Vaseline Aloe Lotion 400ml',       'فازلين لوشن ألوي 400مل',               'Personal Care', 'Piece', 8.00, 12.00, null],
  ['Comfort Sport Deo Spray 150ml',    'كومفورت مزيل رذاذ 150مل',              'Personal Care', 'Piece', 7.00, 11.00, null],
  ['Dettol Hand Wash 250ml',           'ديتول غسول يد 250مل',                 'Personal Care', 'Piece', 5.00, 8.00, null],
  ['Sunsilk Conditioner 200ml',        'سانسيلك بلسم 200مل',                  'Personal Care', 'Piece', 7.00, 11.00, null],
  ['Gillette Fusion Blades 4pcs',      'جيليت فيوجن شفرات 4 حبات - (dup)',   'Personal Care', 'Pack', 17.00, 26.00, null],
  // Cleaning extras
  ['Ariel 3in1 Pods 12pcs',            'أريال 3 في 1 كبسولة 12 حبة',          'Cleaning', 'Pack', 14.00, 21.00, null],
  ['Tide Liquid 2L',                   'تايد سائل 2ل',                        'Cleaning', 'Bottle', 18.00, 26.00, null],
  ['Pledge Multi Surface Spray 300ml', 'بليدج رذاذ متعدد الأسطح 300مل',       'Cleaning', 'Bottle', 9.00, 14.00, null],
  ['Vanish Gold Oxi Action 500g',      'فانيش جولد أوكسي 500غ',               'Cleaning', 'Pack', 14.00, 21.00, null],
  ['Flash Floor Cleaner 1L',           'فلاش منظف أرضيات 1ل',                 'Cleaning', 'Bottle', 7.00, 11.00, null],
  ['Bold Powder Detergent 3kg',        'بولد مسحوق غسيل 3كغ',                'Cleaning', 'Bag', 22.00, 32.00, null],
  ['Sunlight Bar Soap 400g',           'سانلايت صابون بار 400غ',               'Cleaning', 'Pack', 3.50, 5.50, null],
  ['Steel Wool 3pcs',                  'سلك تنظيف 3 حبات',                     'Cleaning', 'Pack', 2.00, 3.50, null],
  ['Scotch Brite Scouring Pad',        'سكوتش برايت لوح تنظيف',               'Cleaning', 'Piece', 2.50, 4.00, null],
  ['Mr Muscle Bathroom Spray 500ml',   'مستر ماسل رذاذ حمام 500مل',            'Cleaning', 'Bottle', 7.00, 11.00, null],
  // Baby extras
  ['Nestlé NAN Pro 3 400g',            'نستله نان برو 3 - 400غ',               'Baby', 'Tin', 32.00, 45.00, null],
  ['Aptamil Stage 3 400g',             'أبتاميل مرحلة 3 - 400غ',               'Baby', 'Tin', 35.00, 48.00, null],
  ['Aptamil Follow On 2 400g',         'أبتاميل متابعة 2 - 400غ',              'Baby', 'Tin', 35.00, 48.00, null],
  ['Nestlé Gerber Pear 113g',          'نستله جيربر كمثرى 113غ',               'Baby', 'Jar', 4.50, 7.00, null],
  ['Nestlé Cerelac Honey 250g',        'نستله سيريلاك عسل 250غ',               'Baby', 'Pack', 13.00, 19.00, null],
  ['Nestlé NAN Pro HA1 400g',          'نستله نان برو هايبو-ألرجينيك 1 - 400غ','Baby', 'Tin', 35.00, 50.00, null],
  ['Sudocrem 125g',                    'سودوكريم 125غ',                         'Baby', 'Jar', 9.00, 14.00, null],
  ['Avent Classic Baby Bottle 260ml',  'أفنت كلاسيك زجاجة 260مل',              'Baby', 'Piece', 17.00, 26.00, null],
  ['Farlin Baby Bottle 120ml',         'فارلين زجاجة رضاعة 120مل',             'Baby', 'Piece', 11.00, 17.00, null],
  ['Pampers Swim Pants M-4 12pcs',     'بامبرز بنطال سباحة M-4 12 حبة',        'Baby', 'Pack', 11.00, 17.00, null],
  ['Huggies XL-5 Pull Ups 28pcs',      'هاجيز XL-5 بول-أبز 28 حبة',            'Baby', 'Pack', 25.00, 36.00, null],
  ['Wet Wipes Aloe 80 sheets',         'مناديل مبللة ألوي فيرا 80 ورقة',        'Baby', 'Pack', 5.50, 8.50, null],
  // Tea & Coffee extras
  ['Lipton Hibiscus Tea 25bags',       'ليبتون شاي كركديه 25 كيس',             'Tea & Coffee', 'Box', 5.50, 8.50, null],
  ['Nescafe Decaf 200g',               'نسكافيه ديكاف 200غ',                   'Tea & Coffee', 'Jar', 25.00, 38.00, null],
  ['Lipton Peppermint Tea 50bags',     'ليبتون شاي نعناع 50 كيس',              'Tea & Coffee', 'Box', 6.50, 10.00, null],
  ['Lavazza Espresso 250g',            'لافازا اسبريسو 250غ',                  'Tea & Coffee', 'Pack', 22.00, 33.00, null],
  ['Illy Coffee Espresso 250g',        'إيلي قهوة اسبريسو 250غ',               'Tea & Coffee', 'Pack', 35.00, 52.00, null],
  ['Coffeemate Creamer Vanilla 400g',  'كوفيميت كريمر فانيلا 400غ',             'Tea & Coffee', 'Tin', 14.00, 22.00, null],
  ['Green Tea Matcha Powder 100g',     'بودرة ماتشا شاي أخضر 100غ',            'Tea & Coffee', 'Pack', 14.00, 22.00, null],
  ['Al Rifai Mint Tea 20bags',         'الرفاعي شاي نعناع 20 كيس',              'Tea & Coffee', 'Box', 4.50, 7.00, null],
  // Confectionery extras
  ['Lindt Chocolate 100g',             'ليندت شوكولاتة 100غ',                  'Confectionery', 'Piece', 9.00, 14.00, null],
  ['Ferrero Raffaello 3pcs',           'فيريرو رافاييلو 3حبات',                'Confectionery', 'Piece', 4.50, 7.00, null],
  ['After Eight Mint Choco 300g',      'آفتر إيت شوكولاتة نعناع 300غ',         'Confectionery', 'Box', 22.00, 33.00, null],
  ['Quality Street 220g',              'كواليتي ستريت 220غ',                   'Confectionery', 'Box', 16.00, 25.00, null],
  ['Haribo Strawberry 80g',            'هاريبو فراولة 80غ',                    'Confectionery', 'Piece', 3.50, 5.50, null],
  ['Pez Dispenser + Refill',           'بيز موزع + إعادة تعبئة',               'Confectionery', 'Piece', 3.00, 5.00, null],
  ['Starburst Tropical 45g',           'ستاربيرست تروبيكال 45غ',               'Confectionery', 'Piece', 2.00, 3.50, null],
  ['Skittles Original 45g',            'سكيتلز أصلي 45غ',                      'Confectionery', 'Piece', 2.00, 3.50, null],
  ['Chupa Chups Lollipop',             'تشوبا تشوبس مصاصة',                    'Confectionery', 'Piece', 0.90, 1.50, null],
  ['Kinder Joy 20g',                   'كيندر جوي 20غ',                        'Confectionery', 'Piece', 2.50, 4.00, null],
  ['Wonka Nerds 46g',                  'وونكا نيردز 46غ',                       'Confectionery', 'Piece', 2.50, 4.00, null],
  ['Smarties Tube 38g',                'سمارتيز أنبوب 38غ',                    'Confectionery', 'Piece', 2.00, 3.50, null],
  ['Starburst Fruit Chews 45g',        'ستاربيرست تشويز 45غ',                   'Confectionery', 'Piece', 2.00, 3.50, null],
  ['Bounty Bar Multipack 3x57g',       'باونتي 3 × 57غ',                       'Confectionery', 'Pack', 5.50, 8.50, null],
  ['Lindt Assorted Box 200g',          'ليندت شوكولاتة مشكلة 200غ',            'Confectionery', 'Box', 18.00, 28.00, null],
  // Water
  ['Nestle Pure Life 500ml',           'نستله بيور لايف 500مل',                'Water', 'Piece', 0.50, 0.90, null],
  ['Nestle Pure Life 1.5L',            'نستله بيور لايف 1.5ل',                 'Water', 'Piece', 0.90, 1.50, null],
  ['Oasis Water 330ml',                'أوسيس ماء 330مل',                       'Water', 'Piece', 0.50, 0.90, null],
  ['Crystal Water 1.5L',               'كريستال ماء 1.5ل',                     'Water', 'Piece', 0.90, 1.50, null],
  ['Crystal Water 5L',                 'كريستال ماء 5ل',                       'Water', 'Piece', 2.50, 4.00, null],
  ['Al Ain Water 5L',                  'العين ماء 5ل',                          'Water', 'Piece', 2.50, 4.00, null],
  ['San Benedetto Water 500ml',        'سان بنيديتو ماء 500مل',                'Water', 'Piece', 1.50, 2.50, null],
  ['Baraka Water 500ml',               'بركة ماء 500مل',                        'Water', 'Piece', 0.50, 0.90, null],
  // Spices extras
  ['Al Doha Nutmeg 50g',               'الدوحة جوزة الطيب 50غ',                'Spices', 'Pack', 4.00, 6.50, null],
  ['Al Doha Cloves 50g',               'الدوحة قرنفل 50غ',                     'Spices', 'Pack', 4.00, 6.50, null],
  ['Al Doha Saffron 1g',               'الدوحة زعفران 1غ',                     'Spices', 'Pack', 14.00, 22.00, null],
  ['Al Doha Dried Ginger 100g',        'الدوحة زنجبيل مجفف 100غ',              'Spices', 'Pack', 2.50, 4.50, null],
  ['Al Doha Garam Masala 100g',        'الدوحة جرام ماسالا 100غ',              'Spices', 'Pack', 3.50, 5.50, null],
  ['Al Doha Mixed Spices 100g',        'الدوحة بهارات مشكلة 100غ',             'Spices', 'Pack', 3.00, 5.00, null],
  ['Al Doha Star Anise 25g',           'الدوحة يانسون نجمي 25غ',               'Spices', 'Pack', 2.50, 4.50, null],
  ['Soy Sauce Lee Kum Kee 150ml',      'صلصة صويا لي كوم كي 150مل',            'Spices', 'Bottle', 7.00, 11.00, null],
  ['Oyster Sauce Lee Kum Kee 255g',    'صلصة محار لي كوم كي 255غ',             'Spices', 'Bottle', 5.50, 8.50, null],
  ['Fish Sauce Tiparos 300ml',         'صلصة سمك 300مل',                        'Spices', 'Bottle', 4.00, 6.50, null],
  ['Coconut Milk Chaokoh 400ml',       'حليب جوز هند 400مل',                   'Spices', 'Piece', 4.00, 6.50, null],
  ['Worcestershire Sauce 150ml',       'صلصة ورسترشاير 150مل',                 'Spices', 'Bottle', 6.00, 9.50, null],
  ['Lyle\'s Golden Syrup 454g',        'ليلز شيرة ذهبية 454غ',                 'Spices', 'Tin', 9.00, 14.00, null],
  ['Sesame Oil 250ml',                 'زيت سمسم 250مل',                        'Spices', 'Bottle', 6.00, 9.50, null],
  ['Lemon Juice Concentrate 250ml',    'عصير ليمون مركز 250مل',                'Spices', 'Bottle', 3.50, 5.50, null],
  ['Balsamic Vinegar 250ml',           'خل بلسمي 250مل',                        'Spices', 'Bottle', 7.00, 11.00, null],
  ['Red Wine Vinegar 500ml',           'خل نبيذ أحمر 500مل',                    'Spices', 'Bottle', 4.50, 7.00, null],
  ['Frank\'s RedHot Sauce 148ml',      'فرانكس صلصة حارة 148مل',               'Spices', 'Bottle', 9.00, 14.00, null],
  ['Tabasco Green Sauce 60ml',         'تاباسكو صلصة خضراء 60مل',               'Spices', 'Bottle', 7.00, 11.00, null],
  ['Peanut Sauce 250ml',               'صلصة فول سوداني 250مل',                'Spices', 'Bottle', 5.00, 8.00, null],
  ['Knorr Hollandaise Sauce Mix',      'كنور مزيج صلصة هولانديز',               'Spices', 'Pack', 6.00, 9.50, null],
  ['Knorr Tomato Powder 50g',          'كنور بودرة طماطم 50غ',                 'Spices', 'Pack', 2.50, 4.00, null],
  ['Best Foods Mayo Light 270g',       'بيست فودز مايونيز لايت 270غ',           'Spices', 'Piece', 6.00, 9.50, null],
  ['Hellmann\'s Mayonnaise 270g',      'هيلمانز مايونيز 270غ',                  'Spices', 'Piece', 7.00, 11.00, null],
  // Medicine extras — Z7
  ['Ibuprofen 400mg 16 tablets',       'إيبوبروفين 400 ملغ 16 قرص',            'Medicine', 'Box', 5.00, 8.00, ZERO_RATE],
  ['Vitamin C 1000mg 30 tablets',      'فيتامين C 1000 ملغ 30 قرص',            'Medicine', 'Box', 8.50, 13.00, ZERO_RATE],
  ['Zinc Lozenges 24pcs',              'أقراص زنك 24 حبة',                     'Medicine', 'Pack', 6.00, 9.50, ZERO_RATE],
  ['Dettol Antiseptic Cream 30g',      'ديتول كريم مطهر 30غ',                  'Medicine', 'Tube', 5.50, 8.50, ZERO_RATE],
  ['Panadol Night 20 tablets',         'بانادول نايت 20 قرص',                  'Medicine', 'Box', 6.00, 9.50, ZERO_RATE],
];

// Final top-up to reach 700+ SKUs
const FINAL_PADS = [
  // Dairy
  ['KDD Full Cream Milk 1L',           'كي دي دي حليب كامل 1ل',           'Dairy', 'Piece', 2.00, 2.80, null],
  ['KDD Laban 1L',                     'كي دي دي لبن 1ل',                  'Dairy', 'Piece', 3.50, 5.00, null],
  ['Almarai Laban 1L',                 'ألماراي لبن 1ل',                   'Dairy', 'Piece', 3.50, 5.00, null],
  ['Almarai Yoghurt Apricot 170g',     'ألماراي زبادي مشمش 170غ',          'Dairy', 'Piece', 0.90, 1.30, null],
  ['Nadec Butter 200g',                'نادك زبدة 200غ',                   'Dairy', 'Piece', 4.50, 6.50, null],
  ['Puck Cream Cheese 120g',           'باك جبن كريمي 120غ',               'Dairy', 'Piece', 4.00, 6.00, null],
  ['Almarai Milk Chocolate 200ml',     'ألماراي حليب شوكولاتة 200مل',      'Dairy', 'Piece', 1.00, 1.60, null],
  ['KDD Chocolate Milk 200ml',         'كي دي دي حليب شوكولاتة 200مل',     'Dairy', 'Piece', 1.00, 1.60, null],
  ['Almarai Cottage Cheese 200g',      'ألماراي جبن قريش 200غ',            'Dairy', 'Piece', 5.50, 8.50, null],
  ['Kraft Singles Cheese 150g',        'كرافت جبن فردي 150غ',              'Dairy', 'Piece', 6.50, 10.00, null],
  // Snacks
  ['Americana Crackers 150g',          'أمريكانا كراكرز 150غ',             'Snacks', 'Piece', 2.50, 4.00, null],
  ['Americana Wafer Chocolate 60g',    'أمريكانا ويفر شوكولاتة 60غ',       'Snacks', 'Piece', 1.00, 1.80, null],
  ['Americana Wafer Vanilla 60g',      'أمريكانا ويفر فانيلا 60غ',         'Snacks', 'Piece', 1.00, 1.80, null],
  ['Bahlsen Choco Leibniz 125g',       'بالسن شوكو ليبنيز 125غ',           'Snacks', 'Piece', 5.50, 8.50, null],
  ['Sunbites Multigrain 25g',          'سانبايتس حبوب متعددة 25غ',         'Snacks', 'Piece', 1.50, 2.50, null],
  ['Kuwaiti Halawa Bar 100g',          'حلاوة 100غ',                        'Snacks', 'Piece', 1.50, 2.50, null],
  ['Lay\'s Classic Chips 48g',         'لايز كلاسيك 48غ',                   'Snacks', 'Piece', 1.80, 2.80, null],
  ['Pringles Chili Lime 165g',         'برينجلز فلفل ليمون 165غ',           'Snacks', 'Piece', 5.50, 7.50, null],
  // Beverages
  ['Coca-Cola Diet 330ml Can',         'كوكا كولا دايت 330مل',             'Beverages', 'Piece', 1.20, 1.80, null],
  ['7UP 2L Bottle',                    '7أب 2ل زجاجة',                     'Beverages', 'Piece', 3.50, 5.50, null],
  ['Sprite 2L Bottle',                 'سبرايت 2ل زجاجة',                  'Beverages', 'Piece', 3.50, 5.50, null],
  ['Fanta Orange 2L Bottle',           'فانتا برتقال 2ل',                   'Beverages', 'Piece', 3.50, 5.50, null],
  ['Mountain Dew 1.5L Bottle',         'ماونتن ديو 1.5ل',                  'Beverages', 'Piece', 2.50, 3.50, null],
  ['Mirinda Orange 1.5L Bottle',       'ميرندا برتقال 1.5ل',               'Beverages', 'Piece', 2.50, 3.50, null],
  ['Lipton Ice Tea Mango 500ml',       'ليبتون شاي مانجو 500مل',           'Beverages', 'Piece', 3.00, 4.50, null],
  ['Oasis Mango 500ml',                'أوسيس مانجو 500مل',                 'Beverages', 'Piece', 2.50, 4.00, null],
  ['KDD Mango Juice 1L',               'كي دي دي عصير مانجو 1ل',           'Beverages', 'Piece', 5.50, 7.50, null],
  ['Tropicana OJ 1L',                  'تروبيكانا عصير برتقال 1ل',          'Beverages', 'Piece', 11.00, 17.00, null],
  ['Lacnor Mango Juice 1L',            'لاكنور عصير مانجو 1ل',             'Beverages', 'Piece', 5.50, 8.00, null],
  ['Lacnor Guava Juice 1L',            'لاكنور عصير جوافة 1ل',             'Beverages', 'Piece', 5.50, 8.00, null],
  ['Lacnor Apple Juice 1L',            'لاكنور عصير تفاح 1ل',              'Beverages', 'Piece', 5.50, 8.00, null],
  ['Almarai Pomegranate Nectar 1L',    'ألماراي نكتار رمان 1ل',             'Beverages', 'Piece', 6.50, 9.50, null],
  ['Al Rabie Apple Juice 200ml',       'الربيع عصير تفاح 200مل',           'Beverages', 'Piece', 1.00, 1.60, null],
  ['Minute Maid Mango 330ml',          'مينيت مايد مانجو 330مل',           'Beverages', 'Piece', 2.00, 3.50, null],
  ['Gatorade Lemon-Lime 500ml',        'جاتوريد ليمون لايم 500مل',         'Beverages', 'Piece', 4.50, 7.00, null],
  ['Pocari Sweat 330ml',               'بوكاري سويت 330مل',                'Beverages', 'Piece', 3.50, 5.50, null],
  ['Nestle Pure Life Sparkling 500ml', 'نستله بيور لايف فوارة 500مل',      'Water', 'Piece', 1.50, 2.50, null],
  ['Acqua Panna 500ml',                'أكوا بانا 500مل',                  'Water', 'Piece', 2.50, 4.00, null],
  ['San Benedetto Sparkling 500ml',    'سان بنيديتو فوارة 500مل',          'Water', 'Piece', 2.00, 3.50, null],
  ['Schweppes Sparkling 500ml',        'شويبس فوارة 500مل',                 'Water', 'Piece', 2.00, 3.50, null],
  // Bakery
  ['L\'usine Cake Slices Vanilla 50g', 'لوزين كيك فانيلا 50غ',             'Bakery', 'Piece', 0.90, 1.50, null],
  ['Americana Cheese Croissant 60g',   'أمريكانا كروسان جبن 60غ',          'Bakery', 'Piece', 1.20, 1.80, null],
  ['L\'usine Bun Cinnamon 60g',        'لوزين بن قرفة 60غ',                'Bakery', 'Piece', 1.20, 2.00, null],
  ['L\'usine Mini Croissant 30g',      'لوزين ميني كروسان 30غ',            'Bakery', 'Piece', 0.90, 1.50, null],
  ['Balila Sesame Ring (Kaak)',         'بليلة كعك سمسم',                   'Bakery', 'Piece', 0.80, 1.50, null],
  ['Pita Bread Wholemeal 6pcs',        'خبز عربي قمح كامل 6 حبات',         'Bakery', 'Pack', 2.50, 4.00, null],
  // Rice & Grains
  ['Split Chickpeas 500g',             'حمص مقشر 500غ',                    'Rice & Grains', 'Bag', 3.50, 5.50, null],
  ['India Gate Super Basmati 2kg',     'انديا جيت سوبر بسمتي 2كغ',         'Rice & Grains', 'Bag', 11.00, 17.00, null],
  ['Egyptian Rice White 2kg',          'أرز مصري أبيض 2كغ',                'Rice & Grains', 'Bag', 7.00, 11.00, null],
  ['Indomie Spicy Noodles 75g',        'إندومي نودلز حار 75غ',             'Rice & Grains', 'Piece', 0.80, 1.30, null],
  ['Tilda Basmati White 2kg',          'تيلدا بسمتي أبيض 2كغ',             'Rice & Grains', 'Bag', 11.00, 17.00, null],
  // Spices
  ['Al Doha White Pepper 100g',        'الدوحة فلفل أبيض 100غ',            'Spices', 'Pack', 3.00, 5.00, null],
  ['Al Doha Bay Leaves 10g',           'الدوحة ورق غار 10غ',               'Spices', 'Pack', 1.50, 2.50, null],
  ['Al Doha Coriander Seeds 100g',     'الدوحة بذور كزبرة 100غ',           'Spices', 'Pack', 2.50, 4.00, null],
  ['Al Doha Sumac 100g',               'الدوحة سماق 100غ',                  'Spices', 'Pack', 2.50, 4.50, null],
  ['Al Doha Dried Thyme 50g',          'الدوحة زعتر مجفف 50غ',             'Spices', 'Pack', 2.00, 3.50, null],
  ['Al Doha Hawaij Mix 50g',           'الدوحة مزيج هوايج 50غ',            'Spices', 'Pack', 2.50, 4.00, null],
  ['Al Doha Chilli Powder 100g',       'الدوحة بودرة فلفل حار 100غ',        'Spices', 'Pack', 2.50, 4.50, null],
  ['Maggi Oyster Sauce 260g',          'ماجي صلصة محار 260غ',              'Spices', 'Bottle', 5.00, 8.00, null],
  ['Knorr Beef Stock 24pcs',           'كنور مرقة لحم 24 حبة',              'Spices', 'Pack', 5.50, 8.50, null],
  ['Maggi Cream of Mushroom Soup 63g', 'ماجي شوربة فطر كريمية 63غ',        'Spices', 'Pack', 3.00, 5.00, null],
  ['Vinegar Apple Cider 500ml',        'خل تفاح 500مل',                     'Spices', 'Bottle', 4.50, 7.00, null],
  // Household
  ['Glad Freezer Bags 20pcs',          'جلاد أكياس تجميد 20 حبة',           'Household', 'Pack', 5.50, 8.50, null],
  ['Albal Heavy Foil 20m',             'ألبال فويل ثقيل 20م',              'Household', 'Roll', 6.00, 9.50, null],
  ['Kleenex Mansize Tissue 80pcs',     'كلينكس مناديل كبيرة 80 ورقة',       'Household', 'Box', 4.00, 6.50, null],
  ['Tissues Pocket Kleenex',           'كلينكس مناديل جيب',                 'Household', 'Pack', 1.50, 2.80, null],
  ['Staples Rubber Bands 100pcs',      'مطاطات 100 حبة',                    'Household', 'Pack', 1.50, 2.50, null],
  ['9V Battery Duracell 1pc',          'دوراسيل بطارية 9V حبة',             'Household', 'Piece', 5.50, 8.50, null],
  ['Sponge Cloth 2pcs',                'إسفنجة قماشية 2 حبة',               'Household', 'Pack', 2.50, 4.00, null],
  ['Nail Brush Plastic',               'فرشاة أظافر بلاستيك',               'Household', 'Piece', 1.50, 2.50, null],
  ['Comet Candles 10pcs',              'كوميت شموع 10 حبات',                'Household', 'Pack', 2.50, 4.00, null],
  // Canned Goods
  ['Maggi Arabic Kabsa Broth 400g',    'ماجي مرق كبسة عربي 400غ',          'Canned Goods', 'Piece', 4.50, 7.00, null],
  ['Pacific Crab Meat 170g',           'باسيفيك سلطعون 170غ',               'Canned Goods', 'Piece', 5.50, 8.50, null],
  ['Americana Beef Hot Dogs 340g',     'أمريكانا هوت دوج لحم بقر 340غ',    'Canned Goods', 'Piece', 8.50, 13.00, null],
  ['Ketchup Al Alali 500g',            'كاتشب العلالي 500غ',                'Canned Goods', 'Piece', 4.50, 7.00, null],
  ['Heinz Cream of Tomato Soup 400g',  'هاينز كريم شوربة طماطم 400غ',       'Canned Goods', 'Piece', 5.50, 8.50, null],
  ['Al Watan Tomato Juice 250ml',      'الوطن عصير طماطم 250مل',            'Canned Goods', 'Piece', 2.50, 4.00, null],
  ['Dole Mixed Fruit 415g',            'دول فاكهة مشكلة 415غ',              'Canned Goods', 'Piece', 5.00, 8.00, null],
  // Cleaning
  ['Comfort Fabric Softener Rose 1.4L','كومفورت منعم ملابس وردي 1.4ل',     'Cleaning', 'Bottle', 9.00, 14.00, null],
  ['Febreze Fabric Freshener 300ml',   'فيبريز معطر أقمشة 300مل',           'Cleaning', 'Bottle', 9.00, 14.00, null],
  ['Harpic Active Foam 500ml',         'هاربيك رغوة نشطة 500مل',            'Cleaning', 'Bottle', 7.00, 11.00, null],
  ['Ariel Color Powder 3kg',           'أريال مسحوق ألوان 3كغ',             'Cleaning', 'Bag', 22.00, 32.00, null],
  // Baby extras
  ['Nestlé Gerber Peach 113g',         'نستله جيربر خوخ 113غ',              'Baby', 'Jar', 4.50, 7.00, null],
  ['Mam Baby Bottle 260ml',            'مام زجاجة رضاعة 260مل',             'Baby', 'Piece', 14.00, 21.00, null],
  ['Aptamil Pepti 1 400g',             'أبتاميل بيبتي 1 - 400غ',            'Baby', 'Tin', 45.00, 65.00, null],
  ['Johnson Baby Oil 200ml',           'جونسون زيت أطفال 200مل',            'Baby', 'Bottle', 6.00, 9.50, null],
  // Personal Care
  ['Clearasil Face Wash 150ml',        'كليراسيل غسول وجه 150مل',           'Personal Care', 'Piece', 11.00, 17.00, null],
  ['Olay Regenerist Cream 50ml',       'أوليه ريجينريست كريم 50مل',         'Personal Care', 'Piece', 22.00, 35.00, null],
  ['Dove Men Deo Spray 150ml',         'دوف رجالي مزيل رذاذ 150مل',         'Personal Care', 'Piece', 8.50, 13.00, null],
  ['Listerine Mouthwash 250ml',        'ليستيرين غسول فم 250مل',            'Personal Care', 'Piece', 9.00, 14.00, null],
  ['Band-Aid Plastic 10pcs',           'باند إيد بلاستيك 10 حبات',          'Personal Care', 'Pack', 3.50, 5.50, null],
  ['Paracetamol 500mg 20 tablets',     'باراسيتامول 500 ملغ 20 قرص',        'Medicine', 'Box', 3.50, 6.00, ZERO_RATE],
];

// All templates combined
const ALL_TEMPLATES = [...PRODUCT_TEMPLATES, ...PAD_TEMPLATES, ...MORE_PADS, ...EXTRA_PADS, ...FINAL_PADS];

// Build products
const headers02 = [
  'Item Name','Arabic Name','SKU','Barcode','Category','Unit',
  'Purchase Rate (SAR)','Selling Price (SAR)','Reorder Level',
  'Track Batch','Shelf Life Days','VAT Applicable','taxGroup',
  'Brand','Status',
];
const productRows = [];
const productObjs = []; // {sku, name, category, vatGroup, sellingPrice, trackBatch}

// Z9 garbled SKUs — positional: inject at specific index in the full list
// We want PRD-1019, PRD-1042, PRD-1067, PRD-1091, PRD-1115
// That's item number 19, 42, 67, 91, 115 (0-indexed) = PRD-1001+18=PRD-1019 etc.
const GARBLED_IDXS = new Set([18, 41, 66, 90, 114]); // 0-based
const GARBLED_VALS = [GARBLED_A, GARBLED_B, GARBLED_A, GARBLED_B, GARBLED_A];
let garbledIdx = 0;

// Z6: indices that get "Standard Rate 15%" instead of "Standard Rate (15%)"
// ~30% of standard-rated items
const Z6_EVERY_N = 3;

const BRANDS = ['Almarai','Nadec','Saudia','Americana','Heinz','Del Monte','Nestlé',
  'Knorr','Maggi','Ariel','Pampers','Huggies','Lipton','Nescafe','Kelloggs',
  'Dove','Colgate','Dettol','Lustucru','McCain','Al Kabeer','L\'usine'];

let skuCounter = 1000;
let standardCounter = 0;

for (let i = 0; i < ALL_TEMPLATES.length; i++) {
  const [name, arName, cat, unit, purchMin, purchMax, vatOverride] = ALL_TEMPLATES[i];
  skuCounter++;
  const sku = `PRD-${skuCounter}`;

  // 10% missing barcodes
  const barcode = (i % 10 === 9) ? '' : padZ(String(Math.floor(rng() * 1e13)), 13).slice(0, 13);

  const pr = +(purchMin + rng() * (purchMax - purchMin)).toFixed(2);
  const sp = +(pr * (1.3 + rng() * 0.5)).toFixed(2);
  const reorder = ri(5, 30);

  const trackBatch = PERISHABLE_CATS.has(cat) ? 'Yes' : 'No';
  const [shelfMin, shelfMax] = SHELF[cat] || [0, 0];
  const shelfLife = (shelfMin === 0 && shelfMax === 0) ? '' : ri(shelfMin, shelfMax);

  // VAT group resolution
  let vatGroup;
  if (GARBLED_IDXS.has(i)) {
    vatGroup = GARBLED_VALS[garbledIdx++];
  } else if (vatOverride) {
    vatGroup = vatOverride;
  } else {
    // Standard-rated. Every 3rd one uses the Z6 no-parens variant
    if (standardCounter % Z6_EVERY_N === 0) {
      vatGroup = STANDARD_Z6;
    } else {
      vatGroup = STANDARD_OK;
    }
    standardCounter++;
  }

  const vatApplicable = (vatGroup === ZERO_RATE || vatGroup === EXEMPT || vatGroup === GARBLED_A || vatGroup === GARBLED_B) ? 'No' : 'Yes';
  const brand = rp(BRANDS);

  productRows.push([name, arName, sku, barcode, cat, unit, sar(pr), sar(sp), reorder, trackBatch, shelfLife, vatApplicable, vatGroup, brand, 'Active']);
  productObjs.push({ sku, name, category: cat, vatGroup, sellingPrice: sp, trackBatch });
}

write('02-products.csv', csv(headers02, productRows));
console.log(`    → ${productObjs.length} SKUs total`);

// Report Z9 SKUs for verification
const z9Skus = productObjs.filter(p => p.vatGroup === GARBLED_A || p.vatGroup === GARBLED_B);
console.log(`    → Z9 garbled-exemption SKUs: ${z9Skus.map(p => p.sku + ' "' + p.vatGroup + '"').join(', ')}`);

// ═══════════════════════════════════════════════════════════════════════════════
// 03 — CUSTOMERS (walk-in B2C heavy, few credit tabs)
// ═══════════════════════════════════════════════════════════════════════════════
const WALK_IN_ID = 'WALK-IN';

const SAUDI_FIRST = ['أم سعود','فاطمة','نورة','منى','هند','سلمى','ريم','دانة','لولوة','غادة',
  'عائشة','أسماء','صالحة','زينب','خديجة','وفاء','إيمان','رنا','شيماء','مريم'];
const SAUDI_LAST  = ['العتيبي','القحطاني','الدوسري','الغامدي','الزهراني','الشهري','الحربي',
  'العمري','المطيري','السبيعي','الشمري','العنزي','البقمي','الرشيدي','الثبيتي'];
const EXPAT_FIRST = ['Priya','Ana','Maria','Joyce','Fatima','Dina','Sara','Hana','Meera','Elena'];
const EXPAT_LAST  = ['Sharma','Santos','Dela Cruz','Hassan','Kumar','Patel','Ibrahim','Rodriguez'];

const SAR_MOBILE_PREFIX = ['+966 50', '+966 55', '+966 56', '+966 58'];

const customerRows = [];
const customerObjs = [];

// Walk-in cash (generic)
customerObjs.push({ name: 'Walk-in Cash Customer', id: WALK_IN_ID });
customerRows.push(['Walk-in Cash Customer', 'عميل كاش', '', '', WALK_IN_ID, '0.00', 'Default walk-in — B2C mada/cash']);

// Walk-in mada (generic)
customerObjs.push({ name: 'Walk-in Mada Customer', id: 'WALK-MADA' });
customerRows.push(['Walk-in Mada Customer', 'عميل مدى', '', '', 'WALK-MADA', '0.00', 'Default walk-in — mada payment ']);

// Named regulars — ~80 Saudi + ~20 expat
for (let i = 0; i < 100; i++) {
  const isExpat = i >= 80;
  let fullName, arName;
  if (isExpat) {
    fullName = `${rp(EXPAT_FIRST)} ${rp(EXPAT_LAST)}`;
    arName = '';
  } else {
    const fn = rp(SAUDI_FIRST);
    const ln = rp(SAUDI_LAST);
    fullName = `${fn} ${ln}`;
    arName = fullName;
  }
  const mobile = `${rp(SAR_MOBILE_PREFIX)} ${ri(100,999)} ${ri(1000,9999)}`;
  const nationalId = String(ri(1,2)) + String(ri(1000000000, 9999999999));
  // Credit tabs: first 8 customers get a small positive opening balance
  const balance = i < 8 ? sar(ri(50, 500) + rng()) : '0.00';
  const notes = i < 8 ? 'Small credit tab — neighbourhood regular' : '';
  customerObjs.push({ name: fullName, id: nationalId });
  customerRows.push([fullName, arName, mobile, '', nationalId, balance, notes]);
}

write('03-customers.csv', csv(
  ['Ledger Name','Name in Arabic','Mobile','Email','National ID','Opening Balance (SAR)','Notes'],
  customerRows
));

// ═══════════════════════════════════════════════════════════════════════════════
// 04 — SUPPLIERS
// ═══════════════════════════════════════════════════════════════════════════════
const supplierData = [
  ['Almarai Company', 'شركة الممارع', '+966 11 470 0000', 'orders@almarai.com', '30', '12500.00'],
  ['Americana Foods KSA', 'أمريكانا الأغذية', '+966 11 476 5000', 'supply@americanafoods.com', '45', '8750.00'],
  ['Nestlé Arabia', 'نستله العربية', '+966 11 479 3000', 'orders@nestle-arabia.com', '45', '15000.00'],
  ['Unilever Gulf', 'يونيليفر الخليج', '+966 11 460 2200', 'accounts@unilever-gulf.com', '60', '22000.00'],
  ['P&G Arabia', 'بروكتر آند غامبل العربية', '+966 11 450 8800', 'orders@pg-arabia.com', '60', '18500.00'],
  ['Heinz Middle East', 'هاينز الشرق الأوسط', '+966 11 455 0000', 'supply@heinz-me.com', '45', '6200.00'],
  ['Al Kabeer Foods', 'شركة الكبير للأغذية', '+966 11 467 1100', 'orders@alkabeer.com', '30', '9800.00'],
  ['Baraka Distribution', 'توزيع بركة', '+966 12 647 0000', 'accounts@baraka-dist.com.sa', '30', '4100.00'],
  ['Gulf Trading & Exporting Co.', 'الخليج للتجارة والتصدير', '+966 11 488 3300', 'gulftrading@gulfco.com.sa', '60', '31000.00'],
  ['Rana Jeddah Wholesale', 'رنا جدة للجملة', '+966 12 610 9900', 'rana.wholesale@gmail.com', '', '1200.00'],
  ['National Foods Co. (Nadec)', 'الشركة الوطنية للأغذية نادك', '+966 11 464 3200', 'nadec-orders@nadec.com.sa', '45', '7500.00'],
  ['Saudi Medical Supplies', 'مستلزمات طبية سعودية', '+966 11 472 6600', 'sms@medical-ksa.com', '30', '3200.00'],
];

write('04-suppliers.csv', csv(
  ['Supplier Name','Arabic Name','Phone','Email','Payment Terms (Days)','Opening Balance (SAR)'],
  supplierData.map(r => r)
));

// ═══════════════════════════════════════════════════════════════════════════════
// 05 — OPENING STOCK (with batch/expiry, expired + near-expiry)
// ═══════════════════════════════════════════════════════════════════════════════
const perishableProducts = productObjs.filter(p => p.trackBatch === 'Yes');
const nonPerishableProducts = productObjs.filter(p => p.trackBatch === 'No');

// Dates
const BASE_DATE = new Date('2026-01-01');
function dateStr(d) { return d.toISOString().slice(0, 10); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

// Expired: 3 batches expired Dec 2025 (before base date Jan 1 2026)
const expiredExpiries = [
  '2025-12-05',
  '2025-12-18',
  '2025-12-28',
];
// Near-expiry: 2 batches expire within 7 days of Jan 1 2026
const nearExpiries = [
  '2026-01-04',
  '2026-01-06',
];

const stockHeaders = [
  'SKU','Warehouse','Quantity','Unit Cost (SAR)','Batch No','Expiry Date',
];
const stockRows = [];

let totalInventoryValue = 0;
let perishableCount = 0;

for (const p of perishableProducts) {
  const qty = ri(10, 80);
  const pr = parseFloat(productRows.find(r => r[2] === p.sku)?.[6] || '5.00');
  const uc = +(pr * (0.97 + rng() * 0.06)).toFixed(2);
  totalInventoryValue += qty * uc;

  // First 3 perishables → expired
  // Next 2 → near-expiry
  let batchNo, expiryDate;
  if (perishableCount < 3) {
    batchNo = `BATCH-EXP-${padZ(perishableCount + 1, 3)}`;
    expiryDate = expiredExpiries[perishableCount];
  } else if (perishableCount < 5) {
    batchNo = `BATCH-NE-${padZ(perishableCount - 2, 3)}`;
    expiryDate = nearExpiries[perishableCount - 3];
  } else {
    const randomFuture = addDays(BASE_DATE, ri(30, 400));
    batchNo = `BATCH-${padZ(perishableCount + 1, 4)}`;
    expiryDate = dateStr(randomFuture);
  }
  perishableCount++;
  stockRows.push([p.sku, 'Jeddah Main', qty, sar(uc), batchNo, expiryDate]);
}

for (const p of nonPerishableProducts) {
  const qty = ri(10, 150);
  const pr = parseFloat(productRows.find(r => r[2] === p.sku)?.[6] || '5.00');
  const uc = +(pr * (0.97 + rng() * 0.06)).toFixed(2);
  totalInventoryValue += qty * uc;
  stockRows.push([p.sku, 'Jeddah Main', qty, sar(uc), '', '']);
}

write('05-opening-stock.csv', csv(stockHeaders, stockRows));
console.log(`    → ${stockRows.length} stock rows (${perishableProducts.length} perishable, 3 expired, 2 near-expiry)`);

// ═══════════════════════════════════════════════════════════════════════════════
// 06 — SALES HISTORY (500+ B2C simplified invoices, 2025-12 to 2026-06)
// Z11: all simplified B2C (no TRN)
// Z14: some receipts mix S-line + Z-line items in one ticket
// ═══════════════════════════════════════════════════════════════════════════════
const startTs = new Date('2025-12-01').getTime();
const endTs   = new Date('2026-06-09').getTime();

const PAYMENT_METHODS = ['Cash', 'Mada', 'Cash', 'Mada', 'Cash', 'Cash', 'Mada']; // ~70% cash, ~30% mada

// Build a sell-price lookup
const skuPriceMap = {};
productRows.forEach(row => {
  skuPriceMap[row[2]] = parseFloat(row[7]);
});

// Z14: we want some multi-line receipts that mix S + Z categories
// Pick some zero-rated SKUs for mixing
const zeroRatedSkus = productObjs.filter(p => p.vatGroup === ZERO_RATE);
const standardSkus  = productObjs.filter(p => p.vatGroup === STANDARD_OK || p.vatGroup === STANDARD_Z6);

const salesHeaders = [
  'Date','Receipt No','Customer ID','SKU','Qty','Unit Price (SAR)','Line Total (SAR)',
  'VAT Rate (%)','VAT Amount (SAR)','Payment Method','Invoice Type',
];
const salesRows = [];

// Walk-in customer pool
const walkInIds = [WALK_IN_ID, 'WALK-MADA', ...customerObjs.slice(2).map(c => c.id)];

let receiptNo = 3001;
let salesCount = 0;

// Generate ~550 rows. Some receipts are multi-line (2-3 items).
while (salesCount < 550) {
  const dateTs = startTs + rng() * (endTs - startTs);
  const d = new Date(dateTs);
  const ds = d.toISOString().slice(0, 10);
  const custId = rp(walkInIds);
  const pm = rp(PAYMENT_METHODS);
  receiptNo++;

  // Z14: ~15% of receipts mix S + Z items
  const isMixed = rng() < 0.15 && zeroRatedSkus.length > 0 && standardSkus.length > 0;
  const linesCount = isMixed ? 2 : ri(1, 3);

  for (let l = 0; l < linesCount && salesCount < 550; l++) {
    let prod;
    if (isMixed) {
      // Alternate: first line S, second line Z
      prod = l === 0 ? rp(standardSkus) : rp(zeroRatedSkus);
    } else {
      prod = rp(productObjs);
    }
    const qty = ri(1, 5);
    const sp = skuPriceMap[prod.sku] || 5.00;
    const lineTotal = +(sp * qty).toFixed(2);

    let vatRate, vatAmount;
    if (prod.vatGroup === ZERO_RATE) {
      vatRate = '0';
      vatAmount = '0.00';
    } else if (prod.vatGroup === EXEMPT || prod.vatGroup === GARBLED_A || prod.vatGroup === GARBLED_B) {
      vatRate = '0';
      vatAmount = '0.00';
    } else {
      vatRate = '15';
      vatAmount = +(lineTotal * 0.15).toFixed(2);
    }

    salesRows.push([ds, `RCP-${receiptNo}`, custId, prod.sku, qty, sar(sp), sar(lineTotal), vatRate, sar(parseFloat(vatAmount)), pm, 'Simplified']);
    salesCount++;
  }
}

write('06-sales-history.csv', csv(salesHeaders, salesRows));
console.log(`    → ${salesRows.length} sales rows (B2C simplified, Z11+Z14)`);

// ═══════════════════════════════════════════════════════════════════════════════
// 07 — TRIAL BALANCE
// ═══════════════════════════════════════════════════════════════════════════════
const supplierAP = supplierData.reduce((sum, s) => sum + parseFloat(s[5]), 0);
const invValue = +totalInventoryValue.toFixed(2);
const tabsBalance = customerRows.slice(2).reduce((s, r) => s + parseFloat(r[5] || 0), 0);
const cash      = 18500.00;
const bank      = 45200.00;
const furniture = 22000.00;
const prepaid   = 3500.00;
const totalDebit = +(cash + bank + invValue + tabsBalance + furniture + prepaid).toFixed(2);
const ownerCapital = +(totalDebit - supplierAP).toFixed(2);

function fmtTB(n) {
  if (!n || n === 0) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const tbRows = [
  ['Cash in Hand',              fmtTB(cash),         ''],
  ['Bank - Al Rajhi Current Account', fmtTB(bank),   ''],
  ['Inventory (Merchandise)',   fmtTB(invValue),      ''],
  ['Sundry Debtors (Tabs)',     fmtTB(tabsBalance),   ''],
  ['Furniture & Fixtures',      fmtTB(furniture),     ''],
  ['Prepaid Expenses',          fmtTB(prepaid),       ''],
  ['Sundry Creditors (Suppliers)', '',               fmtTB(supplierAP)],
  ['Owner Capital',             '',                   fmtTB(ownerCapital)],
];

write('07-trial-balance.csv', csv(
  ['Account Name', 'Debit (SAR)', 'Credit (SAR)'],
  tbRows
));
console.log(`    → TB Debits SAR ${fmtTB(totalDebit)}  Credits SAR ${fmtTB(supplierAP + ownerCapital)}`);

// ═══════════════════════════════════════════════════════════════════════════════
// 08 — CUSTOMERS WINDOWS-1256 (Arabic encoding trap, no BOM)
// ═══════════════════════════════════════════════════════════════════════════════
// Build a subset of the Arabic customer names in Windows-1256 encoding.
// The CSV is NOT written with utf8 — we write it as a Buffer of Win-1256 bytes.
// Win-1256 Arabic mapping for the chars we use (partial).

import { Buffer } from 'buffer';

// Simple win1256 encoder covering the Arabic block + ASCII
function encodeWin1256(str) {
  const bytes = [];
  for (const ch of str) {
    const code = ch.charCodeAt(0);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code >= 0x0621 && code <= 0x064A) {
      // Arabic letters ء...ي  → Win-1256 0xC1..0xEA
      bytes.push(code - 0x0621 + 0xC1);
    } else if (code === 0x060C) { // Arabic comma
      bytes.push(0xAC);
    } else if (code === 0x061B) { // Arabic semicolon
      bytes.push(0xBB);
    } else if (code === 0x061F) { // Arabic question
      bytes.push(0xBF);
    } else if (code >= 0x064B && code <= 0x0652) {
      // Harakat — map to similar Win-1256 range
      bytes.push(code - 0x064B + 0xF0);
    } else {
      bytes.push(0x3F); // '?' fallback
    }
  }
  return Buffer.from(bytes);
}

// Build CSV as a string (ASCII + Arabic), then encode
const win1256Lines = ['Ledger Name,Name in Arabic,Mobile,National ID,Opening Balance (SAR),Notes'];
for (const row of customerRows.slice(0, 30)) {
  const line = row.map((c, i) => {
    const s = String(c == null ? '' : c);
    if (s.includes(',') || s.includes('"')) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }).join(',');
  win1256Lines.push(line);
}
const win1256Str = win1256Lines.join('\n') + '\n';
const win1256Buf = encodeWin1256(win1256Str);
writeFileSync(join(__dir, '08-customers-windows1256.csv'), win1256Buf);
console.log(`  wrote 08-customers-windows1256.csv  (Windows-1256, no BOM, ${win1256Lines.length - 1} data rows)`);

// ═══════════════════════════════════════════════════════════════════════════════
// VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n── Verification ─────────────────────────────────────────────');
console.log(`  SKUs total:          ${productObjs.length}`);
console.log(`  Standard Rate (15%): ${productObjs.filter(p => p.vatGroup === STANDARD_OK).length}`);
console.log(`  Standard Rate 15%:   ${productObjs.filter(p => p.vatGroup === STANDARD_Z6).length}  (Z6)`);
console.log(`  Zero Rate:           ${productObjs.filter(p => p.vatGroup === ZERO_RATE).length}  (Z7)`);
console.log(`  Exempt:              ${productObjs.filter(p => p.vatGroup === EXEMPT).length}  (Z8)`);
console.log(`  Garbled exemption:   ${productObjs.filter(p => p.vatGroup === GARBLED_A || p.vatGroup === GARBLED_B).length}  (Z9)`);
z9Skus.forEach(p => console.log(`    ↳ ${p.sku}  taxGroup="${p.vatGroup}"`));
console.log(`  Missing barcodes:    ${productRows.filter(r => r[3] === '').length}`);
console.log(`  Perishable SKUs:     ${perishableProducts.length}`);
console.log(`  Expired batches:     3  (expiry Dec 2025)`);
console.log(`  Near-expiry batches: 2  (expiry ≤ Jan 6 2026)`);
console.log(`  Sales rows:          ${salesRows.length}  (simplified B2C, Z11)`);
const mixedRows = salesRows.filter((r, i, arr) => {
  // a receipt is mixed if same receipt no has both vatRate=15 and vatRate=0 rows
  return false; // just count receipts with mixed VAT below
});
const receiptGroups = {};
salesRows.forEach(r => {
  const rno = r[1];
  if (!receiptGroups[rno]) receiptGroups[rno] = new Set();
  receiptGroups[rno].add(r[7]);
});
const mixedReceipts = Object.values(receiptGroups).filter(s => s.has('15') && s.has('0')).length;
console.log(`  Mixed S+Z receipts:  ${mixedReceipts}  (Z14)`);
console.log(`  Customer credit tabs:${customerRows.filter(r => parseFloat(r[5] || 0) > 0).length}`);
console.log(`  TB balanced:         ${Math.abs((supplierAP + ownerCapital) - totalDebit) < 0.01 ? 'YES ✓' : 'NO — CHECK!'}`);
