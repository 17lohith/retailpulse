#!/usr/bin/env python3
"""Profile the external datasets in data/raw/external -> evidence/data_profile/external_*.json (facts only)."""
import json, pathlib, glob, collections, pandas as pd, numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[1]; X = ROOT / "data/raw/external"; OUT = ROOT / "evidence/data_profile"
def save(n, o): (OUT / f"external_{n}.json").write_text(json.dumps(o, indent=1, default=str)); print("==", n); print(json.dumps(o, default=str)[:900])
def lic(d):
    try: return [l.get("name") for l in json.load(open(X / d / "dataset-metadata.json")).get("licenses", [])]
    except Exception: return None
def nulls(df): return {c: round(float(v), 4) for c, v in df.isna().mean().items() if v > 0}

# 1. synthetic supermarket inventory (expiry / waste)
d = pd.read_csv(X / "supermarket-inventory-and-demand-synthetic/inventory_management.csv")
sold = d.Actual_Sales_Units.sum()
per = d.groupby("Is_Perishable").agg(rows=("Date", "size"), sold=("Actual_Sales_Units", "sum"), wasted=("Units_Wasted", "sum"), oos=("Out_Of_Stock_Flag", "mean"))
save("supermarket_inventory_synthetic", dict(license=lic("supermarket-inventory-and-demand-synthetic"), rows=len(d), columns=list(d.columns), products=d.Product_ID.nunique(), stores=d.Store_ID.nunique(),
     date_min=d.Date.min(), date_max=d.Date.max(), batches=d.Batch_ID.nunique(), nulls=nulls(d), waste_share_of_sold=float(d.Units_Wasted.sum() / sold),
     perishable_split=per.reset_index().to_dict("records"), shelf_life_by_category=d.groupby("Category").Standard_Shelf_Life_Days.median().to_dict(),
     days_to_expiry_describe=d.Days_To_Expiry.describe().to_dict(), oos_share=float(d.Out_Of_Stock_Flag.mean())))
# 2. grocery inventory & sales (dirty, expiry)
g = pd.read_csv(X / "grocery-inventory-and-sales-data/Grocery_Inventory_and_Sales_Dataset.csv"); g.columns = [c.strip() for c in g.columns]
for c in ("Date_Received", "Last_Order_Date", "Expiration_Date"): g[c] = pd.to_datetime(g[c], errors="coerce")
save("grocery_inventory_sales", dict(license=lic("grocery-inventory-and-sales-data"), rows=len(g), nulls=nulls(g), statuses=g.Status.value_counts().to_dict(), categories=g.Catagory.value_counts().to_dict(),
     expiry_before_received=int((g.Expiration_Date < g.Date_Received).sum()), stock_below_reorder=int((g.Stock < g.Reorder_Level).sum()), duplicate_product_ids=int(g.Product_ID.duplicated().sum()), blank_price=int(g["Price"].isna().sum()) if "Price" in g else None))
# 3. retail store inventory forecasting
r = pd.read_csv(X / "retail-store-inventory-forecasting-dataset/retail_store_inventory.csv")
save("retail_store_inventory", dict(license=lic("retail-store-inventory-forecasting-dataset"), rows=len(r), stores=r["Store ID"].nunique(), products=r["Product ID"].nunique(), categories=r.Category.value_counts().to_dict(),
     date_min=r.Date.min(), date_max=r.Date.max(), nulls=nulls(r), sold_gt_inventory=int((r["Units Sold"] > r["Inventory Level"]).sum()), corr_units_vs_forecast=float(r["Units Sold"].corr(r["Demand Forecast"]))))
# 4. BigBasket
b = pd.read_csv(X / "bigbasket-entire-product-list-28k-datapoints/BigBasket Products.csv")
save("bigbasket", dict(license=lic("bigbasket-entire-product-list-28k-datapoints"), rows=len(b), columns=list(b.columns), nulls=nulls(b), categories=b.category.value_counts().to_dict(), brands=int(b.brand.nunique()),
     sale_price=b.sale_price.describe().to_dict(), market_price=b.market_price.describe().to_dict(), discount_share=float((b.sale_price < b.market_price).mean()), duplicate_names=int(b["product"].duplicated().sum())))
# 5. Online Retail II
o = pd.read_csv(X / "online-retail-ii-uci/online_retail_II.csv", dtype={"Invoice": str, "StockCode": str}, parse_dates=["InvoiceDate"])
canc = o.Invoice.str.startswith("C", na=False)
nonprod = o.StockCode.str.match(r"^(POST|DOT|M|BANK CHARGES|AMAZONFEE|C2|D|S|B|CRUK|ADJUST|PADS|TEST)", na=False)
save("online_retail_ii", dict(license=lic("online-retail-ii-uci"), rows=len(o), invoices=o.Invoice.nunique(), products=o.StockCode.nunique(), customers=int(o["Customer ID"].nunique()), countries=int(o.Country.nunique()),
     date_min=o.InvoiceDate.min(), date_max=o.InvoiceDate.max(), nulls=nulls(o), cancellation_rows=int(canc.sum()), cancellation_share=float(canc.mean()), negative_qty=int((o.Quantity < 0).sum()), zero_or_neg_price=int((o.Price <= 0).sum()),
     non_product_stockcodes=int(nonprod.sum()), exact_duplicate_rows=int(o.duplicated().sum()), lines_per_invoice=o.groupby("Invoice").size().describe().to_dict()))
# 6. Instacart
ords = pd.read_csv(X / "instacart-market-basket-analysis/orders.csv"); prod = pd.read_csv(X / "instacart-market-basket-analysis/products.csv")
n_prior = sum(1 for _ in open(X / "instacart-market-basket-analysis/order_products__prior.csv", "rb")) - 1
save("instacart", dict(license=lic("instacart-market-basket-analysis"), orders=len(ords), users=int(ords.user_id.nunique()), eval_sets=ords.eval_set.value_counts().to_dict(), products=len(prod), prior_order_product_rows=n_prior,
     avg_basket=n_prior / (ords.eval_set == "prior").sum(), orders_by_dow=ords.order_dow.value_counts().sort_index().to_dict(), days_since_prior_nulls=int(ords.days_since_prior_order.isna().sum())))
# 7. Dunnhumby
t = pd.read_csv(X / "dunnhumby-the-complete-journey/transaction_data.csv")
cs = sum(1 for _ in open(X / "dunnhumby-the-complete-journey/causal_data.csv", "rb")) - 1
pr = pd.read_csv(X / "dunnhumby-the-complete-journey/product.csv")
save("dunnhumby", dict(license=lic("dunnhumby-the-complete-journey"), transaction_rows=len(t), columns=list(t.columns), households=int(t.household_key.nunique()), baskets=int(t.BASKET_ID.nunique()), products=int(t.PRODUCT_ID.nunique()), stores=int(t.STORE_ID.nunique()),
     day_range=[int(t.DAY.min()), int(t.DAY.max())], weeks=int(t.WEEK_NO.nunique()), nulls=nulls(t), negative_sales=int((t.SALES_VALUE < 0).sum()), zero_quantity=int((t.QUANTITY == 0).sum()), retail_discount_rows=int((t.RETAIL_DISC < 0).sum()),
     coupon_rows=int((t.COUPON_DISC < 0).sum()), causal_rows=cs, departments=pr.DEPARTMENT.value_counts().head(8).to_dict()))
# 8. Real Canadian Superstore monthly scrapes
fs = sorted(glob.glob(str(X / "rc-superstore-grocery-data/*.csv"))); parts = []; schemas = collections.Counter()
for f in fs:
    df = pd.read_csv(f, low_memory=False); schemas[tuple(df.columns)] += 1; df["_file"] = pathlib.Path(f).stem; parts.append(df)
a = pd.concat(parts, ignore_index=True)
pc = [c for c in a.columns if c.startswith("pricing.price")][:3]
save("rc_superstore", dict(license=lic("rc-superstore-grocery-data"), files=len(fs), rows=len(a), distinct_schemas=len(schemas), products=int(a.productId.nunique()), brands=int(a.brand.nunique()), columns=list(a.columns)[:45], price_columns=pc,
     inventory_indicator=a.inventoryIndicator.astype(str).value_counts().head(8).to_dict(), nulls=dict(list(nulls(a).items())[:12]), rows_per_file={pathlib.Path(f).stem: int(len(p)) for f, p in zip(fs, parts)}))
