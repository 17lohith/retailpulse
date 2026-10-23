"""Product catalog builder for the SIMULATED retail layer (L3).

Real Amazon grocery metadata supplies names/brands/prices for packaged families;
template products (clearly flagged catalog_source='template') cover fresh/household
families that the Amazon grocery set does not represent well.
All prices are converted USD -> INR with a documented localisation factor (ASSUMPTION).
"""
import json, math, random, re, pathlib
import numpy as np

USD_TO_INR = 33.0   # ASSUMPTION: 83 INR/USD x ~0.4 local price level for packaged groceries

# family -> (gross margin, shelf life days or None, tracking policy, pack size, n_sku_full, supplier key)
FAMILIES = {
    "GROCERY I":      (0.12, 300, "estimate", 12, 330, "wholesale"),
    "GROCERY II":     (0.20, 240, "estimate", 12, 120, "wholesale"),
    "BEVERAGES":      (0.15, 180, "estimate", 12, 150, "beverage"),
    "BREAD/BAKERY":   (0.25,   4, "strict",   10,  40, "bakery"),
    "DAIRY":          (0.08,  14, "strict",   12,  70, "dairy"),
    "FROZEN FOODS":   (0.18, 180, "estimate",  6,  60, "frozen"),
    "PRODUCE":        (0.30,   6, "strict",    5,  90, "produce"),
    "MEATS":          (0.20,   5, "strict",    5,  30, "meat"),
    "POULTRY":        (0.18,   5, "strict",    5,  20, "meat"),
    "SEAFOOD":        (0.22,   3, "strict",    5,  15, "meat"),
    "EGGS":           (0.10,  28, "strict",   30,   8, "dairy"),
    "DELI":           (0.28,  10, "strict",    6,  40, "frozen"),
    "PREPARED FOODS": (0.35,   3, "strict",    6,  25, "frozen"),
    "CLEANING":       (0.18, None, "off",     12,  90, "home"),
    "PERSONAL CARE":  (0.22, None, "off",     12,  80, "home"),
    "PET SUPPLIES":   (0.20, None, "off",      6,  32, "home"),
}
AMAZON_FAMILY_MAP = {  # Amazon categories[1] -> family
    "Pantry Staples": "GROCERY I", "Snacks & Sweets": "GROCERY II", "Beverages": "BEVERAGES",
    "Breads & Bakery": "BREAD/BAKERY", "Dairy, Eggs & Plant-Based Alternatives": "DAIRY", "Frozen": "FROZEN FOODS",
}
SUPPLIERS = {  # key -> (name, lead days, review period days)
    "dairy": ("Daily Fresh Dairy & Eggs", 1, 2), "bakery": ("City Bakery Supplies", 1, 1),
    "produce": ("Farm Fresh Produce Traders", 1, 1), "meat": ("Prime Meats & Poultry", 1, 1),
    "wholesale": ("Metro Wholesale Grocers", 3, 3), "beverage": ("Beverage Distributors Co.", 3, 4),
    "frozen": ("FrostLine Distributors", 2, 3), "home": ("HomeCare Distributors", 4, 5),
}
TEMPLATES = {
    "PRODUCE": (["Tomato", "Onion", "Potato", "Banana", "Apple", "Carrot", "Cucumber", "Spinach", "Cauliflower", "Capsicum",
                 "Lemon", "Ginger", "Garlic", "Cabbage", "Beans", "Coriander Leaves", "Mango", "Grapes", "Orange", "Papaya"],
                ["500 g", "1 kg"], (15, 140)),
    "MEATS": (["Mutton Curry Cut", "Mutton Boneless", "Lamb Chops", "Pork Belly", "Beef Mince"], ["500 g", "1 kg"], (300, 900)),
    "POULTRY": (["Chicken Curry Cut", "Chicken Breast Boneless", "Chicken Drumsticks", "Chicken Wings", "Chicken Mince"], ["500 g", "1 kg"], (150, 420)),
    "SEAFOOD": (["Rohu Fish", "Prawns Medium", "Pomfret", "Seer Fish Steaks", "Tuna Cubes"], ["250 g", "500 g"], (200, 800)),
    "EGGS": (["Farm Eggs White", "Farm Eggs Brown", "Country Eggs", "Omega-3 Eggs"], ["6 pcs", "12 pcs", "30 pcs"], (45, 300)),
    "DELI": (["Chicken Sausage", "Cheese Slices", "Paneer Fresh", "Ham Sliced", "Mozzarella Block", "Tofu", "Hummus", "Salami"],
             ["200 g", "400 g"], (80, 450)),
    "PREPARED FOODS": (["Veg Sandwich", "Chicken Wrap", "Samosa Pack", "Biryani Box", "Idli Batter", "Dosa Batter", "Fresh Pasta Salad", "Poha Mix Ready"],
                       ["1 pack", "2 pack"], (40, 220)),
    "CLEANING": (["Dish Wash Liquid", "Floor Cleaner", "Detergent Powder", "Toilet Cleaner", "Glass Cleaner", "Laundry Liquid",
                  "Fabric Softener", "Bathroom Cleaner", "Scrub Pad", "Garbage Bags"], ["500 ml", "1 L", "2 L"], (30, 450)),
    "PERSONAL CARE": (["Shampoo", "Bath Soap", "Toothpaste", "Face Wash", "Deodorant", "Hair Oil", "Body Lotion", "Shaving Foam",
                       "Hand Wash", "Sanitary Pads"], ["50 g", "100 g", "200 ml", "400 ml"], (25, 500)),
    "PET SUPPLIES": (["Dog Food Adult", "Cat Food Tuna", "Dog Biscuits", "Cat Litter", "Puppy Food"], ["500 g", "1 kg", "3 kg"], (120, 1400)),
}
BRANDS = ["FreshNest", "GreenLeaf", "Kisan Pure", "HomeEase", "Daily Choice", "NaturePick", "Sunrise", "Maple Valley", "ValuePlus", "TrueFarm"]


def ean13(rng):
    d = [rng.randint(0, 9) for _ in range(12)]
    c = (10 - (sum(d[i] * (1 if i % 2 == 0 else 3) for i in range(12)) % 10)) % 10
    return "".join(map(str, d + [c]))


def _clean_title(t):
    t = re.sub(r"\s+", " ", (t or "")).strip()
    return t[:80]


def sample_amazon(meta_path, per_family_needed, seed):
    """Weighted (by log rating_number) sample of real Amazon products per mapped family."""
    rng = np.random.default_rng(seed)
    pools = {f: [] for f in AMAZON_FAMILY_MAP.values()}
    with open(meta_path, encoding="utf-8") as fh:
        for line in fh:
            d = json.loads(line)
            c = d.get("categories") or []
            if len(c) < 3 or c[1] not in AMAZON_FAMILY_MAP: continue
            p = d.get("price")
            if not isinstance(p, (int, float)) or not (0.5 <= p <= 120): continue
            if not d.get("store") or not d.get("title") or len(d["title"]) < 5: continue
            if re.search(r"eggs?\b", d["title"], re.I) and c[1].startswith("Dairy"): continue
            pools[AMAZON_FAMILY_MAP[c[1]]].append((d["parent_asin"], _clean_title(d["title"]), d["store"], float(p),
                                                     int(d.get("rating_number") or 0), (d.get("details") or {}).get("UPC"),
                                                     c[2] if len(c) > 2 else "", float(d.get("average_rating") or 0)))
    chosen = {}
    for fam, pool in pools.items():
        n = per_family_needed.get(fam, 0)
        w = np.array([math.log1p(x[4]) + 0.1 for x in pool]); w /= w.sum()
        idx = rng.choice(len(pool), size=min(n, len(pool)), replace=False, p=w)
        chosen[fam] = [pool[i] for i in idx]
    return chosen


def build_catalog(meta_path, n_by_family, seed, tenant_id):
    rng = random.Random(seed)
    amz = sample_amazon(meta_path, n_by_family, seed)
    products, seq = [], 0
    for fam, (margin, shelf, policy, pack, _n, sup) in FAMILIES.items():
        n = n_by_family[fam]
        if fam in amz:
            for asin, title, brand, usd, rn, upc, sub, avg in amz[fam]:
                seq += 1
                mrp = max(5, round(usd * USD_TO_INR))
                products.append(dict(sku=f"SKU-{seq:05d}", name=title, brand=brand, family=fam, subcategory=sub,
                                     barcode=(upc if upc and re.fullmatch(r"\d{12,13}", str(upc)) else ean13(rng)),
                                     mrpPaise=mrp * 100, catalog_source="amazon_meta", source_asin=asin, price_imputed=False))
        else:
            names, sizes, (lo, hi) = TEMPLATES[fam]
            combos = [(nm, sz) for nm in names for sz in sizes]
            rng.shuffle(combos)
            k = 0
            while sum(1 for p in products if p["family"] == fam) < n:
                nm, sz = combos[k % len(combos)]
                brand = rng.choice(BRANDS); k += 1
                dup = f" ({brand})" if k > len(combos) or fam not in ("PRODUCE", "MEATS", "POULTRY", "SEAFOOD") else ""
                title = f"{brand} {nm} {sz}" if fam not in ("PRODUCE", "MEATS", "POULTRY", "SEAFOOD") else f"{nm} {sz}{dup}"
                if any(p["name"] == title for p in products): title += f" #{k}"
                seq += 1
                mrp = round(math.exp(rng.uniform(math.log(lo), math.log(hi))))
                products.append(dict(sku=f"SKU-{seq:05d}", name=title, brand=brand, family=fam, subcategory="",
                                     barcode=ean13(rng), mrpPaise=mrp * 100, catalog_source="template", source_asin=None,
                                     price_imputed=True))
        for p in products:
            if p["family"] == fam and "costPaise" not in p:
                m = min(0.5, max(0.03, rng.gauss(margin, 0.03)))
                p["costPaise"] = int(round(p["mrpPaise"] * (1 - m)))
                p["packSize"] = pack
                p["shelfLifeDays"] = shelf
                p["trackingPolicy"] = policy
                p["supplierKey"] = sup
                p["simulated"] = True
                p["tenantId"] = tenant_id
                p["active"] = True
    return products


# ---------------------------------------------------------------------------------------------------------------------------
# Indian catalogue from the BigBasket product list (real Indian products, prices already in INR)
FAMILIES_BB = {**FAMILIES, "BABY CARE": (0.20, 365, "estimate", 6, 40, "home")}
BB_MAP = {  # (category, sub_category or None) -> family ; None = any sub-category
    ("Fruits & Vegetables", None): "PRODUCE",
    ("Eggs, Meat & Fish", "Eggs"): "EGGS", ("Eggs, Meat & Fish", "Fish & Seafood"): "SEAFOOD", ("Eggs, Meat & Fish", "Mutton & Lamb"): "MEATS",
    ("Eggs, Meat & Fish", "Pork & Other Meats"): "MEATS", ("Eggs, Meat & Fish", "Sausages, Bacon & Salami"): "DELI",
    ("Bakery, Cakes & Dairy", "Dairy"): "DAIRY", ("Bakery, Cakes & Dairy", "Non Dairy"): "DAIRY", ("Bakery, Cakes & Dairy", "Ice Creams & Desserts"): "FROZEN FOODS",
    ("Bakery, Cakes & Dairy", None): "BREAD/BAKERY", ("Beverages", None): "BEVERAGES", ("Foodgrains, Oil & Masala", None): "GROCERY I",
    ("Snacks & Branded Foods", "Frozen Veggies & Snacks"): "FROZEN FOODS", ("Snacks & Branded Foods", "Ready To Cook & Eat"): "PREPARED FOODS", ("Snacks & Branded Foods", None): "GROCERY II",
    ("Gourmet & World Food", "Dairy & Cheese"): "DAIRY", ("Gourmet & World Food", "Drinks & Beverages"): "BEVERAGES", ("Gourmet & World Food", "Cooking & Baking Needs"): "GROCERY I",
    ("Gourmet & World Food", None): "GROCERY II",
    ("Cleaning & Household", "Stationery"): None, ("Cleaning & Household", "Bins & Bathroom Ware"): None, ("Cleaning & Household", "Car & Shoe Care"): None, ("Cleaning & Household", "Party & Festive Needs"): None,
    ("Cleaning & Household", None): "CLEANING",
    ("Beauty & Hygiene", "Health & Medicine"): None, ("Beauty & Hygiene", "Makeup"): None, ("Beauty & Hygiene", "Mothers & Maternity"): None, ("Beauty & Hygiene", None): "PERSONAL CARE",
    ("Baby Care", "Baby Accessories"): None, ("Baby Care", "Feeding & Nursing"): None, ("Baby Care", "Mothers & Maternity"): None, ("Baby Care", None): "BABY CARE",
    ("Kitchen, Garden & Pets", "Pet Food & Accessories"): "PET SUPPLIES",
}


def bb_family(cat, sub):
    if (cat, sub) in BB_MAP: return BB_MAP[(cat, sub)]
    return BB_MAP.get((cat, None))


def build_catalog_bigbasket(csv_path, n_by_family, seed, tenant_id):
    import pandas as pd
    rng = random.Random(seed); nrng = np.random.default_rng(seed)
    df = pd.read_csv(csv_path)
    df["family"] = [bb_family(c, s) for c, s in zip(df.category, df.sub_category)]
    df = df[df.family.notna() & df["product"].notna() & df.sale_price.notna() & (df.sale_price >= 2)].drop_duplicates(subset=["product", "brand"])
    products, seq = [], 0
    for fam, (margin, shelf, policy, pack, _n, sup) in FAMILIES_BB.items():
        pool = df[df.family == fam]
        if pool.empty: continue
        w = (pool.rating.fillna(pool.rating.mean() if pool.rating.notna().any() else 3.5) + 0.5).values; w = w / w.sum()   # mild preference for rated products
        pick = pool.iloc[nrng.choice(len(pool), size=min(n_by_family.get(fam, 0), len(pool)), replace=False, p=w)]
        for r in pick.itertuples():
            seq += 1; sale = float(r.sale_price); m = min(0.5, max(0.03, rng.gauss(margin, 0.03)))
            products.append(dict(sku=f"SKU-{seq:05d}", name=re.sub(r"\s+", " ", str(r.product)).strip()[:90], brand=str(r.brand), family=fam, subcategory=str(r.sub_category), barcode="890" + "".join(str(rng.randint(0, 9)) for _ in range(9)) + "0",
                                 mrpPaise=int(round(sale * 100)), listPricePaise=int(round(float(r.market_price) * 100)), costPaise=int(round(sale * 100 * (1 - m))), packSize=pack, shelfLifeDays=shelf, trackingPolicy=policy,
                                 supplierKey=sup, catalog_source="bigbasket", price_imputed=False, simulated=True, tenantId=tenant_id, active=True))
    return products
