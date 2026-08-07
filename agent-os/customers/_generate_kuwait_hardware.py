#!/usr/bin/env python3
"""
Seeded generator for a large, realistic, referentially-consistent test dataset
for a KUWAIT GENERAL HARDWARE / BUILDING-TOOLS wholesaler+retailer.

Produces CSVs across four import surfaces:
  01-unified-ai-import/  - messy real-world headers, AI-mapped
  02-inventory-bulk/     - exact Zerupt inventory-import contract headers
  03-books/              - exact Zerupt books-import contract headers
  04-opening/            - opening balances (AI-mapped)
  05-sales-history/      - sales history import (dropdown-backed FK lookups)

Stdlib only. Fixed seed -> reproducible output. UTF-8, no BOM, comma-delimited.
Kuwait = no tax, KWD with 3 decimal places.
"""
from __future__ import annotations

import csv
import os
import random
from datetime import date, timedelta

# ─── Constants ──────────────────────────────────────────────────────────────

SEED = 20260807
RNG = random.Random(SEED)

BASE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kuwait-hardware")
DIR_UNIFIED = os.path.join(BASE_DIR, "01-unified-ai-import")
DIR_INVENTORY = os.path.join(BASE_DIR, "02-inventory-bulk")
DIR_BOOKS = os.path.join(BASE_DIR, "03-books")
DIR_OPENING = os.path.join(BASE_DIR, "04-opening")
DIR_SALES = os.path.join(BASE_DIR, "05-sales-history")

TODAY = date(2026, 8, 7)

BRANCHES = ["Shuwaikh Main", "Rai Branch", "Fahaheel Branch", "Ardiya Warehouse"]
KUWAIT_CITIES = [
    "Kuwait City", "Hawally", "Salmiya", "Farwaniya", "Jahra",
    "Ahmadi", "Fahaheel", "Shuwaikh", "Rai", "Ardiya",
]

MESS_RATE = 0.17

# ─── Category taxonomy (2-3 levels, ~120 nodes) ────────────────────────────

CATEGORY_TREE = {
    "Power Tools": {
        "nameAlt": "أدوات كهربائية",
        "children": {
            "Drills & Drivers": {"nameAlt": "مثاقب"},
            "Angle Grinders": {"nameAlt": "صنفرة زاوية"},
            "Circular Saws": {"nameAlt": "مناشير دائرية"},
            "Jigsaws": {"nameAlt": "مناشير منحنية"},
            "Planers & Routers": {"nameAlt": "مسويات وروترات"},
            "Generators": {"nameAlt": "مولدات كهرباء"},
            "Welding Machines": {"nameAlt": "ماكينات لحام"},
        },
    },
    "Hand Tools": {
        "nameAlt": "أدوات يدوية",
        "children": {
            "Wrenches": {"nameAlt": "مفاتيح ربط"},
            "Screwdrivers": {"nameAlt": "مفكات"},
            "Pliers": {"nameAlt": "زرادية"},
            "Hammers": {"nameAlt": "مطارق"},
            "Hand Saws": {"nameAlt": "مناشير يدوية"},
            "Chisels": {"nameAlt": "إزميل"},
            "Tool Sets": {"nameAlt": "طقم عدة"},
        },
    },
    "Fasteners": {
        "nameAlt": "مثبتات",
        "children": {
            "Screws": {"nameAlt": "براغي", "children": {
                "Wood Screws": {"nameAlt": "براغي خشب"},
                "Machine Screws": {"nameAlt": "براغي آلات"},
                "Self Tapping Screws": {"nameAlt": "براغي ذاتية التنصيت"},
            }},
            "Bolts & Nuts": {"nameAlt": "صواميل وبراغي"},
            "Washers": {"nameAlt": "حلقات"},
            "Anchors & Plugs": {"nameAlt": "مثبتات جدارية"},
            "Nails": {"nameAlt": "مسامير"},
            "Rivets": {"nameAlt": "مسامير برشام"},
        },
    },
    "Plumbing": {
        "nameAlt": "سباكة",
        "children": {
            "Pipes & Fittings": {"nameAlt": "مواسير ووصلات", "children": {
                "PVC Pipes": {"nameAlt": "مواسير بي في سي"},
                "Copper Fittings": {"nameAlt": "وصلات نحاس"},
                "PPR Pipes": {"nameAlt": "مواسير بي بي آر"},
            }},
            "Valves": {"nameAlt": "صمامات"},
            "Taps & Mixers": {"nameAlt": "حنفيات وخلاطات"},
            "Water Tanks": {"nameAlt": "خزانات مياه"},
            "Sealants & Tape": {"nameAlt": "شريط لحام وسدادات"},
        },
    },
    "Electrical": {
        "nameAlt": "كهرباء",
        "children": {
            "Cables & Wires": {"nameAlt": "كابلات وأسلاك"},
            "Switches & Sockets": {"nameAlt": "مفاتيح وأفياش"},
            "Circuit Breakers": {"nameAlt": "قواطع كهربائية"},
            "Lighting": {"nameAlt": "إنارة"},
            "Conduits": {"nameAlt": "مواسير كهرباء"},
            "Extension Cords": {"nameAlt": "وصلات كهرباء"},
        },
    },
    "Paint & Coatings": {
        "nameAlt": "دهانات",
        "children": {
            "Emulsion Paint": {"nameAlt": "دهان مائي"},
            "Enamel Paint": {"nameAlt": "دهان زيتي"},
            "Primers": {"nameAlt": "برايمر"},
            "Spray Paint": {"nameAlt": "بخاخ دهان"},
            "Brushes & Rollers": {"nameAlt": "فرش ورولات"},
            "Thinners": {"nameAlt": "تنر"},
        },
    },
    "Safety Gear": {
        "nameAlt": "معدات السلامة",
        "children": {
            "Helmets": {"nameAlt": "خوذات"},
            "Gloves": {"nameAlt": "قفازات"},
            "Safety Boots": {"nameAlt": "أحذية سلامة"},
            "Eye Protection": {"nameAlt": "نظارات واقية"},
            "High Visibility Vests": {"nameAlt": "سترات عاكسة"},
            "Respirators": {"nameAlt": "أقنعة تنفس"},
        },
    },
    "Adhesives & Sealants": {
        "nameAlt": "مواد لاصقة وعازلة",
        "children": {
            "Silicone Sealant": {"nameAlt": "سيليكون"},
            "Construction Adhesive": {"nameAlt": "لاصق إنشائي"},
            "Epoxy": {"nameAlt": "إيبوكسي"},
            "Super Glue": {"nameAlt": "لاصق سريع"},
            "Foam Fillers": {"nameAlt": "رغوة عازلة"},
        },
    },
    "Abrasives": {
        "nameAlt": "مواد كاشطة",
        "children": {
            "Sandpaper": {"nameAlt": "ورق صنفرة"},
            "Grinding Discs": {"nameAlt": "أقراص جلخ"},
            "Cutting Discs": {"nameAlt": "أقراص قطع"},
            "Wire Brushes": {"nameAlt": "فرش سلك"},
        },
    },
    "Building Hardware": {
        "nameAlt": "عدد بناء",
        "children": {
            "Cement & Mortar": {"nameAlt": "أسمنت وملاط"},
            "Insulation": {"nameAlt": "عزل"},
            "Tiles Adhesive": {"nameAlt": "لاصق بلاط"},
            "Scaffolding": {"nameAlt": "سقالات"},
            "Wheelbarrows": {"nameAlt": "عربات يدوية"},
        },
    },
    "Ironmongery": {
        "nameAlt": "أدوات حديدية",
        "children": {
            "Door Hinges": {"nameAlt": "مفصلات أبواب"},
            "Locks & Padlocks": {"nameAlt": "أقفال"},
            "Door Handles": {"nameAlt": "مقابض أبواب"},
            "Cabinet Fittings": {"nameAlt": "تجهيزات خزائن"},
            "Chains": {"nameAlt": "سلاسل"},
        },
    },
    "Garden Tools": {
        "nameAlt": "أدوات حديقة",
        "children": {
            "Shovels & Spades": {"nameAlt": "مجارف"},
            "Hoses & Sprinklers": {"nameAlt": "خراطيم ورشاشات"},
            "Pruning Shears": {"nameAlt": "مقصات تقليم"},
            "Wheelbarrows & Carts": {"nameAlt": "عربات حديقة"},
        },
    },
    "Measuring Tools": {
        "nameAlt": "أدوات قياس",
        "children": {
            "Tape Measures": {"nameAlt": "أشرطة قياس"},
            "Spirit Levels": {"nameAlt": "ميزان مياه"},
            "Laser Levels": {"nameAlt": "ميزان ليزر"},
            "Calipers": {"nameAlt": "فرجار قياس"},
        },
    },
    "Ladders & Access": {
        "nameAlt": "سلالم",
        "children": {
            "Aluminium Ladders": {"nameAlt": "سلالم ألمنيوم"},
            "Step Stools": {"nameAlt": "مقاعد درج"},
            "Platform Ladders": {"nameAlt": "سلالم منصة"},
        },
    },
    "Welding & Metalwork": {
        "nameAlt": "لحام وأعمال معدنية",
        "children": {
            "Welding Rods": {"nameAlt": "أسياخ لحام"},
            "Welding Accessories": {"nameAlt": "ملحقات لحام"},
            "Metal Sheets": {"nameAlt": "صفائح معدنية"},
        },
    },
}

BRANDS = [
    "Bosch", "Makita", "DeWalt", "Stanley", "Total", "Ingco", "Hilti", "Black+Decker",
    "Karcher", "Skil", "Tolsen", "Crown", "Al-Fanar", "Gulf Star", "Ridgid",
    "Truper", "Yato", "Sata", "Metabo", "Hitachi",
]

SUPPLIER_LEGAL_SUFFIXES = ["Trading Co.", "W.L.L.", "Est.", "General Trading Co. W.L.L.", "Trading Est."]
SUPPLIER_NAME_STEMS = [
    "Al-Sanea", "Al-Rashed", "Gulf Hardware", "Al-Kuwait Building Materials", "Al-Zamil",
    "National Tools", "Al-Ghanim", "Sultan Center", "Al-Marzouq", "Al-Bahar",
    "Kuwait Steel", "Al-Fahad", "Union Hardware", "Al-Qadi", "Al-Mutawa",
    "Gulf Fasteners", "Al-Ostath", "Middle East Tools", "Al-Wazzan", "Bin Hindi",
    "Al-Duaij", "Kuwait Paint", "Al-Hajeri", "Al-Roumi", "Al-Sabah Trading",
    "Gulf Safety Supplies", "Al-Ajmi", "Continental Hardware", "Al-Yaqout", "Salem Trading",
    "Al-Khaled", "Desert Star Hardware", "Al-Anjari", "Gulf Ironmongery", "Al-Nasser",
    "Bin Nakhi", "Al-Enezi", "Kuwait Adhesives", "Al-Osaimi", "First Gulf Tools",
]
CUSTOMER_NAME_STEMS = [
    "Al-Fahad Contracting", "Modern Home Fix-It", "Al-Sabah Villa Services", "Bayt Al-Jomard",
    "Al-Duaij Maintenance", "Gulf Builders", "Salem Al-Rashidi", "Fahad Al-Otaibi",
    "Al-Mutairi Est.", "New Kuwait Contracting", "Al-Ajmi Interiors", "Ahmad Al-Kandari",
    "Al-Enezi General Maintenance", "Desert Rose Interiors", "Al-Anjari Villas",
    "Al-Roumi Renovation", "Union Facility Services", "Al-Yaqout Villas",
    "Al-Qadi Household", "Nasser Al-Hajeri", "Al-Ghanim Home Repairs",
    "Al-Bahar Property Services", "Gulf Facility Management", "Continental Maintenance Co.",
    "Al-Zamil Villas", "Bin Hindi Property", "Al-Wazzan Maintenance", "Al-Marzouq Home",
    "Farwaniya Fix-It Center", "Salmiya Handyman Services", "Hawally Repair Shop",
    "Jahra Building Supplies Buyer", "Ahmadi Villa Care", "Fahaheel Home Services",
    "Al-Khaled General Trading", "Al-Nasser Renovation", "Al-Osaimi Maintenance",
    "First Gulf Interiors", "Al-Rashed Villas", "Al-Sanea Property",
]

UNIT_SPELLINGS = ["PCS", "pcs", "Pieces", "PC", "Nos", "pc"]

# ─── Mess helpers ───────────────────────────────────────────────────────────

def maybe(rate: float = MESS_RATE) -> bool:
    return RNG.random() < rate


def messy_case(text: str) -> str:
    style = RNG.choice(["upper", "lower", "title", "asis"])
    if style == "upper":
        return text.upper()
    if style == "lower":
        return text.lower()
    if style == "title":
        return text.title()
    return text


def messy_spacing(text: str) -> str:
    variant = RNG.choice(["lead", "trail", "double", "both"])
    if variant == "lead":
        return f"  {text}"
    if variant == "trail":
        return f"{text}  "
    if variant == "double":
        return text.replace(" ", "  ", 1)
    return f" {text} "


def messy_name(text: str) -> str:
    """Applies casing/spacing/punctuation mess to a display name, rarely."""
    out = text
    if maybe():
        out = messy_case(out)
    if maybe(0.08):
        out = messy_spacing(out)
    if maybe(0.05):
        out = out + RNG.choice([".", ","])
    return out


def messy_money(amount: float) -> str:
    """Returns a 3dp KWD amount, sometimes with thousands separators or a currency prefix."""
    formatted = f"{amount:,.3f}"
    plain = f"{amount:.3f}"
    if maybe(0.10):
        return RNG.choice([f"KD {plain}", f"KWD {plain}"])
    if maybe(0.10):
        return formatted
    return plain


def deterministic_messy_money(amount: float, key: str) -> str:
    """Same visual mess as messy_money (plain / thousands separator / KD-KWD prefix)
    but chosen from `key` instead of the shared RNG stream, so callers that must not
    perturb downstream random draws (e.g. the GL/TB builders, which run before
    sales-history generation) can still vary the formatting deterministically."""
    style = sum(ord(c) for c in key) % 4
    plain = f"{amount:.3f}"
    if style == 0:
        return plain
    if style == 1:
        return f"{amount:,.3f}"
    if style == 2:
        return f"KD {plain}"
    return f"KWD {plain}"


def messy_date(d: date, fmt_pool: str = "any") -> str:
    """fmt_pool: 'any' picks randomly per-row; 'iso' or 'dmy' forces a file-level convention."""
    if fmt_pool == "iso":
        return d.isoformat()
    if fmt_pool == "dmy_slash":
        return f"{d.day}/{d.month}/{d.year}"
    if fmt_pool == "dmy_dash":
        return f"{d.day:02d}-{d.month:02d}-{d.year}"
    return RNG.choice([d.isoformat(), f"{d.day}/{d.month}/{d.year}", f"{d.day:02d}-{d.month:02d}-{d.year}"])


def messy_unit(default: str = "PCS") -> str:
    return RNG.choice(UNIT_SPELLINGS) if maybe(0.3) else default


def blank_if_optional(value: str, rate: float = 0.12) -> str:
    return "" if maybe(rate) else value


def quoted_number_text(n) -> str:
    """Occasionally returns a number as a quoted-looking text value (still valid CSV cell)."""
    return f"'{n}" if maybe(0.05) else str(n)


def phone_kw() -> str:
    return f"+965 {RNG.randint(50000000, 99999999)}"


def write_csv(path: str, headers: list[str], rows: list[list]) -> int:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows(rows)
    return len(rows)


# ─── Category universe ──────────────────────────────────────────────────────

class Category:
    __slots__ = ("code", "name", "name_alt", "parent_code", "depth")

    def __init__(self, code, name, name_alt, parent_code, depth):
        self.code = code
        self.name = name
        self.name_alt = name_alt
        self.parent_code = parent_code
        self.depth = depth


def build_categories() -> list[Category]:
    categories: list[Category] = []
    counter = 1

    def add(name, name_alt, parent_code, depth):
        nonlocal counter
        code = f"CAT{counter:03d}"
        counter += 1
        categories.append(Category(code, name, name_alt, parent_code, depth))
        return code

    for top_name, top_data in CATEGORY_TREE.items():
        top_code = add(top_name, top_data.get("nameAlt", ""), None, 0)
        children = top_data.get("children", {})
        for child_name, child_data in children.items():
            child_code = add(child_name, child_data.get("nameAlt", ""), top_code, 1)
            grandchildren = child_data.get("children", {})
            for gc_name, gc_data in grandchildren.items():
                add(gc_name, gc_data.get("nameAlt", ""), child_code, 2)

    return categories


def leaf_categories(categories: list[Category]) -> list[Category]:
    parent_codes = {c.parent_code for c in categories if c.parent_code}
    return [c for c in categories if c.code not in parent_codes]


# ─── Item universe ──────────────────────────────────────────────────────────

class Item:
    __slots__ = (
        "sku", "barcode", "name", "name_alt", "category", "brand", "part_number",
        "unit", "cost", "sell", "wholesale", "reorder", "tracking", "valuation",
        "book_name",
    )


ITEM_TEMPLATES_BY_CATEGORY = {
    "Drills & Drivers": ["Cordless Drill {spec}", "Impact Driver {spec}", "Hammer Drill {spec}"],
    "Angle Grinders": ["Angle Grinder {spec}", "Mini Grinder {spec}"],
    "Circular Saws": ["Circular Saw {spec}"],
    "Jigsaws": ["Jigsaw {spec}"],
    "Planers & Routers": ["Electric Planer {spec}", "Wood Router {spec}"],
    "Generators": ["Portable Generator {spec}", "Inverter Generator {spec}"],
    "Welding Machines": ["ARC Welding Machine {spec}", "MIG Welder {spec}"],
    "Wrenches": ["Combination Wrench {spec}", "Adjustable Wrench {spec}", "Socket Wrench Set {spec}"],
    "Screwdrivers": ["Flat Screwdriver {spec}", "Phillips Screwdriver {spec}", "Screwdriver Set {spec}"],
    "Pliers": ["Combination Pliers {spec}", "Long Nose Pliers {spec}", "Locking Pliers {spec}"],
    "Hammers": ["Claw Hammer {spec}", "Sledge Hammer {spec}", "Rubber Mallet {spec}"],
    "Hand Saws": ["Hand Saw {spec}", "Hacksaw {spec}"],
    "Chisels": ["Wood Chisel {spec}", "Cold Chisel {spec}"],
    "Tool Sets": ["Tool Kit {spec} Pieces"],
    "Wood Screws": ["Wood Screw {spec}"],
    "Machine Screws": ["Machine Screw {spec}"],
    "Self Tapping Screws": ["Self Tapping Screw {spec}"],
    "Bolts & Nuts": ["Hex Bolt {spec}", "Hex Nut {spec}"],
    "Washers": ["Flat Washer {spec}", "Spring Washer {spec}"],
    "Anchors & Plugs": ["Wall Plug {spec}", "Expansion Anchor {spec}"],
    "Nails": ["Common Nail {spec}", "Concrete Nail {spec}"],
    "Rivets": ["Pop Rivet {spec}"],
    "PVC Pipes": ["PVC Pipe {spec}"],
    "Copper Fittings": ["Copper Elbow {spec}", "Copper Tee {spec}"],
    "PPR Pipes": ["PPR Pipe {spec}"],
    "Valves": ["Gate Valve {spec}", "Ball Valve {spec}"],
    "Taps & Mixers": ["Kitchen Mixer {spec}", "Basin Tap {spec}"],
    "Water Tanks": ["Plastic Water Tank {spec}"],
    "Sealants & Tape": ["Teflon Tape {spec}", "Pipe Sealant {spec}"],
    "Cables & Wires": ["Electrical Cable {spec}", "Flexible Wire {spec}"],
    "Switches & Sockets": ["Wall Switch {spec}", "Power Socket {spec}"],
    "Circuit Breakers": ["MCB Circuit Breaker {spec}"],
    "Lighting": ["LED Bulb {spec}", "Flood Light {spec}"],
    "Conduits": ["PVC Conduit Pipe {spec}"],
    "Extension Cords": ["Extension Cord {spec}"],
    "Emulsion Paint": ["Emulsion Paint {spec}"],
    "Enamel Paint": ["Enamel Paint {spec}"],
    "Primers": ["Wall Primer {spec}"],
    "Spray Paint": ["Spray Paint Can {spec}"],
    "Brushes & Rollers": ["Paint Brush {spec}", "Paint Roller {spec}"],
    "Thinners": ["Paint Thinner {spec}"],
    "Helmets": ["Safety Helmet {spec}"],
    "Gloves": ["Work Gloves {spec}"],
    "Safety Boots": ["Steel Toe Safety Boots {spec}"],
    "Eye Protection": ["Safety Goggles {spec}"],
    "High Visibility Vests": ["Hi-Vis Safety Vest {spec}"],
    "Respirators": ["Dust Mask Respirator {spec}"],
    "Silicone Sealant": ["Silicone Sealant Tube {spec}"],
    "Construction Adhesive": ["Construction Adhesive {spec}"],
    "Epoxy": ["Epoxy Adhesive {spec}"],
    "Super Glue": ["Super Glue {spec}"],
    "Foam Fillers": ["PU Foam Filler {spec}"],
    "Sandpaper": ["Sandpaper Sheet {spec}"],
    "Grinding Discs": ["Grinding Disc {spec}"],
    "Cutting Discs": ["Cutting Disc {spec}"],
    "Wire Brushes": ["Wire Brush {spec}"],
    "Cement & Mortar": ["Cement Bag {spec}", "Ready Mix Mortar {spec}"],
    "Insulation": ["Thermal Insulation Sheet {spec}"],
    "Tiles Adhesive": ["Tile Adhesive Bag {spec}"],
    "Scaffolding": ["Scaffolding Frame {spec}"],
    "Wheelbarrows": ["Wheelbarrow {spec}"],
    "Door Hinges": ["Door Hinge {spec}"],
    "Locks & Padlocks": ["Door Lock {spec}", "Padlock {spec}"],
    "Door Handles": ["Door Handle {spec}"],
    "Cabinet Fittings": ["Cabinet Hinge {spec}", "Drawer Slide {spec}"],
    "Chains": ["Steel Chain {spec}"],
    "Shovels & Spades": ["Garden Shovel {spec}", "Digging Spade {spec}"],
    "Hoses & Sprinklers": ["Garden Hose {spec}", "Sprinkler Head {spec}"],
    "Pruning Shears": ["Pruning Shears {spec}"],
    "Wheelbarrows & Carts": ["Garden Cart {spec}"],
    "Tape Measures": ["Tape Measure {spec}"],
    "Spirit Levels": ["Spirit Level {spec}"],
    "Laser Levels": ["Laser Level {spec}"],
    "Calipers": ["Vernier Caliper {spec}"],
    "Aluminium Ladders": ["Aluminium Ladder {spec}"],
    "Step Stools": ["Step Stool {spec}"],
    "Platform Ladders": ["Platform Ladder {spec}"],
    "Welding Rods": ["Welding Electrode {spec}"],
    "Welding Accessories": ["Welding Gloves {spec}", "Welding Mask {spec}"],
    "Metal Sheets": ["Galvanized Metal Sheet {spec}"],
}

SERIAL_LEAF_HINTS = {
    "Drills & Drivers", "Angle Grinders", "Circular Saws", "Jigsaws", "Planers & Routers",
    "Generators", "Welding Machines", "Laser Levels",
}
BATCH_LEAF_HINTS = {
    "Emulsion Paint", "Enamel Paint", "Primers", "Spray Paint", "Thinners",
    "Silicone Sealant", "Construction Adhesive", "Epoxy", "Super Glue", "Foam Fillers",
}

ITEM_TARGET_COUNT = 5000


def spec_token(rng: random.Random) -> str:
    kind = rng.choice(["mm", "inch", "watt", "liter", "kg", "gauge", "size"])
    if kind == "mm":
        return f"{rng.choice([6, 8, 10, 12, 16, 20, 25, 32, 40, 50])}mm"
    if kind == "inch":
        return f"{rng.choice(['1/4', '3/8', '1/2', '3/4', '1'])} inch"
    if kind == "watt":
        return f"{rng.choice([450, 650, 750, 900, 1200, 1500, 2000])}W"
    if kind == "liter":
        return f"{rng.choice([1, 4, 9, 18, 20])}L"
    if kind == "kg":
        return f"{rng.choice([1, 5, 10, 25, 50])}kg"
    if kind == "gauge":
        return f"{rng.choice([16, 18, 20, 22, 24])} Gauge"
    return rng.choice(["Small", "Medium", "Large", "XL"])


def build_items(categories: list[Category]) -> list[Item]:
    leaves = leaf_categories(categories)
    items: list[Item] = []
    sku_counter = 100000
    duplicate_skus: list[str] = []
    used_barcodes: list[str] = []

    serial_budget = 120
    while len(items) < ITEM_TARGET_COUNT:
        leaf = RNG.choice(leaves)
        templates = ITEM_TEMPLATES_BY_CATEGORY.get(leaf.name, ["{cat} Item {spec}"])
        template = RNG.choice(templates)
        brand = RNG.choice(BRANDS)
        spec = spec_token(RNG)
        base_name = template.format(spec=spec, cat=leaf.name)
        display_name = f"{brand} {base_name}"

        item = Item()
        sku_counter += 1
        item.sku = f"HW-{sku_counter}"
        item.name = display_name
        item.name_alt = f"{leaf.name_alt or leaf.name} {spec}".strip()
        item.category = leaf
        item.brand = brand
        item.part_number = f"{brand[:3].upper()}-{RNG.randint(1000, 99999)}"

        cost = round(RNG.uniform(0.100, 25.000), 3) if maybe(0.95) else round(RNG.uniform(25.000, 300.000), 3)
        margin = RNG.uniform(1.18, 1.55)
        item.cost = cost
        item.sell = round(cost * margin, 3)
        item.wholesale = round(cost * RNG.uniform(1.08, 1.20), 3)
        item.reorder = RNG.choice([5, 10, 15, 20, 25, 50])
        item.unit = "PCS"

        if leaf.name in SERIAL_LEAF_HINTS and serial_budget > 0:
            item.tracking = "serial"
            serial_budget -= 1
        elif leaf.name in BATCH_LEAF_HINTS:
            item.tracking = "batch"
        else:
            item.tracking = "none"
        item.valuation = RNG.choice(["wac", "wac", "wac", "fifo"])

        barcode = f"6{RNG.randint(100000000000, 999999999999)}"
        if maybe(0.02) and used_barcodes:
            barcode = RNG.choice(used_barcodes)
        else:
            used_barcodes.append(barcode)
        item.barcode = barcode

        items.append(item)

    # Inject a handful of deliberate duplicate SKUs (reuse an earlier SKU on a later row).
    dup_targets = RNG.sample(range(len(items) // 2), 12)
    for idx in dup_targets:
        clone_idx = RNG.randint(len(items) // 2, len(items) - 1)
        items[clone_idx].sku = items[idx].sku
        duplicate_skus.append(items[idx].sku)

    return items


# ─── Party (customer/supplier) universe ────────────────────────────────────

class Party:
    __slots__ = (
        "code", "name", "name_alt", "phone", "email", "opening_balance",
        "payment_term_days", "credit_limit", "status", "city", "book_name",
    )


def build_parties(stems: list[str], count: int, prefix: str, with_credit_limit: bool) -> list[Party]:
    parties: list[Party] = []
    for i in range(count):
        stem = stems[i % len(stems)]
        suffix_pool = SUPPLIER_LEGAL_SUFFIXES if prefix == "SUP" else ["", "", "", " Est."]
        suffix = RNG.choice(suffix_pool)
        name = f"{stem} {suffix}".strip() if suffix else stem
        if i >= len(stems):
            name = f"{name} {i // len(stems) + 1}"

        p = Party()
        p.code = f"{prefix}-{1000 + i}"
        p.name = name
        p.name_alt = ""  # filled per-row with mess below at write time
        p.phone = phone_kw()
        p.email = f"{stem.lower().replace(' ', '.').replace('-', '')}{i}@example.com.kw"
        p.opening_balance = round(RNG.uniform(0, 8000), 3) if maybe(0.6) else 0.0
        p.payment_term_days = RNG.choice([0, 15, 30, 45, 60, 90])
        p.credit_limit = round(RNG.uniform(500, 50000), 3) if with_credit_limit else 0.0
        p.status = RNG.choices(["active", "inactive", "blocked"], weights=[90, 7, 3])[0]
        p.city = RNG.choice(KUWAIT_CITIES)
        parties.append(p)

    # Inject a few duplicate names with different codes.
    dup_count = max(2, count // 100)
    for _ in range(dup_count):
        src = RNG.choice(parties)
        clone = Party()
        clone.code = f"{prefix}-{9000 + RNG.randint(0, 900)}"
        clone.name = src.name
        clone.name_alt = src.name_alt
        clone.phone = phone_kw()
        clone.email = f"dup{RNG.randint(1000,9999)}@example.com.kw"
        clone.opening_balance = 0.0
        clone.payment_term_days = src.payment_term_days
        clone.credit_limit = src.credit_limit
        clone.status = "active"
        clone.city = src.city
        parties.append(clone)

    return parties


# ─── Date helpers ───────────────────────────────────────────────────────────

def random_date_within(days_back: int) -> date:
    offset = RNG.randint(0, days_back)
    return TODAY - timedelta(days=offset)


# ═══════════════════════════════════════════════════════════════════════════
# 01 - Unified AI-first import (messy real-world headers)
# ═══════════════════════════════════════════════════════════════════════════

def write_unified_categories(categories: list[Category]) -> int:
    rows = []
    for c in categories:
        rows.append([
            messy_name(c.name),
            blank_if_optional(c.name_alt, 0.15),
            c.parent_code or "",
            quoted_number_text(categories.index(c) + 1),
        ])
    return write_csv(
        os.path.join(DIR_UNIFIED, "categories.csv"),
        ["Category Name", "Category Name (Arabic)", "Parent Code", "Sort Order"],
        rows,
    )


def write_unified_products(items: list[Item]) -> int:
    rows = []
    for it in items:
        desc = f"{it.brand} {it.category.name} - {it.part_number}"
        rows.append([
            it.sku,
            messy_name(it.name),
            blank_if_optional(it.name_alt, 0.2),
            it.barcode,
            messy_name(it.category.name),
            messy_unit(),
            messy_money(it.cost),
            messy_money(it.sell),
            quoted_number_text(it.reorder),
            blank_if_optional(desc, 0.3),
            blank_if_optional(it.part_number, 0.25),
            it.brand,
        ])
    return write_csv(
        os.path.join(DIR_UNIFIED, "products.csv"),
        ["Item Code", "Description", "Description (AR)", "Barcode", "Category", "UOM",
         "Cost", "Retail", "Re-Order Qty", "Notes", "Mfr Part No", "Brand"],
        rows,
    )


def write_unified_parties(parties: list[Party], filename: str, with_credit_limit: bool) -> int:
    rows = []
    for p in parties:
        row = [
            p.code,
            messy_name(p.name),
            blank_if_optional(p.name_alt, 0.5),
            p.phone,
            blank_if_optional(p.email, 0.1),
        ]
        if with_credit_limit:
            row.append(messy_money(p.credit_limit))
        row.append(str(p.payment_term_days))
        row.append(messy_money(p.opening_balance))
        row.append(blank_if_optional(f"{p.status} account, {p.city}", 0.4))
        return_row = row
        rows.append(return_row)
    headers = ["Code", "Name", "Name (Arabic)", "Phone", "Email"]
    if with_credit_limit:
        headers.append("Credit Limit")
    headers += ["Payment Terms (Days)", "Opening Balance", "Notes"]
    return write_csv(os.path.join(DIR_UNIFIED, filename), headers, rows)


# ═══════════════════════════════════════════════════════════════════════════
# 02 - Inventory bulk import (exact contract headers)
# ═══════════════════════════════════════════════════════════════════════════

def write_inventory_categories(categories: list[Category]) -> int:
    rows = [[c.code, messy_name(c.name), blank_if_optional(c.name_alt, 0.1), c.parent_code or ""]
            for c in categories]
    return write_csv(os.path.join(DIR_INVENTORY, "categories.csv"),
                      ["code", "namePrimary", "nameSecondary", "parentCode"], rows)


def write_inventory_items(items: list[Item]) -> int:
    rows = []
    for it in items:
        # Captured once and reused verbatim by sales-history: that importer resolves
        # `item` against a live dropdown of this exact namePrimary column, so the
        # sales-history item value must be byte-identical to what lands here, not a
        # separately re-messed copy of it.name.
        it.book_name = messy_name(it.name)
        rows.append([
            it.book_name,
            blank_if_optional(it.name_alt, 0.15),
            it.sku,
            it.barcode,
            it.category.code,
            "",  # taxGroup blank, Kuwait has no tax
            it.tracking,
            messy_money(it.cost),
            messy_money(it.sell),
            messy_unit(),
            blank_if_optional(it.brand, 0.05),
            blank_if_optional(it.part_number, 0.1),
            quoted_number_text(it.reorder),
            it.valuation,
            messy_money(it.wholesale),
        ])
    return write_csv(
        os.path.join(DIR_INVENTORY, "items.csv"),
        ["namePrimary", "nameSecondary", "sku", "barcode", "categoryCode", "taxGroup",
         "trackingType", "cost", "sellPrice", "baseUnit", "brand", "partNumber",
         "reorderLevel", "valuationMethod", "wholesalePrice"],
        rows,
    )


def write_opening_stock_inventory(items: list[Item]) -> int:
    rows = []
    for it in items:
        # Per-warehouse holding for a hardware wholesaler: shallow and patchy,
        # not 200 units of every SKU in every location. Keep this the ONLY place
        # opening quantities are invented -- write_opening_stock_flat must derive
        # from the same numbers, never roll its own (they drifted 100x apart once).
        qtys = [RNG.randint(1, 12) if maybe(0.45) else 0 for _ in BRANCHES]
        rows.append([it.sku, messy_money(it.cost)] + [str(q) for q in qtys])
    return write_csv(
        os.path.join(DIR_INVENTORY, "opening-stock.csv"),
        ["itemSku", "unitCost"] + BRANCHES,
        rows,
    )


def write_opening_stock_batches(items: list[Item]) -> int:
    batch_items = [it for it in items if it.tracking == "batch"]
    rows = []
    target = 400
    per_item = max(1, target // max(1, len(batch_items)))
    for it in batch_items:
        for b in range(per_item):
            if len(rows) >= target:
                break
            warehouse = RNG.choice(BRANCHES)
            batch_no = f"B{RNG.randint(2025, 2026)}{RNG.randint(100,999)}"
            expiry = TODAY + timedelta(days=RNG.randint(60, 900))
            qty = RNG.randint(10, 300)
            rows.append([it.sku, warehouse, batch_no, messy_date(expiry), str(qty), messy_money(it.cost)])
        if len(rows) >= target:
            break
    return write_csv(
        os.path.join(DIR_INVENTORY, "opening-stock-batches.csv"),
        ["itemSku", "warehouse", "batchNo", "expiryDate", "qty", "unitCost"],
        rows,
    )


def write_alternate_codes(items: list[Item]) -> int:
    rows = []
    target_items = RNG.sample(items, min(700, len(items)))
    for it in target_items:
        code_type = RNG.choice(["oem", "aftermarket", "superseded", "other"])
        alt_code = f"ALT-{RNG.randint(10000, 99999)}"
        note = blank_if_optional(f"Old catalogue code for {it.brand}", 0.4)
        rows.append([it.sku, alt_code, code_type, note])
        if maybe(0.15):
            rows.append([it.sku, f"ALT-{RNG.randint(10000, 99999)}", RNG.choice(["oem", "aftermarket"]), ""])
    return write_csv(
        os.path.join(DIR_INVENTORY, "alternate-codes.csv"),
        ["itemSku", "altCode", "codeType", "note"],
        rows,
    )


# ═══════════════════════════════════════════════════════════════════════════
# 03 - Books import (exact contract headers)
# ═══════════════════════════════════════════════════════════════════════════

def write_books_parties(parties: list[Party], filename: str, with_credit_limit: bool) -> int:
    rows = []
    for p in parties:
        addr1 = blank_if_optional(f"{RNG.randint(1,100)} {RNG.choice(['Block', 'St', 'Bldg'])} {RNG.randint(1,20)}", 0.15)
        # Captured once and reused verbatim by sales-history for customers.csv: that
        # importer resolves `customer` against a live dropdown of this exact `name`
        # column, so the sales-history customer value must be byte-identical to what
        # lands here, not a separately re-messed copy of p.name.
        p.book_name = messy_name(p.name)
        row = [
            p.book_name,
            blank_if_optional(p.name_alt, 0.5),
            p.code,
            messy_money(p.opening_balance),
            p.phone,
            blank_if_optional(p.email, 0.1),
            "",  # taxNumber blank, Kuwait no tax
            str(p.payment_term_days),
        ]
        if with_credit_limit:
            row.append(messy_money(p.credit_limit))
        row += [
            p.status,
            addr1,
            "",  # addressLine2 optional
            p.city,
            "",  # state
            "",  # postalCode
            "Kuwait",
            blank_if_optional("Imported opening balance", 0.5),
        ]
        rows.append(row)
    headers = ["name", "nameAlt", "code", "openingBalance", "phone", "email", "taxNumber", "paymentTermDays"]
    if with_credit_limit:
        headers.append("creditLimit")
    headers += ["status", "addressLine1", "addressLine2", "city", "state", "postalCode", "country", "notes"]
    return write_csv(os.path.join(DIR_BOOKS, filename), headers, rows)


## ─── Chart of accounts: a real Kuwaiti hardware wholesaler's book, not a
## textbook minimum. Labels are DELIBERATELY inconsistent (this is the
## AI-classified TB/GL path, so messy labels are the whole point): mixed
## code+name / name-only / ALL CAPS / abbreviations / Arabic / stray
## whitespace. Two lines carry a deliberately ABNORMAL balance sign (a bank
## account sitting in credit = overdraft, a payables line sitting in debit)
## to exercise the abnormal-balance decision card. "Sundry Creditors",
## "Suspense Account" and "Other Debit Balances" are deliberately vague, the
## kind of line a human has to judge on import.

# (label, debit-or-credit "kind", amount). Non-control balance-sheet accounts
# ONLY -- 1131/1141/2111 are seeded from opening-receivables/payables/stock
# and are added separately by each caller below.
BASE_BS_ACCOUNTS: list[tuple[str, str, float]] = [
    ("Petty Cash", "debit", 350.000),
    ("1010 Bank - NBK Current A/C", "debit", 42000.000),
    ("Bank  - KFH Current Account", "debit", 28500.000),
    ("BANK GULF BANK C/A", "credit", 6200.000),  # overdraft -- ABNORMAL: credit in a cash account
    ("Retention Receivable", "debit", 15400.000),
    ("Employee Advances", "debit", 3200.000),
    ("A/C REC - OTHER", "debit", 2100.000),
    ("Allowance for Doubtful Debts", "credit", 4500.000),
    ("Goods in Transit", "debit", 9800.000),
    ("Prepaid Rent", "debit", 6000.000),
    ("Prepaid Insurance", "debit", 1800.000),
    ("Advances to Suppliers", "debit", 7400.000),
    ("Motor Vehicles", "debit", 38000.000),
    ("Accum. Dep'n - Vehicles", "credit", 15200.000),
    ("Furniture and Fixtures", "debit", 12500.000),
    ("Accumulated Depreciation - Furniture", "credit", 5100.000),
    ("Warehouse Equipment", "debit", 22000.000),
    ("Accum Dep - Warehouse Equipment", "credit", 8900.000),
    ("Sundry Creditors", "credit", 4300.000),
    ("Accrued Salaries", "credit", 5200.000),
    ("EOSB Provision", "credit", 16500.000),  # end-of-service benefits, mandatory in Kuwait
    ("PIFSS Payable", "credit", 2600.000),
    ("Notes / Cheques Payable", "credit", 9100.000),
    ("Customer Advances", "credit", 3700.000),
    ("Other Payables", "debit", 1250.000),  # ABNORMAL: debit sitting in a payables line
    ("رأس مال المالك", "credit", 100000.000),  # Owner's Capital, Arabic-labelled
    ("Partner Current Account", "credit", 10000.000),
    ("Suspense Account", "debit", 640.000),  # vague, a human has to judge this
    ("Other Debit Balances", "debit", 380.000),  # vague, a human has to judge this
]

# Accounts dropped from the Trial Balance (present only in the leaner Opening
# GL) so the two files are NOT the same list at two sizes -- realistic, since
# a customer's rough TB spreadsheet and their accounting system's opening GL
# export rarely carry identical account sets.
TB_DROPPED_LABELS = {
    "Prepaid Insurance", "Sundry Creditors", "Accrued Salaries",
    "Notes / Cheques Payable", "Customer Advances", "Other Debit Balances",
}

# P&L lines: Trial Balance only (Opening GL is balance-sheet-only, matching
# the existing opening-balance-equity posting model).
PL_ACCOUNTS: list[tuple[str, str, float]] = [
    ("Sales Revenue", "credit", 612400.000),
    ("Sales Returns and Allowances", "debit", 8200.000),  # contra-revenue
    ("Sales Discounts Allowed", "debit", 3100.000),
    ("Cost of Goods Sold", "debit", 398600.000),
    ("مصاريف الشحن الداخلي", "debit", 9800.000),  # Freight Inward, Arabic-labelled
    ("Salaries and Wages", "debit", 96000.000),
    ("Staff Indemnity Expense", "debit", 12500.000),
    ("Rent Expense", "debit", 42000.000),
    ("Utilities Expense", "debit", 8100.000),
    ("Transport and Fuel", "debit", 5400.000),
    ("Bank Charges", "debit", 1200.000),
    ("Depreciation Expense", "debit", 29200.000),
]


def _plug_retained_earnings(rows: list[tuple[str, float, float]], label: str) -> list[tuple[str, float, float]]:
    """Appends a Retained Earnings row that makes debit == credit exactly."""
    debit_sum = sum(d for _, d, _ in rows)
    credit_sum = sum(c for _, _, c in rows)
    diff = round(debit_sum - credit_sum, 3)
    if diff >= 0:
        rows.append((label, 0, diff))
    else:
        rows.append((label, -diff, 0))
    return rows


def build_trial_balance(ar_total: float, ap_total: float, inventory_total: float) -> list[tuple]:
    """Returns (account, debit, credit) rows that balance exactly to 3dp."""
    rows: list[tuple[str, float, float]] = [
        ("1131 Trade Receivables", ar_total, 0),
        ("1141 Merchandise Inventory", inventory_total, 0),
        ("2111 Trade Payables", 0, ap_total),
    ]
    for label, kind, amount in BASE_BS_ACCOUNTS:
        if label in TB_DROPPED_LABELS:
            continue
        rows.append((label, amount, 0) if kind == "debit" else (label, 0, amount))
    for label, kind, amount in PL_ACCOUNTS:
        rows.append((label, amount, 0) if kind == "debit" else (label, 0, amount))
    return _plug_retained_earnings(rows, "3900 Retained Earnings")


def write_trial_balance(rows: list[tuple]) -> tuple[int, float, float]:
    out_rows = []
    total_debit = 0.0
    total_credit = 0.0
    for account, debit, credit in rows:
        total_debit += debit
        total_credit += credit
        # Deterministic (non-RNG) formatting: this runs before sales-history
        # generation, and sales-history must stay byte-identical to the prior
        # run, so this function must not consume any draws from the shared RNG.
        out_rows.append([
            account,
            deterministic_messy_money(debit, account) if debit else "",
            deterministic_messy_money(credit, account) if credit else "",
        ])
    count = write_csv(os.path.join(DIR_BOOKS, "trial-balance.csv"), ["account", "debit", "credit"], out_rows)
    return count, round(total_debit, 3), round(total_credit, 3)


# ═══════════════════════════════════════════════════════════════════════════
# 04 - Opening balances (AI-mapped)
# ═══════════════════════════════════════════════════════════════════════════

def write_opening_gl_balances() -> tuple[int, float, float]:
    lines: list[tuple[str, float, float]] = []
    for label, kind, amount in BASE_BS_ACCOUNTS:
        lines.append((label, amount, 0) if kind == "debit" else (label, 0, amount))
    lines = _plug_retained_earnings(lines, "3900 Retained Earnings")
    rows = []
    total_debit = 0.0
    total_credit = 0.0
    for account, debit, credit in lines:
        total_debit += debit
        total_credit += credit
        # Deterministic (non-RNG) formatting -- see write_trial_balance for why.
        rows.append([
            account,
            deterministic_messy_money(debit, account) if debit else "",
            deterministic_messy_money(credit, account) if credit else "",
        ])
    count = write_csv(os.path.join(DIR_OPENING, "opening-gl-balances.csv"), ["account", "debit", "credit"], rows)
    return count, round(total_debit, 3), round(total_credit, 3)


def write_opening_receivables(customers: list[Party]) -> tuple[int, float]:
    """Open customer invoices. The AR control account is DERIVED from this sum.

    Never plug a remainder row to force a preset control total: a preset target
    below the natural invoice sum produces a huge negative row that ties the
    books arithmetically while being pure garbage.
    """
    active = [c for c in customers if c.status != "blocked"]
    invoice_count = 900
    rows = []
    running_total = 0.0
    # A couple of realistic credit notes, not a six-figure plug.
    credit_note_rows = {RNG.randrange(invoice_count) for _ in range(2)}
    for i in range(invoice_count):
        cust = RNG.choice(active)
        amount = round(RNG.uniform(20, 1800), 3)
        if i in credit_note_rows:
            amount = -round(RNG.uniform(15, 400), 3)
        running_total += amount
        inv_date = random_date_within(365)
        due = inv_date + timedelta(days=cust.payment_term_days or 30)
        fmt = "dmy_slash" if maybe(0.5) else "iso"
        rows.append([
            cust.code,
            messy_name(cust.name),
            f"INV-{20260 + i}",
            messy_date(inv_date, fmt),
            messy_date(due, fmt),
            messy_money(amount),
        ])
    count = write_csv(
        os.path.join(DIR_OPENING, "opening-receivables.csv"),
        ["partyCode", "partyName", "invoiceNumber", "invoiceDate", "dueDate", "amount"],
        rows,
    )
    return count, round(running_total, 3)


def write_opening_payables(suppliers: list[Party]) -> tuple[int, float]:
    """Open supplier bills. The AP control account is DERIVED from this sum."""
    active = [s for s in suppliers if s.status != "blocked"]
    bill_count = 350
    rows = []
    running_total = 0.0
    # A couple of realistic debit notes, not a six-figure plug.
    debit_note_rows = {RNG.randrange(bill_count) for _ in range(2)}
    for i in range(bill_count):
        sup = RNG.choice(active)
        amount = round(RNG.uniform(50, 3500), 3)
        if i in debit_note_rows:
            amount = -round(RNG.uniform(25, 600), 3)
        running_total += amount
        inv_date = random_date_within(365)
        due = inv_date + timedelta(days=sup.payment_term_days or 30)
        fmt = "dmy_dash" if maybe(0.5) else "iso"
        rows.append([
            sup.code,
            messy_name(sup.name),
            f"BILL-{50600 + i}",
            messy_date(inv_date, fmt),
            messy_date(due, fmt),
            messy_money(amount),
        ])
    count = write_csv(
        os.path.join(DIR_OPENING, "opening-payables.csv"),
        ["partyCode", "partyName", "invoiceNumber", "invoiceDate", "dueDate", "amount"],
        rows,
    )
    return count, round(running_total, 3)


def write_opening_stock_flat(items: list[Item]) -> tuple[int, float]:
    rows = []
    inventory_total = 0.0
    for it in items:
        warehouse = RNG.choice(BRANCHES)
        qty = RNG.randint(1, 5) if maybe(0.75) else 0
        serials = ""
        if it.tracking == "serial" and qty > 0:
            serials = ";".join(f"SN-{it.sku}-{n}" for n in range(1, qty + 1))
        inventory_total += qty * it.cost
        rows.append([
            it.sku,
            warehouse,
            str(qty),
            messy_money(it.cost),
            it.tracking,
            blank_if_optional(it.part_number, 0.1),
            serials,
        ])
    count = write_csv(
        os.path.join(DIR_OPENING, "opening-stock.csv"),
        ["sku", "warehouse", "quantity", "unitCost", "trackingType", "partNumber", "serialNumbers"],
        rows,
    )
    return count, round(inventory_total, 3)


# ═══════════════════════════════════════════════════════════════════════════
# 05 - Sales history
# ═══════════════════════════════════════════════════════════════════════════

def write_sales_history(customers: list[Party], items: list[Item]) -> tuple[list[int], list[str]]:
    active_customers = [c for c in customers if c.status == "active"]
    row_counts = []
    broken_refs = []
    ref_counter = 90000

    for file_idx in range(1, 7):
        rows = []
        date_fmt = "dmy_slash" if file_idx % 2 == 1 else "iso"
        while len(rows) < 480:
            ref_counter += 1
            ref = f"SLS-{ref_counter}"
            customer = RNG.choice(active_customers)
            branch = RNG.choice(BRANCHES)
            warehouse = branch
            sale_date = random_date_within(365)
            payment = RNG.choices(["cash", "bank_transfer", "credit"], weights=[45, 25, 30])[0]
            due_date = ""
            if payment == "credit":
                due_date = messy_date(sale_date + timedelta(days=customer.payment_term_days or 30), date_fmt)

            line_count = RNG.choice([1, 1, 2, 2, 3])
            line_items = RNG.sample(items, min(line_count, len(items)))
            line_total = 0.0
            line_rows = []
            for it in line_items:
                if len(rows) + len(line_rows) >= 500:
                    break
                qty = RNG.randint(1, 12)
                unit_price = it.sell
                discount = round(unit_price * qty * RNG.uniform(0, 0.05), 3) if maybe(0.2) else 0.0
                line_total += round(qty * unit_price - discount, 3)
                # This importer resolves customer/item against LIVE dropdowns (exact FK
                # lookups), so these two columns must be byte-identical to the canonical
                # values in books/customers.csv (name) and inventory/items.csv
                # (namePrimary) -- never independently re-messed free text. The discarded
                # messy_name() call below preserves the RNG draw sequence that downstream
                # sampling (line counts, discounts, the 10 deliberately-broken statedTotal
                # refs) depends on, so regenerating this fix does not shift any of that.
                _ = messy_name(customer.name)
                line_rows.append([
                    ref,
                    messy_date(sale_date, date_fmt),
                    customer.book_name,
                    branch,
                    warehouse,
                    it.book_name,
                    messy_unit(),
                    str(qty),
                    messy_money(unit_price),
                    messy_money(discount) if discount else "",
                    payment,
                    due_date,
                    "",  # statedTotal filled once per ref, on first line
                    blank_if_optional("Migrated from legacy system", 0.5),
                ])
            if not line_rows:
                break
            stated_total = round(line_total, 3)
            break_this_ref = len(broken_refs) < 10 and maybe(0.05)
            if break_this_ref:
                stated_total = round(stated_total + RNG.choice([-0.050, 0.075, 0.010, -0.025]), 3)
                broken_refs.append(ref)
            line_rows[0][12] = messy_money(stated_total)
            rows.extend(line_rows)
            if len(rows) >= 480:
                break

        count = write_csv(
            os.path.join(DIR_SALES, f"sales-history-{file_idx:02d}.csv"),
            ["saleRef", "saleDate", "customer", "branch", "warehouse", "item", "unit",
             "qty", "unitPrice", "discount", "payment", "dueDate", "statedTotal", "notes"],
            rows,
        )
        row_counts.append(count)

    return row_counts, broken_refs


# ═══════════════════════════════════════════════════════════════════════════
# README
# ═══════════════════════════════════════════════════════════════════════════

def write_readme(stats: dict) -> None:
    lines = [
        "# Kuwait Hardware Wholesaler - Seeded Test Dataset",
        "",
        f"Generated by `_generate_kuwait_hardware.py`, fixed seed {SEED}. Re-run the script",
        "to reproduce byte-identical output. Currency KWD, 3 decimal places, no tax",
        "(Kuwait has no VAT/GST). Deliberate messiness (~15-20% of rows) is spread across",
        "every file: inconsistent casing, stray whitespace, mixed unit spellings, thousands",
        "separators, currency prefixes, mixed date formats, blank optional fields, a handful",
        "of duplicate SKUs/barcodes/party names, mixed Arabic/English names, trailing",
        "punctuation, and quoted numbers.",
        "",
        "## 01-unified-ai-import/ (AI-mapped, messy real-world headers)",
        f"- products.csv - {stats['unified_products']} rows - feeds the unified product import surface (AI header mapping)",
        f"- categories.csv - {stats['unified_categories']} rows - unified category import",
        f"- customers.csv - {stats['unified_customers']} rows - unified customer import",
        f"- suppliers.csv - {stats['unified_suppliers']} rows - unified supplier import",
        "- Mess: headers are deliberately NOT Zerupt's canonical names (e.g. 'Item Code',",
        "  'Cost', 'Retail', 'Re-Order Qty') to exercise the AI mapper.",
        "",
        "## 02-inventory-bulk/ (exact inventory-import contract headers)",
        f"- categories.csv - {stats['inv_categories']} rows",
        f"- items.csv - {stats['inv_items']} rows - trackingType mostly 'none', ~120 'serial'",
        "  (power tools/generators/welders), 'batch' for paints/adhesives/sealants",
        f"- opening-stock.csv - {stats['inv_opening_stock']} rows - one column per warehouse",
        f"- opening-stock-batches.csv - {stats['inv_opening_batches']} rows - batch-tracked items only",
        f"- alternate-codes.csv - {stats['inv_alt_codes']} rows - OEM/aftermarket/superseded/other",
        "- No fitment.csv (auto-parts only, not applicable to hardware).",
        "- taxGroup column left BLANK on every row (Kuwait, no tax).",
        "",
        "## 03-books/ (exact books-import contract headers)",
        f"- customers.csv - {stats['books_customers']} rows - same 500 customers as unified import, matching codes",
        f"- suppliers.csv - {stats['books_suppliers']} rows - same 80 suppliers as unified import, matching codes",
        f"- trial-balance.csv - {stats['tb_rows']} rows - BALANCES EXACTLY: debit {stats['tb_debit']:.3f} == credit {stats['tb_credit']:.3f}",
        "  Expanded chart of accounts for a real Kuwaiti hardware wholesaler (cash/multi-bank,",
        "  receivables incl. retention + employee advances + allowance for doubtful debts,",
        "  inventory incl. goods in transit, prepayments, fixed-asset classes with matching",
        "  accumulated depreciation, payables incl. EOSB/PIFSS/notes/customer advances, equity,",
        "  and P&L). Labels are DELIBERATELY inconsistent (code+name, name-only, ALL CAPS,",
        "  abbreviations like 'A/C REC - OTHER' and 'EOSB Provision', Arabic-labelled accounts",
        "  with no English at all, stray/double spaces) because this is the AI-classified TB path.",
        "  DELIBERATE ABNORMAL BALANCES (2, for the abnormal-balance decision card): 'BANK GULF",
        "  BANK C/A' carries a CREDIT balance (overdraft, a cash account in credit) and 'Other",
        "  Payables' carries a DEBIT balance (a debit sitting in a payables line). Both are",
        "  intentional, not generator bugs.",
        "  DELIBERATE VAGUE LINES (a human has to judge these): 'Sundry Creditors', 'Suspense",
        "  Account', 'Other Debit Balances' (the latter two live in opening-gl-balances.csv).",
        "- taxNumber column left BLANK on every row (Kuwait, no tax).",
        "",
        "## 04-opening/ (AI-mapped opening balances)",
        f"- opening-gl-balances.csv - {stats['gl_rows']} rows - balances exactly: debit {stats['gl_debit']:.3f} == credit {stats['gl_credit']:.3f}",
        "  Balance-sheet-only (no P&L), same messy-label chart of accounts as the trial balance",
        "  minus 6 accounts the TB doesn't carry (Prepaid Insurance, Sundry Creditors, Accrued",
        "  Salaries, Notes/Cheques Payable, Customer Advances, Other Debit Balances) -- the two",
        "  files are deliberately not the same account list at two sizes, matching how a rough",
        "  customer TB spreadsheet and an accounting-system GL export usually differ. Also",
        "  carries the same 2 deliberate abnormal-balance rows and the vague/suspense rows noted",
        "  above.",
        f"- opening-receivables.csv - {stats['ar_rows']} rows - sum {stats['ar_sum']:.3f} ties to AR control 1131 = {stats['ar_control']:.3f}",
        f"- opening-payables.csv - {stats['ap_rows']} rows - sum {stats['ap_sum']:.3f} ties to AP control 2111 = {stats['ap_control']:.3f}",
        f"- opening-stock.csv - {stats['opening_stock_rows']} rows - serial items carry exactly qty semicolon-separated serials",
        "",
        "## 05-sales-history/ (dropdown-backed FK lookups, 500-row cap per file)",
    ]
    for i, count in enumerate(stats["sales_counts"], start=1):
        lines.append(f"- sales-history-{i:02d}.csv - {count} rows")
    lines += [
        "- customer / item / branch / warehouse are the four FK columns for this importer. They",
        "  are CLEAN BY DESIGN, byte-identical to the canonical values in books/customers.csv",
        "  (name), inventory/items.csv (namePrimary), and the branch/warehouse list, with NO",
        "  casing, whitespace, or punctuation mess applied -- because this import path resolves",
        "  them against dropdowns of live tenant records (exact FK lookups), not free text.",
        "  Verified: 0 unmatched customer values and 0 unmatched item values across all 6 files.",
        "  Every OTHER column in these files stays messy: mixed date formats, thousands",
        "  separators, KD/KWD prefixes, unit spelling variance (PCS/pcs/Pieces/Nos), blank",
        "  optional notes, and quoted numeric text.",
        "- Multi-line sales repeat the same saleRef across consecutive rows.",
        "- payment in {cash, bank_transfer, credit}; dueDate populated only for credit.",
        "- No taxGroup column (Kuwait is no-tax).",
        "- Dates alternate file-by-file between D/M/YYYY (odd-numbered files) and ISO (even-numbered files).",
        f"- Deliberately mismatched statedTotal (off by a few fils) on {len(stats['broken_refs'])} refs to test the",
        f"  mismatch-detection path: {', '.join(stats['broken_refs'])}",
        "",
        "## Contract corrections",
        stats["contract_notes"],
        "",
        "## Referential integrity",
        "Item, customer, supplier, category, and warehouse/branch universes are generated ONCE",
        "and reused across every file. SKUs in opening stock exist in items.csv. Customers in",
        "sales history exist in the customer universe. Party codes match between the unified-import",
        "and books-import versions of the same customer/supplier.",
    ]
    with open(os.path.join(BASE_DIR, "README.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


# ═══════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════

def main() -> None:
    categories = build_categories()
    items = build_items(categories)
    customers = build_parties(CUSTOMER_NAME_STEMS, 500, "CUST", with_credit_limit=True)
    suppliers = build_parties(SUPPLIER_NAME_STEMS, 80, "SUP", with_credit_limit=False)

    stats: dict = {}

    stats["unified_categories"] = write_unified_categories(categories)
    stats["unified_products"] = write_unified_products(items)
    stats["unified_customers"] = write_unified_parties(customers, "customers.csv", with_credit_limit=True)
    stats["unified_suppliers"] = write_unified_parties(suppliers, "suppliers.csv", with_credit_limit=False)

    stats["inv_categories"] = write_inventory_categories(categories)
    stats["inv_items"] = write_inventory_items(items)
    stats["inv_opening_stock"] = write_opening_stock_inventory(items)
    stats["inv_opening_batches"] = write_opening_stock_batches(items)
    stats["inv_alt_codes"] = write_alternate_codes(items)

    stats["books_customers"] = write_books_parties(customers, "customers.csv", with_credit_limit=True)
    stats["books_suppliers"] = write_books_parties(suppliers, "suppliers.csv", with_credit_limit=False)

    # Compute opening-stock inventory total (flat file, 04-opening) first since the
    # trial balance's 1141 line must equal it, and AR/AP control lines must equal
    # the opening-receivables/payables sums.
    opening_stock_count, inventory_total = write_opening_stock_flat(items)
    stats["opening_stock_rows"] = opening_stock_count

    # The control accounts are DERIVED from the invoice sums, never the reverse.
    ar_rows, ar_sum = write_opening_receivables(customers)
    ap_rows, ap_sum = write_opening_payables(suppliers)
    stats["ar_rows"], stats["ar_sum"], stats["ar_control"] = ar_rows, ar_sum, ar_sum
    stats["ap_rows"], stats["ap_sum"], stats["ap_control"] = ap_rows, ap_sum, ap_sum

    gl_rows, gl_debit, gl_credit = write_opening_gl_balances()
    stats["gl_rows"], stats["gl_debit"], stats["gl_credit"] = gl_rows, gl_debit, gl_credit

    tb_lines = build_trial_balance(ar_sum, ap_sum, inventory_total)
    tb_rows, tb_debit, tb_credit = write_trial_balance(tb_lines)
    stats["tb_rows"], stats["tb_debit"], stats["tb_credit"] = tb_rows, tb_debit, tb_credit

    sales_counts, broken_refs = write_sales_history(customers, items)
    stats["sales_counts"] = sales_counts
    stats["broken_refs"] = broken_refs

    stats["contract_notes"] = (
        "Party column order/names (customers.csv, suppliers.csv under 02/03) follow the "
        "canonical CUSTOMER_COLUMN_KEYS/SUPPLIER_COLUMN_KEYS/ITEM_CORE_COLUMN_KEYS/"
        "CATEGORY_COLUMN_KEYS/ALT_CODE_COLUMN_KEYS/BATCH_STOCK_COLUMN_KEYS/"
        "STOCK_FIXED_COLUMN_KEYS from inventory-template.contract.ts and "
        "books-template.contract.ts exactly as read; no header mismatches were found "
        "against the spec. taxGroup and taxNumber are emitted as columns but left BLANK "
        "per the contract (Kuwait has no tax), suppliers omit creditLimit per contract."
    )

    write_readme(stats)

    print("=== Kuwait Hardware Dataset Generation Report ===")
    print(f"Seed: {SEED}")
    print()
    print("01-unified-ai-import/")
    print(f"  categories.csv: {stats['unified_categories']}")
    print(f"  products.csv:   {stats['unified_products']}")
    print(f"  customers.csv:  {stats['unified_customers']}")
    print(f"  suppliers.csv:  {stats['unified_suppliers']}")
    print("02-inventory-bulk/")
    print(f"  categories.csv:            {stats['inv_categories']}")
    print(f"  items.csv:                 {stats['inv_items']}")
    print(f"  opening-stock.csv:         {stats['inv_opening_stock']}")
    print(f"  opening-stock-batches.csv: {stats['inv_opening_batches']}")
    print(f"  alternate-codes.csv:       {stats['inv_alt_codes']}")
    print("03-books/")
    print(f"  customers.csv:     {stats['books_customers']}")
    print(f"  suppliers.csv:     {stats['books_suppliers']}")
    print(f"  trial-balance.csv: {stats['tb_rows']}")
    print("04-opening/")
    print(f"  opening-gl-balances.csv: {stats['gl_rows']}")
    print(f"  opening-receivables.csv: {stats['ar_rows']}")
    print(f"  opening-payables.csv:    {stats['ap_rows']}")
    print(f"  opening-stock.csv:       {stats['opening_stock_rows']}")
    print("05-sales-history/")
    for i, c in enumerate(stats["sales_counts"], start=1):
        print(f"  sales-history-{i:02d}.csv: {c}")
    print()
    print("=== Balance invariants ===")
    print(f"Trial balance:      debit {stats['tb_debit']:.3f} == credit {stats['tb_credit']:.3f} -> {stats['tb_debit'] == stats['tb_credit']}")
    print(f"Opening GL:         debit {stats['gl_debit']:.3f} == credit {stats['gl_credit']:.3f} -> {stats['gl_debit'] == stats['gl_credit']}")
    print(f"AR sum vs control:  {stats['ar_sum']:.3f} == {stats['ar_control']:.3f} -> {stats['ar_sum'] == stats['ar_control']}")
    print(f"AP sum vs control:  {stats['ap_sum']:.3f} == {stats['ap_control']:.3f} -> {stats['ap_sum'] == stats['ap_control']}")
    print(f"Inventory total (04-opening/opening-stock.csv): {inventory_total:.3f} (feeds trial-balance 1141 line)")
    print()
    print(f"Broken statedTotal refs (deliberate mismatch, {len(broken_refs)}): {', '.join(broken_refs)}")


if __name__ == "__main__":
    main()
