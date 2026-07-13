#!/usr/bin/env python3
"""
Generate UAE E2E test data + images for 3 personas (VAT-ON market).
Run: python3 _generate_uae.py
Outputs into uae/<persona>/. Mirrors _generate.py (Kuwait, no-VAT) in structure,
but every persona here exercises UAE 5% VAT, TRNs, tax-inclusive shelf pricing,
AED 2-decimal (fils) precision, and UAE payment methods (incl. Tabby/Tamara).
Deterministic seeds: P1=51, P2=252, P3=353.
"""
import csv, os, random
from openpyxl import Workbook
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))

def wdir(name):
    sub = "images" if name == "images" else os.path.join("uae", name)
    p = os.path.join(ROOT, sub)
    os.makedirs(p, exist_ok=True)
    return p

def write_csv(path, header, rows):
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        if header: w.writerow(header)
        w.writerows(rows)

def write_xlsx(path, sheets):
    wb = Workbook()
    wb.remove(wb.active)
    for name, header, rows in sheets:
        ws = wb.create_sheet(title=name[:31])
        if header: ws.append(header)
        for r in rows: ws.append(r)
    wb.save(path)

# ---- messy number / TRN helpers -------------------------------------------
AR_DIGITS = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")
def ar_num(n): return str(n).translate(AR_DIGITS)
def euro(n): return f"{n:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")  # 1.234,56
def plain(n): return f"{n:.2f}"
def comma(n): return f"{n:,.2f}"  # 1,234.56
def trn(rng): return "1" + "".join(str(rng.randint(0, 9)) for _ in range(14))

def _parse_messy(s):
    s = str(s).replace("AED", "").replace("aed", "").strip()
    if s in ("", "-"): return 0.0
    s = s.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩", "0123456789"))
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."): s = s.replace(".", "").replace(",", ".")
        else: s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", "") if len(s.split(",")[-1]) == 3 else s.replace(",", ".")
    try: return float(s)
    except: return 0.0

# ===========================================================================
# PERSONA 1 — Nur Al Sharq Perfumes & Oud (SIMPLE, clean, VAT-compliant)
# ===========================================================================
def persona1():
    rng = random.Random(51)
    d = wdir("persona-1-noor-alsharq-perfumes")
    seller_trn = trn(rng)
    cats = ["Oud", "Attar", "Perfumes", "Bakhoor", "Gift Sets", "Musk & Amber", "Incense Burners", "Travel Sets"]
    prefixes = {"Oud": "OUD", "Attar": "ATR", "Perfumes": "PRF", "Bakhoor": "BKH",
                "Gift Sets": "GFT", "Musk & Amber": "MSK", "Incense Burners": "INC", "Travel Sets": "TRV"}
    names = {"Oud": ["Cambodi Oud Oil", "Hindi Oud Chips", "Royal Oud Blend", "Malaysian Oud Oil"],
             "Attar": ["Rose Attar", "Sandalwood Attar", "Jasmine Attar", "Musk Attar"],
             "Perfumes": ["Oud Royale EDP", "Amber Musk EDP", "White Oud EDP", "Rose Garden EDP", "Saffron Oud EDP"],
             "Bakhoor": ["Bakhoor Chips 40g", "Bakhoor Chips 100g", "Mabsoos Bakhoor"],
             "Gift Sets": ["Oud & Attar Gift Set", "Wedding Gift Set", "Eid Gift Set"],
             "Musk & Amber": ["White Musk Oil", "Black Musk Oil", "Amber Oil"],
             "Incense Burners": ["Electric Bakhoor Burner", "Traditional Mabkhara"],
             "Travel Sets": ["Travel Attar Set 6x3ml", "Travel Perfume Set 3x15ml"]}
    items, n = [], 1
    for cat in cats:
        for base in names[cat]:
            for variant in range(rng.randint(3, 7)):
                sku = f"{prefixes[cat]}-{n:04d}"
                cost = round(rng.uniform(8, 220), 2)
                # tax-inclusive retail price (UAE legal requirement); margin applied then rounded to 2dp
                net_price = round(cost * rng.uniform(1.3, 2.1), 2)
                price_incl = round(net_price * 1.05, 2)
                qty = rng.randint(0, 80)
                bc = f"628{rng.randint(1000000000, 9999999999)}"
                items.append([sku, f"{base} {variant + 1}", cat, "Each", plain(cost), plain(price_incl),
                              qty, bc, "Standard 5%"])
                n += 1
    write_csv(os.path.join(d, "products.csv"),
              ["SKU", "Item Name", "Category", "Unit", "Cost", "Selling Price (VAT incl.)",
               "Opening Qty", "Barcode", "Tax Group"], items)
    custs = [["C-001", "Al Maha Gifting Trading LLC", "0501234567", "sales@almaha.ae", "1200.00", trn(rng)],
             ["C-002", "Zayed Hospitality Supplies", "0559876543", "", "0.00", trn(rng)],
             ["C-003", "Deira Souq Retail Est", "0521112222", "info@deirasouq.ae", "480.75", trn(rng)],
             ["C-004", "Walk-in Customer", "", "", "0.00", ""]]
    write_csv(os.path.join(d, "customers.csv"),
              ["Code", "Customer Name", "Phone", "Email", "Opening Balance", "TRN"], custs)
    sups = [["S-001", "Gulf Oud Distribution FZE", "042221100", "3400.00", trn(rng)],
            ["S-002", "Sharq Attar Supplies LLC", "042335566", "1550.00", trn(rng)]]
    write_csv(os.path.join(d, "suppliers.csv"),
              ["Code", "Supplier Name", "Phone", "Opening Balance", "TRN"], sups)
    # inventory value at COST (not tax-incl retail)
    inv_val = round(sum(float(i[4]) * i[6] for i in items), 2)
    ar_total = round(sum(float(c[4]) for c in custs), 2)
    ap_total = round(sum(float(s[3]) for s in sups), 2)
    cash, bank = 4200.00, 22000.00
    vat_payable = 1850.30  # net output VAT owed for the period, provided by owner's bookkeeper
    capital = round(cash + bank + ar_total + inv_val - ap_total - vat_payable, 2)
    tb = [["1100", "Cash on Hand", plain(cash), "0.00"],
          ["1110", "Bank - Emirates NBD Current", plain(bank), "0.00"],
          ["1131", "Accounts Receivable", plain(ar_total), "0.00"],
          ["1141", "Inventory", plain(inv_val), "0.00"],
          ["2111", "Accounts Payable", "0.00", plain(ap_total)],
          ["2210", "VAT Payable (Output - Input)", "0.00", plain(vat_payable)],
          ["3901", "Owner Capital", "0.00", plain(capital)]]
    write_csv(os.path.join(d, "trial_balance.csv"),
              ["Account Code", "Account Name", "Debit", "Credit"], tb)
    # inventory import template CSVs (v3 ADAPTIVE) — Tax Group SHOWN for UAE
    cat_codes = list(prefixes.values())
    write_csv(os.path.join(d, "inventory-import-categories.csv"),
              ["Code", "Name (primary)", "Name (secondary)", "Parent Code"],
              [[prefixes[c], c, "", ""] for c in cats])
    write_csv(os.path.join(d, "inventory-import-items.csv"),
              ["Name (primary)", "Name (secondary)", "SKU", "Barcode", "Category Code", "Tax Group",
               "Cost", "Sell Price", "Base Unit", "Brand", "Reorder Level", "Wholesale Price"],
              [[i[1], "", i[0], i[7], prefixes[i[2]], i[8], i[4], i[5], i[3], "", "10", ""] for i in items])
    write_csv(os.path.join(d, "inventory-import-opening-stock.csv"),
              ["SKU", "Unit Cost", "Main Warehouse - Deira"],
              [[i[0], i[4], i[6]] for i in items])
    logo_png(os.path.join(d, "logo-noor.png"), "NUR AL SHARQ", (249, 247, 245), (20, 19, 16))
    logo_svg(os.path.join(d, "logo-noor.svg"), "NUR AL SHARQ", "#F9F7F5", "#141310")
    return len(items), len(custs), len(sups), seller_trn, ar_total, ap_total, inv_val, vat_payable

# ===========================================================================
# PERSONA 2 — Meydan Mobiles & Electronics (MEDIUM, 3 branches, messy + VAT mess)
# ===========================================================================
def persona2():
    rng = random.Random(252)
    d = wdir("persona-2-meydan-mobiles")
    seller_trn = trn(rng)
    brands = ["Nova", "Zenlink", "Falconx", "Orbit", "PureSound", "Vantage"]
    lines = {"Phones": ["Smartphone 128GB", "Smartphone 256GB", "Smartphone Lite"],
             "Chargers": ["Fast Charger 20W", "Fast Charger 65W", "Wireless Charger Pad"],
             "Accessories": ["Phone Case", "Screen Protector", "Car Mount", "Cable Type-C"],
             "Audio": ["Wireless Earbuds", "Bluetooth Speaker", "Over-Ear Headphones"],
             "Wearables": ["Smart Watch", "Fitness Band"],
             "Repair Parts": ["Replacement Screen", "Replacement Battery"]}
    cat_alias = {"Accessories": ["Accessories", "accessories", "Acc."],
                 "Phones": ["Phones", "phones", "Mobiles"],
                 "Chargers": ["Chargers", "Charging"],
                 "Audio": ["Audio", "audio"],
                 "Wearables": ["Wearables", "Wearable"],
                 "Repair Parts": ["Repair Parts", "Parts"]}
    units = ["Each", "each", "pc", "Each"]
    tax_groups = ["Standard 5%", "Standard 5%", "Standard 5%", "Standard 5%", "Zero-Rated 0%", ""]
    expiries = ["2027-03", "2026-11", ""]  # a few phone-adjacent screen-protector/battery items get "expiry"-like shelf-life tag
    items, n = [], 1
    for line, products in lines.items():
        for base in products:
            brand = rng.choice(brands)
            for variant in range(rng.randint(3, 6)):
                sku = f"MM-{n:05d}"
                cost = round(rng.uniform(15, 900), 2)
                net_price = round(cost * rng.uniform(1.2, 1.8), 2)
                # MESS: mixed tax-inclusive vs tax-exclusive entry in the raw price column (ambiguous)
                inclusive = n % 4 != 0
                price_cell = plain(round(net_price * 1.05, 2)) if inclusive else plain(net_price)
                qty = rng.randint(0, 50)
                name = f"{brand} {base} - v{variant + 1}"
                cat = rng.choice(cat_alias.get(line, [line]))
                cost_cell = "" if n % 15 == 0 else plain(cost)
                # VAT mess: mostly standard, a zero-rated export SKU deliberately mis-tagged standard,
                # and a few blank tax codes (should default to standard 5%)
                tg = rng.choice(tax_groups)
                exp = rng.choice(expiries) if line in ("Repair Parts",) else ""
                items.append([sku, name, brand, cat, rng.choice(units), cost_cell, price_cell,
                              qty, tg, exp])
                n += 1
    while len(items) < 780:
        brand = rng.choice(brands); line = rng.choice(list(lines)); base = rng.choice(lines[line])
        sku = f"MM-{len(items) + 1:05d}"; cost = round(rng.uniform(15, 900), 2)
        net_price = round(cost * rng.uniform(1.2, 1.8), 2)
        items.append([sku, f"{brand} {base}", brand, rng.choice(cat_alias.get(line, [line])), "Each",
                      plain(cost), plain(round(net_price * 1.05, 2)), rng.randint(0, 50), "Standard 5%", ""])
    # DELIBERATE duplicate SKU
    dup = list(items[9]); dup[1] = dup[1] + " (open box)"; items.insert(30, dup)
    write_csv(os.path.join(d, "products.csv"),
              ["SKU", "Product Name", "Brand", "Category", "Unit", "Cost (AED)", "Price (mixed incl./excl. VAT)",
               "Opening Qty", "Tax Group", "Shelf Life Note"], items)
    branches = ["Bur Dubai", "Sharjah", "Ajman"]
    stock = [[i[0], i[1], rng.randint(0, 30), rng.randint(0, 25), rng.randint(0, 20)] for i in items[:400]]
    write_csv(os.path.join(d, "stock_by_branch.csv"), ["Code", "Name"] + branches, stock)
    # customers — messy balances, some MISSING TRN (mess)
    cust_names = ["Meydan Retail Partners LLC", "Bur Dubai Mobile Souq", "Sharjah Electronics Hub",
                  "شركة الاتحاد للاتصالات", "Ajman Gadget World", "Al Nasr Trading Est",
                  "متجر الفلاح للجوالات", "Deira Digital Distribution", "Gulf Wireless Trading LLC",
                  "Ajman Free Zone Retail Co", "Fatima Mobile Accessories", "Union Square Electronics"]
    rows = []
    for i, nm in enumerate(cust_names):
        bal = round(rng.uniform(100, 9000), 2)
        if i % 5 == 0: balcell = euro(bal)
        elif i % 5 == 1: balcell = ar_num(int(bal))
        elif i % 5 == 2: balcell = comma(bal)
        elif i % 5 == 3: balcell = "-"
        else: balcell = f"{plain(bal)} AED"
        phone = f"05{rng.randint(10000000, 99999999)}" if i % 3 else ""
        # ~half the B2B accounts MISSING TRN — deliberate mess for onboarding to flag
        cust_trn = trn(rng) if i % 2 == 0 else ""
        rows.append([f"CUST-{i + 1:03d}", nm, phone, balcell, "01/03/2026", cust_trn])
    write_csv(os.path.join(d, "customers_aging.csv"),
              ["Customer Code", "Customer", "Phone", "Outstanding", "Since", "TRN"], rows)
    sups = [["SUP-01", "Nova Distribution Gulf FZE", "043321100", "9800.00", trn(rng)],
            ["SUP-02", "Falconx Imports LLC", "043445566", "4200.50", trn(rng)],
            ["SUP-03", "شركة الاتصالات الخليجية", "065512233", "1650.00", trn(rng)]]
    write_csv(os.path.join(d, "suppliers.csv"),
              ["Code", "Supplier", "Phone", "Balance", "TRN"], sups)
    inv_val = round(sum((float(i[5]) if i[5] else 0.0) * i[7] for i in items), 2)
    cash, bank, ar_ctrl, fixtures = 8500.00, 61000.00, 14200.00, 22000.00
    ap_ctrl = round(sum(float(s[3]) for s in sups), 2)
    vat_payable = 3120.75
    # DELIBERATE imbalance of exactly AED 950.00 (tests OBE plug)
    OBE_PLUG = 950.00
    capital = round(cash + bank + ar_ctrl + inv_val + fixtures - ap_ctrl - vat_payable - OBE_PLUG, 2)
    tb = [["1100", "Cash", plain(cash), "0.00"],
          ["1110", "Bank - Mashreq Current", plain(bank), "0.00"],
          ["1131", "Trade Receivables", plain(ar_ctrl), "0.00"],
          ["1141", "Inventory - Stock on Hand", plain(inv_val), "0.00"],
          ["1500", "Shop Fit-out & Fixtures", plain(fixtures), "0.00"],
          ["2111", "Trade Payables", "0.00", plain(ap_ctrl)],
          ["2210", "VAT Payable", "0.00", plain(vat_payable)],
          ["3901", "Owner Capital", "0.00", plain(capital)]]
    write_csv(os.path.join(d, "trial_balance.csv"), ["Account Code", "Account Name", "Debit", "Credit"], tb)
    logo_png(os.path.join(d, "logo-meydan.png"), "MEYDAN MOBILES", (20, 19, 16), (151, 156, 26))
    logo_svg(os.path.join(d, "logo-meydan.svg"), "MEYDAN MOBILES", "#141310", "#979C1A")
    debit_total = round(cash + bank + ar_ctrl + inv_val + fixtures, 2)
    credit_total = round(ap_ctrl + vat_payable + capital, 2)
    return len(items), len(rows), len(sups), seller_trn, debit_total, credit_total, OBE_PLUG

# ===========================================================================
# PERSONA 3 — Emirates Building Materials Trading LLC (LARGE, B2B, DZ + FX)
# ===========================================================================
def persona3():
    rng = random.Random(353)
    d = wdir("persona-3-emirates-building-materials")
    seller_trn = trn(rng)
    cats = {"TILE": "Tiles & Ceramics", "CEM": "Cement & Aggregates", "PAINT": "Paint & Coatings",
            "PLUM": "Plumbing", "ELEC": "Electrical", "HAND": "Hand Tools", "PWR": "Power Tools",
            "TIMB": "Timber & Boards", "FAST": "Fasteners", "SAFE": "Safety Gear",
            "ADHE": "Adhesives & Sealants", "MEAS": "Measuring & Levelling"}
    nouns = {"TILE": ["Porcelain Tile", "Ceramic Wall Tile", "Marble Effect Tile", "Outdoor Paver"],
             "CEM": ["Portland Cement 50kg", "Ready Mix Sand", "Aggregate 20mm", "Gypsum Plaster"],
             "PAINT": ["Emulsion Paint 20L", "Primer 4L", "Weatherproof Paint", "Wood Varnish"],
             "PLUM": ["PVC Pipe 4in", "Ball Valve", "Pipe Fitting", "Flexible Hose", "Water Tank Fitting"],
             "ELEC": ["Cable 4mm", "Wall Socket", "Circuit Breaker", "LED Panel Light", "Junction Box"],
             "HAND": ["Hammer", "Screwdriver Set", "Wrench", "Pliers", "Hand Saw"],
             "PWR": ["Drill", "Angle Grinder", "Circular Saw", "Impact Driver"],
             "TIMB": ["Plywood Sheet 18mm", "MDF Board", "Timber Batten", "Formwork Panel"],
             "FAST": ["Wood Screw Box", "Machine Bolt", "Anchor Bolt", "Self-Tapping Screw"],
             "SAFE": ["Safety Helmet", "Hi-Vis Vest", "Work Gloves", "Safety Goggles"],
             "ADHE": ["Tile Adhesive 25kg", "Silicone Sealant", "Grout", "Epoxy"],
             "MEAS": ["Tape Measure", "Spirit Level", "Laser Level"]}
    sizes = ["Small", "Medium", "Large", "600x600mm", "300x300mm", "4in", "6in", "Box of 10", "Box of 50",
             "20kg", "25kg", "50kg", "4L", "20L", "White", "Grey", "1.2m x 2.4m"]
    units = ["Each", "Box", "Bag", "Pack", "Sheet", "Roll", "Set"]
    branches = ["Al Quoz Store", "Sharjah Industrial Store", "Ajman Store", "Ras Al Khor Store",
                "Jebel Ali Free Zone Store", "Central Warehouse (Al Quoz)"]
    JEBEL_ALI = "Jebel Ali Free Zone Store"
    TARGET_ITEMS = 8500
    items = []
    for i in range(TARGET_ITEMS):
        pre = rng.choice(list(cats))
        noun = rng.choice(nouns[pre]); size = rng.choice(sizes)
        sku = f"{pre}-{i + 1:06d}"
        cost = round(rng.uniform(2, 900), 2)
        price = round(cost * rng.uniform(1.25, 1.8), 2)
        unit = rng.choice(units)
        bc = f"629{rng.randint(1000000000, 9999999999)}"
        wholesale = round(cost * rng.uniform(1.1, 1.35), 2)
        items.append([sku, f"{noun} {size}", cats[pre], unit, plain(cost), plain(wholesale), plain(price), bc])
    write_xlsx(os.path.join(d, "item_master.xlsx"),
               [("Items", ["SKU", "Item Name", "Category", "Unit", "Cost",
                           "Wholesale Price", "Sell Price", "Barcode"], items)])
    stock = []
    for it in items:
        qtys = [rng.randint(0, 40) for _ in branches]
        stock.append([it[0], it[1]] + qtys)
    write_csv(os.path.join(d, "opening_stock_by_warehouse.csv"), ["Code", "Name"] + branches, stock)
    first = ["Al Manara", "Gulf", "Desert", "Al Reem", "Falcon", "Emirates", "Union", "National",
             "Modern", "Reliable", "Prime", "Oasis", "Pearl", "Marina", "Capital", "Meraas"]
    kind = ["Contracting LLC", "Construction Co", "Trading Est", "Maintenance Co", "Engineering Consultants",
            "Interiors LLC", "Real Estate Development", "MEP Services", "Builders LLC", "Fit-out Co"]
    custs = []
    NCUST = 4200
    for i in range(NCUST):
        nm = f"{rng.choice(first)} {rng.choice(kind)}"
        bal = round(rng.uniform(0, 60000), 2)
        r = i % 6
        if r == 0: balcell = comma(bal)
        elif r == 1: balcell = euro(bal)
        elif r == 2: balcell = plain(bal)
        elif r == 3: balcell = "-" if bal < 2000 else plain(bal)
        elif r == 4: balcell = f"AED {plain(bal)}"
        else: balcell = plain(bal)
        phone = f"05{rng.randint(10000000, 99999999)}"
        credit = rng.choice(["10000", "25000", "50000", "100000", ""])
        salesman = rng.choice(["Anwar", "Rakesh", "Mahmoud", "Joseph", "Khaled", "Suresh"])
        terms = rng.choice(["Cash", "30 days", "45 days", "60 days", "COD", "90 days"])
        cust_trn = trn(rng) if rng.random() > 0.08 else ""  # a few missing TRN, mess at scale
        custs.append([f"CN-{i + 1:05d}", nm, phone, credit, balcell, salesman, terms, cust_trn])
    write_csv(os.path.join(d, "customers.csv"),
              ["Account No", "Customer Name", "Phone", "Credit Limit", "Outstanding Balance",
               "Salesman", "Payment Terms", "TRN"], custs)
    banks = ["Emirates NBD", "ADCB", "Mashreq", "FAB", "DIB", "RAK Bank"]
    pdc = []
    for i in range(220):
        c = rng.choice(custs)
        amt = round(rng.uniform(500, 90000), 2)
        mth = rng.randint(6, 12)
        pdc.append([f"CHQ-{rng.randint(100000, 999999)}", c[0], c[1], rng.choice(banks), comma(amt),
                    f"2026-{mth:02d}-{rng.randint(1, 28):02d}", rng.choice(["On Hand", "Deposited", "Cleared"])])
    write_csv(os.path.join(d, "pdc_register.csv"),
              ["Cheque No", "Account No", "Customer", "Bank", "Amount", "Cheque Date", "Status"], pdc)
    quos = []
    for i in range(140):
        c = rng.choice(custs)
        val = round(rng.uniform(500, 140000), 2)
        st = rng.choice(["Quotation", "Confirmed Order", "Part-Delivered"])
        quos.append([f"QT-2026-{i + 1:04d}", c[0], c[1], comma(val),
                     f"2026-06-{rng.randint(1, 15):02d}", st,
                     rng.choice(["Tower - Business Bay", "Villa - Arabian Ranches", "Mall Fit-out - Sharjah",
                                 "Warehouse - Jebel Ali", "Maintenance", "Fit-out", ""])])
    write_csv(os.path.join(d, "open_quotations.csv"),
              ["Doc No", "Account No", "Customer", "Value (AED)", "Date", "Status", "Project Ref"], quos)
    # suppliers — mostly local, a handful FOREIGN (China/India/Turkey) → reverse charge + FX
    sups = []
    foreign = [("Shanghai Wanjia Building Materials Co", "China", "USD"),
               ("Anand Ceramics Pvt Ltd", "India", "USD"),
               ("Istanbul Yapi Malzemeleri Ltd", "Turkey", "EUR")]
    for i in range(177):
        nm = f"{rng.choice(first)} {rng.choice(['Supplies', 'Imports', 'Distribution', 'Industrial', 'Trading Co'])}"
        sups.append([f"V-{i + 1:04d}", nm, f"04{rng.randint(2000000, 9999999)}",
                     plain(round(rng.uniform(0, 420000), 2)), trn(rng), "UAE", "AED", "Standard - Domestic"])
    for j, (nm, country, ccy) in enumerate(foreign):
        sups.append([f"V-{178 + j:04d}", nm, f"+{rng.randint(1, 99)}{rng.randint(1000000, 999999999)}",
                     plain(round(rng.uniform(20000, 380000), 2)), "", country, ccy, "Reverse Charge - Import"])
    write_csv(os.path.join(d, "suppliers.csv"),
              ["Vendor Code", "Supplier Name", "Phone", "Outstanding", "TRN", "Country", "Currency", "VAT Treatment"],
              sups)
    # designated-zone inter-branch transfer note: Jebel Ali (DZ) -> mainland triggers import VAT
    dz_transfers = []
    for i in range(15):
        it = rng.choice(items)
        qty = rng.randint(10, 400)
        dz_transfers.append([f"TRF-2026-{i + 1:04d}", JEBEL_ALI, rng.choice([b for b in branches if b != JEBEL_ALI]),
                              it[0], it[1], qty, plain(round(float(it[4]) * qty, 2)), "Reverse Charge - DZ to Mainland"])
    write_csv(os.path.join(d, "dz_mainland_transfers.csv"),
              ["Transfer No", "From (Designated Zone)", "To (Mainland)", "SKU", "Item", "Qty",
               "Value (AED)", "VAT Treatment"], dz_transfers)
    inv_val = round(sum(float(i[4]) * sum(s[2:]) for i, s in zip(items, stock)), 2)
    ar_total = round(sum(_parse_messy(c[4]) for c in custs), 2)
    ap_total = round(sum(float(s[3]) for s in sups), 2)
    cash, bank, fixtures = 145000.00, 3200000.00, 950000.00
    vat_payable = 186500.40
    reverse_charge_vat = 42800.00  # self-accounted VAT on foreign supplier + DZ->mainland movements
    capital = round(cash + bank + ar_total + inv_val + fixtures - ap_total - vat_payable - reverse_charge_vat, 2)
    tb = [["1100", "Cash on Hand", plain(cash), "0.00"],
          ["1110", "Bank - FAB Current", plain(bank), "0.00"],
          ["1131", "Accounts Receivable - Trade", plain(ar_total), "0.00"],
          ["1141", "Inventory - Goods for Resale", plain(inv_val), "0.00"],
          ["1500", "Warehouse Equipment & Racking", plain(fixtures), "0.00"],
          ["2111", "Accounts Payable - Trade", "0.00", plain(ap_total)],
          ["2210", "VAT Payable", "0.00", plain(vat_payable)],
          ["2211", "Reverse Charge VAT Payable (imports / DZ)", "0.00", plain(reverse_charge_vat)],
          ["3901", "Share Capital", "0.00", plain(capital)]]
    write_xlsx(os.path.join(d, "trial_balance.xlsx"),
               [("Trial Balance", ["Account Code", "Account Name", "Debit", "Credit"], tb)])
    logo_png(os.path.join(d, "logo-ebm.png"), "EMIRATES BUILDING MATERIALS", (20, 19, 16), (151, 156, 26))
    logo_svg(os.path.join(d, "logo-ebm.svg"), "EMIRATES BUILDING MATERIALS", "#141310", "#979C1A")
    return (len(items), len(custs), len(sups), seller_trn, ar_total, ap_total, inv_val,
            vat_payable, reverse_charge_vat)

# ===========================================================================
# IMAGES — shared helpers (reused from Kuwait generator's approach)
# ===========================================================================
def font(sz):
    for p in ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc",
              "/Library/Fonts/Arial.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except: pass
    return ImageFont.load_default()

def centered(draw, box, text, fnt, fill):
    x0, y0, x1, y1 = box
    l, t, r, b = draw.textbbox((0, 0), text, font=fnt)
    draw.text((x0 + (x1 - x0 - (r - l)) / 2 - l, y0 + (y1 - y0 - (b - t)) / 2 - t), text, font=fnt, fill=fill)

def logo_png(path, text, bg, fg):
    img = Image.new("RGB", (800, 300), bg); dr = ImageDraw.Draw(img)
    centered(dr, (0, 0, 800, 300), text, font(56), fg)
    img.save(path, "PNG")

def logo_svg(path, text, bg, fg):
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="800" height="300" viewBox="0 0 800 300">
  <rect width="800" height="300" fill="{bg}"/>
  <text x="400" y="170" font-family="Arial, sans-serif" font-size="56" font-weight="bold"
        fill="{fg}" text-anchor="middle">{text}</text>
</svg>'''
    with open(path, "w", encoding="utf-8") as f: f.write(svg)

def product_img(path, label, bg, fg):
    img = Image.new("RGB", (600, 600), bg); dr = ImageDraw.Draw(img)
    dr.rectangle([30, 30, 570, 570], outline=fg, width=4)
    centered(dr, (40, 220, 560, 300), label, font(56), fg)
    centered(dr, (40, 320, 560, 380), "ZERUPT TEST", font(28), fg)
    img.save(path, "PNG")

def avatar_img(path, initials, bg):
    img = Image.new("RGB", (400, 400), bg); dr = ImageDraw.Draw(img)
    dr.ellipse([40, 40, 360, 360], fill=(255, 255, 255))
    centered(dr, (40, 40, 360, 360), initials, font(150), bg)
    img.save(path, "PNG")

def images():
    d = wdir("uae/images".split("/")[-1])  # -> images at customers/uae/images
    d = os.path.join(ROOT, "uae", "images")
    os.makedirs(d, exist_ok=True)
    INK = (20, 19, 16); CREAM = (249, 247, 245); CITRON = (151, 156, 26)
    GOLD = (168, 130, 40); TEAL = (20, 90, 100)
    product_img(os.path.join(d, "product-1.png"), "OUD", CREAM, GOLD)
    product_img(os.path.join(d, "product-2.png"), "MOBILE", INK, CITRON)
    product_img(os.path.join(d, "product-3.png"), "TILE", (240, 240, 238), TEAL)
    avatar_img(os.path.join(d, "avatar-1.png"), "NS", GOLD)
    avatar_img(os.path.join(d, "avatar-2.png"), "MM", CITRON)

# ===========================================================================
if __name__ == "__main__":
    p1 = persona1(); print("Persona 1 (Nur Al Sharq):", p1)
    p2 = persona2(); print("Persona 2 (Meydan):      ", p2)
    p3 = persona3(); print("Persona 3 (Emirates BM): ", p3)
    images(); print("Images written.")
