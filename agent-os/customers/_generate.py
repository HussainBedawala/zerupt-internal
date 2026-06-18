#!/usr/bin/env python3
"""
Generate Kuwait E2E test data + images for 3 personas.
Run: python3 _generate.py
Outputs into sibling persona folders + images/.
AI-first import pipeline is the product, so files carry realistic MESS on purpose
(mixed AR/EN, locale number formats, Arabic-Indic digits, currency symbols,
blank/dash cells, TOTAL rows, multi-warehouse columns, a slightly-unbalanced TB).
"""
import csv, os, random
from openpyxl import Workbook
from PIL import Image, ImageDraw, ImageFont

random.seed(42)  # deterministic
ROOT = os.path.dirname(os.path.abspath(__file__))

def wdir(name):
    # Persona data lives under kuwait/ (images/ stays at root — handled separately)
    sub = "images" if name == "images" else os.path.join("kuwait", name)
    p = os.path.join(ROOT, sub)
    os.makedirs(p, exist_ok=True)
    return p

def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        if header: w.writerow(header)
        w.writerows(rows)

def write_xlsx(path, sheets):
    """sheets = [(name, header, rows), ...]"""
    wb = Workbook()
    wb.remove(wb.active)
    for name, header, rows in sheets:
        ws = wb.create_sheet(title=name[:31])
        if header: ws.append(header)
        for r in rows: ws.append(r)
    wb.save(path)

# ---- messy number helpers -------------------------------------------------
AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
def ar_num(n): return str(n).translate(AR_DIGITS)
def euro(n): return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")  # 1.234,56
def plain(n): return f"{n:.2f}"
def comma(n): return f"{n:,.2f}"  # 1,234.56

# ===========================================================================
# PERSONA 1 — Al-Asala Auto Parts (SIMPLE, clean, single shop)
# ===========================================================================
def persona1():
    d = wdir("persona-1-asala-autoparts")
    cats = ["Filters","Brakes","Oils & Fluids","Batteries","Belts","Electrical","Wipers","Tyres"]
    prefixes = {"Filters":"FLT","Brakes":"BRK","Oils & Fluids":"OIL","Batteries":"BAT",
                "Belts":"BLT","Electrical":"ELC","Wipers":"WIP","Tyres":"TYR"}
    names = {"Filters":["Oil Filter","Air Filter","Fuel Filter","Cabin Filter"],
             "Brakes":["Brake Pad Front","Brake Pad Rear","Brake Disc","Brake Shoe"],
             "Oils & Fluids":["Engine Oil 5W30","Engine Oil 10W40","Coolant","Brake Fluid","Gear Oil"],
             "Batteries":["Battery 70AH","Battery 80AH","Battery 100AH"],
             "Belts":["Timing Belt","Fan Belt","Serpentine Belt"],
             "Electrical":["Spark Plug","Ignition Coil","Alternator","Starter Motor"],
             "Wipers":["Wiper Blade 18","Wiper Blade 22","Wiper Motor"],
             "Tyres":["Tyre 195/65","Tyre 205/55","Tyre 215/60"]}
    items, n = [], 1
    for cat in cats:
        for base in names[cat]:
            for variant in range(random.randint(3,7)):
                sku = f"{prefixes[cat]}-{n:04d}"
                cost = round(random.uniform(1.5, 45), 2)
                price = round(cost * random.uniform(1.3, 1.9), 2)
                qty = random.randint(0, 120)
                bc = f"628{random.randint(1000000000,9999999999)}"
                items.append([sku, f"{base} {variant+1}", cat, "Each", plain(cost), plain(price), qty, bc])
                n += 1
    # item master (clean)
    write_csv(os.path.join(d,"products.csv"),
              ["SKU","Item Name","Category","Unit","Cost","Selling Price","Opening Qty","Barcode"],
              items)
    # small customer list (a few credit garages)
    custs = [["C-001","Al Salam Garage","99887766","salam@kw.com","250.00"],
             ["C-002","Speed Motors Workshop","55667788","",""],
             ["C-003","Bader Auto Service","66554433","bader@auto.kw","120.50"],
             ["C-004","Walk-in Customer","","",""]]
    write_csv(os.path.join(d,"customers.csv"),
              ["Code","Customer Name","Phone","Email","Opening Balance"], custs)
    # 2 suppliers
    sups = [["S-001","Gulf Parts Distribution","22334455","2400.00"],
            ["S-002","Shuwaikh Auto Supply","22887766","1100.00"]]
    write_csv(os.path.join(d,"suppliers.csv"),
              ["Code","Supplier Name","Phone","Opening Balance"], sups)
    # clean balanced trial balance
    inv_val = sum(round(float(i[4])*i[6],2) for i in items)
    tb = [["1100","Cash on Hand",plain(1500),"0.00"],
          ["1110","Bank - NBK Current",plain(12400),"0.00"],
          ["1131","Accounts Receivable",plain(370.50),"0.00"],
          ["1141","Inventory",plain(inv_val),"0.00"],
          ["2111","Accounts Payable","0.00",plain(3500)],
          ["3901","Owner Capital","0.00",plain(round(1500+12400+370.5+inv_val-3500,2))]]
    write_csv(os.path.join(d,"trial_balance.csv"),
              ["Account Code","Account Name","Debit","Credit"], tb)
    return len(items), len(custs), len(sups)

# ===========================================================================
# PERSONA 2 — Layla Cosmetics (MEDIUM, 3 branches, images, AR aging, messy)
# ===========================================================================
def persona2():
    random.seed(202)  # per-persona seed → independent, stable output
    d = wdir("persona-2-layla-cosmetics")
    brands = ["Lumiere","Rouge Caprice","Velvet Skin","Ohud","Noor Beauty","Dune"]
    lines = {"Lipstick":["Matte Lipstick","Satin Lipstick","Liquid Lip"],
             "Foundation":["Liquid Foundation","Cushion Foundation","Concealer"],
             "Skincare":["Day Cream","Night Serum","Vitamin C Serum","Cleanser","Toner"],
             "Fragrance":["Eau de Parfum 50ml","Eau de Parfum 100ml","Body Mist"],
             "Eyes":["Mascara","Eyeliner","Eyeshadow Palette","Brow Gel"],
             "Tools":["Makeup Brush Set","Beauty Sponge","Tweezers"]}
    shades = ["01 Nude","02 Rose","03 Coral","04 Crimson","05 Mauve","06 Berry","Fair","Medium","Deep"]
    # DELIBERATE inconsistency: the same category is spelled differently across rows,
    # exactly as a real shop's spreadsheet drifts over time. Mira must canonicalise these.
    cat_alias = {"Skincare":["Skincare","Skin Care","skincare"],
                 "Fragrance":["Fragrance","Perfumes","Fragrances"],
                 "Lipstick":["Lipstick","Lip"],"Foundation":["Foundation","Face"],
                 "Eyes":["Eyes","Eye Makeup"],"Tools":["Tools","Accessories"]}
    # Cosmetics expire — but the shop only tracked it sometimes (inconsistent fill).
    expiries = ["2027-03","2026-11","2028-01","12/2026","Mar-2027","2027",""]
    units = ["Each","each","pc","Each"]  # inconsistent unit casing/abbrev
    items, n = [], 1
    for line, products in lines.items():
        for base in products:
            brand = random.choice(brands)
            for sh in random.sample(shades, random.randint(2,5)):
                sku = f"LC-{n:05d}"
                cost = round(random.uniform(2, 35), 2)
                price = round(cost * random.uniform(1.8, 2.6), 2)
                qty = random.randint(0, 60)
                name = f"{brand} {base} - {sh}"
                cat = random.choice(cat_alias.get(line,[line]))
                # ~8% of rows are missing cost (shop never entered it) — blank, not zero
                cost_cell = "" if n % 13 == 0 else plain(cost)
                exp = random.choice(expiries) if line in ("Skincare","Fragrance","Foundation") else ""
                batch = f"B{random.randint(1000,9999)}" if exp else ""
                items.append([sku, name, brand, cat, random.choice(units),
                              cost_cell, plain(price), qty, exp, batch])
                n += 1
    # ~800-ish: pad with variants
    while len(items) < 780:
        brand = random.choice(brands); line = random.choice(list(lines)); base = random.choice(lines[line])
        sku = f"LC-{len(items)+1:05d}"; cost = round(random.uniform(2,35),2)
        items.append([sku, f"{brand} {base} - {random.choice(shades)}", brand,
                      random.choice(cat_alias.get(line,[line])), "Each",
                      plain(cost), plain(round(cost*random.uniform(1.8,2.6),2)),
                      random.randint(0,60), "", ""])
    # DELIBERATE duplicate SKU: a copy-paste error in the source sheet (Mira must flag/merge)
    dup = list(items[7]); dup[1] = dup[1] + " (refill)"; items.insert(20, dup)
    # item master — extra Expiry/Batch columns, inconsistent units & a missing cost or two
    write_csv(os.path.join(d,"products.csv"),
              ["SKU","Product Name","Brand","Category","Unit","Cost (KWD)","Retail Price",
               "Opening Qty","Expiry","Batch"],
              items)
    # multi-warehouse stock (3 branches) — messy column names
    branches = ["The Avenues","Salmiya","Hawally"]
    stock = [[i[0], i[1], random.randint(0,30), random.randint(0,25), random.randint(0,20)] for i in items[:400]]
    write_csv(os.path.join(d,"stock_by_branch.csv"),
              ["Code","Name"]+branches, stock)
    # customers with AR aging — MESSY (mixed locales, arabic digits, dash, blanks)
    cust_names = ["Layla Al-Sabah VIP","Salon Glamour","Mariam Beauty Lounge","نورة العتيبي",
                  "Fatima Boutique","Hessa Al-Rashid","Glow Salon Salmiya","دلال للتجميل",
                  "Reem Aesthetics","Bridal Studio Kuwait","Sara Al-Mutairi","Amira Spa"]
    rows = []
    for i, nm in enumerate(cust_names):
        bal = round(random.uniform(20, 1800), 2)
        if i % 5 == 0: balcell = euro(bal)            # 1.234,56
        elif i % 5 == 1: balcell = ar_num(int(bal))   # arabic digits
        elif i % 5 == 2: balcell = comma(bal)         # 1,234.56
        elif i % 5 == 3: balcell = "-"                # no balance
        else: balcell = f"{plain(bal)} KWD"           # currency suffix
        phone = f"9{random.randint(1000000,9999999)}" if i % 3 else ""
        rows.append([f"CUST-{i+1:03d}", nm, phone, balcell, "13/02/2026"])
    write_csv(os.path.join(d,"customers_aging.csv"),
              ["Customer Code","Customer","Phone","Outstanding","Since"], rows)
    # suppliers
    sups = [["SUP-01","Lumiere Distribution Gulf","22110099","4200.00"],
            ["SUP-02","Paris Beauty Imports","22330011","1800.50"],
            ["SUP-03","مستحضرات الخليج","22556677","930.00"]]
    write_csv(os.path.join(d,"suppliers.csv"),
              ["Code","Supplier","Phone","Balance"], sups)
    # trial balance — slightly UNBALANCED on purpose (tests OBE plug)
    inv_val = round(sum((float(i[5]) if i[5] else 0.0)*i[7] for i in items),2)
    tb = [["1100","Cash",plain(3200),"0.00"],
          ["1110","Bank - Boubyan",plain(28500),"0.00"],
          ["1131","Trade Receivables",plain(6400),"0.00"],
          ["1141","Inventory - Stock on Hand",plain(inv_val),"0.00"],
          ["1500","Shop Fit-out & Fixtures",plain(15000),"0.00"],
          ["2111","Trade Payables","0.00",plain(6930.50)],
          ["2200","VAT Payable","0.00",plain(0)],
          ["3901","Owner Capital","0.00",plain(round(3200+28500+6400+inv_val+15000-6930.5-1200,2))]]
    # introduce a 1,200 imbalance deliberately (note above subtracts 1200 that isn't credited)
    write_csv(os.path.join(d,"trial_balance.csv"),
              ["Account Code","Account Name","Debit","Credit"], tb)
    return len(items), len(rows), len(sups)

# ===========================================================================
# PERSONA 3 — Gulf Hardware & Tools Co (LARGE, 5 warehouses, thousands, messy)
# ===========================================================================
def persona3():
    random.seed(303)  # per-persona seed → independent, stable output
    d = wdir("persona-3-gulf-hardware")
    cats = {"HAND":"Hand Tools","POWR":"Power Tools","FAST":"Fasteners","PLUM":"Plumbing",
            "ELEC":"Electrical","PAINT":"Paint & Sundries","SAFE":"Safety Gear","ABRA":"Abrasives",
            "ADHE":"Adhesives","GARD":"Garden & Outdoor","WELD":"Welding","MEAS":"Measuring"}
    nouns = {"HAND":["Hammer","Screwdriver","Wrench","Pliers","Chisel","Hand Saw","Spanner Set","Utility Knife"],
             "POWR":["Drill","Angle Grinder","Circular Saw","Impact Driver","Jigsaw","Sander","Heat Gun"],
             "FAST":["Wood Screw","Machine Bolt","Hex Nut","Washer","Anchor","Self-Tapping Screw","Rivet"],
             "PLUM":["PVC Pipe","Ball Valve","Pipe Fitting","Tap Mixer","Flexible Hose","Pipe Clamp"],
             "ELEC":["Cable 2.5mm","Wall Socket","Switch","Circuit Breaker","Junction Box","LED Bulb"],
             "PAINT":["Emulsion Paint","Primer","Paint Roller","Brush","Thinner","Masking Tape"],
             "SAFE":["Safety Helmet","Work Gloves","Safety Goggles","Hi-Vis Vest","Ear Muffs","Dust Mask"],
             "ABRA":["Sandpaper","Cutting Disc","Grinding Wheel","Wire Brush","Flap Disc"],
             "ADHE":["Silicone Sealant","Epoxy","Wood Glue","Super Glue","PU Foam"],
             "GARD":["Garden Hose","Pruning Shears","Shovel","Rake","Wheelbarrow"],
             "WELD":["Welding Rod","Welding Mask","Gas Regulator","Welding Wire"],
             "MEAS":["Tape Measure","Spirit Level","Caliper","Laser Measure","Square"]}
    sizes = ["Small","Medium","Large","6mm","8mm","10mm","12mm","1/2in","3/4in","1in","Pro","Heavy Duty",
             "100mm","150mm","Box of 100","Box of 50","5L","1L","25kg","Yellow","Blue","Red"]
    units = ["Each","Box","Pack","Dozen","Roll","Set","Bag"]
    warehouses = ["Shuwaikh WH","Ardiya Store","Fahaheel Store","Jahra Store","Central Warehouse"]
    TARGET_ITEMS = 8500
    items = []
    for i in range(TARGET_ITEMS):
        pre = random.choice(list(cats))
        noun = random.choice(nouns[pre]); size = random.choice(sizes)
        sku = f"{pre}-{i+1:06d}"
        cost = round(random.uniform(0.3, 60), 2)
        price = round(cost * random.uniform(1.25, 1.75), 2)
        unit = random.choice(units)
        bc = f"629{random.randint(1000000000,9999999999)}"
        # wholesale price — contractors buy at trade price, below retail (specific requirement)
        wholesale = round(cost * random.uniform(1.12, 1.35), 2)
        items.append([sku, f"{noun} {size}", cats[pre], unit, plain(cost),
                      plain(wholesale), plain(price), bc])
    # main item master (xlsx, large) — retail + wholesale (trade) price tiers
    write_xlsx(os.path.join(d,"item_master.xlsx"),
               [("Items", ["SKU","Item Name","Category","Unit","Cost",
                           "Wholesale Price","Sell Price","Barcode"], items)])
    # multi-warehouse opening stock (csv, big) — 5 warehouse columns
    stock = []
    for it in items:
        qtys = [random.randint(0, 45) for _ in warehouses]
        stock.append([it[0], it[1]] + qtys)
    write_csv(os.path.join(d,"opening_stock_by_warehouse.csv"),
              ["Code","Name"]+warehouses, stock)
    # thousands of customers (contractors on credit) — AR aging, messy
    first = ["Al Manar","Gulf","Desert","Burgan","Salmi","Kazma","Al Rai","Sabah","Mubarak","Fahad",
             "United","National","Modern","Reliable","Prime","Falcon","Oasis","Pearl","Marina","Capital"]
    kind = ["Contracting Co","Construction","Trading Est","Maintenance Co","Engineering","Workshop",
            "Real Estate","Interiors","MEP Services","Builders"]
    custs = []
    NCUST = 4200
    for i in range(NCUST):
        nm = f"{random.choice(first)} {random.choice(kind)}"
        bal = round(random.uniform(0, 4000), 2)
        r = i % 6
        if r==0: balcell = comma(bal)
        elif r==1: balcell = euro(bal)
        elif r==2: balcell = plain(bal)
        elif r==3: balcell = "-" if bal < 200 else plain(bal)
        elif r==4: balcell = f"KWD {plain(bal)}"
        else: balcell = plain(bal)
        phone = f"{random.choice(['9','6','5'])}{random.randint(1000000,9999999)}"
        credit = random.choice(["1000","2500","5000","10000",""])
        # specific requirement: every account belongs to a salesman + has payment terms
        salesman = random.choice(["Anwar","Rakesh","Mahmoud","Joseph","Khaled","Suresh"])
        terms = random.choice(["Cash","30 days","45 days","60 days","COD","90 days"])
        custs.append([f"CN-{i+1:05d}", nm, phone, credit, balcell, salesman, terms])
    write_csv(os.path.join(d,"customers.csv"),
              ["Account No","Customer Name","Phone","Credit Limit","Outstanding Balance",
               "Salesman","Payment Terms"], custs)
    # --- PDC register: post-dated cheques on hand (GCC contractor reality) ---------
    banks = ["NBK","Gulf Bank","Boubyan","KFH","Burgan Bank","Warba"]
    pdc = []
    for i in range(220):
        c = random.choice(custs)
        amt = round(random.uniform(150, 9000), 2)
        mth = random.randint(6, 12)
        pdc.append([f"CHQ-{random.randint(100000,999999)}", c[0], c[1],
                    random.choice(banks), comma(amt), f"2026-{mth:02d}-{random.randint(1,28):02d}",
                    random.choice(["On Hand","Deposited","Cleared"])])
    write_csv(os.path.join(d,"pdc_register.csv"),
              ["Cheque No","Account No","Customer","Bank","Amount","Cheque Date","Status"], pdc)
    # --- open quotations / sales orders not yet delivered (quote→order→deliver flow) -
    quos = []
    for i in range(140):
        c = random.choice(custs)
        val = round(random.uniform(80, 14000), 2)
        st = random.choice(["Quotation","Confirmed Order","Part-Delivered"])
        quos.append([f"QT-2026-{i+1:04d}", c[0], c[1], comma(val),
                     f"2026-06-{random.randint(1,15):02d}", st,
                     random.choice(["Project A - Mall","Villa - Salwa","Tower - Sharq",
                                    "Maintenance","Fit-out","Warehouse",""])])
    write_csv(os.path.join(d,"open_quotations.csv"),
              ["Doc No","Account No","Customer","Value (KWD)","Date","Status","Project Ref"], quos)
    # suppliers (hundreds)
    sups = []
    for i in range(180):
        nm = f"{random.choice(first)} {random.choice(['Supplies','Imports','Distribution','Industrial','Hardware Co'])}"
        sups.append([f"V-{i+1:04d}", nm, f"2{random.randint(2000000,9999999)}", plain(round(random.uniform(0,42000),2))])
    write_csv(os.path.join(d,"suppliers.csv"),
              ["Vendor Code","Supplier Name","Phone","Outstanding"], sups)
    # large trial balance (proper, balances via plug shown separately)
    inv_val = round(sum(float(i[4]) * sum(s[2:]) for i,s in zip(items, stock)),2)
    ar_total = round(sum(_parse_messy(c[4]) for c in custs),2)
    ap_total = round(sum(float(s[3]) for s in sups),2)
    cash, bank, fixtures = 18500, 240000, 85000
    capital = round(cash+bank+ar_total+inv_val+fixtures-ap_total,2)
    tb = [["1100","Cash on Hand",plain(cash),"0.00"],
          ["1110","Bank - Gulf Bank Current",plain(bank),"0.00"],
          ["1131","Accounts Receivable - Trade",plain(ar_total),"0.00"],
          ["1141","Inventory - Goods for Resale",plain(inv_val),"0.00"],
          ["1500","Warehouse Equipment & Racking",plain(fixtures),"0.00"],
          ["2111","Accounts Payable - Trade","0.00",plain(ap_total)],
          ["3901","Share Capital","0.00",plain(capital)]]
    write_xlsx(os.path.join(d,"trial_balance.xlsx"),
               [("Trial Balance", ["Account Code","Account Name","Debit","Credit"], tb)])
    return len(items), len(custs), len(sups)

def _parse_messy(s):
    s = str(s).replace("KWD","").replace("kwd","").strip()
    if s in ("","-"): return 0.0
    s = s.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩","0123456789"))
    # euro 1.234,56 vs 1,234.56
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."): s = s.replace(".","").replace(",",".")
        else: s = s.replace(",","")
    elif "," in s:
        s = s.replace(",","") if len(s.split(",")[-1])==3 else s.replace(",",".")
    try: return float(s)
    except: return 0.0

# ===========================================================================
# IMAGES — a small shared set (PNG products/avatars, PNG+SVG logos)
# ===========================================================================
def font(sz):
    for p in ["/System/Library/Fonts/Supplemental/Arial.ttf","/System/Library/Fonts/Helvetica.ttc",
              "/Library/Fonts/Arial.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except: pass
    return ImageFont.load_default()

def centered(draw, box, text, fnt, fill):
    x0,y0,x1,y1 = box
    l,t,r,b = draw.textbbox((0,0), text, font=fnt)
    draw.text((x0+(x1-x0-(r-l))/2 - l, y0+(y1-y0-(b-t))/2 - t), text, font=fnt, fill=fill)

def product_img(path, label, bg, fg):
    img = Image.new("RGB", (600,600), bg); dr = ImageDraw.Draw(img)
    dr.rectangle([30,30,570,570], outline=fg, width=4)
    centered(dr, (40,220,560,300), label, font(56), fg)
    centered(dr, (40,320,560,380), "ZERUPT TEST", font(28), fg)
    img.save(path, "PNG")

def avatar_img(path, initials, bg):
    img = Image.new("RGB", (400,400), bg); dr = ImageDraw.Draw(img)
    dr.ellipse([40,40,360,360], fill=(255,255,255))
    centered(dr, (40,40,360,360), initials, font(150), bg)
    img.save(path, "PNG")

def logo_png(path, text, bg, fg):
    img = Image.new("RGB", (800,300), bg); dr = ImageDraw.Draw(img)
    centered(dr, (0,0,800,300), text, font(80), fg)
    img.save(path, "PNG")

def logo_svg(path, text, bg, fg):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300" viewBox="0 0 800 300">
  <rect width="800" height="300" fill="{bg}"/>
  <text x="400" y="170" font-family="Arial, sans-serif" font-size="80" font-weight="bold"
        fill="{fg}" text-anchor="middle">{text}</text>
</svg>'''
    with open(path,"w",encoding="utf-8") as f: f.write(svg)

def images():
    d = wdir("images")
    INK=(20,19,16); CREAM=(249,247,245); CITRON=(151,156,26); OLIVE=(116,120,24)
    ROSE=(180,70,90); BLUE=(40,80,130)
    # a couple of reusable product images
    product_img(os.path.join(d,"product-1.png"), "PART", CREAM, INK)
    product_img(os.path.join(d,"product-2.png"), "TOOL", INK, CITRON)
    product_img(os.path.join(d,"product-3.png"), "BEAUTY", (250,240,243), ROSE)
    # avatars
    avatar_img(os.path.join(d,"avatar-1.png"), "AO", OLIVE)
    avatar_img(os.path.join(d,"avatar-2.png"), "LS", ROSE)
    # logos per persona (png + svg)
    logo_png(os.path.join(d,"logo-asala.png"), "AL-ASALA", CREAM, INK)
    logo_svg(os.path.join(d,"logo-asala.svg"), "AL-ASALA", "#F9F7F5", "#141310")
    logo_png(os.path.join(d,"logo-layla.png"), "LAYLA", (250,240,243), "#B4465A" and (180,70,90))
    logo_svg(os.path.join(d,"logo-layla.svg"), "LAYLA COSMETICS", "#FAF0F3", "#B4465A")
    logo_png(os.path.join(d,"logo-gulf.png"), "GULF HARDWARE", INK, CITRON)
    logo_svg(os.path.join(d,"logo-gulf.svg"), "GULF HARDWARE", "#141310", "#979C1A")

# ===========================================================================
if __name__ == "__main__":
    p1 = persona1(); print("Persona 1 (Al-Asala):", p1, "items/custs/sups")
    p2 = persona2(); print("Persona 2 (Layla):   ", p2)
    p3 = persona3(); print("Persona 3 (Gulf):    ", p3)
    images(); print("Images written.")
