/**
 * generate.mjs — Umm Faisal Baqala test-data fixture generator
 * Kuwait grocery / FMCG, KWD 3 decimals, no VAT
 * Run: node generate.mjs  (from this folder)
 *
 * Uses mulberry32 PRNG with fixed seed for reproducibility.
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

// ── PRNG ──────────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xABCD1234);

function ri(min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function rp(min, max) { return +(rng() * (max - min) + min).toFixed(3); }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function kwd(n) { return n.toFixed(3); }

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
  ['Dairy',           '',       'ألبان'],
  ['Snacks',          '',       'وجبات خفيفة'],
  ['Beverages',       '',       'مشروبات'],
  ['Bakery',          '',       'مخبوزات'],
  ['Household',       '',       'منزلية'],
  ['Canned Goods',    '',       'معلبات'],
  ['Rice & Grains',   '',       'أرز وحبوب'],
  ['Frozen',          '',       'مجمدات'],
  ['Personal Care',   '',       'عناية شخصية'],
  ['Spices',          '',       'بهارات وتوابل'],
  ['Cleaning',        '',       'منظفات'],
  ['Baby',            '',       'أطفال'],
  ['Tea & Coffee',    '',       'شاي وقهوة'],
  ['Confectionery',   '',       'حلويات'],
  ['Water',           '',       'مياه'],
];

function buildCategories() {
  const rows = CATEGORIES.map(([name, parent, desc]) => [name, parent, desc]);
  return csv(['Category Name', 'Parent Category', 'Description'], rows);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 02 — PRODUCTS (~800 SKUs)
// ═══════════════════════════════════════════════════════════════════════════════

// Perishable categories (Track Batch = Yes)
const PERISHABLE_CATS = new Set(['Dairy', 'Bakery', 'Frozen', 'Baby', 'Canned Goods']);

// Category → shelf life days range
const SHELF = {
  Dairy:          [7,  21],
  Bakery:         [3,  14],
  Frozen:         [90, 365],
  Baby:           [30, 180],
  'Canned Goods': [180, 730],
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

// (name, arabicName, category, unit, purchaseMin, purchaseMax)
const PRODUCT_TEMPLATES = [
  // DAIRY
  ['Almarai Full Fat Milk 1L',       'ألماراي حليب كامل الدسم 1ل',   'Dairy', 'Piece', 0.350, 0.500],
  ['Almarai Full Fat Milk 2L',       'ألماراي حليب كامل الدسم 2ل',   'Dairy', 'Piece', 0.600, 0.800],
  ['Almarai Low Fat Milk 1L',        'ألماراي حليب قليل الدسم 1ل',   'Dairy', 'Piece', 0.350, 0.500],
  ['KDD Full Cream Milk 1L',         'كي دي دي حليب كامل 1ل',         'Dairy', 'Piece', 0.320, 0.450],
  ['KDD Chocolate Milk 200ml',       'كي دي دي حليب شوكولاتة 200مل', 'Dairy', 'Piece', 0.100, 0.180],
  ['KDD Laban 500ml',                'كي دي دي لبن 500مل',            'Dairy', 'Piece', 0.180, 0.280],
  ['Almarai Laban 500ml',            'ألماراي لبن 500مل',             'Dairy', 'Piece', 0.180, 0.280],
  ['Almarai Yoghurt Plain 170g',     'ألماراي زبادي سادة 170غ',       'Dairy', 'Piece', 0.120, 0.200],
  ['Almarai Yoghurt Strawberry 170g','ألماراي زبادي فراولة 170غ',     'Dairy', 'Piece', 0.130, 0.220],
  ['Nadec Full Fat Milk 1L',         'نادك حليب كامل 1ل',             'Dairy', 'Piece', 0.300, 0.440],
  ['Nadec Butter 200g',              'نادك زبدة 200غ',                'Dairy', 'Piece', 0.600, 0.850],
  ['Almarai Butter 200g',            'ألماراي زبدة 200غ',             'Dairy', 'Piece', 0.620, 0.880],
  ['Almarai Cheddar Slices 200g',    'ألماراي شرائح شيدر 200غ',       'Dairy', 'Piece', 0.900, 1.300],
  ['Kraft Cheddar Slices 200g',      'كرافت شرائح شيدر 200غ',         'Dairy', 'Piece', 0.850, 1.200],
  ['Almarai Cream Cheese 200g',      'ألماراي جبن كريمي 200غ',        'Dairy', 'Piece', 0.700, 1.000],
  ['Philadelphia Cream Cheese 200g', 'فيلادلفيا جبن كريمي 200غ',      'Dairy', 'Piece', 1.100, 1.500],
  ['Almarai Fresh Cream 200ml',      'ألماراي كريمة طازجة 200مل',     'Dairy', 'Piece', 0.450, 0.650],
  ['Lurpak Butter Salted 200g',      'لورباك زبدة مملحة 200غ',        'Dairy', 'Piece', 1.000, 1.400],
  ['Lurpak Butter Unsalted 200g',    'لورباك زبدة غير مملحة 200غ',    'Dairy', 'Piece', 1.000, 1.400],
  ['Puck Cream Cheese Spread 500g',  'باك جبنة كريمية 500غ',          'Dairy', 'Piece', 1.200, 1.700],
  ['Almarai Eggs 15pcs',             'ألماراي بيض 15 بيضة',           'Dairy', 'Tray', 1.000, 1.500],
  ['Almarai Eggs 30pcs',             'ألماراي بيض 30 بيضة',           'Dairy', 'Tray', 1.800, 2.500],
  ['KDD Strawberry Milk 200ml',      'كي دي دي حليب فراولة 200مل',    'Dairy', 'Piece', 0.100, 0.180],
  ['KDD Mango Drink 200ml',          'كي دي دي عصير مانجو 200مل',     'Dairy', 'Piece', 0.100, 0.180],
  ['Almarai Strawberry Drink 200ml', 'ألماراي مشروب فراولة 200مل',    'Dairy', 'Piece', 0.100, 0.180],
  ['Almarai Full Cream Milk 500ml',  'ألماراي حليب كامل 500مل',       'Dairy', 'Piece', 0.200, 0.300],
  ['Borden Evaporated Milk 410g',    'بوردن حليب مبخر 410غ',          'Dairy', 'Piece', 0.300, 0.450],
  ['Carnation Evaporated Milk 410g', 'كارنيشن حليب مبخر 410غ',        'Dairy', 'Piece', 0.300, 0.450],
  ['Rainbow Evaporated Milk 170g',   'رينبو حليب مبخر 170غ',          'Dairy', 'Piece', 0.150, 0.250],
  ['Almarai Mozzarella 200g',        'ألماراي موتزاريلا 200غ',         'Dairy', 'Piece', 0.800, 1.100],

  // SNACKS
  ['Lay\'s Classic Chips 28g',       'لايز كلاسيك 28غ',               'Snacks', 'Piece', 0.080, 0.150],
  ['Lay\'s Paprika Chips 28g',       'لايز بابريكا 28غ',               'Snacks', 'Piece', 0.080, 0.150],
  ['Cheetos Puffs 28g',              'شيتوس بافز 28غ',                 'Snacks', 'Piece', 0.080, 0.150],
  ['Pringles Original 165g',         'برينجلز أصلي 165غ',              'Snacks', 'Piece', 0.700, 1.000],
  ['Pringles Sour Cream 165g',       'برينجلز كريمة حامضة 165غ',       'Snacks', 'Piece', 0.700, 1.000],
  ['Oreo Original 137g',             'أوريو أصلي 137غ',                'Snacks', 'Piece', 0.400, 0.600],
  ['Oreo Chocolate 137g',            'أوريو شوكولاتة 137غ',             'Snacks', 'Piece', 0.400, 0.600],
  ['Digestive McVities 400g',        'ديجستيف مكفيتيز 400غ',           'Snacks', 'Piece', 0.700, 1.000],
  ['Bahlsen Choco Leibniz 125g',     'بالسن شوكو ليبنيز 125غ',         'Snacks', 'Piece', 0.600, 0.900],
  ['Americana Crackers 150g',        'أمريكانا كراكرز 150غ',           'Snacks', 'Piece', 0.200, 0.400],
  ['Americana Wafer Chocolate 60g',  'أمريكانا ويفر شوكولاتة 60غ',     'Snacks', 'Piece', 0.080, 0.150],
  ['Americana Wafer Vanilla 60g',    'أمريكانا ويفر فانيلا 60غ',        'Snacks', 'Piece', 0.080, 0.150],
  ['Sunbites Multigrain 25g',        'سانبايتس حبوب متعددة 25غ',       'Snacks', 'Piece', 0.150, 0.250],
  ['Doritos Nacho Cheese 48g',       'دوريتوس ناشو جبن 48غ',           'Snacks', 'Piece', 0.200, 0.350],
  ['Doritos Spicy 48g',              'دوريتوس حار 48غ',                'Snacks', 'Piece', 0.200, 0.350],
  ['Stax Sour Cream 100g',           'ستاكس كريمة حامضة 100غ',         'Snacks', 'Piece', 0.400, 0.650],
  ['Kuwaiti Halawa Bar 100g',        'حلاوة كويتية 100غ',              'Snacks', 'Piece', 0.100, 0.200],
  ['Ritz Original 200g',             'ريتز أصلي 200غ',                 'Snacks', 'Piece', 0.500, 0.750],
  ['Kit Kat 4F 45g',                 'كيت كات 4F 45غ',                 'Snacks', 'Piece', 0.200, 0.350],
  ['Twix 50g',                       'تويكس 50غ',                      'Snacks', 'Piece', 0.200, 0.350],
  ['Snickers 50g',                   'سنيكرز 50غ',                     'Snacks', 'Piece', 0.200, 0.350],
  ['Mars Bar 51g',                   'مارس 51غ',                       'Snacks', 'Piece', 0.200, 0.350],
  ['Bounty 57g',                     'باونتي 57غ',                     'Snacks', 'Piece', 0.200, 0.350],
  ['Ferrero Rocher 3pcs',            'فيريرو روشيه 3حبات',             'Snacks', 'Piece', 0.500, 0.750],
  ['Nutella 200g',                   'نوتيلا 200غ',                    'Snacks', 'Piece', 0.900, 1.300],
  ['Nutella 400g',                   'نوتيلا 400غ',                    'Snacks', 'Piece', 1.600, 2.200],
  ['Skippy Peanut Butter 340g',      'سكيبي زبدة فول سوداني 340غ',     'Snacks', 'Piece', 0.800, 1.200],
  ['Kelloggs Corn Flakes 375g',      'كيلوغز كورن فليكس 375غ',         'Snacks', 'Piece', 0.900, 1.300],
  ['Kelloggs Frosties 375g',         'كيلوغز فروستيز 375غ',             'Snacks', 'Piece', 0.900, 1.300],
  ['Sunbulah Dates 500g',            'سنبلة تمر 500غ',                 'Snacks', 'Piece', 0.700, 1.000],

  // BEVERAGES
  ['Coca-Cola 330ml Can',            'كوكا كولا 330مل علبة',          'Beverages', 'Piece', 0.120, 0.200],
  ['Coca-Cola 1.5L Bottle',          'كوكا كولا 1.5ل زجاجة',          'Beverages', 'Piece', 0.200, 0.350],
  ['Pepsi 330ml Can',                'بيبسي 330مل علبة',               'Beverages', 'Piece', 0.120, 0.200],
  ['Pepsi 1.5L Bottle',              'بيبسي 1.5ل زجاجة',               'Beverages', 'Piece', 0.200, 0.350],
  ['7UP 330ml Can',                  '7أب 330مل علبة',                  'Beverages', 'Piece', 0.120, 0.200],
  ['Sprite 330ml Can',               'سبرايت 330مل علبة',               'Beverages', 'Piece', 0.120, 0.200],
  ['Fanta Orange 330ml Can',         'فانتا برتقال 330مل علبة',         'Beverages', 'Piece', 0.120, 0.200],
  ['Red Bull 250ml',                 'ريد بول 250مل',                   'Beverages', 'Piece', 0.600, 0.900],
  ['Monster Energy 500ml',           'مونستر طاقة 500مل',               'Beverages', 'Piece', 0.700, 1.000],
  ['Lipton Ice Tea Peach 500ml',     'ليبتون شاي خوخ بارد 500مل',       'Beverages', 'Piece', 0.250, 0.400],
  ['Rani Float Orange 240ml',        'راني فلوت برتقال 240مل',          'Beverages', 'Piece', 0.150, 0.250],
  ['Rani Float Mango 240ml',         'راني فلوت مانجو 240مل',            'Beverages', 'Piece', 0.150, 0.250],
  ['Almarai Orange Juice 1L',        'ألماراي عصير برتقال 1ل',          'Beverages', 'Piece', 0.600, 0.900],
  ['Almarai Mango Juice 1L',         'ألماراي عصير مانجو 1ل',           'Beverages', 'Piece', 0.600, 0.900],
  ['KDD Orange Juice 1L',            'كي دي دي عصير برتقال 1ل',         'Beverages', 'Piece', 0.550, 0.800],
  ['Tropicana Orange 330ml',         'تروبيكانا برتقال 330مل',           'Beverages', 'Piece', 0.400, 0.600],
  ['Vimto Cordial 710ml',            'فيمتو شراب 710مل',                'Beverages', 'Piece', 1.000, 1.400],
  ['Tang Orange 500g',               'تانج برتقال 500غ',                'Beverages', 'Piece', 0.600, 0.900],
  ['Nescafe Classic 200g',           'نسكافيه كلاسيك 200غ',             'Beverages', 'Piece', 1.800, 2.500],
  ['Lipton Yellow Tea 100bags',      'ليبتون شاي أصفر 100 كيس',         'Beverages', 'Piece', 1.000, 1.500],
  ['Miranda Orange 330ml Can',       'ميرندا برتقال 330مل علبة',         'Beverages', 'Piece', 0.120, 0.200],
  ['Mirinda Apple 330ml Can',        'ميرندا تفاح 330مل علبة',           'Beverages', 'Piece', 0.120, 0.200],
  ['Mountain Dew 330ml Can',         'ماونتن ديو 330مل علبة',            'Beverages', 'Piece', 0.120, 0.200],
  ['Aquafina 500ml',                 'أكوافينا 500مل',                  'Beverages', 'Piece', 0.050, 0.100],
  ['Masafi Water 500ml',             'مصافي ماء 500مل',                 'Beverages', 'Piece', 0.050, 0.100],

  // BAKERY
  ['L\'usine White Bread Loaf',      'لوزين خبز أبيض رغيف',            'Bakery', 'Piece', 0.200, 0.350],
  ['L\'usine Brown Bread Loaf',      'لوزين خبز أسمر رغيف',             'Bakery', 'Piece', 0.220, 0.380],
  ['L\'usine Burger Buns 6pcs',      'لوزين خبز برغر 6 حبات',           'Bakery', 'Pack', 0.250, 0.400],
  ['L\'usine Pita Bread 6pcs',       'لوزين خبز عربي 6 حبات',           'Bakery', 'Pack', 0.200, 0.350],
  ['Americana Croissant 60g',        'أمريكانا كروسان 60غ',             'Bakery', 'Piece', 0.150, 0.250],
  ['Americana Danish Pastry 60g',    'أمريكانا دانيش 60غ',              'Bakery', 'Piece', 0.150, 0.250],
  ['L\'usine Cake Slices Choco 50g', 'لوزين كيك شوكولاتة 50غ',          'Bakery', 'Piece', 0.120, 0.220],
  ['L\'usine Brioche 6pcs',          'لوزين بريوش 6 حبات',              'Bakery', 'Pack', 0.400, 0.600],
  ['Balila Sesame Ring (Kaak)',       'بليلة كعك سمسم',                 'Bakery', 'Piece', 0.050, 0.100],
  ['Fresh Samoon Bread 10pcs',       'خبز سمون طازج 10 حبات',           'Bakery', 'Pack', 0.250, 0.400],
  ['L\'usine Hot Dog Buns 6pcs',     'لوزين خبز هوت دوج 6 حبات',        'Bakery', 'Pack', 0.250, 0.400],
  ['Americana Maamoul Date 50g',     'أمريكانا معمول تمر 50غ',          'Bakery', 'Piece', 0.120, 0.200],

  // HOUSEHOLD
  ['Glad Cling Wrap 30m',            'جلاد غطاء بلاستيك 30م',          'Household', 'Roll', 0.400, 0.700],
  ['Glad Bake & Cooking Paper 10m',  'جلاد ورق خبز 10م',               'Household', 'Roll', 0.350, 0.600],
  ['Glad Foil Wrap 30m',             'جلاد ورق ألومنيوم 30م',           'Household', 'Roll', 0.600, 0.900],
  ['Albal Aluminium Foil 20m',       'ألبال ورق ألومنيوم 20م',          'Household', 'Roll', 0.500, 0.800],
  ['Tamr Garbage Bags 60L 20pcs',    'تمر أكياس قمامة 60ل 20 حبة',      'Household', 'Pack', 0.400, 0.650],
  ['Tamr Garbage Bags 90L 10pcs',    'تمر أكياس قمامة 90ل 10 حبة',      'Household', 'Pack', 0.450, 0.700],
  ['Viva Kitchen Towel 2-roll',      'فيفا مناشف مطبخ 2 رول',           'Household', 'Pack', 0.500, 0.750],
  ['Kleenex Facial Tissue 200 sheets','كلينكس مناديل وجه 200 ورقة',    'Household', 'Box', 0.400, 0.650],
  ['Panadol Tissue 100 sheets',      'مناديل بانادول 100 ورقة',         'Household', 'Box', 0.250, 0.400],
  ['Scotch Brite Sponge 2pcs',       'سكوتش برايت إسفنجة 2 حبة',       'Household', 'Pack', 0.350, 0.550],
  ['Comet Candles 10pcs',            'كوميت شموع 10 حبات',              'Household', 'Pack', 0.200, 0.350],
  ['Vileda Mop Refill',              'فيليدا ممسحة بديل',               'Household', 'Piece', 1.200, 1.800],
  ['Disposable Plates 25pcs',        'أطباق بلاستيك للاستعمال مرة 25',  'Household', 'Pack', 0.300, 0.500],
  ['Disposable Cups 50pcs',          'أكواب بلاستيك للاستعمال مرة 50',  'Household', 'Pack', 0.300, 0.500],
  ['Toothpicks Box 200pcs',          'عود أسنان علبة 200 حبة',          'Household', 'Box', 0.100, 0.200],
  ['Matchbox',                       'علبة كبريت',                      'Household', 'Piece', 0.050, 0.100],
  ['Kitekat Canned Cat Food 400g',   'كيتيكات طعام قطط 400غ',           'Household', 'Piece', 0.600, 0.900],
  ['Bic Lighter',                    'بيك ولاعة',                       'Household', 'Piece', 0.100, 0.200],
  ['Saran Wrap 30m',                 'ساران غطاء 30م',                   'Household', 'Roll', 0.350, 0.600],

  // CANNED GOODS
  ['Americana Tuna in Oil 170g',     'أمريكانا تونة بالزيت 170غ',       'Canned Goods', 'Piece', 0.200, 0.380],
  ['Americana Tuna in Brine 170g',   'أمريكانا تونة بالماء 170غ',       'Canned Goods', 'Piece', 0.200, 0.380],
  ['Del Monte Tomato Paste 135g',    'ديل مونت معجون طماطم 135غ',       'Canned Goods', 'Piece', 0.150, 0.280],
  ['Heinz Baked Beans 415g',         'هاينز فاصوليا 415غ',              'Canned Goods', 'Piece', 0.500, 0.750],
  ['Del Monte Sweet Corn 340g',      'ديل مونت ذرة حلوة 340غ',          'Canned Goods', 'Piece', 0.350, 0.550],
  ['Del Monte Green Peas 400g',      'ديل مونت بازيلاء 400غ',           'Canned Goods', 'Piece', 0.350, 0.550],
  ['Heinz Tomato Ketchup 570g',      'هاينز كاتشب طماطم 570غ',          'Canned Goods', 'Piece', 0.700, 1.000],
  ['Heinz Tomato Ketchup 325g',      'هاينز كاتشب طماطم 325غ',          'Canned Goods', 'Piece', 0.450, 0.700],
  ['Maggi Chicken Broth 400g',       'ماجي مرق دجاج 400غ',              'Canned Goods', 'Piece', 0.500, 0.750],
  ['Americana Luncheon Meat 340g',   'أمريكانا لانشيون 340غ',            'Canned Goods', 'Piece', 0.700, 1.000],
  ['Americana Chicken Luncheon 340g','أمريكانا لانشيون دجاج 340غ',      'Canned Goods', 'Piece', 0.650, 0.950],
  ['Pacific Sardines 425g',          'باسيفيك سردين 425غ',              'Canned Goods', 'Piece', 0.350, 0.600],
  ['Hunts Tomato Sauce 425g',        'هانتس صلصة طماطم 425غ',           'Canned Goods', 'Piece', 0.400, 0.650],
  ['Dole Sliced Pineapple 565g',     'دول أناناس شرائح 565غ',           'Canned Goods', 'Piece', 0.600, 0.900],
  ['Kraft Peanut Butter Smooth 462g','كرافت زبدة فول سوداني ناعمة 462غ','Canned Goods', 'Piece', 1.100, 1.600],

  // RICE & GRAINS
  ['Al Rashidi Irma Basmati 5kg',    'الراشدي إيرما بسمتي 5كغ',        'Rice & Grains', 'Bag', 2.500, 3.500],
  ['Al Rashidi Irma Basmati 10kg',   'الراشدي إيرما بسمتي 10كغ',       'Rice & Grains', 'Bag', 4.500, 6.500],
  ['India Gate Basmati 5kg',         'انديا جيت بسمتي 5كغ',            'Rice & Grains', 'Bag', 3.000, 4.200],
  ['India Gate Basmati 1kg',         'انديا جيت بسمتي 1كغ',            'Rice & Grains', 'Bag', 0.650, 0.950],
  ['Egyptian Rice White 5kg',        'أرز مصري أبيض 5كغ',              'Rice & Grains', 'Bag', 1.800, 2.800],
  ['Lentils Red 500g',               'عدس أحمر 500غ',                   'Rice & Grains', 'Bag', 0.300, 0.550],
  ['Chickpeas 500g',                 'حمص 500غ',                        'Rice & Grains', 'Bag', 0.350, 0.600],
  ['Fava Beans Dry 500g',            'فول جاف 500غ',                    'Rice & Grains', 'Bag', 0.300, 0.550],
  ['Vermicelli 400g',                'شعيرية 400غ',                     'Rice & Grains', 'Pack', 0.200, 0.400],
  ['Spaghetti Barilla 500g',         'سباغيتي باريلا 500غ',             'Rice & Grains', 'Pack', 0.600, 0.900],
  ['Penne Barilla 500g',             'بيني باريلا 500غ',                'Rice & Grains', 'Pack', 0.600, 0.900],
  ['Indomie Chicken Noodles 75g',    'إندومي نودلز دجاج 75غ',           'Rice & Grains', 'Piece', 0.080, 0.150],
  ['Indomie Beef Noodles 75g',       'إندومي نودلز لحم 75غ',            'Rice & Grains', 'Piece', 0.080, 0.150],
  ['Maggi 2-Minute Noodles 70g',     'ماجي نودلز دقيقتين 70غ',          'Rice & Grains', 'Piece', 0.080, 0.150],
  ['Quaker Oats 500g',               'كويكر شوفان 500غ',                'Rice & Grains', 'Pack', 0.700, 1.000],
  ['Flour Plain 1kg',                'دقيق أبيض 1كغ',                   'Rice & Grains', 'Bag', 0.200, 0.380],
  ['Sugar White 1kg',                'سكر أبيض 1كغ',                    'Rice & Grains', 'Bag', 0.200, 0.380],
  ['Sugar White 2kg',                'سكر أبيض 2كغ',                    'Rice & Grains', 'Bag', 0.380, 0.650],

  // FROZEN
  ['Americana Chicken Nuggets 400g', 'أمريكانا ناجتس دجاج 400غ',       'Frozen', 'Bag', 1.200, 1.700],
  ['Americana Chicken Strips 400g',  'أمريكانا ستريبس دجاج 400غ',      'Frozen', 'Bag', 1.200, 1.700],
  ['Americana Burger Patties 6pcs',  'أمريكانا برجر دجاج 6 حبات',      'Frozen', 'Pack', 1.500, 2.100],
  ['Al Kabeer Samosa Chicken 20pcs', 'الكبير سمبوسة دجاج 20 حبة',      'Frozen', 'Pack', 1.500, 2.200],
  ['Al Kabeer Samosa Veg 20pcs',     'الكبير سمبوسة خضار 20 حبة',      'Frozen', 'Pack', 1.400, 2.000],
  ['McCain French Fries 900g',       'مكين بطاطس مقلية 900غ',           'Frozen', 'Bag', 1.300, 1.900],
  ['Americana Peas & Carrots 400g',  'أمريكانا بازيلاء وجزر 400غ',     'Frozen', 'Bag', 0.500, 0.800],
  ['Americana Mixed Vegetables 400g','أمريكانا خضار مشكلة 400غ',        'Frozen', 'Bag', 0.500, 0.800],
  ['Americana Corn Kernels 400g',    'أمريكانا ذرة 400غ',               'Frozen', 'Bag', 0.450, 0.750],
  ['Kwality Vanilla Ice Cream 2L',   'كواليتي آيس كريم فانيلا 2ل',     'Frozen', 'Tub', 1.800, 2.600],
  ['Kwality Chocolate Ice Cream 2L', 'كواليتي آيس كريم شوكولاتة 2ل',   'Frozen', 'Tub', 1.800, 2.600],
  ['Magnum Classic Ice Cream Bar',   'ماجنوم كلاسيك آيس كريم',          'Frozen', 'Piece', 0.400, 0.650],
  ['Cornetto Vanilla 120ml',         'كورنيتو فانيلا 120مل',            'Frozen', 'Piece', 0.250, 0.450],
  ['Americana Frozen Paratha 10pcs', 'أمريكانا باراتا مجمدة 10 حبات',  'Frozen', 'Pack', 0.800, 1.200],
  ['Al Kabeer Shish Tawook 400g',    'الكبير شيش طاووق 400غ',           'Frozen', 'Pack', 2.000, 2.800],
  ['Americana Escalope Chicken 400g','أمريكانا إسكالوب دجاج 400غ',     'Frozen', 'Pack', 1.600, 2.200],

  // PERSONAL CARE
  ['Dove Soap Bar 135g',             'دوف صابون 135غ',                  'Personal Care', 'Piece', 0.250, 0.450],
  ['Lux Soap Bar 125g',              'لوكس صابون 125غ',                 'Personal Care', 'Piece', 0.150, 0.300],
  ['Lifebuoy Soap Bar 125g',         'لايفبوي صابون 125غ',              'Personal Care', 'Piece', 0.100, 0.220],
  ['Head & Shoulders Shampoo 200ml', 'هيد آند شولدرز شامبو 200مل',      'Personal Care', 'Piece', 0.900, 1.300],
  ['Pantene Shampoo 200ml',          'بانتين شامبو 200مل',               'Personal Care', 'Piece', 0.850, 1.200],
  ['Sunsilk Shampoo 350ml',          'سانسيلك شامبو 350مل',              'Personal Care', 'Piece', 0.700, 1.100],
  ['Colgate Toothpaste 125ml',       'كولجيت معجون أسنان 125مل',         'Personal Care', 'Piece', 0.400, 0.650],
  ['Oral-B Toothbrush Medium',       'أورال-بي فرشاة أسنان متوسطة',     'Personal Care', 'Piece', 0.350, 0.600],
  ['Dettol Antiseptic 250ml',        'ديتول مطهر 250مل',                'Personal Care', 'Piece', 0.600, 0.900],
  ['Always Pads Regular 10pcs',      'أولويز فوط صحية 10 حبات',         'Personal Care', 'Pack', 0.350, 0.600],
  ['Gillette Sensor Excel Razor',    'جيليت ماكينة حلاقة سينسور',       'Personal Care', 'Piece', 1.200, 1.800],
  ['Nivea Body Lotion 400ml',        'نيفيا لوشن جسم 400مل',            'Personal Care', 'Piece', 1.200, 1.800],
  ['Vaseline Petroleum Jelly 250ml', 'فازلين جيلي بترولي 250مل',        'Personal Care', 'Piece', 0.600, 0.900],
  ['Panadol Extra 24 tablets',       'بانادول إكسترا 24 قرص',           'Personal Care', 'Box', 0.400, 0.700],

  // SPICES
  ['Al Doha Black Pepper 100g',      'الدوحة فلفل أسود 100غ',           'Spices', 'Pack', 0.300, 0.550],
  ['Al Doha Cumin 100g',             'الدوحة كمون 100غ',                'Spices', 'Pack', 0.250, 0.450],
  ['Al Doha Turmeric 100g',          'الدوحة كركم 100غ',                'Spices', 'Pack', 0.250, 0.450],
  ['Al Doha Cinnamon 100g',          'الدوحة قرفة 100غ',                'Spices', 'Pack', 0.250, 0.450],
  ['Al Doha Cardamom 50g',           'الدوحة هيل 50غ',                  'Spices', 'Pack', 0.400, 0.700],
  ['Maggi Chicken Seasoning 100g',   'ماجي بهار دجاج 100غ',             'Spices', 'Pack', 0.300, 0.550],
  ['Knorr Chicken Stock Cube 24pcs', 'كنور مرقة دجاج مكعب 24 حبة',     'Spices', 'Pack', 0.600, 0.900],
  ['Salt Iodized 1kg',               'ملح يودي 1كغ',                    'Spices', 'Pack', 0.100, 0.200],
  ['Maggi Arabic Kabsa Mix 50g',     'ماجي بهار كبسة عربي 50غ',         'Spices', 'Pack', 0.200, 0.380],
  ['Sunflower Oil 1.8L',             'زيت عباد الشمس 1.8ل',             'Spices', 'Bottle', 0.900, 1.400],
  ['Noor Vegetable Oil 1.8L',        'نور زيت نباتي 1.8ل',              'Spices', 'Bottle', 0.800, 1.200],
  ['Extra Virgin Olive Oil 500ml',   'زيت زيتون بكر ممتاز 500مل',       'Spices', 'Bottle', 1.500, 2.200],
  ['White Vinegar 500ml',            'خل أبيض 500مل',                   'Spices', 'Bottle', 0.200, 0.400],
  ['Tomato Sauce Pomi 500g',         'صلصة طماطم بومي 500غ',            'Spices', 'Piece', 0.500, 0.800],

  // CLEANING
  ['Ariel Powder Detergent 4kg',     'أريال مسحوق غسيل 4كغ',           'Cleaning', 'Bag', 3.000, 4.200],
  ['Ariel Liquid Detergent 2L',      'أريال سائل غسيل 2ل',             'Cleaning', 'Bottle', 2.000, 2.800],
  ['Tide Powder Detergent 3kg',      'تايد مسحوق غسيل 3كغ',            'Cleaning', 'Bag', 2.500, 3.500],
  ['Persil Powder Detergent 4kg',    'برسيل مسحوق غسيل 4كغ',           'Cleaning', 'Bag', 3.000, 4.200],
  ['Fairy Dish Liquid 500ml',        'فيري سائل جلي 500مل',             'Cleaning', 'Bottle', 0.600, 0.950],
  ['Sunlight Dish Liquid 500ml',     'سانلايت سائل جلي 500مل',          'Cleaning', 'Bottle', 0.400, 0.700],
  ['Flash All Purpose Cleaner 500ml','فلاش منظف متعدد الاستخدام 500مل', 'Cleaning', 'Bottle', 0.700, 1.000],
  ['Harpic Toilet Cleaner 500ml',    'هاربيك منظف مراحيض 500مل',        'Cleaning', 'Bottle', 0.700, 1.000],
  ['Dettol Surface Cleaner 500ml',   'ديتول منظف أسطح 500مل',           'Cleaning', 'Bottle', 0.800, 1.200],
  ['Febreze Air Freshener 300ml',    'فيبريز معطر جو 300مل',             'Cleaning', 'Bottle', 1.000, 1.500],
  ['Domestos Bleach 750ml',          'دومستوس كلور 750مل',               'Cleaning', 'Bottle', 0.450, 0.750],
  ['Comfort Fabric Softener 1.4L',   'كومفورت منعم ملابس 1.4ل',         'Cleaning', 'Bottle', 1.000, 1.500],

  // BABY
  ['Pampers Active Baby S-3 54pcs',  'بامبرز أكتيف بيبي S-3 54 حبة',   'Baby', 'Pack', 2.800, 4.000],
  ['Pampers Active Baby M-4 46pcs',  'بامبرز أكتيف بيبي M-4 46 حبة',   'Baby', 'Pack', 2.800, 4.000],
  ['Pampers Active Baby L-5 40pcs',  'بامبرز أكتيف بيبي L-5 40 حبة',   'Baby', 'Pack', 2.800, 4.000],
  ['Huggies Dry Comfort S-3 50pcs',  'هاجيز جاف كومفورت S-3 50 حبة',   'Baby', 'Pack', 2.600, 3.800],
  ['Huggies Dry Comfort M-4 44pcs',  'هاجيز جاف كومفورت M-4 44 حبة',   'Baby', 'Pack', 2.600, 3.800],
  ['Nestlé NAN Pro 1 400g',          'نستله نان برو 1 - 400غ',          'Baby', 'Tin', 3.500, 5.000],
  ['Nestlé NAN Pro 2 400g',          'نستله نان برو 2 - 400غ',          'Baby', 'Tin', 3.500, 5.000],
  ['Aptamil Stage 1 400g',           'أبتاميل مرحلة 1 - 400غ',          'Baby', 'Tin', 4.000, 5.500],
  ['Aptamil Stage 2 400g',           'أبتاميل مرحلة 2 - 400غ',          'Baby', 'Tin', 4.000, 5.500],
  ['Nestlé Cerelac Wheat 250g',      'نستله سيريلاك قمح 250غ',           'Baby', 'Pack', 1.500, 2.200],
  ['Nestlé Cerelac Rice 250g',       'نستله سيريلاك أرز 250غ',           'Baby', 'Pack', 1.500, 2.200],
  ['Johnson Baby Shampoo 200ml',     'جونسون شامبو أطفال 200مل',         'Baby', 'Bottle', 0.700, 1.100],
  ['Johnson Baby Lotion 200ml',      'جونسون لوشن أطفال 200مل',          'Baby', 'Bottle', 0.700, 1.100],
  ['Desitin Cream 57g',              'ديسيتين كريم 57غ',                 'Baby', 'Tube', 1.200, 1.800],
  ['Wet Wipes 80 sheets',            'مناديل مبللة 80 ورقة',             'Baby', 'Pack', 0.500, 0.800],

  // TEA & COFFEE
  ['Lipton Yellow Label 100bags',    'ليبتون ييلو لاببل 100 كيس',       'Tea & Coffee', 'Box', 1.000, 1.500],
  ['Lipton Green Tea 50bags',        'ليبتون شاي أخضر 50 كيس',          'Tea & Coffee', 'Box', 0.700, 1.100],
  ['Tapal Danedar Tea 500g',         'تاپل دانيدار شاي 500غ',           'Tea & Coffee', 'Pack', 1.200, 1.800],
  ['Brooke Bond Red Label 450g',     'بروك بوند ريد لاببل 450غ',         'Tea & Coffee', 'Pack', 1.200, 1.800],
  ['Nescafe 3in1 20 sachets',        'نسكافيه 3 في 1 - 20 كيس',         'Tea & Coffee', 'Box', 1.200, 1.800],
  ['Nescafe Gold 200g',              'نسكافيه جولد 200غ',               'Tea & Coffee', 'Jar', 3.000, 4.200],
  ['Lavazza Espresso 250g',          'لافازا اسبريسو 250غ',              'Tea & Coffee', 'Pack', 2.500, 3.500],
  ['Coffeemate Creamer 400g',        'كوفيميت كريمر 400غ',               'Tea & Coffee', 'Tin', 1.500, 2.200],
  ['Al Rifai Mint Tea 20bags',       'الرفاعي شاي نعناع 20 كيس',         'Tea & Coffee', 'Box', 0.400, 0.700],
  ['Karak Chai Mix 500g',            'مزيج شاي كرك 500غ',               'Tea & Coffee', 'Pack', 1.500, 2.200],
  ['Arabic Coffee Ground 250g',      'قهوة عربية مطحونة 250غ',           'Tea & Coffee', 'Pack', 1.200, 1.800],
  ['Hana Cardamom Coffee 500g',      'هنا قهوة هيل 500غ',               'Tea & Coffee', 'Pack', 2.200, 3.200],

  // CONFECTIONERY
  ['Galaxy Chocolate Bar 100g',      'جالاكسي شوكولاتة 100غ',          'Confectionery', 'Piece', 0.400, 0.700],
  ['Celebrations Box 186g',          'سيليبريشنز علبة 186غ',            'Confectionery', 'Box', 1.500, 2.200],
  ['Kinder Bueno 43g',               'كيندر بوينو 43غ',                 'Confectionery', 'Piece', 0.300, 0.550],
  ['Kinder Surprise Egg 20g',        'كيندر مفاجأة 20غ',                'Confectionery', 'Piece', 0.250, 0.450],
  ['Milky Way 52g',                  'ميلكي واي 52غ',                   'Confectionery', 'Piece', 0.200, 0.350],
  ['Haribo Goldbears 80g',           'هاريبو دبب ذهبية 80غ',            'Confectionery', 'Piece', 0.400, 0.650],
  ['Mentos Mint Roll 38g',           'مينتوس نعناع 38غ',                'Confectionery', 'Piece', 0.150, 0.280],
  ['Skittles Original 45g',          'سكيتلز أصلي 45غ',                 'Confectionery', 'Piece', 0.200, 0.380],
  ['Starburst Fruit Chews 45g',      'ستاربيرست 45غ',                   'Confectionery', 'Piece', 0.200, 0.380],
  ['Cadbury Dairy Milk 120g',        'كادبوري دايري ميلك 120غ',         'Confectionery', 'Piece', 0.600, 0.900],
  ['Toblerone 100g',                 'توبليرون 100غ',                   'Confectionery', 'Piece', 0.800, 1.200],
  ['Wrigley\'s Extra Spearmint 10pcs','ريغليز إكسترا نعناع 10 حبة',    'Confectionery', 'Pack', 0.150, 0.280],
  ['Halawiyat Arabic Mix 250g',      'حلاويات عربية مشكلة 250غ',        'Confectionery', 'Pack', 0.700, 1.100],

  // WATER
  ['Acqua Panna 500ml',              'أكوا بانا 500مل',                 'Water', 'Piece', 0.150, 0.280],
  ['Evian 500ml',                    'إيفيان 500مل',                    'Water', 'Piece', 0.250, 0.400],
  ['Arwa Water 500ml',               'أروى ماء 500مل',                  'Water', 'Piece', 0.050, 0.100],
  ['Arwa Water 1.5L',                'أروى ماء 1.5ل',                   'Water', 'Piece', 0.080, 0.160],
  ['Masafi Water 1.5L',              'مصافي ماء 1.5ل',                  'Water', 'Piece', 0.080, 0.160],
  ['Oasis Water 330ml',              'أوسيس ماء 330مل',                  'Water', 'Piece', 0.050, 0.100],
  ['Oasis Water 1.5L',               'أوسيس ماء 1.5ل',                  'Water', 'Piece', 0.080, 0.160],
  ['Safa Water 500ml',               'صفا ماء 500مل',                    'Water', 'Piece', 0.050, 0.100],
  ['Safa Water 5L',                  'صفا ماء 5ل',                       'Water', 'Piece', 0.200, 0.380],
  ['Al Ain Water 500ml',             'العين ماء 500مل',                  'Water', 'Piece', 0.050, 0.100],
  ['Al Ain Water 1.5L',              'العين ماء 1.5ل',                   'Water', 'Piece', 0.080, 0.160],
  ['Sparkling Water Perrier 330ml',  'مياه بيريه فوارة 330مل',           'Water', 'Piece', 0.350, 0.600],
];

// Extra variant templates to reach ~800 total
const PAD_TEMPLATES = [
    ['Coca-Cola Zero 330ml Can',       'كوكا كولا زيرو 330مل',         'Beverages', 'Piece', 0.120, 0.200],
    ['Pepsi Max 330ml Can',            'بيبسي ماكس 330مل علبة',         'Beverages', 'Piece', 0.120, 0.200],
    ['Almarai UHT Milk 200ml',         'ألماراي حليب UHT 200مل',        'Dairy', 'Piece', 0.100, 0.180],
    ['Almarai Labneh 500g',            'ألماراي لبنة 500غ',              'Dairy', 'Piece', 0.700, 1.000],
    ['Cheetos Cheese Puffs 50g',       'شيتوس بافز جبن 50غ',            'Snacks', 'Piece', 0.150, 0.280],
    ['Kelloggs Special K 375g',        'كيلوغز سبيشال K 375غ',           'Snacks', 'Piece', 0.900, 1.400],
    ['Sprite Zero 330ml Can',          'سبرايت زيرو 330مل',              'Beverages', 'Piece', 0.120, 0.200],
    ['Dettol Soap 125g',               'ديتول صابون 125غ',               'Personal Care', 'Piece', 0.200, 0.380],
    ['Colgate 360 Toothbrush',         'كولجيت 360 فرشاة أسنان',          'Personal Care', 'Piece', 0.500, 0.800],
    ['Al Doha Mixed Spices 100g',      'الدوحة بهارات مشكلة 100غ',       'Spices', 'Pack', 0.250, 0.450],
    ['Indomie Shrimp Noodles 75g',     'إندومي نودلز روبيان 75غ',         'Rice & Grains', 'Piece', 0.080, 0.150],
    ['Americana Beef Nuggets 400g',    'أمريكانا ناجتس لحم 400غ',         'Frozen', 'Bag', 1.200, 1.700],
    ['Puck Cream Cheese 120g',         'باك جبن كريمي 120غ',              'Dairy', 'Piece', 0.450, 0.700],
    ['Del Monte Tomato Paste 70g',     'ديل مونت معجون طماطم 70غ',        'Canned Goods', 'Piece', 0.100, 0.200],
    ['Barilla Fusilli 500g',           'باريلا فوزيلي 500غ',              'Rice & Grains', 'Pack', 0.600, 0.900],
    ['Fairy Dish Liquid 1L',           'فيري سائل جلي 1ل',               'Cleaning', 'Bottle', 1.000, 1.500],
    ['Ariel Powder 2kg',               'أريال مسحوق 2كغ',                'Cleaning', 'Bag', 1.600, 2.200],
    ['Pampers Newborn N 42pcs',        'بامبرز مولود جديد N 42 حبة',      'Baby', 'Pack', 2.500, 3.500],
    ['Huggies Newborn N 30pcs',        'هاجيز مولود جديد N 30 حبة',       'Baby', 'Pack', 2.200, 3.200],
    ['Nestlé Cerelac Honey 250g',      'نستله سيريلاك عسل 250غ',          'Baby', 'Pack', 1.500, 2.200],
    ['Galaxy Caramel 100g',            'جالاكسي كراميل 100غ',             'Confectionery', 'Piece', 0.400, 0.700],
    ['Haribo Worms 80g',               'هاريبو ديدان 80غ',                'Confectionery', 'Piece', 0.400, 0.650],
    ['Lipton Earl Grey 50bags',        'ليبتون إيرل جراي 50 كيس',         'Tea & Coffee', 'Box', 0.700, 1.100],
    ['Nescafe Dolce Gusto Caps 16pcs', 'نسكافيه دولتشي جوستو 16 كبسولة', 'Tea & Coffee', 'Box', 2.500, 3.500],
    ['Arwa Water 330ml',               'أروى ماء 330مل',                  'Water', 'Piece', 0.040, 0.090],
    ['Saudi Dates Sukkari 500g',       'تمر سكري سعودي 500غ',             'Snacks', 'Pack', 1.500, 2.200],
    ['Lay\'s Max Cheese Chips 28g',    'لايز ماكس جبن 28غ',               'Snacks', 'Piece', 0.100, 0.180],
    ['Weetabix 430g',                  'ويتابيكس 430غ',                   'Snacks', 'Pack', 1.200, 1.800],
    ['Uncle Toby\'s Oats 500g',        'أونكل توبيز شوفان 500غ',          'Snacks', 'Pack', 1.000, 1.500],
    ['Libby\'s Tomato Juice 250ml',    'ليبيز عصير طماطم 250مل',          'Beverages', 'Piece', 0.250, 0.450],
    ['Al Ain Sparkling 500ml',         'العين فوارة 500مل',               'Water', 'Piece', 0.150, 0.280],
    ['Bounty Bar Multipack 3x57g',     'باونتي 3 × 57غ',                  'Confectionery', 'Pack', 0.600, 0.950],
    ['Hershey\'s Chocolate Syrup 623g','هيرشيز شراب شوكولاتة 623غ',      'Snacks', 'Piece', 1.400, 2.000],
    ['Philadelphia Light 200g',        'فيلادلفيا لايت 200غ',             'Dairy', 'Piece', 1.000, 1.450],
    ['Almarai Greek Yoghurt 170g',     'ألماراي زبادي يوناني 170غ',        'Dairy', 'Piece', 0.250, 0.400],
    ['KDD Laban Up Strawberry 200ml',  'كي دي دي لبن أب فراولة 200مل',   'Dairy', 'Piece', 0.100, 0.200],
    ['Americana Falafel Mix 400g',     'أمريكانا خليط فلافل 400غ',        'Frozen', 'Pack', 0.900, 1.400],
    ['Americana Pizza Mini 2pcs',      'أمريكانا بيتزا صغيرة 2 حبة',      'Frozen', 'Pack', 1.000, 1.500],
    ['Uncle Ben\'s Rice Express 250g', 'أنكل بنز أرز سريع 250غ',          'Rice & Grains', 'Pack', 0.600, 0.900],
    ['Instant Noodles Cup Nissin',     'نيسين نودلز فوري كوب',            'Rice & Grains', 'Piece', 0.200, 0.380],
    ['Heinz White Vinegar 473ml',      'هاينز خل أبيض 473مل',             'Spices', 'Bottle', 0.500, 0.800],
    ['Al Doha Chilli Powder 100g',     'الدوحة بودرة فلفل حار 100غ',      'Spices', 'Pack', 0.250, 0.450],
    ['Knorr Beef Stock 24pcs',         'كنور مرقة لحم 24 حبة',            'Spices', 'Pack', 0.600, 0.900],
    ['Olive Oil Borges 500ml',         'زيت زيتون بورجيز 500مل',          'Spices', 'Bottle', 1.400, 2.000],
    ['Persil Liquid 2L',               'برسيل سائل 2ل',                   'Cleaning', 'Bottle', 2.000, 2.800],
    ['Vanish Gold Oxi Action 500g',    'فانيش جولد أوكسي 500غ',           'Cleaning', 'Pack', 1.500, 2.200],
    ['Ajax Powder Scourer 500g',       'أجاكس مسحوق تنظيف 500غ',          'Cleaning', 'Pack', 0.300, 0.550],
    ['Flash Spray 500ml',              'فلاش رذاذ 500مل',                 'Cleaning', 'Bottle', 0.700, 1.000],
    ['Air Wick Freshener 300ml',       'إير ويك معطر جو 300مل',            'Cleaning', 'Bottle', 1.000, 1.500],
    ['Nivea Men Deo Roll-On 50ml',     'نيفيا مزيل رجالي رول أون 50مل',   'Personal Care', 'Piece', 0.700, 1.100],
    ['Dove Deo Spray 150ml',           'دوف مزيل رذاذ 150مل',              'Personal Care', 'Piece', 0.900, 1.300],
    ['Panadol Flu Max 24 capsules',    'بانادول فلو ماكس 24 كبسولة',       'Personal Care', 'Box', 0.600, 0.950],
    ['Oral-B Kids Toothbrush',         'أورال-بي فرشاة أسنان أطفال',       'Personal Care', 'Piece', 0.350, 0.600],
    ['Dove Shampoo 400ml',             'دوف شامبو 400مل',                  'Personal Care', 'Piece', 1.000, 1.500],
    ['Head & Shoulders 400ml',         'هيد آند شولدرز 400مل',             'Personal Care', 'Piece', 1.200, 1.700],
    ['Sensodyne Toothpaste 75ml',      'سينسوداين معجون أسنان 75مل',       'Personal Care', 'Piece', 0.800, 1.200],
    ['Gillette Fusion Blades 4pcs',    'جيليت فيوجن شفرات 4 حبات',         'Personal Care', 'Pack', 1.800, 2.500],
    ['Johnson Baby Powder 100g',       'جونسون بودرة أطفال 100غ',           'Baby', 'Bottle', 0.500, 0.800],
    ['Pampers Active Baby XL-6 34pcs', 'بامبرز XL-6 34 حبة',              'Baby', 'Pack', 2.800, 4.000],
    ['Huggies Ultra Comfort M-4 50pcs','هاجيز ألترا كومفورت M-4 50 حبة',  'Baby', 'Pack', 2.900, 4.100],
    ['Nestlé NAN Pro 3 400g',          'نستله نان برو 3 - 400غ',           'Baby', 'Tin', 3.500, 5.000],
    ['Aptamil Stage 3 400g',           'أبتاميل مرحلة 3 - 400غ',           'Baby', 'Tin', 4.000, 5.500],
    ['Sudocrem 125g',                  'سودوكريم 125غ',                    'Baby', 'Jar', 1.000, 1.500],
    ['Wet Wipes Aloe 80 sheets',       'مناديل مبللة ألوي فيرا 80 ورقة',   'Baby', 'Pack', 0.500, 0.800],
    ['Dettol Wipes 12 sheets',         'ديتول مناديل مبللة 12 ورقة',       'Personal Care', 'Pack', 0.250, 0.450],
    ['Kleenex Toilet Tissue 4-roll',   'كلينكس مناديل حمام 4 رول',         'Household', 'Pack', 0.600, 0.950],
    ['Al-Ain Water 5L',                'العين ماء 5ل',                     'Water', 'Piece', 0.200, 0.380],
    ['Volvic Water 500ml',             'فولفيك ماء 500مل',                  'Water', 'Piece', 0.200, 0.380],
    ['Perrier Water 750ml',            'بيريه ماء فوار 750مل',              'Water', 'Piece', 0.600, 0.900],
    ['S.Pellegrino 500ml',             'سان بيليجرينو 500مل',               'Water', 'Piece', 0.350, 0.600],
    ['Crystal Water 1.5L',             'كريستال ماء 1.5ل',                  'Water', 'Piece', 0.080, 0.160],
    ['Al Rabie Orange Juice 200ml',    'الربيع عصير برتقال 200مل',          'Beverages', 'Piece', 0.100, 0.200],
    ['Al Rabie Mango Juice 200ml',     'الربيع عصير مانجو 200مل',           'Beverages', 'Piece', 0.100, 0.200],
    ['Al Rabie Apple Juice 200ml',     'الربيع عصير تفاح 200مل',            'Beverages', 'Piece', 0.100, 0.200],
    ['Lacnor Orange Juice 1L',         'لاكنور عصير برتقال 1ل',             'Beverages', 'Piece', 0.600, 0.900],
    ['Lacnor Mango Juice 1L',          'لاكنور عصير مانجو 1ل',              'Beverages', 'Piece', 0.600, 0.900],
    ['Minute Maid Orange 330ml Can',   'مينيت مايد برتقال 330مل',           'Beverages', 'Piece', 0.200, 0.350],
    ['Schweppes Tonic Water 330ml',    'شويبس ماء تونيك 330مل',             'Beverages', 'Piece', 0.180, 0.320],
    ['Gatorade Blue 500ml',            'جاتوريد أزرق 500مل',                'Beverages', 'Piece', 0.400, 0.700],
    ['Pocari Sweat 500ml',             'بوكاري سويت 500مل',                 'Beverages', 'Piece', 0.500, 0.800],
    ['Almarai Strawberry Yoghurt 180g','ألماراي زبادي فراولة 180غ',         'Dairy', 'Piece', 0.130, 0.250],
    ['Almarai Peach Yoghurt 180g',     'ألماراي زبادي خوخ 180غ',            'Dairy', 'Piece', 0.130, 0.250],
    ['Lactalis Brie 125g',             'لاكتاليس بري 125غ',                 'Dairy', 'Piece', 1.200, 1.800],
    ['Happy Cow Cream Cheese 12pcs',   'هابي كاو جبن كريمي 12 حبة',        'Dairy', 'Pack', 0.700, 1.100],
    ['Kiri Cream Cheese Squares 8pcs', 'كيري جبن كريمي مربعات 8 حبة',     'Dairy', 'Pack', 0.900, 1.350],
    ['Lurpak Spreadable 250g',         'لورباك قابل للدهن 250غ',            'Dairy', 'Piece', 1.200, 1.700],
    ['Del Monte Peas 200g',            'ديل مونت بازيلاء 200غ',             'Canned Goods', 'Piece', 0.250, 0.450],
    ['Heinz Mushroom Soup 400g',       'هاينز شوربة فطر 400غ',              'Canned Goods', 'Piece', 0.500, 0.800],
    ['Knorr Minestrone Soup 58g',      'كنور شوربة مينيسترونه 58غ',         'Canned Goods', 'Piece', 0.250, 0.450],
    ['Pacific Mackerel 425g',          'باسيفيك ماكريل 425غ',               'Canned Goods', 'Piece', 0.400, 0.650],
    ['Heinz Pasta Sauce 350g',         'هاينز صلصة باستا 350غ',             'Canned Goods', 'Piece', 0.600, 0.900],
    ['Al Doha Garam Masala 100g',      'الدوحة جرام ماسالا 100غ',           'Spices', 'Pack', 0.300, 0.550],
    ['Tabasco Hot Sauce 60ml',         'تاباسكو صلصة حارة 60مل',            'Spices', 'Bottle', 0.700, 1.100],
    ['Maggi Oyster Sauce 260g',        'ماجي صلصة محار 260غ',               'Spices', 'Bottle', 0.500, 0.800],
    ['Soy Sauce Kikkoman 150ml',       'صلصة صويا كيكومان 150مل',           'Spices', 'Bottle', 0.700, 1.100],
    ['Vinegar Apple Cider 500ml',      'خل تفاح 500مل',                     'Spices', 'Bottle', 0.400, 0.700],
    ['India Gate Extra Long Basmati 2kg','انديا جيت بسمتي طويل 2كغ',       'Rice & Grains', 'Bag', 1.400, 2.000],
    ['Royal Long Grain Rice 5kg',      'رويال أرز حبة طويلة 5كغ',           'Rice & Grains', 'Bag', 2.000, 3.000],
    ['Quaker Instant Oats 1kg',        'كويكر شوفان فوري 1كغ',              'Rice & Grains', 'Pack', 1.200, 1.800],
    ['Mama Noodles Chicken 90g',       'ماما نودلز دجاج 90غ',               'Rice & Grains', 'Piece', 0.100, 0.200],
    ['Corn Flour Maizena 400g',        'دقيق ذرة مايزينا 400غ',             'Rice & Grains', 'Pack', 0.400, 0.700],
    ['Brown Sugar 1kg',                'سكر أسمر 1كغ',                      'Rice & Grains', 'Bag', 0.300, 0.550],
    ['Baking Powder 100g',             'باكينج بودر 100غ',                   'Rice & Grains', 'Pack', 0.150, 0.300],
    // More variants to reach 800
    ['Almarai Milk 250ml',             'ألماراي حليب 250مل',                 'Dairy', 'Piece', 0.120, 0.220],
    ['KDD Milk 2L',                    'كي دي دي حليب 2ل',                   'Dairy', 'Piece', 0.600, 0.850],
    ['Almarai Yoghurt Mango 170g',     'ألماراي زبادي مانجو 170غ',           'Dairy', 'Piece', 0.130, 0.220],
    ['Almarai Yoghurt Blueberry 170g', 'ألماراي زبادي بلوبيري 170غ',         'Dairy', 'Piece', 0.130, 0.220],
    ['Puck Labneh 500g',               'باك لبنة 500غ',                      'Dairy', 'Piece', 0.700, 1.000],
    ['Lurpak Butter Salted 400g',      'لورباك زبدة مملحة 400غ',             'Dairy', 'Piece', 1.800, 2.600],
    ['Almarai Halloumi 200g',          'ألماراي جبن حلومي 200غ',             'Dairy', 'Piece', 1.000, 1.500],
    ['Kraft Singles Cheese 150g',      'كرافت جبن فردي 150غ',                'Dairy', 'Piece', 0.700, 1.000],
    ['Almarai Cottage Cheese 200g',    'ألماراي جبن قريش 200غ',              'Dairy', 'Piece', 0.700, 1.000],
    ['Anchor Butter 250g',             'آنكور زبدة 250غ',                    'Dairy', 'Piece', 1.200, 1.800],
    ['President Butter 250g',          'بريزيدينت زبدة 250غ',                'Dairy', 'Piece', 1.000, 1.500],
    ['Lay\'s BBQ Chips 28g',           'لايز بي بي كيو 28غ',                 'Snacks', 'Piece', 0.080, 0.150],
    ['Cheetos Crunchy 28g',            'شيتوس كرانشي 28غ',                   'Snacks', 'Piece', 0.080, 0.150],
    ['Pringles Cheese 165g',           'برينجلز جبن 165غ',                   'Snacks', 'Piece', 0.700, 1.000],
    ['Oreo Golden 137g',               'أوريو ذهبي 137غ',                    'Snacks', 'Piece', 0.400, 0.600],
    ['Digestive Chocolate McVities 400g','ديجستيف شوكولاتة مكفيتيز 400غ',   'Snacks', 'Piece', 0.800, 1.100],
    ['Nutella 750g',                   'نوتيلا 750غ',                        'Snacks', 'Piece', 2.500, 3.500],
    ['Kelloggs Rice Krispies 340g',    'كيلوغز رايس كريسبيز 340غ',           'Snacks', 'Piece', 0.900, 1.400],
    ['Kelloggs Crunchy Nut 500g',      'كيلوغز كرانشي نات 500غ',             'Snacks', 'Piece', 1.000, 1.500],
    ['Pepperidge Farm Milano 150g',    'ميلانو بيبريدج فارم 150غ',           'Snacks', 'Piece', 1.200, 1.800],
    ['Twix King Size 75g',             'تويكس كبير الحجم 75غ',               'Snacks', 'Piece', 0.350, 0.600],
    ['M&M\'s Peanut 45g',              'إم آند إم فول سوداني 45غ',           'Snacks', 'Piece', 0.250, 0.450],
    ['Kit Kat Chunky 40g',             'كيت كات تشانكي 40غ',                 'Snacks', 'Piece', 0.200, 0.380],
    ['Coca-Cola Diet 330ml Can',       'كوكا كولا دايت 330مل',               'Beverages', 'Piece', 0.120, 0.200],
    ['Pepsi Diet 330ml Can',           'بيبسي دايت 330مل',                   'Beverages', 'Piece', 0.120, 0.200],
    ['Fanta Grape 330ml Can',          'فانتا عنب 330مل',                    'Beverages', 'Piece', 0.120, 0.200],
    ['Mirinda Lemon 330ml Can',        'ميرندا ليمون 330مل',                 'Beverages', 'Piece', 0.120, 0.200],
    ['Coca-Cola 500ml Bottle',         'كوكا كولا 500مل',                    'Beverages', 'Piece', 0.150, 0.280],
    ['Pepsi 500ml Bottle',             'بيبسي 500مل',                        'Beverages', 'Piece', 0.150, 0.280],
    ['7UP 1.5L Bottle',                '7أب 1.5ل',                           'Beverages', 'Piece', 0.200, 0.380],
    ['Almarai Apple Juice 1L',         'ألماراي عصير تفاح 1ل',               'Beverages', 'Piece', 0.600, 0.900],
    ['Almarai Guava Juice 1L',         'ألماراي عصير جوافة 1ل',              'Beverages', 'Piece', 0.600, 0.900],
    ['KDD Mango Juice 1L',             'كي دي دي عصير مانجو 1ل',             'Beverages', 'Piece', 0.550, 0.850],
    ['Tropicana Mango 330ml',          'تروبيكانا مانجو 330مل',              'Beverages', 'Piece', 0.400, 0.650],
    ['Tang Mango 500g',                'تانج مانجو 500غ',                    'Beverages', 'Piece', 0.600, 0.900],
    ['Tang Strawberry 500g',           'تانج فراولة 500غ',                   'Beverages', 'Piece', 0.600, 0.900],
    ['Vimto Zero 710ml',               'فيمتو زيرو 710مل',                   'Beverages', 'Piece', 0.900, 1.350],
    ['Boost Energy 250ml',             'بوست طاقة 250مل',                    'Beverages', 'Piece', 0.500, 0.800],
    ['Lipton Ice Tea Lemon 500ml',     'ليبتون شاي ليمون 500مل',             'Beverages', 'Piece', 0.250, 0.450],
    ['L\'usine White Bread Small',     'لوزين خبز أبيض صغير',               'Bakery', 'Piece', 0.100, 0.200],
    ['L\'usine Toast Bread',           'لوزين خبز توست',                     'Bakery', 'Piece', 0.300, 0.500],
    ['Americana Croissant Chocolate 60g','أمريكانا كروسان شوكولاتة 60غ',    'Bakery', 'Piece', 0.150, 0.280],
    ['L\'usine Bun Cinnamon 60g',      'لوزين بن قرفة 60غ',                  'Bakery', 'Piece', 0.120, 0.220],
    ['L\'usine Mini Croissant 30g',    'لوزين ميني كروسان 30غ',              'Bakery', 'Piece', 0.080, 0.160],
    ['Balila Date Kaak 50g',           'بليلة كعك تمر 50غ',                  'Bakery', 'Piece', 0.080, 0.160],
    ['Pita Bread Wholemeal 6pcs',      'خبز عربي قمح كامل 6 حبات',          'Bakery', 'Pack', 0.250, 0.420],
    ['Scotch Brite Heavy Sponge',      'سكوتش برايت إسفنجة ثقيلة',          'Household', 'Piece', 0.200, 0.400],
    ['Glad Zipper Bags 25pcs',         'جلاد أكياس سحاب 25 حبة',             'Household', 'Pack', 0.500, 0.800],
    ['Tamr Garbage Bags 45L 20pcs',    'تمر أكياس قمامة 45ل 20 حبة',         'Household', 'Pack', 0.350, 0.600],
    ['Paper Plates Square 25pcs',      'أطباق ورقية مربعة 25 حبة',           'Household', 'Pack', 0.350, 0.600],
    ['Viva Paper Towel 4-roll',        'فيفا مناشف 4 رول',                   'Household', 'Pack', 0.900, 1.400],
    ['Tissues Pocket Kleenex',         'كلينكس مناديل جيب',                  'Household', 'Pack', 0.150, 0.280],
    ['Candles White 12pcs',            'شموع بيضاء 12 حبة',                  'Household', 'Pack', 0.200, 0.380],
    ['Broom Handle Plastic',           'عصا مكنسة بلاستيك',                  'Household', 'Piece', 0.800, 1.300],
    ['Dust Pan',                       'جارف غبار',                          'Household', 'Piece', 0.400, 0.700],
    ['Del Monte Tomato Paste 200g',    'ديل مونت معجون طماطم 200غ',          'Canned Goods', 'Piece', 0.250, 0.450],
    ['Heinz Cream of Tomato Soup 400g','هاينز كريم شوربة طماطم 400غ',       'Canned Goods', 'Piece', 0.600, 0.900],
    ['Del Monte Fruit Cocktail 415g',  'ديل مونت كوكتيل فواكه 415غ',         'Canned Goods', 'Piece', 0.500, 0.800],
    ['Americana Corned Beef 340g',     'أمريكانا لحم بقر معلب 340غ',         'Canned Goods', 'Piece', 0.900, 1.300],
    ['Al Watan Tomato Juice 250ml',    'الوطن عصير طماطم 250مل',             'Canned Goods', 'Piece', 0.200, 0.380],
    ['Pacific Crab Meat 170g',         'باسيفيك سلطعون 170غ',                'Canned Goods', 'Piece', 0.600, 0.900],
    ['India Gate Sella Basmati 2kg',   'انديا جيت سيلا بسمتي 2كغ',           'Rice & Grains', 'Bag', 1.200, 1.800],
    ['Tilda Pure Basmati 5kg',         'تيلدا بسمتي خالص 5كغ',               'Rice & Grains', 'Bag', 3.500, 5.000],
    ['Egyptian Rice Short Grain 2kg',  'أرز مصري حبة قصيرة 2كغ',            'Rice & Grains', 'Bag', 0.700, 1.100],
    ['Lentils Green 500g',             'عدس أخضر 500غ',                      'Rice & Grains', 'Bag', 0.350, 0.600],
    ['Moong Dal 500g',                 'موج دال 500غ',                       'Rice & Grains', 'Bag', 0.350, 0.600],
    ['Urad Dal 500g',                  'أوراد دال 500غ',                     'Rice & Grains', 'Bag', 0.350, 0.600],
    ['Penne Rigate Barilla 500g',      'بيني ريغاتي باريلا 500غ',            'Rice & Grains', 'Pack', 0.600, 0.900],
    ['Tagliatelle Barilla 500g',       'تاجلياتيلي باريلا 500غ',             'Rice & Grains', 'Pack', 0.700, 1.000],
    ['Rigatoni Barilla 500g',          'ريغاتوني باريلا 500غ',               'Rice & Grains', 'Pack', 0.600, 0.900],
    ['Nissin Cup Noodles Chicken',     'نيسين كوب نودلز دجاج',               'Rice & Grains', 'Piece', 0.200, 0.380],
    ['Indomie Spicy Noodles 75g',      'إندومي نودلز حار 75غ',               'Rice & Grains', 'Piece', 0.080, 0.150],
    ['Bread Flour Strong 1kg',         'دقيق خبز قوي 1كغ',                   'Rice & Grains', 'Bag', 0.300, 0.550],
    ['Icing Sugar 500g',               'سكر بودرة 500غ',                     'Rice & Grains', 'Bag', 0.250, 0.450],
    ['Americana Chicken Kiev 400g',    'أمريكانا دجاج كييف 400غ',            'Frozen', 'Pack', 1.400, 2.000],
    ['Americana Fish Fillets 400g',    'أمريكانا فيليه سمك 400غ',            'Frozen', 'Pack', 1.500, 2.200],
    ['McCain Wedges 900g',             'مكين ويدجز 900غ',                    'Frozen', 'Bag', 1.400, 2.000],
    ['Americana Mozzarella Sticks 400g','أمريكانا عيدان موتزاريلا 400غ',    'Frozen', 'Pack', 1.500, 2.200],
    ['Al Kabeer Chicken Biryani 400g', 'الكبير كباب دجاج 400غ',             'Frozen', 'Pack', 1.800, 2.500],
    ['Kwality Strawberry Ice Cream 2L','كواليتي آيس كريم فراولة 2ل',        'Frozen', 'Tub', 1.800, 2.600],
    ['Magnum Almond Ice Cream Bar',    'ماجنوم لوز آيس كريم',                'Frozen', 'Piece', 0.450, 0.750],
    ['Cornetto Chocolate 120ml',       'كورنيتو شوكولاتة 120مل',             'Frozen', 'Piece', 0.250, 0.450],
    ['Americana Frozen Spring Rolls 20pcs','أمريكانا ربيع ملفوف 20 حبة',   'Frozen', 'Pack', 1.400, 2.000],
    ['Sunsilk Conditioner 200ml',      'سانسيلك بلسم 200مل',                 'Personal Care', 'Piece', 0.700, 1.100],
    ['Pantene Conditioner 200ml',      'بانتين بلسم 200مل',                  'Personal Care', 'Piece', 0.850, 1.250],
    ['Dove Body Wash 250ml',           'دوف غسول جسم 250مل',                 'Personal Care', 'Piece', 1.000, 1.500],
    ['Lifebuoy Hand Wash 250ml',       'لايفبوي غسول يد 250مل',              'Personal Care', 'Piece', 0.500, 0.800],
    ['Dettol Hand Wash 250ml',         'ديتول غسول يد 250مل',                'Personal Care', 'Piece', 0.500, 0.800],
    ['Colgate Max Fresh Toothpaste 125ml','كولجيت ماكس فريش 125مل',         'Personal Care', 'Piece', 0.450, 0.750],
    ['Signal Toothpaste 75ml',         'سيجنال معجون أسنان 75مل',            'Personal Care', 'Piece', 0.300, 0.550],
    ['Oral-B Pro-Health Toothbrush',   'أورال-بي برو هيلث فرشاة أسنان',      'Personal Care', 'Piece', 0.400, 0.700],
    ['Always Pads Night 8pcs',         'أولويز فوط ليلية 8 حبات',            'Personal Care', 'Pack', 0.400, 0.700],
    ['Comfort Sport Deo Spray 150ml',  'كومفورت مزيل رذاذ 150مل',            'Personal Care', 'Piece', 0.700, 1.100],
    ['Vaseline Aloe Lotion 400ml',     'فازلين لوشن ألوي 400مل',             'Personal Care', 'Piece', 0.800, 1.200],
    ['Al Doha Fenugreek 100g',         'الدوحة حلبة 100غ',                   'Spices', 'Pack', 0.200, 0.400],
    ['Al Doha Coriander 100g',         'الدوحة كزبرة 100غ',                  'Spices', 'Pack', 0.200, 0.400],
    ['Al Doha Nutmeg 50g',             'الدوحة جوزة الطيب 50غ',              'Spices', 'Pack', 0.350, 0.600],
    ['Al Doha Cloves 50g',             'الدوحة قرنفل 50غ',                   'Spices', 'Pack', 0.350, 0.600],
    ['Al Doha Dried Lime 100g',        'الدوحة ليمي مجفف 100غ',              'Spices', 'Pack', 0.250, 0.500],
    ['Noor Corn Oil 1.8L',             'نور زيت ذرة 1.8ل',                   'Spices', 'Bottle', 0.900, 1.400],
    ['Borges Olive Oil 1L',            'بورجيز زيت زيتون 1ل',                'Spices', 'Bottle', 2.500, 3.500],
    ['Red Wine Vinegar 500ml',         'خل نبيذ أحمر 500مل',                 'Spices', 'Bottle', 0.400, 0.700],
    ['Ariel 3in1 Pods 12pcs',          'أريال 3 في 1 كبسولة 12 حبة',         'Cleaning', 'Pack', 1.500, 2.200],
    ['Tide Liquid 2L',                 'تايد سائل 2ل',                       'Cleaning', 'Bottle', 2.000, 2.800],
    ['Sunlight Bar Soap 400g',         'سانلايت صابون بار 400غ',             'Cleaning', 'Pack', 0.300, 0.550],
    ['Harpic Power Plus 750ml',        'هاربيك باور بلس 750مل',              'Cleaning', 'Bottle', 0.900, 1.300],
    ['Flash Liquid Soap 500ml',        'فلاش صابون سائل 500مل',              'Cleaning', 'Bottle', 0.600, 0.950],
    ['Mr Muscle Kitchen Cleaner 500ml','مستر ماسل منظف مطبخ 500مل',         'Cleaning', 'Bottle', 0.700, 1.100],
    ['Glade Air Freshener 300ml',      'جليد معطر جو 300مل',                 'Cleaning', 'Bottle', 0.900, 1.400],
    ['Domestos Extended Germ Kill 750ml','دومستوس كلور مقوى 750مل',          'Cleaning', 'Bottle', 0.500, 0.850],
    ['Pampers Baby Wipes 72pcs',       'بامبرز مناديل أطفال 72 ورقة',        'Baby', 'Pack', 0.600, 0.950],
    ['Huggies Baby Wipes 56pcs',       'هاجيز مناديل أطفال 56 ورقة',         'Baby', 'Pack', 0.600, 0.950],
    ['Nestlé NAN Pro HA1 400g',        'نستله نان برو هايبو-ألرجينيك 1 - 400غ','Baby', 'Tin', 4.000, 5.500],
    ['Aptamil Follow On 2 400g',       'أبتاميل متابعة 2 - 400غ',            'Baby', 'Tin', 4.000, 5.500],
    ['Nestlé Cerelac Oats 250g',       'نستله سيريلاك شوفان 250غ',           'Baby', 'Pack', 1.500, 2.200],
    ['Pigeon Baby Bottle 240ml',       'بيجون زجاجة رضاعة 240مل',           'Baby', 'Piece', 1.800, 2.600],
    ['Farlin Baby Bottle 120ml',       'فارلين زجاجة رضاعة 120مل',           'Baby', 'Piece', 1.200, 1.800],
    ['Johnson Baby Oil 200ml',         'جونسون زيت أطفال 200مل',             'Baby', 'Bottle', 0.600, 0.950],
    ['Lipton Chamomile Tea 25bags',    'ليبتون شاي بابونج 25 كيس',           'Tea & Coffee', 'Box', 0.500, 0.850],
    ['Tapal Family Mixture Tea 450g',  'تاپل شاي عائلي 450غ',                'Tea & Coffee', 'Pack', 1.200, 1.800],
    ['Nestle Milo 400g',               'نستله ميلو 400غ',                    'Tea & Coffee', 'Tin', 1.800, 2.600],
    ['Ovaltine 400g',                  'أوفالتين 400غ',                      'Tea & Coffee', 'Tin', 1.600, 2.400],
    ['Bru Instant Coffee 100g',        'برو قهوة فورية 100غ',                'Tea & Coffee', 'Jar', 1.000, 1.500],
    ['Hana Green Cardamom 250g',       'هنا هيل أخضر 250غ',                  'Tea & Coffee', 'Pack', 1.000, 1.600],
    ['Galaxy Ripple 50g',              'جالاكسي ريبل 50غ',                   'Confectionery', 'Piece', 0.250, 0.450],
    ['Cadbury Caramel 120g',           'كادبوري كراميل 120غ',                'Confectionery', 'Piece', 0.600, 0.950],
    ['Kinder Joy 20g',                 'كيندر جوي 20غ',                      'Confectionery', 'Piece', 0.250, 0.450],
    ['Smarties Tube 38g',              'سمارتيز أنبوب 38غ',                   'Confectionery', 'Piece', 0.200, 0.380],
    ['Wonka Nerds 46g',                'وونكا نيردز 46غ',                    'Confectionery', 'Piece', 0.250, 0.450],
    ['Chupa Chups Lollipop',           'تشوبا تشوبس مصاصة',                  'Confectionery', 'Piece', 0.050, 0.120],
    ['Cadbury Roses Box 252g',         'كادبوري روزيز علبة 252غ',            'Confectionery', 'Box', 2.000, 2.800],
    ['Luxury Dates Box 500g',          'علبة تمر فاخرة 500غ',                'Confectionery', 'Box', 2.500, 3.800],
    ['San Benedetto Water 500ml',      'سان بنيديتو ماء 500مل',              'Water', 'Piece', 0.150, 0.280],
    ['Aquafina 1.5L',                  'أكوافينا 1.5ل',                      'Water', 'Piece', 0.080, 0.160],
    ['Nestle Pure Life 500ml',         'نستله بيور لايف 500مل',              'Water', 'Piece', 0.050, 0.100],
    ['Nestle Pure Life 1.5L',          'نستله بيور لايف 1.5ل',               'Water', 'Piece', 0.080, 0.160],
    ['Masafi Water 330ml',             'مصافي ماء 330مل',                    'Water', 'Piece', 0.050, 0.100],
    ['Safa Sparkling 500ml',           'صفا فوارة 500مل',                    'Water', 'Piece', 0.150, 0.280],
    ['Voss Still Water 375ml',         'فوس ماء صافٍ 375مل',                 'Water', 'Piece', 0.600, 0.950],
    ['Evian 1.5L',                     'إيفيان 1.5ل',                        'Water', 'Piece', 0.400, 0.700],
    ['Baraka Water 500ml',             'بركة ماء 500مل',                     'Water', 'Piece', 0.050, 0.100],
    ['Oasis Lemon Water 500ml',        'أوسيس ماء ليمون 500مل',              'Water', 'Piece', 0.080, 0.160],
    // Additional ~200 SKUs to reach ~800 total
    ['Almarai Milk Skimmed 1L',        'ألماراي حليب خالي الدسم 1ل',         'Dairy', 'Piece', 0.350, 0.500],
    ['Almarai Milk Full Fat 4L',       'ألماراي حليب كامل 4ل',               'Dairy', 'Piece', 1.200, 1.700],
    ['Saudia Full Cream Milk 1L',      'سعودية حليب كامل 1ل',                'Dairy', 'Piece', 0.300, 0.450],
    ['Tropicana OJ 1L',                'تروبيكانا عصير برتقال 1ل',           'Beverages', 'Piece', 1.200, 1.800],
    ['Almarai Yoghurt Apricot 170g',   'ألماراي زبادي مشمش 170غ',            'Dairy', 'Piece', 0.130, 0.220],
    ['President Cream Cheese 150g',    'بريزيدينت جبن كريمي 150غ',           'Dairy', 'Piece', 0.900, 1.350],
    ['President Brie 125g',            'بريزيدينت بري 125غ',                 'Dairy', 'Piece', 1.200, 1.800],
    ['Castello Blue Cheese 150g',      'كاستيلو جبن أزرق 150غ',              'Dairy', 'Piece', 1.500, 2.200],
    ['Philadelphia Full Fat 200g',     'فيلادلفيا كامل الدسم 200غ',          'Dairy', 'Piece', 1.100, 1.600],
    ['Almarai Sour Cream 200ml',       'ألماراي كريمة حامضة 200مل',          'Dairy', 'Piece', 0.500, 0.800],
    ['Galaxy Caramel Crunch 100g',     'جالاكسي كراميل كرانش 100غ',          'Confectionery', 'Piece', 0.450, 0.750],
    ['Lindor Swiss Ball 3pcs',         'ليندور كرة سويسرية 3 حبات',          'Confectionery', 'Pack', 0.600, 1.000],
    ['After Eight Mint Choco 300g',    'آفتر إيت شوكولاتة نعناع 300غ',       'Confectionery', 'Box', 2.500, 3.500],
    ['Quality Street 220g',            'كواليتي ستريت 220غ',                 'Confectionery', 'Box', 1.800, 2.600],
    ['Haribo Strawberry 80g',          'هاريبو فراولة 80غ',                  'Confectionery', 'Piece', 0.350, 0.600],
    ['Starburst Tropical 45g',         'ستاربيرست تروبيكال 45غ',             'Confectionery', 'Piece', 0.200, 0.380],
    ['Mentos Spearmint 38g',           'مينتوس سبيرمنت 38غ',                 'Confectionery', 'Piece', 0.150, 0.280],
    ['Pez Dispenser + Refill',         'بيز موزع + إعادة تعبئة',            'Confectionery', 'Piece', 0.300, 0.550],
    ['Coca-Cola 2L Bottle',            'كوكا كولا 2ل زجاجة',                'Beverages', 'Piece', 0.350, 0.600],
    ['Pepsi 2L Bottle',                'بيبسي 2ل زجاجة',                    'Beverages', 'Piece', 0.350, 0.600],
    ['7UP 2L Bottle',                  '7أب 2ل زجاجة',                      'Beverages', 'Piece', 0.350, 0.600],
    ['Sprite 2L Bottle',               'سبرايت 2ل زجاجة',                   'Beverages', 'Piece', 0.350, 0.600],
    ['Fanta Orange 2L Bottle',         'فانتا برتقال 2ل',                    'Beverages', 'Piece', 0.350, 0.600],
    ['Mountain Dew 1.5L Bottle',       'ماونتن ديو 1.5ل',                   'Beverages', 'Piece', 0.200, 0.380],
    ['Mirinda Orange 1.5L Bottle',     'ميرندا برتقال 1.5ل',                'Beverages', 'Piece', 0.200, 0.380],
    ['Lipton Ice Tea Mango 500ml',     'ليبتون شاي مانجو 500مل',             'Beverages', 'Piece', 0.250, 0.450],
    ['Nestea Lemon 500ml',             'نستي ليمون 500مل',                   'Beverages', 'Piece', 0.250, 0.450],
    ['Oasis Mango 500ml',              'أوسيس مانجو 500مل',                  'Beverages', 'Piece', 0.200, 0.380],
    ['Redbull 473ml XL',               'ريد بول 473مل XL',                   'Beverages', 'Piece', 1.000, 1.500],
    ['Monster Ultra 500ml',            'مونستر ألترا 500مل',                  'Beverages', 'Piece', 0.700, 1.100],
    ['Burn Energy 250ml',              'بيرن طاقة 250مل',                    'Beverages', 'Piece', 0.500, 0.850],
    ['Power Horse Energy 500ml',       'باور هورس طاقة 500مل',               'Beverages', 'Piece', 0.600, 0.950],
    ['Masafi Water 5L',                'مصافي ماء 5ل',                       'Water', 'Piece', 0.250, 0.450],
    ['Al Ain Water 5L',                'العين ماء 5ل',                       'Water', 'Piece', 0.250, 0.450],
    ['Crystal Water 5L',               'كريستال ماء 5ل',                    'Water', 'Piece', 0.250, 0.450],
    ['Arwa Water 5L',                  'أروى ماء 5ل',                        'Water', 'Piece', 0.200, 0.400],
    ['Nestle Pure Life 5L',            'نستله بيور لايف 5ل',                 'Water', 'Piece', 0.250, 0.450],
    ['San Benedetto Sparkling 500ml',  'سان بنيديتو فوارة 500مل',            'Water', 'Piece', 0.200, 0.380],
    ['Schweppes Sparkling 500ml',      'شويبس فوارة 500مل',                  'Water', 'Piece', 0.200, 0.380],
    ['L\'usine Sandwich Bread Whole',  'لوزين خبز ساندوتش قمح كامل',        'Bakery', 'Piece', 0.250, 0.420],
    ['Americana Cheese Croissant 60g', 'أمريكانا كروسان جبن 60غ',            'Bakery', 'Piece', 0.150, 0.280],
    ['L\'usine Donuts 2pcs',           'لوزين دونات 2 حبة',                  'Bakery', 'Pack', 0.200, 0.380],
    ['L\'usine Muffin Chocolate 80g',  'لوزين مافن شوكولاتة 80غ',            'Bakery', 'Piece', 0.150, 0.280],
    ['Fresh Pita Bread 10pcs',         'خبز عربي طازج 10 حبات',              'Bakery', 'Pack', 0.300, 0.500],
    ['Shawarma Bread Large 5pcs',      'خبز شاورما كبير 5 حبات',             'Bakery', 'Pack', 0.250, 0.450],
    ['Al Kabeer Chicken Shawarma 400g','الكبير شاورما دجاج 400غ',            'Frozen', 'Pack', 1.800, 2.600],
    ['Americana Shrimp Tempura 400g',  'أمريكانا روبيان تيمبورا 400غ',       'Frozen', 'Pack', 2.000, 2.800],
    ['Al Kabeer Lamb Kebab 400g',      'الكبير كباب ضأن 400غ',               'Frozen', 'Pack', 2.500, 3.500],
    ['McCain Sweet Potato Fries 500g', 'مكين بطاطا حلوة 500غ',               'Frozen', 'Bag', 1.200, 1.800],
    ['Americana Corn Dogs 500g',       'أمريكانا كورن دوج 500غ',             'Frozen', 'Pack', 1.400, 2.000],
    ['Kwality Mango Ice Cream 2L',     'كواليتي آيس كريم مانجو 2ل',          'Frozen', 'Tub', 1.800, 2.600],
    ['Magnum White Ice Cream',         'ماجنوم أبيض آيس كريم',               'Frozen', 'Piece', 0.450, 0.750],
    ['Twister Ice Cream Bar',          'تويستر آيس كريم',                    'Frozen', 'Piece', 0.200, 0.400],
    ['Paddle Pop Lion Bar',            'بادل بوب ليون',                      'Frozen', 'Piece', 0.150, 0.300],
    ['Calippo Orange Sorbet',          'كاليبو برتقال سوربيه',               'Frozen', 'Piece', 0.250, 0.450],
    ['Americana Mixed Seafood 400g',   'أمريكانا ميكس مأكولات بحرية 400غ',  'Frozen', 'Bag', 2.000, 2.800],
    ['Del Monte Mango Slices 415g',    'ديل مونت شرائح مانجو 415غ',          'Canned Goods', 'Piece', 0.500, 0.800],
    ['Heinz Spaghetti in Sauce 400g',  'هاينز سباغيتي بالصلصة 400غ',         'Canned Goods', 'Piece', 0.500, 0.800],
    ['Knorr Chicken Broth Tetra 500ml','كنور مرق دجاج 500مل',                'Canned Goods', 'Piece', 0.600, 0.950],
    ['Dole Peach Slices 415g',         'دول شرائح خوخ 415غ',                 'Canned Goods', 'Piece', 0.500, 0.800],
    ['Pacific Salmon 213g',            'باسيفيك سلمون 213غ',                  'Canned Goods', 'Piece', 0.900, 1.400],
    ['Kraft Cheese Spread 230g',       'كرافت جبن قابل للدهن 230غ',          'Canned Goods', 'Piece', 0.700, 1.100],
    ['Americana Turkey Luncheon 340g', 'أمريكانا لانشيون ديك رومي 340غ',     'Canned Goods', 'Piece', 0.700, 1.000],
    ['Hero Strawberry Jam 340g',       'هيرو مربى فراولة 340غ',              'Canned Goods', 'Piece', 0.700, 1.100],
    ['Smucker Grape Jam 340g',         'سمكرز مربى عنب 340غ',                'Canned Goods', 'Piece', 0.700, 1.100],
    ['Al Rashidi Honey 250g',          'الراشدي عسل 250غ',                   'Canned Goods', 'Piece', 1.200, 1.800],
    ['Baladna Honey 500g',             'بلدنا عسل 500غ',                     'Canned Goods', 'Piece', 2.000, 3.000],
    ['India Gate Super Basmati 2kg',   'انديا جيت سوبر بسمتي 2كغ',           'Rice & Grains', 'Bag', 1.200, 1.800],
    ['Khazana Basmati 5kg',            'خزانة بسمتي 5كغ',                    'Rice & Grains', 'Bag', 2.800, 4.000],
    ['Egyptian Rice White 2kg',        'أرز مصري أبيض 2كغ',                  'Rice & Grains', 'Bag', 0.750, 1.200],
    ['Black Lentils 500g',             'عدس أسود 500غ',                      'Rice & Grains', 'Bag', 0.300, 0.550],
    ['Split Chickpeas 500g',           'حمص مقشر 500غ',                      'Rice & Grains', 'Bag', 0.300, 0.550],
    ['Coarse Bulgur 500g',             'برغل خشن 500غ',                      'Rice & Grains', 'Bag', 0.250, 0.500],
    ['Farfalle Barilla 500g',          'فارفالي باريلا 500غ',                 'Rice & Grains', 'Pack', 0.600, 0.950],
    ['Linguine Barilla 500g',          'لينجويني باريلا 500غ',               'Rice & Grains', 'Pack', 0.600, 0.950],
    ['Orzo Pasta 500g',                'شعيرية أوريزو 500غ',                  'Rice & Grains', 'Pack', 0.400, 0.700],
    ['Mama Noodles Tom Yum 90g',       'ماما نودلز توم يم 90غ',               'Rice & Grains', 'Piece', 0.100, 0.200],
    ['Indomie Special Chicken 75g',    'إندومي دجاج خاص 75غ',                'Rice & Grains', 'Piece', 0.080, 0.160],
    ['Nissin Cup Noodles Seafood',     'نيسين كوب نودلز بحري',               'Rice & Grains', 'Piece', 0.200, 0.400],
    ['Cake Mix Pillsbury 500g',        'خلطة كيك بيلسبري 500غ',              'Rice & Grains', 'Pack', 0.800, 1.200],
    ['Pancake Mix 400g',               'خلطة بان كيك 400غ',                   'Rice & Grains', 'Pack', 0.600, 1.000],
    ['Semolina Fine 1kg',              'سميد ناعم 1كغ',                       'Rice & Grains', 'Bag', 0.200, 0.400],
    ['Corn Starch 400g',               'نشا 400غ',                            'Rice & Grains', 'Pack', 0.250, 0.450],
    ['Brown Rice 1kg',                 'أرز بني 1كغ',                         'Rice & Grains', 'Bag', 0.400, 0.700],
    ['Al Doha Seven Spices 100g',      'الدوحة سبع بهارات 100غ',              'Spices', 'Pack', 0.250, 0.500],
    ['Al Doha Paprika 100g',           'الدوحة بابريكا 100غ',                 'Spices', 'Pack', 0.250, 0.450],
    ['Al Doha Dried Thyme 50g',        'الدوحة زعتر مجفف 50غ',               'Spices', 'Pack', 0.150, 0.300],
    ['Al Doha Sumac 100g',             'الدوحة سماق 100غ',                    'Spices', 'Pack', 0.250, 0.450],
    ['Al Doha Hawaij Mix 50g',         'الدوحة مزيج هوايج 50غ',              'Spices', 'Pack', 0.200, 0.400],
    ['Tabasco Green Sauce 60ml',       'تاباسكو صلصة خضراء 60مل',            'Spices', 'Bottle', 0.700, 1.100],
    ['Frank\'s RedHot Sauce 148ml',    'فرانكس صلصة حارة 148مل',             'Spices', 'Bottle', 0.900, 1.400],
    ['Heinz Mayonnaise 270g',          'هاينز مايونيز 270غ',                  'Spices', 'Piece', 0.600, 0.950],
    ['Hellmann\'s Mayonnaise 270g',    'هيلمانز مايونيز 270غ',               'Spices', 'Piece', 0.700, 1.100],
    ['Best Foods Mayo Light 270g',     'بيست فودز مايونيز لايت 270غ',         'Spices', 'Piece', 0.600, 0.950],
    ['Knorr Hollandaise Sauce Mix',    'كنور مزيج صلصة هولانديز',             'Spices', 'Pack', 0.600, 0.950],
    ['Colman\'s Mustard 190g',         'كولمانز خردل 190غ',                  'Spices', 'Piece', 0.700, 1.100],
    ['Worcestershire Sauce 150ml',     'صلصة ورسترشاير 150مل',               'Spices', 'Bottle', 0.600, 0.950],
    ['Lyle\'s Golden Syrup 454g',      'ليلز شيرة ذهبية 454غ',               'Spices', 'Tin', 0.900, 1.400],
    ['Maple Syrup 250ml',              'شيرة القيقب 250مل',                   'Spices', 'Bottle', 1.500, 2.200],
    ['Sesame Oil 250ml',               'زيت سمسم 250مل',                      'Spices', 'Bottle', 0.600, 1.000],
    ['Pomegranate Molasses 250ml',     'دبس رمان 250مل',                      'Spices', 'Bottle', 0.500, 0.900],
    ['Lemon Juice Concentrate 250ml',  'عصير ليمون مركز 250مل',              'Spices', 'Bottle', 0.300, 0.550],
    ['Ariel Pods 3in1 16pcs',          'أريال كبسولات 3في1 - 16 حبة',        'Cleaning', 'Pack', 1.500, 2.200],
    ['Lenor Fabric Softener 1L',       'لينور منعم ملابس 1ل',                'Cleaning', 'Bottle', 0.900, 1.400],
    ['Bold Powder Detergent 3kg',      'بولد مسحوق غسيل 3كغ',               'Cleaning', 'Bag', 2.500, 3.500],
    ['Sunlight Lemon Dish Liquid 1L',  'سانلايت ليمون جلي 1ل',               'Cleaning', 'Bottle', 0.700, 1.100],
    ['Mr Muscle Bathroom Spray 500ml', 'مستر ماسل رذاذ حمام 500مل',          'Cleaning', 'Bottle', 0.700, 1.100],
    ['Pledge Multi Surface Spray 300ml','بليدج رذاذ متعدد الأسطح 300مل',    'Cleaning', 'Bottle', 1.000, 1.500],
    ['Scotch Brite Scouring Pad',      'سكوتش برايت لوح تنظيف',              'Cleaning', 'Piece', 0.200, 0.400],
    ['Vileda Mop Bucket Set',          'فيليدا ممسحة مع دلو',                'Household', 'Set', 3.500, 5.000],
    ['Steel Wool 3pcs',                'سلك تنظيف 3 حبات',                   'Cleaning', 'Pack', 0.150, 0.300],
    ['Flash Floor Cleaner 1L',         'فلاش منظف أرضيات 1ل',               'Cleaning', 'Bottle', 0.700, 1.100],
    ['Gillette Blue3 Disposable 3pcs', 'جيليت بلو3 شفرات 3 حبات',            'Personal Care', 'Pack', 0.700, 1.100],
    ['Bic Shaver 3pcs',                'بيك شفرات 3 حبات',                   'Personal Care', 'Pack', 0.300, 0.600],
    ['Clearasil Acne Wash 150ml',      'كليراسيل غسول حب الشباب 150مل',      'Personal Care', 'Piece', 1.200, 1.800],
    ['Neutrogena Hydra Boost 50ml',    'نيتروجينا هايدرا بوست 50مل',         'Personal Care', 'Piece', 2.500, 3.500],
    ['Olay Total Effects 50ml',        'أوليه توتال إيفكتس 50مل',            'Personal Care', 'Piece', 2.500, 3.500],
    ['Sunscreen SPF50 150ml',          'واقي شمس SPF50 150مل',                'Personal Care', 'Piece', 1.500, 2.200],
    ['Band-Aid Assorted 20pcs',        'باند إيد متنوعة 20 حبة',             'Personal Care', 'Pack', 0.500, 0.850],
    ['Strepsils Lemon 24pcs',          'ستريبسلز ليمون 24 حبة',               'Personal Care', 'Pack', 0.500, 0.850],
    ['Gaviscon Suspension 150ml',      'جافيسكون معلق 150مل',                'Personal Care', 'Piece', 1.200, 1.800],
    ['Rennie Antacid 36pcs',           'ريني مضاد حموضة 36 حبة',              'Personal Care', 'Pack', 0.600, 1.000],
    ['Pampers Swim Pants M-4 12pcs',   'بامبرز بنطال سباحة M-4 12 حبة',      'Baby', 'Pack', 1.200, 1.800],
    ['Huggies XL-5 Pull Ups 28pcs',    'هاجيز XL-5 بول-أبز 28 حبة',          'Baby', 'Pack', 2.800, 4.000],
    ['Nestlé Gerber Banana 113g',      'نستله جيربر موز 113غ',               'Baby', 'Jar', 0.400, 0.700],
    ['Nestlé Gerber Pear 113g',        'نستله جيربر كمثرى 113غ',             'Baby', 'Jar', 0.400, 0.700],
    ['Aptamil Pepti 1 400g',           'أبتاميل بيبتي 1 - 400غ',             'Baby', 'Tin', 5.000, 7.000],
    ['Nutramigen 400g',                'نوترامجين 400غ',                      'Baby', 'Tin', 5.500, 7.500],
    ['Mam Baby Bottle 260ml',          'مام زجاجة رضاعة 260مل',              'Baby', 'Piece', 1.500, 2.200],
    ['Avent Classic Baby Bottle 260ml','أفنت كلاسيك زجاجة 260مل',            'Baby', 'Piece', 1.800, 2.600],
    ['Wipes Pampers Sensitive 72pcs',  'مناديل بامبرز حساسة 72 ورقة',        'Baby', 'Pack', 0.700, 1.100],
    ['Lipton Hibiscus Tea 25bags',     'ليبتون شاي كركديه 25 كيس',           'Tea & Coffee', 'Box', 0.500, 0.850],
    ['Nescafe Classic 500g',           'نسكافيه كلاسيك 500غ',                'Tea & Coffee', 'Jar', 3.500, 5.000],
    ['Lavazza Rossa 250g',             'لافازا روسا 250غ',                    'Tea & Coffee', 'Pack', 2.800, 4.000],
    ['Illy Coffee Espresso 250g',      'إيلي قهوة اسبريسو 250غ',             'Tea & Coffee', 'Pack', 4.000, 5.500],
    ['Coffeemate Creamer Vanilla 400g','كوفيميت كريمر فانيلا 400غ',           'Tea & Coffee', 'Tin', 1.600, 2.400],
    ['Barista Oat Milk 1L',            'بريستا حليب شوفان 1ل',               'Tea & Coffee', 'Piece', 1.200, 1.800],
    ['Gladfield Filter Coffee 250g',   'جلادفيلد قهوة فلتر 250غ',            'Tea & Coffee', 'Pack', 2.000, 3.000],
    ['Dallmayr Espresso 500g',         'دالماير اسبريسو 500غ',               'Tea & Coffee', 'Pack', 4.500, 6.500],
    ['Green Tea Matcha Powder 100g',   'بودرة ماتشا شاي أخضر 100غ',          'Tea & Coffee', 'Pack', 1.500, 2.500],
    ['Glad Freezer Bags 20pcs',        'جلاد أكياس تجميد 20 حبة',            'Household', 'Pack', 0.500, 0.800],
    ['Albal Heavy Foil 20m',           'ألبال فويل ثقيل 20م',                'Household', 'Roll', 0.550, 0.900],
    ['Glad Press n Seal 30m',          'جلاد برس أند سيل 30م',               'Household', 'Roll', 0.800, 1.300],
    ['Kleenex Mansize Tissue 80pcs',   'كلينكس مناديل كبيرة 80 ورقة',        'Household', 'Box', 0.400, 0.700],
    ['Viva Multi-Use Cloth 20pcs',     'فيفا قماش متعدد الاستخدام 20 حبة',   'Household', 'Pack', 0.600, 0.950],
    ['Scotch Magic Tape 3pcs',         'سكوتش لاصق شفاف 3 حبات',            'Household', 'Pack', 0.350, 0.600],
    ['Staples Rubber Bands 100pcs',    'مطاطات 100 حبة',                      'Household', 'Pack', 0.100, 0.200],
    ['AA Battery Duracell 4pcs',       'دوراسيل بطارية AA 4 حبات',           'Household', 'Pack', 0.700, 1.100],
    ['AAA Battery Duracell 4pcs',      'دوراسيل بطارية AAA 4 حبات',          'Household', 'Pack', 0.700, 1.100],
    ['9V Battery Duracell 1pc',        'دوراسيل بطارية 9V حبة',              'Household', 'Piece', 0.500, 0.850],
    ['Energizer AA 4pcs',              'إنيرجايزر بطارية AA 4 حبات',         'Household', 'Pack', 0.600, 1.000],
    ['Energizer AAA 4pcs',             'إنيرجايزر بطارية AAA 4 حبات',        'Household', 'Pack', 0.600, 1.000],
    ['Insect Repellent Raid 300ml',    'ريد طارد حشرات 300مل',               'Household', 'Bottle', 0.900, 1.400],
    ['Cockroach Bait Raid',            'ريد طعم صراصير',                      'Household', 'Piece', 0.700, 1.100],
    ['Fly Catcher Strips 4pcs',        'شرائط قاطعة ذباب 4 حبات',            'Household', 'Pack', 0.250, 0.500],
    ['Naphthalene Balls 200g',         'كرات النفتالين 200غ',                  'Household', 'Pack', 0.200, 0.400],
    ['Air Freshener Glade Gel 150g',   'جليد جل معطر 150غ',                   'Household', 'Piece', 0.500, 0.850],
    ['Candle Decorative Set',          'شموع ديكور طقم',                      'Household', 'Set', 0.500, 0.900],
    ['Coffee Paper Filter 100pcs',     'فلتر ورق قهوة 100 حبة',              'Household', 'Pack', 0.300, 0.550],
    ['Toothpick Bamboo 500pcs',        'عود سمك بامبو 500 حبة',              'Household', 'Box', 0.150, 0.300],
    ['Nail Brush Plastic',             'فرشاة أظافر بلاستيك',                'Household', 'Piece', 0.150, 0.300],
    ['Sponge Cloth 2pcs',              'إسفنجة قماشية 2 حبة',                'Household', 'Pack', 0.200, 0.400],
    ['Ketchup Al Alali 500g',          'كاتشب العلالي 500غ',                 'Canned Goods', 'Piece', 0.400, 0.700],
    ['Hunts Tomato Ketchup 570g',      'هانتس كاتشب طماطم 570غ',             'Canned Goods', 'Piece', 0.550, 0.900],
    ['Al Alali Tuna 185g',             'العلالي تونة 185غ',                  'Canned Goods', 'Piece', 0.200, 0.380],
    ['Del Monte Mixed Fruit 415g',     'ديل مونت فاكهة مشكلة 415غ',          'Canned Goods', 'Piece', 0.450, 0.750],
    ['Americana Baked Beans 415g',     'أمريكانا فاصوليا بالصلصة 415غ',      'Canned Goods', 'Piece', 0.400, 0.700],
    ['Heinz Onion Gravy 400g',         'هاينز مرق بصل 400غ',                 'Canned Goods', 'Piece', 0.500, 0.850],
    ['Balsamic Vinegar 250ml',         'خل بلسمي 250مل',                     'Spices', 'Bottle', 0.700, 1.200],
    ['Coconut Milk Chaokoh 400ml',     'حليب جوز هند 400مل',                 'Spices', 'Piece', 0.400, 0.700],
    ['Fish Sauce Tiparos 300ml',       'صلصة سمك 300مل',                     'Spices', 'Bottle', 0.400, 0.700],
    ['Oyster Sauce Lee Kum Kee 255g',  'صلصة محار 255غ',                     'Spices', 'Bottle', 0.500, 0.850],
    ['Sweet Chilli Sauce 350g',        'صلصة فلفل حلو 350غ',                 'Spices', 'Bottle', 0.500, 0.850],
    ['Peanut Sauce 250ml',             'صلصة فول سوداني 250مل',              'Spices', 'Bottle', 0.450, 0.800],
    ['Al Doha Star Anise 25g',         'الدوحة يانسون نجمي 25غ',             'Spices', 'Pack', 0.200, 0.400],
    ['Al Doha Coriander Seeds 100g',   'الدوحة بذور كزبرة 100غ',             'Spices', 'Pack', 0.200, 0.400],
    ['Al Doha White Pepper 100g',      'الدوحة فلفل أبيض 100غ',              'Spices', 'Pack', 0.300, 0.550],
    ['Almarai Mango Nectar 1L',        'ألماراي نكتار مانجو 1ل',             'Beverages', 'Piece', 0.600, 0.950],
    ['KDD Guava Juice 1L',             'كي دي دي عصير جوافة 1ل',             'Beverages', 'Piece', 0.550, 0.900],
    ['Almarai Pomegranate Juice 1L',   'ألماراي عصير رمان 1ل',               'Beverages', 'Piece', 0.700, 1.100],
    ['Nestle Nesquik Chocolate 400g',  'نستله نسكويك شوكولاتة 400غ',         'Beverages', 'Piece', 1.500, 2.200],
    ['Horlicks Malt Drink 500g',       'هورليكس مشروب شعير 500غ',            'Beverages', 'Piece', 1.800, 2.600],
    ['Ribena Blackcurrant 288ml',      'ريبينا كشمش 288مل',                  'Beverages', 'Piece', 0.350, 0.600],
    ['Rose Milk Syrup 750ml',          'شراب حليب الورد 750مل',              'Beverages', 'Piece', 0.500, 0.850],
    ['Vimto Cordial 300ml',            'فيمتو شراب صغير 300مل',              'Beverages', 'Piece', 0.450, 0.750],
    ['Aloe Vera Drink 500ml',          'مشروب ألوي فيرا 500مل',              'Beverages', 'Piece', 0.300, 0.550],
    ['Kombucha Original 330ml',        'كومبوشا أصلي 330مل',                 'Beverages', 'Piece', 0.700, 1.100],
    ['Al Ain Strawberry Milk 200ml',   'العين حليب فراولة 200مل',            'Dairy', 'Piece', 0.100, 0.200],
    ['KDD Banana Milk 200ml',          'كي دي دي حليب موز 200مل',            'Dairy', 'Piece', 0.100, 0.200],
    ['Almarai Salted Butter Spread 200g','ألماراي زبدة مالحة للدهن 200غ',    'Dairy', 'Piece', 0.600, 0.950],
    ['Lurpak Cook\'s Range Butter 250g','لورباك زبدة للطهي 250غ',            'Dairy', 'Piece', 1.200, 1.800],
    ['Kirkland Mozzarella 500g',       'كيركلاند موتزاريلا 500غ',            'Dairy', 'Piece', 1.500, 2.200],
    ['Americana Ice Cream Sandwich',   'أمريكانا ساندوتش آيس كريم',         'Frozen', 'Piece', 0.200, 0.380],
    ['Nestlé Drumstick Vanilla',       'نستله درمستيك فانيلا',               'Frozen', 'Piece', 0.300, 0.550],
    ['Al Kabeer Chicken Patties 400g', 'الكبير باتيز دجاج 400غ',             'Frozen', 'Pack', 1.400, 2.000],
    ['Americana Cheeseburger Patties', 'أمريكانا باتيز تشيز برجر',           'Frozen', 'Pack', 1.500, 2.200],
    ['McCain Crinkle Cut Fries 900g',  'مكين فريز كرينكل كت 900غ',           'Frozen', 'Bag', 1.500, 2.200],
    ['Americana Breaded Mushroom 400g','أمريكانا فطر مغطى بالفتات 400غ',    'Frozen', 'Pack', 1.200, 1.800],
    ['L\'usine Honey Cake 50g',        'لوزين كيك عسل 50غ',                  'Bakery', 'Piece', 0.100, 0.200],
    ['L\'usine Coconut Cake 50g',      'لوزين كيك جوز هند 50غ',              'Bakery', 'Piece', 0.100, 0.200],
    ['Americana Swiss Roll 60g',       'أمريكانا سويس رول 60غ',               'Bakery', 'Piece', 0.120, 0.220],
    ['Sesame Bread Sticks 150g',       'عصي خبز سمسم 150غ',                  'Bakery', 'Pack', 0.300, 0.550],
    ['Lemon Zest Muffin 80g',          'مافن ليمون 80غ',                      'Bakery', 'Piece', 0.150, 0.280],
    ['Garlic Bread Frozen 250g',       'خبز الثوم مجمد 250غ',                'Bakery', 'Pack', 0.600, 0.950],
    ['Briwat Biscuit 200g',            'بريوات بسكويت 200غ',                  'Snacks', 'Pack', 0.400, 0.700],
    ['Tiger Biscuit 200g',             'بسكويت تايغر 200غ',                   'Snacks', 'Pack', 0.300, 0.550],
    ['Arnotts Tim Tam 200g',           'أرنوتس تيم تام 200غ',                'Snacks', 'Pack', 1.200, 1.800],
    ['Mikado Sticks 75g',              'ميكادو عيدان شوكولاتة 75غ',           'Snacks', 'Piece', 0.500, 0.800],
    ['M&M\'s Crispy 45g',              'إم آند إم كريسبي 45غ',               'Snacks', 'Piece', 0.250, 0.450],
  ];

// Auto-generated size/pack variants to bring total to ~800
// Pattern: take a subset of templates and produce 2-litre / 6-pack / bulk variants
function generateExtraVariants() {
  const extra = [];
  // Multi-pack / bulk size variants for beverages and water
  const bulkBev = [
    ['Coca-Cola 330ml Can 6-Pack',     'كوكا كولا 330مل 6 علب',            'Beverages', 'Pack', 0.650, 1.000],
    ['Pepsi 330ml Can 6-Pack',         'بيبسي 330مل 6 علب',                 'Beverages', 'Pack', 0.650, 1.000],
    ['7UP 330ml Can 6-Pack',           '7أب 330مل 6 علب',                   'Beverages', 'Pack', 0.650, 1.000],
    ['Sprite 330ml Can 6-Pack',        'سبرايت 330مل 6 علب',                'Beverages', 'Pack', 0.650, 1.000],
    ['Fanta Orange 330ml 6-Pack',      'فانتا برتقال 6 علب',                'Beverages', 'Pack', 0.650, 1.000],
    ['Arwa Water 500ml 12-Pack',       'أروى ماء 500مل 12 قارورة',          'Water', 'Carton', 0.550, 0.900],
    ['Masafi Water 500ml 12-Pack',     'مصافي ماء 500مل 12 قارورة',         'Water', 'Carton', 0.550, 0.950],
    ['Al Ain Water 500ml 12-Pack',     'العين ماء 500مل 12 قارورة',         'Water', 'Carton', 0.550, 0.900],
    ['Oasis Water 1.5L 6-Pack',        'أوسيس ماء 1.5ل 6 قوارير',           'Water', 'Carton', 0.450, 0.850],
    ['Safa Water 1.5L 6-Pack',         'صفا ماء 1.5ل 6 قوارير',             'Water', 'Carton', 0.450, 0.850],
    ['Rani Float Mixed Fruit 240ml',   'راني فلوت فواكه مشكلة 240مل',       'Beverages', 'Piece', 0.150, 0.280],
    ['Rani Apple Juice 240ml',         'راني عصير تفاح 240مل',               'Beverages', 'Piece', 0.150, 0.280],
    ['KDD Laban 1L',                   'كي دي دي لبن 1ل',                   'Dairy', 'Piece', 0.350, 0.550],
    ['Almarai Laban 1L',               'ألماراي لبن 1ل',                    'Dairy', 'Piece', 0.350, 0.550],
    ['Lacnor Apple Juice 1L',          'لاكنور عصير تفاح 1ل',               'Beverages', 'Piece', 0.600, 0.900],
    ['Lacnor Guava Juice 1L',          'لاكنور عصير جوافة 1ل',              'Beverages', 'Piece', 0.600, 0.900],
    ['Minute Maid Mango 330ml',        'مينيت مايد مانجو 330مل',            'Beverages', 'Piece', 0.200, 0.380],
    ['Pocari Sweat 330ml',             'بوكاري سويت 330مل',                  'Beverages', 'Piece', 0.350, 0.600],
    ['Gatorade Orange 500ml',          'جاتوريد برتقالي 500مل',              'Beverages', 'Piece', 0.400, 0.700],
    ['Gatorade Lemon-Lime 500ml',      'جاتوريد ليمون لايم 500مل',          'Beverages', 'Piece', 0.400, 0.700],
    ['Nescafe 3in1 Sweet 20 sachets',  'نسكافيه 3 في 1 حلو 20 كيس',         'Tea & Coffee', 'Box', 1.200, 1.800],
    ['Nescafe Decaf 200g',             'نسكافيه ديكاف 200غ',                'Tea & Coffee', 'Jar', 2.800, 4.000],
    ['Lipton Peppermint 25bags',       'ليبتون نعناع 25 كيس',               'Tea & Coffee', 'Box', 0.500, 0.850],
    ['Lipton Ginger Lemon 25bags',     'ليبتون زنجبيل ليمون 25 كيس',        'Tea & Coffee', 'Box', 0.500, 0.850],
    ['Brooke Bond D Tea 450g',         'بروك بوند D شاي 450غ',              'Tea & Coffee', 'Pack', 1.200, 1.800],
    ['Milo 3in1 Sachet 30pcs',         'ميلو 3 في 1 - 30 كيس',              'Tea & Coffee', 'Box', 2.000, 2.800],
    ['Karak Cardamom Tea 500g',        'شاي كرك هيل 500غ',                  'Tea & Coffee', 'Pack', 1.500, 2.200],
    ['Arabic Coffee Medium Roast 250g','قهوة عربية تحميص متوسط 250غ',       'Tea & Coffee', 'Pack', 1.200, 1.800],
    ['Americana Hot Dog Beef 340g',    'أمريكانا هوت دوج لحم 340غ',         'Canned Goods', 'Piece', 0.900, 1.300],
    ['Heinz BBQ Sauce 220g',           'هاينز صلصة بي بي كيو 220غ',         'Canned Goods', 'Piece', 0.700, 1.100],
    ['Del Monte Kidney Beans 400g',    'ديل مونت فاصوليا 400غ',             'Canned Goods', 'Piece', 0.400, 0.700],
    ['Knorr Vegetable Broth 400g',     'كنور مرقة خضار 400غ',               'Canned Goods', 'Piece', 0.500, 0.800],
    ['Pacific Tuna Chunk 185g',        'باسيفيك تونة قطع 185غ',             'Canned Goods', 'Piece', 0.250, 0.450],
    ['Americana Chipolata Sausage 340g','أمريكانا سجق تشيبولاتا 340غ',      'Canned Goods', 'Piece', 0.900, 1.300],
    ['Al Doha Bay Leaves 10g',         'الدوحة ورق غار 10غ',                'Spices', 'Pack', 0.150, 0.300],
    ['Al Doha Saffron 1g',             'الدوحة زعفران 1غ',                  'Spices', 'Pack', 1.500, 2.500],
    ['Knorr Tomato Powder 50g',        'كنور بودرة طماطم 50غ',              'Spices', 'Pack', 0.200, 0.380],
    ['Sunflower Oil 5L',               'زيت عباد الشمس 5ل',                 'Spices', 'Bottle', 2.500, 3.800],
    ['Canola Oil 1.8L',                'زيت الكانولا 1.8ل',                  'Spices', 'Bottle', 1.000, 1.500],
    ['Al Doha Dried Ginger 100g',      'الدوحة زنجبيل مجفف 100غ',           'Spices', 'Pack', 0.200, 0.400],
    ['Maggi Cream of Mushroom Soup 63g','ماجي شوربة فطر كريمية 63غ',        'Spices', 'Pack', 0.300, 0.550],
    ['Lay\'s Salt & Vinegar 28g',      'لايز ملح وخل 28غ',                  'Snacks', 'Piece', 0.080, 0.160],
    ['Cheetos Jumbo Puffs 60g',        'شيتوس جمبو بافز 60غ',               'Snacks', 'Piece', 0.200, 0.380],
    ['Pringles Ranch 165g',            'برينجلز رانش 165غ',                  'Snacks', 'Piece', 0.700, 1.000],
    ['Oreo Double Stuf 137g',          'أوريو دبل ستاف 137غ',               'Snacks', 'Piece', 0.450, 0.700],
    ['Ritz Cheese Crackers 200g',      'ريتز جبن كراكر 200غ',               'Snacks', 'Piece', 0.550, 0.850],
    ['Kelloggs Honey Loops 375g',      'كيلوغز حلقات عسل 375غ',             'Snacks', 'Piece', 0.900, 1.400],
    ['Skippy Chunky PB 340g',          'سكيبي زبدة فول سوداني حبيبات 340غ', 'Snacks', 'Piece', 0.850, 1.250],
    ['Sunbulah Medjool Dates 500g',    'سنبلة تمر مجدول 500غ',              'Snacks', 'Pack', 2.000, 3.000],
    ['Bahlsen Waffeletten 100g',       'بالسن وافيليتن 100غ',               'Snacks', 'Piece', 0.600, 0.950],
    ['Americana Wafer Hazelnut 60g',   'أمريكانا ويفر هيزلنوت 60غ',         'Snacks', 'Piece', 0.080, 0.160],
    ['Galaxy Smooth Milk 110g',        'جالاكسي حليب ناعم 110غ',            'Confectionery', 'Piece', 0.500, 0.800],
    ['Cadbury Fruit & Nut 120g',       'كادبوري فاكهة ومكسرات 120غ',        'Confectionery', 'Piece', 0.600, 0.950],
    ['Rafaello 3pcs',                  'رافايلو 3 حبات',                    'Confectionery', 'Piece', 0.500, 0.800],
    ['Ferrero Rocher 6pcs',            'فيريرو روشيه 6 حبات',               'Confectionery', 'Pack', 0.900, 1.350],
    ['Bounty Coconut Dark 57g',        'باونتي جوز هند داكن 57غ',           'Confectionery', 'Piece', 0.200, 0.380],
    ['Snickers XL 75g',                'سنيكرز XL 75غ',                     'Confectionery', 'Piece', 0.350, 0.600],
    ['Haribo Happy Cola 80g',          'هاريبو كولا سعيدة 80غ',             'Confectionery', 'Piece', 0.400, 0.650],
    ['Mentos Fruit Roll 38g',          'مينتوس فواكه 38غ',                  'Confectionery', 'Piece', 0.150, 0.280],
    ['Trident Spearmint 14pcs',        'ترايدنت سبيرمنت 14 حبة',            'Confectionery', 'Pack', 0.150, 0.280],
    ['Cadbury Miniature Heroes 250g',  'كادبوري أبطال صغار 250غ',           'Confectionery', 'Box', 1.800, 2.600],
    ['Pampers Baby Dry XL-5 36pcs',    'بامبرز بيبي دراي XL-5 36 حبة',     'Baby', 'Pack', 2.800, 4.000],
    ['Huggies Pull-Ups L-4 32pcs',     'هاجيز بول-أبز L-4 32 حبة',         'Baby', 'Pack', 2.800, 4.000],
    ['Nestlé NAN Comfort 400g',        'نستله نان كومفورت 400غ',            'Baby', 'Tin', 3.800, 5.200],
    ['Beechnut Baby Food Carrot 113g', 'بيتشنات طعام أطفال جزر 113غ',       'Baby', 'Jar', 0.400, 0.700],
    ['Heinz Baby Rice Cereal 125g',    'هاينز حبوب أرز أطفال 125غ',         'Baby', 'Pack', 0.600, 0.950],
    ['Johnsons Baby Wash 500ml',       'جونسون غسول أطفال 500مل',           'Baby', 'Bottle', 1.000, 1.500],
    ['Cetaphil Baby Gentle Wash 200ml','سيتافيل غسول أطفال لطيف 200مل',    'Baby', 'Bottle', 2.500, 3.500],
    ['Mustela Baby Cream 100ml',       'موستيلا كريم أطفال 100مل',           'Baby', 'Tube', 2.200, 3.200],
    ['Dove Bar Soap 6-Pack',           'دوف صابون 6 حبات',                  'Personal Care', 'Pack', 1.200, 1.800],
    ['Lifebuoy Bar Soap 4-Pack',       'لايفبوي صابون 4 حبات',              'Personal Care', 'Pack', 0.350, 0.650],
    ['Colgate Toothpaste 2+1 promo',   'كولجيت معجون أسنان عرض 2+1',        'Personal Care', 'Pack', 0.700, 1.200],
    ['Oral-B Toothbrush 3-Pack',       'أورال-بي فرشاة أسنان 3 حبات',       'Personal Care', 'Pack', 0.900, 1.400],
    ['Head & Shoulders 600ml',         'هيد آند شولدرز 600مل',              'Personal Care', 'Piece', 1.600, 2.300],
    ['Dove Body Wash 500ml',           'دوف غسول جسم 500مل',                'Personal Care', 'Piece', 1.600, 2.300],
    ['Pantene Shampoo 400ml',          'بانتين شامبو 400مل',                 'Personal Care', 'Piece', 1.200, 1.800],
    ['Always Ultra Pads 14pcs',        'أولويز ألترا فوط 14 حبة',            'Personal Care', 'Pack', 0.500, 0.850],
    ['Dettol Soap Multi 6-Pack',       'ديتول صابون متعدد 6 حبات',           'Personal Care', 'Pack', 0.900, 1.400],
    ['Vicks VapoRub 25ml',             'فيكس فيبوروب 25مل',                  'Personal Care', 'Piece', 0.400, 0.700],
    ['Betadine Antiseptic 125ml',      'بيتادين مطهر 125مل',                 'Personal Care', 'Piece', 0.900, 1.400],
    ['Ariel Pods 3in1 32pcs',          'أريال كبسولات 3 في 1 - 32 حبة',     'Cleaning', 'Pack', 2.800, 4.000],
    ['Persil Color Powder 3kg',        'برسيل مسحوق ملون 3كغ',              'Cleaning', 'Bag', 2.500, 3.500],
    ['Comfort Concentrate 750ml',      'كومفورت مركز 750مل',                 'Cleaning', 'Bottle', 0.800, 1.200],
    ['Fairy Ultra Concentrate 320ml',  'فيري ألترا مركز 320مل',              'Cleaning', 'Bottle', 0.800, 1.200],
    ['Harpic Lavender 500ml',          'هاربيك لافندر 500مل',                'Cleaning', 'Bottle', 0.700, 1.100],
    ['Domestos Bleach Thick 1L',       'دومستوس كلور سميك 1ل',               'Cleaning', 'Bottle', 0.700, 1.100],
    ['Cillit Bang Spray 500ml',        'سيليت بانج رذاذ 500مل',              'Cleaning', 'Bottle', 0.900, 1.400],
    ['Glad Tall Kitchen Bags 20pcs',   'جلاد أكياس مطبخ طويلة 20 حبة',      'Household', 'Pack', 0.500, 0.850],
    ['Albal Foil 30m',                 'ألبال ورق 30م',                      'Household', 'Roll', 0.700, 1.100],
    ['Kleenex Dinner Napkins 200pcs',  'كلينكس مناديل عشاء 200 ورقة',       'Household', 'Pack', 0.600, 0.950],
    ['Sandwich Zip Bags 25pcs',        'أكياس سحاب ساندوتش 25 حبة',          'Household', 'Pack', 0.350, 0.600],
    ['Scotch Brite Cloth 1pcs',        'سكوتش برايت قماش 1 حبة',            'Household', 'Piece', 0.300, 0.550],
    ['Fairy Dish Liquid 2L',           'فيري سائل جلي 2ل',                   'Cleaning', 'Bottle', 1.800, 2.600],
    ['Ariel Liquid 3L',                'أريال سائل 3ل',                      'Cleaning', 'Bottle', 3.000, 4.200],
  ];
  return bulkBev;
}

function buildProducts() {
  const headers = ['Item Name','Arabic Name','SKU','Barcode','Category','Unit',
    'Purchase Rate','Selling Price','Reorder Level','Track Serial','Status',
    'Track Batch','Shelf Life Days'];

  const allTemplates = [...PRODUCT_TEMPLATES, ...PAD_TEMPLATES, ...generateExtraVariants()];
  const rows = [];
  let skuCounter = 1;
  let barcodeGapCount = 0;

  for (const [name, arabic, cat, unit, pMin, pMax] of allTemplates) {
    const sku = `BQ-${String(skuCounter).padStart(5, '0')}`;
    skuCounter++;

    // ~10% missing barcodes
    let barcode = '';
    if (barcodeGapCount % 10 !== 0) {
      barcode = String(ri(1000000000000, 9999999999999));
    }
    barcodeGapCount++;

    const purchaseRate = rp(pMin, pMax);
    const margin = 1 + rng() * 0.25 + 0.10;
    const sellingPrice = Math.max(purchaseRate + 0.005, +(purchaseRate * margin).toFixed(3));
    const reorderLevel = pick([5, 10, 12, 15, 20, 24, 30, 48]);
    const trackBatch = PERISHABLE_CATS.has(cat) ? 'Yes' : 'No';
    const shelfRange = SHELF[cat] || [0, 0];
    const shelfLife = shelfRange[0] === 0 ? '' : ri(shelfRange[0], shelfRange[1]);

    rows.push([
      name, arabic, sku, barcode, cat, unit,
      kwd(purchaseRate), kwd(sellingPrice),
      reorderLevel, 'No', 'Active',
      trackBatch, shelfLife
    ]);
  }

  return { content: csv(headers, rows), rows };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 03 — CUSTOMERS (~150)
// ═══════════════════════════════════════════════════════════════════════════════
const CUSTOMER_NAMES = [
  ['Umm Faisal Al-Rashidi', 'أم فيصل الرشيدي'],
  ['Abu Khalid Al-Mutairi', 'أبو خالد المطيري'],
  ['Maryam Al-Kandari', 'مريم الكندري'],
  ['Fahad Al-Enezi', 'فهد العنزي'],
  ['Nour Al-Azmi', 'نور العازمي'],
  ['Khaled Al-Harbi', 'خالد الحربي'],
  ['Sara Al-Sabah', 'سارة الصباح'],
  ['Jassim Al-Ajmi', 'جاسم العجمي'],
  ['Hessa Al-Qattan', 'حصة القطان'],
  ['Abdullah Al-Shammari', 'عبدالله الشمري'],
  ['Reem Al-Dousari', 'ريم الدوسري'],
  ['Tariq Al-Rashidi', 'طارق الرشيدي'],
  ['Dana Al-Mutairi', 'دانة المطيري'],
  ['Hamad Al-Azemi', 'حمد العازمي'],
  ['Fatima Al-Enezi', 'فاطمة العنزي'],
  ['Bader Al-Hajeri', 'بدر الحاجري'],
  ['Noura Al-Sabah', 'نورة الصباح'],
  ['Mishari Al-Otaibi', 'مشاري العتيبي'],
  ['Lulwa Al-Kandari', 'لولوة الكندري'],
  ['Saud Al-Mutairi', 'سعود المطيري'],
  ['Aisha Al-Rashidi', 'عائشة الرشيدي'],
  ['Faisal Al-Arbash', 'فيصل الأربش'],
  ['Maha Al-Hayem', 'مها الهيم'],
  ['Omar Al-Faresi', 'عمر الفارسي'],
  ['Zainab Al-Dosari', 'زينب الدوسري'],
  ['Sultan Al-Shammari', 'سلطان الشمري'],
  ['Lubna Al-Ajmi', 'لبنى العجمي'],
  ['Bassam Al-Rashidi', 'بسام الرشيدي'],
  ['Yasmine Al-Enezi', 'ياسمين العنزي'],
  ['Walid Al-Kandari', 'وليد الكندري'],
  // Expat names
  ['Rajesh Kumar', ''],
  ['Priya Sharma', ''],
  ['Mohammed Hassan', 'محمد حسن'],
  ['Ahmed Ibrahim', 'أحمد إبراهيم'],
  ['Ravi Patel', ''],
  ['Sunita Devi', ''],
  ['Deepak Singh', ''],
  ['Anjali Nair', ''],
  ['Vikram Rao', ''],
  ['Lakshmi Menon', ''],
  ['Manoj Pillai', ''],
  ['Suresh Nair', ''],
  ['Kavitha Reddy', ''],
  ['Arjun Mehta', ''],
  ['Pooja Gupta', ''],
  ['Sanjay Verma', ''],
  ['Meena Krishnan', ''],
  ['Ram Babu', ''],
  ['Geeta Shankar', ''],
  ['Naresh Tiwari', ''],
  ['Bashir Al-Ahmad', 'بشير الأحمد'],
  ['Hussain Al-Mansoori', 'حسين المنصوري'],
  ['Ali Hassan', 'علي حسن'],
  ['Ibrahim Yusuf', 'إبراهيم يوسف'],
  ['Khalil Mansour', 'خليل منصور'],
  ['Samir Boutros', 'سمير بطرس'],
  ['Nadia Khalil', 'نادية خليل'],
  ['Hana Al-Bakri', 'هناء البكري'],
  ['Zeina Al-Atrash', 'زينا الأطرش'],
  ['Rami Saleh', 'رامي صالح'],
  ['Fatimah Malik', 'فاطمة مالك'],
  ['Usman Ghani', ''],
  ['Amina Bibi', ''],
  ['Tariq Javaid', ''],
  ['Rehman Siddiqui', ''],
  ['Shaista Parveen', ''],
  ['Anwar Hussain', ''],
  ['Zahida Begum', ''],
  ['Mohammad Akram', ''],
  ['Nasreen Akhtar', ''],
  // More Kuwaiti names
  ['Abdulaziz Al-Hajri', 'عبدالعزيز الحاجري'],
  ['Latifa Al-Harbi', 'لطيفة الحربي'],
  ['Meshari Al-Bloushi', 'مشاري البلوشي'],
  ['Hala Al-Kandari', 'هالة الكندري'],
  ['Nawaf Al-Mutairi', 'نواف المطيري'],
  ['Asma Al-Rashidi', 'أسماء الرشيدي'],
  ['Turki Al-Enezi', 'تركي العنزي'],
  ['Rasha Al-Azemi', 'رشا العازمي'],
  ['Jasim Al-Otaibi', 'جاسم العتيبي'],
  ['Wafa Al-Sabah', 'وفاء الصباح'],
  ['Majed Al-Shammari', 'ماجد الشمري'],
  ['Ibtisam Al-Ajmi', 'ابتسام العجمي'],
  ['Fares Al-Rashidi', 'فارس الرشيدي'],
  ['Kholoud Al-Mutairi', 'خلود المطيري'],
  ['Nayef Al-Harbi', 'نايف الحربي'],
  ['Eman Al-Kandari', 'إيمان الكندري'],
  ['Dhafer Al-Azemi', 'ظافر العازمي'],
  ['Mona Al-Enezi', 'منى العنزي'],
  ['Sabah Al-Ahmad', 'صباح الأحمد'],
  ['Taif Al-Rashidi', 'طيف الرشيدي'],
  ['Nasir Al-Mutairi', 'ناصر المطيري'],
  ['Ghada Al-Sabah', 'غادة الصباح'],
  ['Hussain Al-Ajmi', 'حسين العجمي'],
  ['Dalal Al-Kandari', 'دلال الكندري'],
  ['Adnan Al-Harbi', 'عدنان الحربي'],
  ['Ruba Al-Enezi', 'ربى العنزي'],
  ['Talal Al-Azemi', 'طلال العازمي'],
  ['Hind Al-Rashidi', 'هند الرشيدي'],
  ['Saad Al-Otaibi', 'سعد العتيبي'],
  ['Manal Al-Mutairi', 'منال المطيري'],
  // Fill to 150 with more expats and Kuwaiti
  ['Ghassan Khalaf', 'غسان خلف'],
  ['Rola Youssef', 'رولا يوسف'],
  ['Badr Al-Bloushi', 'بدر البلوشي'],
  ['Ghufran Idris', 'غفران إدريس'],
  ['Adel Al-Qalaf', 'عادل القلاف'],
  ['Samira Nouri', 'سميرة نوري'],
  ['Waleed Al-Hajeri', 'وليد الحاجري'],
  ['Suad Al-Rashidi', 'سعاد الرشيدي'],
  ['Jamal Hassan', 'جمال حسن'],
  ['Nida Alam', ''],
  ['Karim El-Masri', 'كريم المصري'],
  ['Amr Salama', 'عمرو سلامة'],
  ['Dina Youssef', 'دينا يوسف'],
  ['Tarek Fahmy', 'طارق فهمي'],
  ['Hany Bishara', 'هاني بشارة'],
  ['Rania Sayed', 'رانيا سيد'],
  ['Wissam Farhat', 'وسام فرحات'],
  ['Charbel Khoury', ''],
  ['Maroun Atallah', ''],
  ['Elie Hanna', ''],
  ['Georgio Mansour', ''],
  ['Carla Rizk', ''],
  ['Fawzi Abou-Hamdan', ''],
  ['Zeynep Yilmaz', ''],
  ['Mehmet Kaya', ''],
  ['Ayasha Johnson', ''],
  ['Ngozi Okonkwo', ''],
  ['James Mwangi', ''],
  ['Thanh Nguyen', ''],
  ['Hai Van Tran', ''],
  ['Suwannee Charoenwong', ''],
  ['Pilar Santos', ''],
  ['Eduardo Reyes', ''],
  ['Maria Dela Cruz', ''],
  ['Rosalinda Bautista', ''],
  ['Bernardo Ibarra', ''],
  ['Cathy Florendo', ''],
  ['Ana Pacleb', ''],
  ['Roberto Aguilar', ''],
  ['Lourdes Esteves', ''],
  ['Rommel Aquino', ''],
  ['Rizalina Cruz', ''],
  ['Julius Dela Torre', ''],
  ['Annabelle Santiago', ''],
  ['Noel Reyes', ''],
  ['Merlyn Panganiban', ''],
  ['Dante Ramos', ''],
  ['Concepcion Flores', ''],
];

function randomCivilId() {
  // 12-digit Kuwaiti Civil ID
  return String(ri(200000000000, 399999999999));
}

function randomMobile() {
  // Kuwait mobile: starts 5,6,9 + 7 digits
  const prefix = pick(['5', '6', '9']);
  return `+965 ${prefix}${ri(100, 999)} ${ri(1000, 9999)}`;
}

function buildCustomers() {
  const headers = ['Ledger Name','Name in Arabic','Mobile','Email','Civil ID','Opening Balance (KWD)','Notes'];
  const rows = [];
  // 25 customers with a tab (opening balance = money they owe = shown as positive debit)
  const tabIndices = new Set();
  while (tabIndices.size < 25) { tabIndices.add(ri(0, CUSTOMER_NAMES.length - 1)); }

  for (let i = 0; i < Math.min(150, CUSTOMER_NAMES.length); i++) {
    const [engName, arName] = CUSTOMER_NAMES[i];
    const hasMobile = rng() > 0.15;
    const hasEmail = rng() > 0.6;
    const hasCivilId = rng() > 0.3;
    const mobile = hasMobile ? randomMobile() : '';
    const email = hasEmail ? `customer.${i}@example.com` : '';
    const civilId = hasCivilId ? randomCivilId() : '';
    let balance;
    if (tabIndices.has(i)) {
      // Owe between 1.000 and 150.000 KWD — shown as negative (parenthesis) because it's a receivable credit
      // Actually: customer owing money = debit on their ledger = positive opening balance
      balance = kwd(rp(1.000, 150.000));
    } else {
      balance = '0.000';
    }
    const notes = tabIndices.has(i) ? 'Regular tab customer' : '';
    rows.push([engName, arName, mobile, email, civilId, balance, notes]);
  }

  // Compute total debtors
  let totalDebtors = 0;
  for (const r of rows) {
    const b = parseFloat(r[5]);
    if (b > 0) totalDebtors += b;
  }

  return { content: csv(headers, rows), totalDebtors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 04 — SUPPLIERS
// ═══════════════════════════════════════════════════════════════════════════════
const SUPPLIERS = [
  ['Sultan Center Wholesale',      'سلطان سنتر للجملة',          '+965 2225 1111', 'wholesale@sultan.com.kw',  30,  3200.000],
  ['Almarai Kuwait Distributor',   'موزع ألماراي الكويت',         '+965 2444 5000', 'orders@almarai-kw.com',    7,   1850.500],
  ['KDD Company',                  'شركة كي دي دي',               '+965 2476 7777', 'orders@kdd.com.kw',        14,  2640.750],
  ['Americana Group Kuwait',       'مجموعة أمريكانا الكويت',       '+965 2570 6006', 'supply@americana.com.kw',  14,  1920.250],
  ['Kuwait Danish Dairy',          'ألبان دانماركية الكويت',       '+965 2224 3322', 'info@kdd-dairy.com.kw',    7,     0.000],
  ['Nestle Kuwait Distributor',    'موزع نستله الكويت',           '+965 2298 3300', 'nestle@distributor.kw',    30,  4100.000],
  ['Procter & Gamble Distributor', 'موزع بروكتر وغامبل',          '+965 2571 5500', 'pg@dist.com.kw',           30,     0.000],
  ['Unilever Kuwait Distributor',  'موزع يونيليفر الكويت',         '+965 2223 7700', 'unilever@dist.kw',         30,  1450.000],
  ['Al Rashidi Irma Co.',          'شركة الراشدي إيرما',          '+965 2242 0011', 'orders@rashidi-irma.com',  0,      0.000],
  ['General Mills Distributor',    'موزع جنرال ميلز',             '+965 2248 5400', 'gm@dist-kw.com',           14,   750.000],
  ['Heinz Arabia Distributor',     'موزع هاينز العربية',           '+965 2242 8800', 'heinz@arabia-dist.kw',     14,   980.500],
  ['Kuwait Bakery Supplies',       'مستلزمات المخابز الكويتية',    '+965 2222 6644', 'info@kwbakery.kw',          7,     0.000],
];

function buildSuppliers() {
  const headers = ['Supplier Name','Arabic Name','Phone','Email','Payment Terms (Days)','Opening Balance (KWD)'];
  const rows = SUPPLIERS.map(([name, ar, phone, email, terms, bal]) =>
    [name, ar, phone, email, terms === 0 ? '' : terms, kwd(bal)]
  );

  let totalCreditors = 0;
  for (const [,,,,, bal] of SUPPLIERS) totalCreditors += bal;

  return { content: csv(headers, rows), totalCreditors };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 05 — OPENING STOCK
// ═══════════════════════════════════════════════════════════════════════════════
function addDays(baseDate, days) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildOpeningStock(productRows) {
  const headers = ['SKU','Warehouse','Quantity','Unit Cost','Batch No','Expiry Date'];
  const rows = [];
  const warehouseName = 'Baqala Umm Faisal';
  const baseDate = new Date('2026-01-01');

  // Track total inventory value
  let totalInventoryValue = 0;
  let batchCounter = 142;

  // Deliberately include some expired / near-expiry batches (first 5 perishables)
  let nearExpiryCount = 0;

  for (const productRow of productRows) {
    const [,, sku,,cat,, purchaseRateStr,,,,, trackBatch] = productRow;
    const purchaseRate = parseFloat(purchaseRateStr);

    const qty = ri(12, 200);
    // Unit cost close to purchase rate ± small variance
    const variance = (rng() - 0.5) * 0.020;
    const unitCost = Math.max(0.001, +(purchaseRate + variance).toFixed(3));

    totalInventoryValue += qty * unitCost;

    let batchNo = '';
    let expiryDate = '';

    if (trackBatch === 'Yes') {
      batchNo = `B2026-${String(batchCounter).padStart(4, '0')}`;
      batchCounter++;
      // First 5 perishables: expired or near-expiry (test traps)
      if (nearExpiryCount < 3) {
        // Already expired
        expiryDate = addDays(baseDate, -ri(5, 30));
        nearExpiryCount++;
      } else if (nearExpiryCount < 5) {
        // Near-expiry (within 7 days from Jan 1 2026 = effectively already passed by June 2026)
        expiryDate = addDays(baseDate, ri(1, 7));
        nearExpiryCount++;
      } else {
        // Normal: 1-18 months ahead of baseDate
        expiryDate = addDays(baseDate, ri(30, 540));
      }
    }

    rows.push([sku, warehouseName, qty, kwd(unitCost), batchNo, expiryDate]);
  }

  return { content: csv(headers, rows), totalInventoryValue: +totalInventoryValue.toFixed(3) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 06 — TRIAL BALANCE
// ═══════════════════════════════════════════════════════════════════════════════
function buildTrialBalance(totalInventoryValue, totalDebtors, totalCreditors) {
  const headers = ['Account Name','Debit (KWD)','Credit (KWD)'];

  const cashInHand      = 4850.750;
  const bankNBK         = 12340.500;
  const furniture       = 3200.000;

  const totalDebits_known = cashInHand + bankNBK + furniture + totalInventoryValue + totalDebtors;
  const totalCredits_known = totalCreditors;

  // Owner capital = balancing figure
  const ownerCapital = +(totalDebits_known - totalCredits_known).toFixed(3);

  const rows = [
    ['Cash in Hand',              kwd(cashInHand),         ''],
    ['Bank - NBK Current Account',kwd(bankNBK),            ''],
    ['Inventory (Merchandise)',   kwd(totalInventoryValue), ''],
    ['Furniture & Equipment',     kwd(furniture),           ''],
    ['Sundry Debtors',            kwd(totalDebtors),        ''],
    ['Sundry Creditors',          '',                       kwd(totalCreditors)],
    ['Owner Capital',             '',                       kwd(ownerCapital)],
  ];

  const totalDebit  = +(cashInHand + bankNBK + furniture + totalInventoryValue + totalDebtors).toFixed(3);
  const totalCredit = +(totalCreditors + ownerCapital).toFixed(3);

  return {
    content: csv(headers, rows),
    totalDebit,
    totalCredit,
    ownerCapital
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 07 — README
// ═══════════════════════════════════════════════════════════════════════════════
function buildReadme(counts, tb) {
  return `# Umm Faisal Baqala — Test Data Fixture

## Persona

**Store:** Baqala Umm Faisal
**Location:** Rumaithiya, Kuwait
**Currency:** KWD (3 decimal places) — no VAT
**Payment mix:** ~60% cash, ~40% KNET
**Sector:** FMCG / Neighbourhood grocery (baqala)

## File Inventory

| File | Rows (data) | Purpose |
|------|-------------|---------|
| 01-categories.csv | ${counts.categories} | 15 grocery categories (EN + AR) |
| 02-products.csv | ${counts.products} | FMCG SKUs, realistic Kuwaiti brands |
| 03-customers.csv | ${counts.customers} | Neighbourhood regulars, incl. tabs |
| 04-suppliers.csv | ${counts.suppliers} | 12 FMCG distributors |
| 05-opening-stock.csv | ${counts.stock} | Opening inventory, single warehouse |
| 06-trial-balance.csv | ${counts.tb} | Chart of accounts opening balances |

## Deliberate Test Traps

1. **Missing barcodes (~10%):** Every 10th product in 02-products.csv has an empty Barcode field. Tests the importer's barcode-gap detection and graceful handling.

2. **Expired batches (3 items):** The first three perishable SKUs in 05-opening-stock.csv have Expiry Dates in December 2025 (before the Jan 1 2026 base date). These trigger the FEFO/expiry-blocking alert on stock movement.

3. **Near-expiry batches (2 items):** Items 4–5 in perishable sequence expire within 7 days of Jan 1 2026, testing the near-expiry warning threshold.

4. **Customer tabs (25 accounts):** 25 of the 150 customers carry a positive Opening Balance (KWD) representing an outstanding tab. Their sum equals Sundry Debtors in the trial balance.

5. **AP opening balances:** Several suppliers carry non-zero Opening Balance representing payables owed. Their sum equals Sundry Creditors in the trial balance.

## Trial Balance Summary

- Total Debits:  KWD ${tb.totalDebit.toFixed(3)}
- Total Credits: KWD ${tb.totalCredit.toFixed(3)}
- Balanced: ${Math.abs(tb.totalDebit - tb.totalCredit) < 0.002 ? 'YES ✓' : 'NO — CHECK GENERATOR'}

## KWD / No-VAT Notes

- All monetary values are stored to **3 decimal places** (fils).
- Kuwait has no VAT. No tax fields anywhere in these fixtures.
- Barcodes are 13-digit EAN-format (not necessarily valid EAN check-digits — they are test data).
`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════
console.log('Generating Umm Faisal fixtures...');

const catContent = buildCategories();
write('01-categories.csv', catContent);

const { content: prodContent, rows: productRows } = buildProducts();
write('02-products.csv', prodContent);

const { content: custContent, totalDebtors } = buildCustomers();
write('03-customers.csv', custContent);

const { content: suppContent, totalCreditors } = buildSuppliers();
write('04-suppliers.csv', suppContent);

const { content: stockContent, totalInventoryValue } = buildOpeningStock(productRows);
write('05-opening-stock.csv', stockContent);

const tb = buildTrialBalance(totalInventoryValue, totalDebtors, totalCreditors);
write('06-trial-balance.csv', tb.content);

// Row counts
const counts = {
  categories: CATEGORIES.length,
  products:   productRows.length,
  customers:  Math.min(150, CUSTOMER_NAMES.length),
  suppliers:  SUPPLIERS.length,
  stock:      productRows.length,
  tb:         7,
};

const readme = buildReadme(counts, tb);
write('README.md', readme);

console.log('\n─── Summary ─────────────────────────────────────────────');
console.log(`  Categories:       ${counts.categories}`);
console.log(`  Products (SKUs):  ${counts.products}`);
console.log(`  Customers:        ${counts.customers}`);
console.log(`  Suppliers:        ${counts.suppliers}`);
console.log(`  Stock lines:      ${counts.stock}`);
console.log(`  TB accounts:      ${counts.tb}`);
console.log(`\n  Inventory value:  KWD ${totalInventoryValue.toFixed(3)}`);
console.log(`  Sundry Debtors:   KWD ${totalDebtors.toFixed(3)}`);
console.log(`  Sundry Creditors: KWD ${totalCreditors.toFixed(3)}`);
console.log(`  Owner Capital:    KWD ${tb.ownerCapital.toFixed(3)}`);
console.log(`\n  Trial Balance Total Debit:  KWD ${tb.totalDebit.toFixed(3)}`);
console.log(`  Trial Balance Total Credit: KWD ${tb.totalCredit.toFixed(3)}`);
const balanced = Math.abs(tb.totalDebit - tb.totalCredit) < 0.002;
console.log(`  BALANCED: ${balanced ? 'YES ✓' : 'NO ✗ — INVESTIGATE'}`);
console.log('─────────────────────────────────────────────────────────\n');
