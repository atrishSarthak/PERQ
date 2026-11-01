"""Synthetic product-page screenshots for the planner eval (Step 3 §11).
Fictional shops and people only. Run: python3 fixtures/plans/make.py, then
screenshot each page with the browse tool (see README.md)."""
import json, pathlib

HERE = pathlib.Path(__file__).parent
PAGES = [
    dict(id="phone", shop="Kartly", item="Nova X15 5G (Midnight, 128 GB)", mrp="79,900", price=59900, rating="4.5",
         offers=["₹1,500 instant discount on HDFC Bank credit cards, min order ₹30,000", "5% cashback with Kartly Pay Later, up to ₹750"],
         emi="No cost EMI from ₹9,983/month. 6 months. Processing fee ₹199"),
    dict(id="laptop", shop="BuyNest", item="AeroBook 14 Laptop (16 GB, 512 GB SSD)", mrp="34,990", price=24999, rating="4.2",
         offers=["10% off up to ₹1,000 on Axis Bank credit card EMI"],
         emi="No Cost EMI available: 3 or 6 months on select cards. Processing fee ₹199 + GST"),
    dict(id="headphones", shop="Kartly", item="SoundPeak ANC 700 Wireless Headphones", mrp="14,999", price=8499, rating="4.3",
         offers=["Flat ₹500 off on SBI Credit Card, min order ₹5,000", "Use coupon SAVE300 for ₹300 off"], emi=None),
    dict(id="fridge", shop="HomeHive", item="FrostPro 340 L Double Door Refrigerator", mrp="52,000", price=38490, rating="4.1",
         offers=["7.5% instant discount on ICICI Bank cards up to ₹3,000"],
         emi="EMI from ₹1,812/month for 24 months at 15% p.a."),
    dict(id="watch", shop="BuyNest", item="Pulse Fit 3 Smartwatch (Graphite)", mrp="6,999", price=3299, rating="4.0",
         offers=[], emi=None),
]
CSS = """body{font-family:-apple-system,Helvetica,Arial;margin:0;background:#fff;color:#212121;width:390px}
.top{background:#2a55e5;color:#fff;padding:12px 16px;font-weight:700}.addr{background:#f1f3f6;padding:8px 16px;font-size:12px;color:#555}
.img{height:150px;background:#eceff4;margin:12px 16px;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999}
h1{font-size:17px;margin:4px 16px;font-weight:500}.r{margin:0 16px;font-size:12px;color:#388e3c}.p{margin:8px 16px;font-size:26px;font-weight:700}
.mrp{font-size:14px;color:#878787;text-decoration:line-through;font-weight:400;margin-left:8px}.off{color:#388e3c;font-size:14px;margin-left:6px}
h2{font-size:14px;margin:14px 16px 6px}li{font-size:13px;margin:4px 0}ul{margin:0 16px;padding-left:18px}.emi{margin:10px 16px;font-size:13px;color:#555}
.ord{margin:10px 16px;font-size:11px;color:#777}"""

def page(p):
    offers = "".join(f"<li>Bank Offer: {o}</li>" for o in p["offers"]) or "<li>No offers on this item</li>"
    emi = f'<div class="emi">{p["emi"]}</div>' if p["emi"] else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="top">{p['shop']}</div><div class="addr">Deliver to: Riya Sharma, 14 Lake View Road, Pune 411001 · Card ending 4242</div>
<div class="img">product photo</div><h1>{p['item']}</h1><div class="r">★ {p['rating']} · 2,314 ratings</div>
<div class="p">₹{p['price']:,}<span class="mrp">₹{p['mrp']}</span><span class="off">Special price</span></div>
<h2>Available offers</h2><ul>{offers}</ul>{emi}<div class="ord">Order ID OD4471829 · Sold by RetailNet</div></body></html>""".replace(f"₹{p['price']:,}", "₹" + format_inr(p["price"]))

def format_inr(n):
    s = str(n); last3, rest = s[-3:], s[:-3]
    parts = []
    while len(rest) > 2: parts.insert(0, rest[-2:]); rest = rest[:-2]
    if rest: parts.insert(0, rest)
    return ",".join(parts + [last3]) if parts else last3

(HERE / "pages").mkdir(exist_ok=True)
for p in PAGES:
    (HERE / "pages" / f"{p['id']}.html").write_text(page(p))
(HERE / "expected.json").write_text(json.dumps({p["id"]: {"price": p["price"], "item": p["item"], "offers": len(p["offers"]), "emi": bool(p["emi"])} for p in PAGES}, indent=2) + "\n")
print("wrote", len(PAGES), "pages")
