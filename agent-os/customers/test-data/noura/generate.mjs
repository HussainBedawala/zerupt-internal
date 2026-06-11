/**
 * Noura Perfumes & Cosmetics — Kuwait test-data generator
 * Fixed seed (mulberry32) → fully reproducible output
 * Run: node generate.mjs  (from the noura/ directory)
 */

import fs from 'fs';
import path from 'path';

// ── PRNG ───────────────────────────────────────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(0xDEADBEEF);

function ri(min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function rp(arr) { return arr[Math.floor(rng() * arr.length)]; }
function fmt(n) { return n.toFixed(3); }

// ── BOM + write helper ─────────────────────────────────────────────────────
const BOM = '﻿';
function write(filename, rows) {
  const content = BOM + rows.join('\n') + '\n';
  fs.writeFileSync(path.join(import.meta.dirname, filename), content, 'utf8');
  console.log(`  wrote ${filename}  (${rows.length - 1} data rows)`);
}

// ══════════════════════════════════════════════════════════════════════════
// 01 — CATEGORIES
// ══════════════════════════════════════════════════════════════════════════
const CATEGORIES = [
  ['Perfumes',          '',            'عطور'],
  ['Oud & Bakhoor',     'Perfumes',    'عود وبخور'],
  ["Women's Fragrance", 'Perfumes',    'عطور نسائية'],
  ["Men's Fragrance",   'Perfumes',    'عطور رجالية'],
  ['Makeup',            '',            'مكياج'],
  ['Skincare',          '',            'العناية بالبشرة'],
  ['Haircare',          '',            'العناية بالشعر'],
  ['Gift Sets',         '',            'هدايا وطقم'],
  ['Body Care',         '',            'العناية بالجسم'],
  ['Nails',             '',            'الأظافر'],
  ['Accessories',       '',            'إكسسوارات'],
  ['Testers',           '',            'عينات وتجارب'],
];

const catRows = ['Category Name,Parent Category,Description',
  ...CATEGORIES.map(([n, p, d]) => `${n},${p},${d}`)];
write('01-categories.csv', catRows);

// ══════════════════════════════════════════════════════════════════════════
// 02 — PRODUCTS  (~400 SKUs, ~20 bundles)
// ══════════════════════════════════════════════════════════════════════════

// Template pools
const oudNames = [
  'Oud Al-Maliki','Oud Sultani','Oud Al-Layl','Oud Kashmir','Oud Amber Royal',
  'Oud Al-Zerup','Oud Al-Dhabi','Oud Musk Noir','Oud Rose Gold','Oud Saffron',
  'Oud Bakhoor Classic','Oud Al-Naseem','Oud Taif Rose','Oud Midnight','Oud Crystal',
];
const oudAr = [
  'عود الملكي','عود سلطاني','عود الليل','عود كشمير','عود العنبر الملكي',
  'عود الزيروب','عود الذهبي','عود المسك النوير','عود الورد الذهبي','عود الزعفران',
  'عود البخور الكلاسيكي','عود النسيم','عود طائف الورد','عود منتصف الليل','عود الكريستال',
];
const womenFragNames = [
  'Rose de Noura 50ml','Jasmine Bloom 100ml','Velvet Iris 75ml','Pink Saffron 50ml',
  'Musc Blanc 100ml','Fleur Orientale 50ml','Amber Blossom 75ml','Neroli Dreams 100ml',
  'Cherry Blossom Mist 100ml','Gardenia Silk 50ml','Patchouli Rose 75ml','Vanilla Oud 100ml',
  'Midnight Rose 50ml','Aqua Flora 75ml','Peony Elegance 100ml','Lily & Musk 100ml',
  'Coco Amber 50ml','Iris Royale 75ml','Bergamot Bliss 100ml','Citrus Bouquet 50ml',
];
const womenFragAr = [
  'روز دو نورا','ياسمين بلوم','بنفسج مخملي','زعفران وردي','مسك أبيض',
  'فلور أوريانتال','عنبر الأزهار','أحلام النيرولي','كرز أبيض','حرير الغارديني',
  'باتشولي ورد','فانيلا عود','وردة منتصف الليل','أكوا فلورا','بيوني إليغانس',
  'ليلي ومسك','كوكو عنبر','إيريس رويال','برغموت بليس','باقة الحمضيات',
];
const menFragNames = [
  'Atlas Noir 100ml','Cedar Storm 75ml','Dark Oud Man 100ml','Blue Ocean 100ml',
  'Leather & Smoke 75ml','Desert King 100ml','Aqua Virilis 100ml','Black Saffron 50ml',
  'Vetiver Elite 75ml','Sandalwood Sultan 100ml','Tobacco Oud 50ml','Silver Musk 100ml',
  'Noir Intense 75ml','Oud & Spice 100ml','Mountain Cedar 75ml',
];
const menFragAr = [
  'أطلس نوار','عاصفة الأرز','عود رجالي داكن','المحيط الأزرق','الجلد والدخان',
  'ملك الصحراء','أكوا فيريليس','زعفران أسود','فيتيفر إيليت','صندل السلطان',
  'تبغ وعود','مسك فضي','نوار إنتنس','عود وبهارات','أرز الجبل',
];
const makeupNames = [
  'Matte Lipstick - Red Passion','Matte Lipstick - Nude Rose','Matte Lipstick - Berry',
  'Lip Gloss - Crystal Clear','Lip Gloss - Pink Shimmer','Foundation SPF30 - Ivory',
  'Foundation SPF30 - Sand','Foundation SPF30 - Honey','Foundation SPF30 - Caramel',
  'Concealer - Light','Concealer - Medium','Concealer - Dark',
  'Eyeshadow Palette 12 Colors','Eyeshadow Palette 18 Colors - Nudes',
  'Mascara Volume Black','Mascara Lengthening','Eyeliner Pen Black','Eyeliner Pencil Brown',
  'Highlighter Stick - Gold','Highlighter Powder - Pearl','Blush Palette - Coral',
  'Contour Kit','Setting Powder - Translucent','Setting Spray 100ml',
  'Brow Pencil - Dark Brown','Brow Pencil - Taupe','BB Cream SPF25',
  'Tinted Moisturiser','Lip Liner - Nude','Lip Liner - Red',
];
const makeupAr = [
  'أحمر شفاه مات - أحمر','أحمر شفاه مات - وردي','أحمر شفاه مات - توت',
  'لمعة شفاه - شفاف','لمعة شفاه - وردي','كريم أساس واقي شمس - عاجي',
  'كريم أساس - رملي','كريم أساس - عسلي','كريم أساس - كراميل',
  'كونسيلر - فاتح','كونسيلر - متوسط','كونسيلر - داكن',
  'لوح ظلال 12 لون','لوح ظلال 18 لون','ماسكارا حجم أسود','ماسكارا تطويل',
  'قلم كحل أسود','قلم كحل بني','قلم هايلايتر ذهبي','هايلايتر بودرة',
  'لوح رووج مرجاني','كيت كونتور','بودرة تثبيت','سبراي تثبيت',
  'قلم حواجب بني','قلم حواجب رمادي','كريم بي بي','مرطب ملون','محدد شفاه وردي','محدد شفاه أحمر',
];
const skincareNames = [
  'Vitamin C Serum 30ml','Hyaluronic Acid Serum 30ml','Retinol Night Cream 50ml',
  'Rose Water Toner 200ml','Micellar Water 400ml','Clay Face Mask 100ml',
  'Sheet Mask - Brightening','Sunscreen SPF50 50ml','Eye Cream 15ml',
  'Cleansing Foam 150ml','Moisturiser Light 50ml','Moisturiser Rich 50ml',
  'Exfoliating Scrub 100ml','Snail Serum 30ml','Niacinamide 10% 30ml',
  'AHA BHA Toner 200ml','Bakuchiol Oil 30ml','Peptide Cream 50ml',
];
const skincareAr = [
  'سيروم فيتامين سي','سيروم حامض الهيالورونيك','كريم ريتينول الليلي',
  'تونر ماء الورد','ماء مزيل الميسيلار','قناع طين',
  'ماسك ورقي مضيء','واقي شمس','كريم العيون',
  'رغوة تنظيف','مرطب خفيف','مرطب غني',
  'سكراب تقشير','سيروم الحلزون','نياسيناميد',
  'تونر AHA BHA','زيت باكوشيول','كريم ببتيد',
];
const haircareNames = [
  'Argan Oil Shampoo 400ml','Keratin Conditioner 400ml','Hair Mask - Repair 300ml',
  'Leave-In Serum 100ml','Scalp Scrub 200ml','Dry Shampoo 200ml',
  'Hair Oil - Moroccan 100ml','Heat Protectant Spray 200ml',
];
const haircareAr = [
  'شامبو زيت أركان','بلسم كيراتين','قناع شعر تصليح',
  'سيروم بدون شطف','سكراب فروة الرأس','شامبو جاف',
  'زيت شعر مغربي','رذاذ حماية الحرارة',
];
const bodyCareNames = [
  'Body Lotion - Rose 400ml','Body Butter - Shea 200ml','Body Scrub - Coffee 300ml',
  'Shower Gel - Jasmine 400ml','Hand Cream - Almond 75ml','Foot Cream 100ml',
  'Body Oil - Oud Musk 100ml','Talcum Powder - Fresh 200g',
];
const bodyCareAr = [
  'لوشن جسم وردي','زبدة جسم شيا','سكراب جسم قهوة',
  'جل استحمام ياسمين','كريم يدين لوز','كريم قدمين',
  'زيت جسم عود مسك','بودرة طلك',
];
const nailNames = [
  'Nail Polish - Red Classic','Nail Polish - Nude Beige','Nail Polish - Coral Pink',
  'Nail Polish - Deep Plum','Nail Polish - Glitter Gold','Nail Polish - French White',
  'Base Coat 15ml','Top Coat 15ml','Nail Polish Remover 100ml','Cuticle Oil 10ml',
];
const nailAr = [
  'طلاء أظافر أحمر','طلاء أظافر بيج','طلاء أظافر مرجاني',
  'طلاء أظافر بنفسجي','طلاء أظافر جلتر ذهبي','طلاء أظافر أبيض فرنسي',
  'طلاء أساس','طلاء علوي','مزيل طلاء أظافر','زيت أظافر',
];
const accessoriesNames = [
  'Perfume Atomiser - Rose Gold','Perfume Atomiser - Silver','Makeup Brush Set 12pc',
  'Sponge Blender Pack 2','Beauty Organiser Bag','Mirror Compact - Gold',
  'Eyelash Curler','Tweezers Set 3pc','Headband Spa Pack',
];
const accessoriesAr = [
  'مرذاذ عطر ذهبي وردي','مرذاذ عطر فضي','طقم فرش مكياج',
  'إسفنجة بلندر','حقيبة تنظيم مكياج','مرآة مدمجة ذهبية',
  'جهاز تجعيد الرموش','طقم ملاقط','عصابة شعر',
];
const testerNames = [
  'Tester - Oud Al-Maliki 5ml','Tester - Rose de Noura 5ml','Tester - Atlas Noir 5ml',
  'Tester - Jasmine Bloom 5ml','Tester - Dark Oud Man 5ml',
];
const testerAr = [
  'تستر عود الملكي','تستر روز دو نورا','تستر أطلس نوار',
  'تستر ياسمين بلوم','تستر عود رجالي داكن',
];

// Price ranges per category  [purchaseMin, purchaseMax, sellMin, sellMax]
const priceRanges = {
  'Oud & Bakhoor':       [30, 60, 55, 95],
  "Women's Fragrance":   [8,  25, 15, 45],
  "Men's Fragrance":     [10, 28, 18, 50],
  'Makeup':              [1.2, 8, 2.5, 18],
  'Skincare':            [2,  15, 4.5, 28],
  'Haircare':            [2,  10, 4,  18],
  'Body Care':           [1.5, 7, 3,  13],
  'Nails':               [0.7, 3, 1.5, 6],
  'Accessories':         [1,   8, 2,  15],
  'Testers':             [0.5, 2, 1,  3.5],
};

function randPrice(min, max) {
  const v = min + rng() * (max - min);
  return Math.round(v * 1000) / 1000;
}

const productRows = ['Item Name,Arabic Name,SKU,Barcode,Category,Unit,Purchase Rate,Selling Price,Reorder Level,Track Serial,Status,Is Bundle'];
const products = []; // { sku, name, category, isBundle }

let skuCounter = 1000;
function nextSku(prefix) { skuCounter++; return `${prefix}-${skuCounter}`; }

function addProducts(nameArr, arArr, category, prefix) {
  const [pmin, pmax, smin, smax] = priceRanges[category];
  for (let i = 0; i < nameArr.length; i++) {
    const sku = nextSku(prefix);
    const barcode = String(rng() * 1e13 | 0).padStart(13, '0');
    const pr = randPrice(pmin, pmax);
    const minSell = Math.max(smin, pr * 1.35);
    const sp = randPrice(Math.min(minSell, smax * 0.7), smax);
    const reorder = ri(3, 20);
    const ar = arArr[i] || '';
    products.push({ sku, name: nameArr[i], category, isBundle: false });
    productRows.push(`${nameArr[i]},${ar},${sku},${barcode},${category},Piece,${fmt(pr)},${fmt(sp)},${reorder},No,Active,No`);
  }
}

addProducts(oudNames, oudAr, 'Oud & Bakhoor', 'OUD');
addProducts(womenFragNames, womenFragAr, "Women's Fragrance", 'WF');
addProducts(menFragNames, menFragAr, "Men's Fragrance", 'MF');
addProducts(makeupNames, makeupAr, 'Makeup', 'MK');
addProducts(skincareNames, skincareAr, 'Skincare', 'SK');
addProducts(haircareNames, haircareAr, 'Haircare', 'HC');
addProducts(bodyCareNames, bodyCareAr, 'Body Care', 'BC');
addProducts(nailNames, nailAr, 'Nails', 'NL');
addProducts(accessoriesNames, accessoriesAr, 'Accessories', 'AC');
addProducts(testerNames, testerAr, 'Testers', 'TST');

// Pad up to ~380 non-bundle products with extra fragrance/skincare/makeup lines
const extraFragW = ['Sweet Oud Mist 100ml','Floral Delight 75ml','Amber Dreams 50ml','Musk Tahara 100ml',
  'Velvet Oud Rose 75ml','Citrine Flora 100ml','Blossom Breeze 50ml','Ivory Musk 100ml',
  'Sunset Bloom 75ml','Golden Jasmine 100ml','Pearl Musk 50ml','Silk Rose 100ml',
  'Mystic Oud 75ml','Santal Rose 100ml','Desert Bloom 50ml','Cedarwood Silk 100ml',
  'Amber Velvet 75ml','White Patchouli 100ml','Moonlit Rose 50ml','Lace & Musk 75ml',
  'Blush Suede 100ml','Magnolia Dreams 50ml','Soft Iris 75ml','Pink Elixir 100ml',
  'French Jasmine 50ml','Oud Blanc 100ml','Cream Satin 75ml','Lilac Haze 50ml',
  'Golden Hour 100ml','Rose Infusion 75ml'];
const extraFragWAr = extraFragW.map(n => n.replace(/\s\d+ml$/,''));
addProducts(extraFragW, extraFragWAr, "Women's Fragrance", 'WF');

const extraSkin = ['Snail Mucin Cream 50ml','Centella Serum 30ml','Collagen Boost Mask',
  'Glow Drops 30ml','SPF30 Daily Moisturiser 50ml','Pore Refiner Serum 30ml',
  'Dark Spot Corrector 30ml','Azelaic Acid 10% 30ml','Green Tea Toner 200ml',
  'Ceramide Barrier Cream 50ml','Jojoba Oil 30ml','Rosehip Oil 30ml',
  'Tranexamic Acid Serum 30ml','Waterless Cleansing Balm 100ml','Lip Sleeping Mask 20ml',
  'Under Eye Patches (5 pairs)','Brightening Essence 150ml','Multi Peptide Toner 200ml',
  'BHA Exfoliant 200ml','Moisture Surge Cream 75ml'];
const extraSkinAr = extraSkin.map(n => n.replace(/\s\d+\w+$/,''));
addProducts(extraSkin, extraSkinAr, 'Skincare', 'SK');

const extraMakeup = ['Lip Oil - Rosehip','Tinted Lip Balm - Pink','Eyeshadow Stick - Bronze',
  'Eyeshadow Stick - Champagne','Glitter Liner - Silver','Graphic Liner - White',
  'Brow Pomade - Dark Brown','Lash Primer','Volumising Mascara - Brown',
  'Mini Lipstick Set 3pc','Lip Plumper Gloss','Cheek Tint - Peach',
  'Illuminating Primer','Pore-fill Primer','HD Setting Powder 10g',
  'Travel Brush Set 5pc','Magnetic Lash Kit','Brow Gel - Clear',
  'Waterproof Liner Pen','Matte Bronzer'];
const extraMakeupAr = extraMakeup.map(n => n);
addProducts(extraMakeup, extraMakeupAr, 'Makeup', 'MK');

const extraMen = ['Oud & Leather 100ml','Smoky Noir 75ml','Royal Oud Man 100ml',
  'Arctic Wood 100ml','Musk Intense 75ml','Black Forest 100ml',
  'Bold Cedar 100ml','Smoke & Amber 75ml','Iron & Oud 50ml','Blue Saffron 100ml',
  'Dark Suede 75ml','Mossy Earth 100ml','Tobacco Royale 75ml','Ember Knight 100ml',
  'Granite Storm 75ml','Spiced Cedar 100ml','Amber Force 50ml','Dusk Rider 100ml',
  'Black Musk Extreme 75ml','Sandalwood Storm 100ml'];
const extraMenAr = extraMen.map(n => n);
addProducts(extraMen, extraMenAr, "Men's Fragrance", 'MF');

// Extra batches to reach ~400 non-bundle SKUs
const extraOud = [
  'Oud Muattar Chips 10g','Oud Muattar Chips 25g','Oud Muattar Chips 50g',
  'Bakhoor Al-Oud 100g','Bakhoor Rose Musk 100g','Oud Cambodian 3ml',
  'Oud Hindi 3ml','Oud Laos 3ml','Oud Borneo 3ml','Oud Sumbawa 3ml',
  'Dehn Al-Oud 6ml','Dehn Al-Oud 12ml','Oud Water Spray 100ml',
  'Bakhoor Burner - Ceramic','Bakhoor Burner - Metal',
];
const extraOudAr = ['رقائق معطر عود 10ج','رقائق معطر عود 25ج','رقائق معطر عود 50ج',
  'بخور العود 100ج','بخور الورد والمسك 100ج','عود كمبودي 3مل',
  'عود هندي 3مل','عود لاوس 3مل','عود بورنيو 3مل','عود سومباوا 3مل',
  'دهن العود 6مل','دهن العود 12مل','رذاذ ماء العود','مبخرة سيراميك','مبخرة معدنية'];
addProducts(extraOud, extraOudAr, 'Oud & Bakhoor', 'OUD');

const extraNail2 = [
  'Nail Polish - Mint Green','Nail Polish - Sky Blue','Nail Polish - Dusty Mauve',
  'Nail Polish - Burgundy','Nail Polish - Neon Pink','Nail Polish - Holographic',
  'Nail Polish - Pastel Yellow','Nail Polish - Forest Green','Gel Polish Starter Kit',
  'Nail Art Pen - Black','Nail Stickers Pack','Nail Gems Set',
];
const extraNail2Ar = extraNail2.map(n => n);
addProducts(extraNail2, extraNail2Ar, 'Nails', 'NL');

const extraBody2 = [
  'Body Mist - Jasmine 200ml','Body Mist - Vanilla 200ml','Body Mist - Rose 200ml',
  'Bath Salts - Lavender 500g','Bath Bomb Set 6pc','Exfoliating Gloves Pair',
  'Body Wrap Cream 200ml','Cellulite Gel 150ml','Firming Lotion 400ml',
  'Stretch Mark Oil 100ml','Tanning Drops 30ml','After-Sun Lotion 200ml',
];
const extraBody2Ar = extraBody2.map(n => n);
addProducts(extraBody2, extraBody2Ar, 'Body Care', 'BC');

const extraHair2 = [
  'Anti-Dandruff Shampoo 400ml','Purple Shampoo 300ml','Biotin Shampoo 400ml',
  'Hair Growth Serum 50ml','Bond Repair Treatment 250ml','Glossing Conditioner 300ml',
  'Hair Perfume Mist 100ml','Protective Hair Oil 100ml','Detangling Spray 200ml',
  'Deep Conditioning Mask 500ml',
];
const extraHair2Ar = extraHair2.map(n => n);
addProducts(extraHair2, extraHair2Ar, 'Haircare', 'HC');

const extraAcc2 = [
  'Perfume Case Travel Leather','Vanity Mirror LED','Makeup Organiser Acrylic',
  'Foundation Brush','Powder Brush','Blush Brush','Contour Brush','Fan Brush',
  'Lip Brush Set 3pc','Eye Shadow Brush Set 5pc','Brow Spoolie 3pc',
  'Silicone Lip Mask','Eye Mask - Reusable','Jade Roller','Gua Sha Tool',
];
const extraAcc2Ar = extraAcc2.map(n => n);
addProducts(extraAcc2, extraAcc2Ar, 'Accessories', 'AC');

const extraTester2 = [
  'Tester - Velvet Iris 5ml','Tester - Cedar Storm 5ml','Tester - Amber Blossom 5ml',
  'Tester - Leather & Smoke 5ml','Tester - Rose de Noura 2ml Vial',
  'Tester - Musc Blanc 2ml Vial','Tester - Oud Hindi 2ml Vial',
];
const extraTester2Ar = extraTester2.map(n => n);
addProducts(extraTester2, extraTester2Ar, 'Testers', 'TST');

// More women's fragrances to reach ~400 total SKUs
const extraFragW3 = [
  'Saffron Velvet 75ml','Tuberose & Oud 100ml','Cherry Amber 50ml','Pink Powder 100ml',
  'Amber Nude 75ml','Caramel Musk 100ml','Fig & Cashmere 75ml','Smoke & Rose 100ml',
  'Warm Vanilla Musk 100ml','Coconut Tiare 75ml','Iris & Sandalwood 100ml',
  'Green Tea & White Musk 100ml','Sweet Incense 75ml','Tobacco Rose 50ml',
  'Cotton & Musk 100ml','Dew & Amber 75ml','Sheer Floral 100ml','Lemon Blossom 75ml',
  'Apricot Kiss 100ml','Powder Cloud 75ml',
];
addProducts(extraFragW3, extraFragW3.map(n=>n), "Women's Fragrance", 'WF');

// More men's fragrances
const extraMen2 = [
  'Oud Marine 100ml','Storm King 75ml','Platinum Oud 100ml','Charcoal & Cedar 75ml',
  'Wild Leather 100ml','Incense & Wood 75ml','Steel Blue 100ml','Nomad Oud 75ml',
  'Fierce Cedar 100ml','Raw Tobacco 75ml','Rock & Moss 100ml','Dark Rum & Oud 75ml',
  'Silver Black 100ml','Pepper & Smoke 75ml','Rugged Amber 100ml',
  'Neroli Man 100ml','Vetiver Intense 75ml','Dusk & Cedar 100ml',
  'Black Vanilla Man 75ml','Iron Oud 100ml',
];
addProducts(extraMen2, extraMen2.map(n=>n), "Men's Fragrance", 'MF');

// More makeup
const extraMakeup2 = [
  'Lip Tint - Berry','Lip Tint - Coral','Gloss Bomb - Fuchsia',
  'Multi-Use Stick - Peach','Cream Blush - Rose','Bronzing Drops',
  'Brow Lamination Kit','Lash Serum 5ml','Primer Eye 10ml',
  'Under Eye Brightener','Colour Corrector - Green','Colour Corrector - Peach',
  'Micro Brow Pen','Satin Matte Lipstick - Terracotta','Setting Mist Rose',
  'Dewy Finish Spray 100ml','Pressed Highlighter - Bronze','Eyeshadow Palette 24 Colors',
  'Glitter Pot - Rose Gold','Metallic Eyeliner - Copper',
];
addProducts(extraMakeup2, extraMakeup2.map(n=>n), 'Makeup', 'MK');

// ── BUNDLES (~20) ─────────────────────────────────────────────────────────
const nonBundleProds = products.filter(p => !p.isBundle);
const bundleDefinitions = [
  { name: 'Eid Gift Set - Luxury Oud', ar: 'طقم عيد - عود فاخر', cats: ['Oud & Bakhoor','Oud & Bakhoor','Women\'s Fragrance'] },
  { name: 'Bridal Beauty Box', ar: 'صندوق جمال العروس', cats: ['Makeup','Skincare','Body Care','Women\'s Fragrance'] },
  { name: "Mother's Day Pamper Set", ar: 'طقم يوم الأم', cats: ['Skincare','Body Care','Skincare'] },
  { name: 'Fragrance Duo - His & Hers', ar: 'ثنائي العطور', cats: ["Women's Fragrance","Men's Fragrance"] },
  { name: 'Makeup Essentials Kit', ar: 'حقيبة أساسيات المكياج', cats: ['Makeup','Makeup','Accessories'] },
  { name: 'Skincare Glow Starter', ar: 'مجموعة بداية التوهج', cats: ['Skincare','Skincare','Skincare'] },
  { name: 'Oud Bakhoor Travel Set', ar: 'طقم العود السفر', cats: ['Oud & Bakhoor','Accessories'] },
  { name: 'National Day Gift Box', ar: 'صندوق هدايا اليوم الوطني', cats: ["Women's Fragrance",'Body Care','Nails'] },
  { name: 'Nail Art Bundle', ar: 'حزمة فن الأظافر', cats: ['Nails','Nails','Nails','Accessories'] },
  { name: 'Hair Care Routine Pack', ar: 'حزمة روتين الشعر', cats: ['Haircare','Haircare','Haircare'] },
  { name: 'Luxury Body Ritual Set', ar: 'طقم طقوس الجسم الفاخرة', cats: ['Body Care','Body Care','Skincare'] },
  { name: 'Ramadan Fragrance Box', ar: 'صندوق عطور رمضان', cats: ['Oud & Bakhoor',"Women's Fragrance",'Testers'] },
  { name: 'Mini Perfume Discovery Set', ar: 'مجموعة اكتشاف العطور الصغيرة', cats: ['Testers','Testers','Testers','Testers'] },
  { name: "Men's Grooming Box", ar: 'صندوق عناية الرجال', cats: ["Men's Fragrance",'Skincare','Accessories'] },
  { name: "Valentine's Blush Set", ar: 'طقم فالنتاين', cats: ['Makeup','Body Care',"Women's Fragrance"] },
  { name: 'Brow & Eye Hero Kit', ar: 'حزمة الحاجب والعيون', cats: ['Makeup','Makeup','Makeup'] },
  { name: 'Full Face Glam Kit', ar: 'طقم الجلام الكامل', cats: ['Makeup','Makeup','Makeup','Accessories'] },
  { name: 'Oud & Rose Duo', ar: 'ثنائي العود والورد', cats: ['Oud & Bakhoor',"Women's Fragrance"] },
  { name: 'Spa At Home Kit', ar: 'طقم السبا المنزلي', cats: ['Body Care','Skincare','Haircare'] },
  { name: 'Summer Glow Set', ar: 'طقم توهج الصيف', cats: ['Skincare','Body Care','Makeup'] },
];

const bundleRows03 = ['Bundle SKU,Bundle Name,Component SKU,Component Qty'];
const skuByCategory = {};
nonBundleProds.forEach(p => {
  if (!skuByCategory[p.category]) skuByCategory[p.category] = [];
  skuByCategory[p.category].push(p.sku);
});

let bundleSkuNum = 5000;
const bundleProductRows = [];

bundleDefinitions.forEach(bd => {
  bundleSkuNum++;
  const bsku = `BNDL-${bundleSkuNum}`;
  // pick components
  const componentSkus = bd.cats.map(cat => {
    const pool = skuByCategory[cat] || [];
    return pool[Math.floor(rng() * pool.length)];
  }).filter(Boolean);
  // bundle sell price = sum of component sell prices * 0.85
  let bundleSellSum = 0;
  componentSkus.forEach(csku => {
    const row = productRows.find(r => r.startsWith(r.split(',')[0] + ',') || r.includes(`,${csku},`));
    // parse from productRows
    const found = productRows.find(r => { const parts = r.split(','); return parts[2] === csku; });
    if (found) { bundleSellSum += parseFloat(found.split(',')[7]); }
  });
  const bundleSell = Math.round(bundleSellSum * 0.85 * 1000) / 1000 || 25.000;
  const bundlePurch = Math.round(bundleSell * 0.55 * 1000) / 1000;
  const barcode = String(rng() * 1e13 | 0).padStart(13, '0');

  products.push({ sku: bsku, name: bd.name, category: 'Gift Sets', isBundle: true });
  productRows.push(`${bd.name},${bd.ar},${bsku},${barcode},Gift Sets,Set,${fmt(bundlePurch)},${fmt(bundleSell)},2,No,Active,Yes`);

  componentSkus.forEach(csku => {
    bundleRows03.push(`${bsku},${bd.name},${csku},1`);
  });
});

write('02-products.csv', productRows);
write('03-bundles.csv', bundleRows03);

// ══════════════════════════════════════════════════════════════════════════
// 04 — PROMOTIONS
// ══════════════════════════════════════════════════════════════════════════
const promoRows = ['Promo Name,Type,Scope,Target,Value,Start Date,End Date,Active'];
const promos = [
  ['Ramadan 2026 - 15% Off Perfumes',       'PERCENT_OFF',  'CATEGORY', 'Perfumes',           '15', '2026-02-28', '2026-03-29', 'Yes'],
  ['Ramadan 2026 - 20% Off Skincare',       'PERCENT_OFF',  'CATEGORY', 'Skincare',            '20', '2026-02-28', '2026-03-29', 'Yes'],
  ['Eid Al-Fitr - 25% Off Oud & Bakhoor',  'PERCENT_OFF',  'CATEGORY', 'Oud & Bakhoor',       '25', '2026-03-30', '2026-04-06', 'No'],
  ['Eid Al-Fitr - Gift Sets Special',      'PERCENT_OFF',  'CATEGORY', 'Gift Sets',            '20', '2026-03-30', '2026-04-06', 'No'],
  ['Eid Al-Adha - 20% Off Makeup',         'PERCENT_OFF',  'CATEGORY', 'Makeup',              '20', '2026-06-06', '2026-06-13', 'Yes'],
  ['National Day Feb - Buy 2 Get 1 Nails', 'BUY_X_GET_Y',  'CATEGORY', 'Nails',               '2:1', '2026-02-24', '2026-02-27', 'No'],
  ['National Day Feb - 10 KWD Off Oud',    'AMOUNT_OFF',   'CATEGORY', 'Oud & Bakhoor',       '10', '2026-02-24', '2026-02-27', 'No'],
  ["Mother's Day - 15% Off Skincare",      'PERCENT_OFF',  'CATEGORY', 'Skincare',            '15', '2026-05-21', '2026-05-21', 'No'],
  ['Buy 2 Get 1 Free Matte Lipstick',      'BUY_X_GET_Y',  'PRODUCT',  'MK-1036',             '2:1', '2026-01-01', '2026-12-31', 'Yes'],
  ['Buy 2 Get 1 Nail Polish',             'BUY_X_GET_Y',  'PRODUCT',  'NL-1091',             '2:1', '2026-06-01', '2026-06-30', 'Yes'],
  ['Bridal Beauty Box Fixed Price',        'BUNDLE_PRICE', 'PRODUCT',  'BNDL-5001',           '35.000', '2026-01-01', '2026-12-31', 'Yes'],
  ['Eid Gift Set Luxury Oud Price',        'BUNDLE_PRICE', 'PRODUCT',  'BNDL-5000',           '75.000', '2026-03-30', '2026-04-06', 'No'],
  ['Summer Clearance - 30% Off Body Care','PERCENT_OFF',  'CATEGORY', 'Body Care',           '30', '2026-07-01', '2026-07-31', 'No'],
  ['Haircare Flash Sale 25% Off',          'PERCENT_OFF',  'CATEGORY', 'Haircare',            '25', '2026-04-15', '2026-04-17', 'No'],
  ['General Clearance - KWD 2 Off Testers','AMOUNT_OFF',  'CATEGORY', 'Testers',             '2', '2026-05-01', '2026-05-31', 'No'],
];
promos.forEach(p => promoRows.push(p.join(',')));
write('04-promotions.csv', promoRows);

// ══════════════════════════════════════════════════════════════════════════
// 05 — CUSTOMERS (~300)
// ══════════════════════════════════════════════════════════════════════════
const kuwaitiFirstF = ['Noura','Latifa','Dalal','Maha','Sara','Hessa','Fatima','Asma','Reem','Dana',
  'Ghada','Nadia','Hind','Lulwa','Aisha','Farah','Nour','Layla','Deema','Abeer',
  'Shaikha','Noof','Thuraya','Ohoud','Jouri','Nada','Rand','Rawabi','Afra','Rana'];
const kuwaitiLastF = ['Al-Sabah','Al-Rashidi','Al-Mutairi','Al-Enezi','Al-Azmi','Al-Harbi','Al-Shimmari',
  'Al-Hajri','Al-Dosari','Al-Khalidi','Behbehani','Boodai','Al-Baghli','Al-Romi','Al-Jassim',
  'Al-Ghanim','Al-Fares','Al-Hussain','Al-Nasser','Al-Fadli'];
const expatFirstF = ['Priya','Deepa','Aarti','Meera','Sneha','Lakshmi','Kavya','Anjali',
  'Amira','Yasmin','Mona','Hana','Rania','Dina','Sarah','Maria','Anna','Elena',
  'Joyce','Grace','Mary','Luz','Jennifer'];
const expatLastF = ['Sharma','Patel','Nair','Kumar','Singh','Verma','Thomas','Joseph',
  'Hassan','Ahmed','Ibrahim','Khalil','Rodriguez','Santos','Dela Cruz','Fernandez'];
const arabicFirstNames = ['نورة','لطيفة','دلال','مها','سارة','حصة','فاطمة','أسماء','ريم','دانة',
  'غادة','نادية','هند','لولوة','عائشة','فرح','نور','ليلى','ديمة','عبير'];
const loyaltyNotes = ['VIP','Prefers oud','Regular monthly customer','Prefers women fragrances',
  'Gift buyer','Bulk buyer - gifting','Bridal customer','Loyal since opening',
  'Prefers natural skincare','Makeup enthusiast','','','','',''];

const customerRows = ['Ledger Name,Name in Arabic,Mobile,Email,Civil ID,Opening Balance (KWD),Notes'];
const customers = [];

for (let i = 0; i < 300; i++) {
  const isExpat = rng() < 0.35;
  let fullName, arName, mobile, email;
  if (isExpat) {
    const fn = rp(expatFirstF);
    const ln = rp(expatLastF);
    fullName = `${fn} ${ln}`;
    arName = '';
  } else {
    const fn = rp(kuwaitiFirstF);
    const ln = rp(kuwaitiLastF);
    fullName = `${fn} ${ln}`;
    arName = `${rp(arabicFirstNames)} ${rp(kuwaitiLastF.map(n => 'ال' + n.replace('Al-','')))}`;
  }
  mobile = `+965 ${ri(6,9)}${ri(100,999)} ${ri(1000,9999)}`;
  email = rng() < 0.6 ? `cust${i + 1}@gmail.com` : '';
  const civilId = String(ri(1,3)) + String(ri(10,99)) + String(ri(1000,9999)) + String(ri(100000,999999));
  // Most 0 balance; ~10 have small store credit (negative)
  let balance = '0.000';
  if (rng() < 0.1) balance = `(${fmt(ri(5,80) + rng())})`;
  const note = rp(loyaltyNotes);
  customers.push({ fullName, civilId });
  customerRows.push(`${fullName},${arName},${mobile},${email},${civilId},${balance},${note}`);
}
write('05-customers.csv', customerRows);

// ══════════════════════════════════════════════════════════════════════════
// 06 — SALES HISTORY (~500 lines)
// ══════════════════════════════════════════════════════════════════════════
const salesRows = ['Date,Receipt No,Customer Civil ID,SKU,Qty,Unit Price (KWD),Line Total (KWD),Payment Method'];
const payMethods = ['Cash','KNET'];
// Non-bundle non-tester products for sales
const saleableProds = products.filter(p => !p.isBundle && p.category !== 'Testers');

// Build a lookup from sku -> sellingPrice
const skuPriceMap = {};
productRows.slice(1).forEach(row => {
  const parts = row.split(',');
  skuPriceMap[parts[2]] = parseFloat(parts[7]);
});

// Dates from 2025-12 to 2026-06-09
const startTs = new Date('2025-12-01').getTime();
const endTs   = new Date('2026-06-08').getTime();
let receiptNo = 1001;

for (let i = 0; i < 500; i++) {
  const dateTs = startTs + rng() * (endTs - startTs);
  const d = new Date(dateTs);
  const dateStr = d.toISOString().slice(0,10);
  const cust = rp(customers);
  const prod = rp(saleableProds);
  const qty = ri(1, 4);
  const sp = skuPriceMap[prod.sku] || 5.000;
  const lineTotal = Math.round(sp * qty * 1000) / 1000;
  const pm = rng() < 0.5 ? 'Cash' : 'KNET';
  receiptNo++;
  salesRows.push(`${dateStr},RCP-${receiptNo},${cust.civilId},${prod.sku},${qty},${fmt(sp)},${fmt(lineTotal)},${pm}`);
}
write('06-sales-history.csv', salesRows);

// ══════════════════════════════════════════════════════════════════════════
// 07 — SUPPLIERS
// ══════════════════════════════════════════════════════════════════════════
const supplierRows = ['Supplier Name,Arabic Name,Phone,Email,Payment Terms (Days),Opening Balance (KWD)'];
const suppliers = [
  ['Al-Wafra Perfumes Co.','شركة الوفرة للعطور','+965 2246 8830','supplier@alwafra.com.kw','30','4250.750'],
  ['Noura Beauty Wholesale','نورة بيوتي للجملة','+965 2245 9900','info@nourabeautywholesale.com','45','0.000'],
  ['Dubai Fragrance Imports FZE','مستوردات دبي للعطور FZE','+971 4 388 2200','orders@dubaifraginports.ae','60','18200.000'],
  ['Emirates Cosmetics Trading','إمارات للتجارة التجميلية','+971 4 299 4400','trade@emiratescosm.ae','45','9750.500'],
  ['Al-Jazeera Beauty Dist.','الجزيرة لتوزيع مستحضرات التجميل','+965 2248 3300','orders@aljazeera-beauty.com.kw','30','2100.000'],
  ['Gulf Skincare Supplies','الخليج لمستلزمات العناية بالبشرة','+965 2241 5500','contact@gulfskincare.com.kw','30','0.000'],
  ['Musk & Oud Trading Co.','تجارة المسك والعود','+965 2266 7700','info@muskoud.com.kw','','1800.250'],
  ['International Beauty Hub FZCO','هاب التجميل الدولي FZCO','+971 4 355 1100','wholesale@beautyhubintl.ae','60','12400.000'],
];
suppliers.forEach(s => supplierRows.push(s.join(',')));
write('07-suppliers.csv', supplierRows);

// ══════════════════════════════════════════════════════════════════════════
// 08 — OPENING STOCK
// ══════════════════════════════════════════════════════════════════════════
const stockRows = ['SKU,Warehouse,Quantity,Unit Cost'];
const nonBundleSkus = products.filter(p => !p.isBundle);
let totalInventoryValue = 0;

nonBundleSkus.forEach(p => {
  const qty = ri(15, 120);
  const pr = parseFloat((productRows.find(r => r.includes(`,${p.sku},`)) || '').split(',')[6]) || 5.000;
  const uc = Math.round((pr * (0.97 + rng() * 0.06)) * 1000) / 1000;
  totalInventoryValue += qty * uc;
  stockRows.push(`${p.sku},Noura Boutique,${qty},${fmt(uc)}`);
});
write('08-opening-stock.csv', stockRows);

// ══════════════════════════════════════════════════════════════════════════
// 09 — TRIAL BALANCE
// ══════════════════════════════════════════════════════════════════════════
// Compute supplier AP total
const supplierAP = suppliers.reduce((sum, s) => sum + parseFloat(s[5].replace(',','')), 0);
const invValue = Math.round(totalInventoryValue * 1000) / 1000;
const cash = 8250.750;
const bank = 22400.500;
const sundryDebtors = 0.000; // retail shop — no AR
const furniture = 5800.000;
const prepaid = 820.000;
const totalDebit = cash + bank + invValue + sundryDebtors + furniture + prepaid;
const ownerCapital = Math.round((totalDebit - supplierAP) * 1000) / 1000;
const totalCredit = Math.round((supplierAP + ownerCapital) * 1000) / 1000;

function fmtTB(n) {
  if (n === 0) return '';
  return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

const tbRows = ['Account Name,Debit (KWD),Credit (KWD)'];
tbRows.push(`Cash in Hand,${fmtTB(cash)},`);
tbRows.push(`Bank - NBK Current Account,${fmtTB(bank)},`);
tbRows.push(`Inventory (Merchandise),${fmtTB(invValue)},`);
tbRows.push(`Furniture & Fixtures,${fmtTB(furniture)},`);
tbRows.push(`Prepaid Expenses (مصاريف مدفوعة مقدما),${fmtTB(prepaid)},`);
tbRows.push(`Sundry Creditors (Suppliers),,${fmtTB(supplierAP)}`);
tbRows.push(`Owner Capital,,${fmtTB(ownerCapital)}`);
tbRows.push(`,`);
write('09-trial-balance.csv', tbRows);

// ── Verification ──────────────────────────────────────────────────────────
console.log('\n── Verification ─────────────────────────────────────────────');

// 1. Bundle components all reference real SKUs
const allSkus = new Set(products.map(p => p.sku));
const nonBundleSkuSet = new Set(products.filter(p => !p.isBundle).map(p => p.sku));
let bundleComponentErrors = 0;
bundleRows03.slice(1).forEach(row => {
  const [bsku,,compSku] = row.split(',');
  if (!nonBundleSkuSet.has(compSku)) {
    console.error(`  ERROR: Bundle ${bsku} references unknown/bundle SKU: ${compSku}`);
    bundleComponentErrors++;
  }
});
if (bundleComponentErrors === 0) console.log('  ✓ All bundle components reference valid non-bundle SKUs');

// 2. Sales history line math
let salesErrors = 0;
salesRows.slice(1).forEach(row => {
  const parts = row.split(',');
  const qty = parseInt(parts[4]);
  const up = parseFloat(parts[5]);
  const lt = parseFloat(parts[6]);
  const expected = Math.round(qty * up * 1000) / 1000;
  if (Math.abs(expected - lt) > 0.001) {
    salesErrors++;
    if (salesErrors <= 3) console.error(`  ERROR sales math: ${row}`);
  }
});
if (salesErrors === 0) console.log('  ✓ All sales history line totals are consistent');
else console.log(`  ✗ ${salesErrors} sales math errors`);

// 3. Trial balance
const tbDebits = cash + bank + invValue + furniture + prepaid;
const tbCredits = supplierAP + ownerCapital;
console.log(`  Trial balance: Debits = ${fmt(tbDebits)} KWD  |  Credits = ${fmt(tbCredits)} KWD  |  Diff = ${fmt(Math.abs(tbDebits - tbCredits))} KWD`);
if (Math.abs(tbDebits - tbCredits) < 0.005) console.log('  ✓ Trial balance balances');
else console.log('  ✗ Trial balance DOES NOT balance');

console.log(`\n── Row counts ───────────────────────────────────────────────`);
console.log(`  Products (incl. bundles): ${products.length}  | Non-bundle: ${nonBundleSkus.length}  | Bundles: ${bundleDefinitions.length}`);
console.log(`  Customers: ${customers.length}`);
console.log(`  Sales lines: ${salesRows.length - 1}`);
console.log(`  Suppliers: ${suppliers.length}`);
console.log(`  Stock lines: ${stockRows.length - 1}`);
console.log(`  Promotions: ${promos.length}`);
console.log(`  Bundle component lines: ${bundleRows03.length - 1}`);
