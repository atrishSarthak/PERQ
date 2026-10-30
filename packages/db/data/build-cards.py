#!/usr/bin/env python3
"""Builds cards.json (the 40-card catalogue) from the hand-checked terms below.

Every number here was read on the issuer's own page or PDF on 2026-10-31; the
page is in `sourceUrl` and the reading notes are in research-notes.md. Run:
    python3 packages/db/data/build-cards.py
then `pnpm db:seed-cards`. Edit THIS file, not cards.json.

Conventions (see CARDS_README.md):
- rewardRates are % value back per category, already converted from points
  with the card's ₹-per-point value (conservative redemption: statement
  credit or the bank's stated value, never a transfer-partner best case).
- Rates tied to one merchant apply to the whole category only when that
  merchant is one of the category's two main platforms (Swiggy/Zomato for
  food delivery, Amazon/Flipkart for online shopping), or for fuel co-brands
  at their own pumps. Otherwise the card's base rate is used.
- Caps are ₹ of reward per month. capGroups share one cap across categories.
- Fees are before 18% GST (the finance engine adds it).
"""
import json, os

CHECKED = "2026-10-31"
CATS = ["food_delivery", "online_shopping", "groceries", "dining", "fuel", "bills", "upi", "travel", "other"]


def rates(default=0.0, **kw):
    out = {c: default for c in CATS}
    for k, v in kw.items():
        assert k in out, k
        out[k] = v
    return out


UNSECURED = ["salaried", "self_employed"]
ANY = ["student", "salaried", "self_employed"]

cards = []


def card(id, name, issuer, networks, bucket, *, joining, annual, rr, src, notes, verified=True,
         waiver=None, waiver_excludes=(), caps=None, groups=(), milestones=(), welcome=0,
         secured=False, fd=None, upi=False, min_age=None, occupations=None, min_income=None,
         redemption=None, partner=None, tier=None, ltf=None):
    lifetime_free = ltf if ltf is not None else (joining == 0 and annual == 0)
    cards.append({
        "id": id, "name": name, "issuer": issuer, "networks": networks, "bucket": bucket,
        "tier": tier, "cardType": "secured" if secured else "unsecured", "fdMinAmount": fd,
        "lifetimeFree": lifetime_free, "upiEnabled": upi,
        "joiningFee": joining, "annualFee": annual, "feeWaiverSpend": waiver,
        "waiverExcludes": list(waiver_excludes),
        "rewardRates": rr, "rewardCaps": caps or {},
        "capGroups": [{"categories": g[0], "monthlyCap": g[1], "label": g[2]} for g in groups],
        "rewardNotes": notes, "milestones": [{"annualSpend": a, "value": v} for a, v in milestones],
        "welcomeBenefitValue": welcome, "redemptionValue": redemption, "coBrandPartner": partner,
        "minAge": min_age if min_age is not None else (18 if secured else 21),
        "eligibleOccupations": occupations or (ANY if (secured or lifetime_free) else UNSECURED),
        "minMonthlyIncome": min_income,
        "sourceUrl": src, "sourceUpdatedAt": CHECKED, "verified": verified,
    })


# ---------------- Entry cashback / co-brand ----------------
card("sbi-cashback", "Cashback SBI Card", "SBI Card", ["Visa"], "entry_cashback",
     joining=999, annual=999, waiver=200000,
     rr=rates(food_delivery=5, online_shopping=5, groceries=1, dining=1, travel=1, other=1),
     groups=[(["food_delivery", "online_shopping"], 2000, "Online spends (5%)"),
             (["groceries", "dining", "travel", "other"], 2000, "Offline spends (1%)")],
     src="https://www.sbicard.com/en/personal/credit-cards/cashback-sbi-card.html",
     notes="5% on online spends and 1% offline, each capped at ₹2,000 per statement. No cashback on utilities, insurance, fuel, rent, wallets, education, jewellery or railways. Travel is modelled at 1% because offline bookings earn only that.")
card("axis-ace", "Axis Bank ACE Credit Card", "Axis Bank", ["Visa"], "entry_cashback",
     joining=499, annual=499, waiver=200000,
     rr=rates(1.5, food_delivery=4, bills=5, fuel=0, upi=0),
     groups=[(["bills", "food_delivery"], 500, "5% bills + 4% Swiggy/Zomato")],
     src="https://www.axis.bank.in/cards/credit-card/axis-bank-ace-credit-card",
     notes="5% on utility bills, DTH and mobile recharges paid through Google Pay; 4% on Swiggy, Zomato and Ola; the two share a ₹500 cap per statement. 1.5% on everything else. No cashback on fuel, rent, wallets, insurance, education, gold or utilities paid outside Google Pay.")
card("axis-airtel", "Airtel Axis Bank Credit Card", "Axis Bank", ["Visa"], "entry_cashback",
     joining=500, annual=500, waiver=200000, welcome=250, partner="Airtel",
     rr=rates(1, food_delivery=10, fuel=0, upi=0),
     caps={"food_delivery": 200},
     src="https://www.axis.bank.in/cards/credit-card/airtel-axis-bank-credit-card",
     notes="10% back on Zomato (up to ₹200 a month, min order ₹499). 25% on Airtel bills and 10% on utilities via the Airtel Thanks app are capped relative to your base cashback, so PERQ models bills at the 1% base. 1% on other spends.")
card("axis-flipkart", "Flipkart Axis Bank Credit Card", "Axis Bank", ["Visa"], "entry_cashback",
     joining=500, annual=500, waiver=350000, welcome=250, partner="Flipkart",
     rr=rates(1, food_delivery=4, online_shopping=5, fuel=0, bills=0, upi=0),
     caps={"online_shopping": 1333},
     src="https://www.axis.bank.in/cards/credit-card/flipkart-axisbank-credit-card",
     notes="5% on Flipkart and Cleartrip and 7.5% on Myntra, each capped at ₹4,000 per quarter (modelled as ₹1,333 a month on shopping). 4% on preferred merchants including Swiggy and Uber, 1% elsewhere. Utilities modelled at 0% (Axis excludes them from cashback on most cards). No cashback on fuel.")
card("hdfc-millennia", "HDFC Bank Millennia Credit Card", "HDFC Bank", ["Visa", "Mastercard"], "entry_cashback",
     joining=1000, annual=1000, waiver=100000, welcome=1000, redemption=1,
     rr=rates(1, food_delivery=5, online_shopping=5, fuel=0, upi=0),
     groups=[(["food_delivery", "online_shopping"], 1000, "5% on 10 online merchants"),
             (["groceries", "dining", "bills", "travel", "other"], 1000, "1% on other spends")],
     milestones=[(400000, 4000)],
     src="https://www.hdfcbank.com/content/api/contentstream-id/723fb80a-2dde-42a3-9793-7ae1be57c87f/ef2bb403-39aa-46ae-aa45-bcd1ac8a538b",
     notes="5% CashPoints on Amazon, Flipkart, Myntra, Swiggy, Zomato, Uber and 4 more (cap 1,000/month), 1% elsewhere (cap 1,000/month); 1 CashPoint = ₹1. ₹1,000 voucher for each quarter with ₹1 lakh spend, modelled as ₹4,000 at ₹4 lakh a year. Welcome 1,000 CashPoints only when the joining fee is paid. Nothing on fuel, rent, wallets, EMI.")
card("hdfc-swiggy", "Swiggy HDFC Bank Credit Card", "HDFC Bank", ["Mastercard"], "entry_cashback",
     joining=500, annual=500, waiver=200000, partner="Swiggy",
     rr=rates(1, food_delivery=10, online_shopping=5, fuel=0, upi=0),
     caps={"food_delivery": 1500, "online_shopping": 1500},
     groups=[(["groceries", "dining", "bills", "travel", "other"], 500, "1% on other spends")],
     src="https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/swiggy-hdfc-bank-credit-card/pdf/terms-and-conditions-swiggy-hdfc-bank-credit-card-26052026.pdf",
     notes="10% on the Swiggy app (food, Instamart, Dineout; min ₹249) up to ₹1,500 a cycle; 5% on online shopping merchants like Amazon, Flipkart, Myntra up to ₹1,500; 1% elsewhere up to ₹500. Instamart and Dineout are modelled at 1% because groceries and dining mostly happen elsewhere. Fee from HDFC MITC (Oct 2026).")
card("hdfc-tata-neu-plus", "Tata Neu Plus HDFC Bank Credit Card", "HDFC Bank", ["RuPay", "Visa"], "entry_cashback",
     joining=499, annual=499, waiver=100000, upi=True, partner="Tata Neu",
     rr=rates(1, fuel=0, upi=0.25),
     caps={"groceries": 1000, "bills": 2000, "upi": 500},
     src="https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/tata-neu-plus-hdfc-bank-credit-card/pdfs/tata_neu_plus_card_tnc.pdf",
     notes="2% NeuCoins on Tata brands (BigBasket, Croma, Tata CLiQ…), 1% elsewhere; 1 NeuCoin = ₹1 on Tata Neu. UPI earns 0.25% (another 0.75% via the Tata Neu UPI ID), capped at 500 a month. Grocery NeuCoins capped at 1,000 a month. Nothing on fuel, rent, wallets, government. Tata-brand 2% isn't modelled because those brands aren't the main platforms in any category.")
card("sbi-simplyclick", "SimplyCLICK SBI Card", "SBI Card", ["Visa"], "entry_cashback",
     joining=499, annual=499, waiver=100000, welcome=500, redemption=0.25,
     rr=rates(0.25, food_delivery=2.5, online_shopping=2.5, travel=1.25, fuel=0, upi=0),
     groups=[(["food_delivery", "online_shopping", "travel"], 2500, "Online 5X/10X (10,000 points)")],
     src="https://www.sbicard.com/sbi-card-en/assets/docs/pdf/SimplyClick-TnC.pdf",
     notes="10X points on partners (Amazon, Myntra, Swiggy, Cleartrip, BookMyShow…), 5X on other online spends (capped at 10,000 points a month), 1 point per ₹100 offline; 4 points = ₹1. ₹2,000 e-vouchers at ₹1 lakh and ₹2 lakh of online spends are not modelled (online-only). Welcome Amazon gift card ₹500.")
card("axis-indianoil", "IndianOil Axis Bank Credit Card", "Axis Bank", ["Visa"], "entry_cashback",
     joining=500, annual=500, waiver=350000, welcome=250, redemption=0.2, partner="IndianOil",
     rr=rates(0.2, fuel=4, food_delivery=1, online_shopping=1, upi=0),
     caps={"fuel": 200},
     groups=[(["food_delivery", "online_shopping"], 50, "1% online (on up to ₹5,000 a month)")],
     src="https://www.axis.bank.in/cards/credit-card/indianoil-axis-bank-credit-card",
     notes="4% back at IOCL pumps on up to ₹5,000 a month; 1% on online shopping on up to ₹5,000 a month; 1 EDGE point per ₹100 elsewhere (1 point = ₹0.20). Fuel rate assumes you fill up at IndianOil.")
card("hsbc-live-plus", "HSBC Live+ Credit Card", "HSBC", ["Visa"], "entry_cashback",
     joining=999, annual=999, waiver=200000, min_age=18,
     rr=rates(1.5, dining=10, food_delivery=10, groceries=10, bills=10, fuel=0, upi=0),
     groups=[(["dining", "food_delivery", "groceries", "bills"], 1200, "10% accelerated cashback")],
     src="https://www.hsbc.co.in/credit-cards/products/live-plus/",
     notes="10% cashback on dining, food delivery, groceries, shopping and utilities, up to ₹1,200 a month in total; 1.5% unlimited on most other spends. Shopping is modelled at 1.5% because the 10% applies only to the merchant types in HSBC's footnote.")
card("sbi-simplysave", "SimplySAVE SBI Card", "SBI Card", ["Visa"], "entry_cashback",
     joining=499, annual=499, waiver=100000, welcome=500, redemption=0.25,
     rr=rates(0.167, dining=1.667, groceries=1.667, fuel=0, upi=0),
     src="https://www.sbicard.com/en/personal/credit-cards/simplysave-sbi-card.html",
     notes="10 points per ₹150 on dining, movies, departmental stores and groceries; 1 point per ₹150 elsewhere; 4 points = ₹1. 2,000 bonus points (₹500) for ₹2,000 spent in the first 60 days.")

# ---------------- Lifetime free / ₹0 ----------------
card("icici-amazon-pay", "Amazon Pay ICICI Bank Credit Card", "ICICI Bank", ["Visa"], "lifetime_free",
     joining=0, annual=0, partner="Amazon",
     rr=rates(1, online_shopping=3, fuel=0, upi=0),
     src="https://www.icicibank.com/personal-banking/cards/credit-card/amazon-pay-credit-card",
     notes="5% on Amazon for Prime members, 3% otherwise (PERQ uses 3%: Prime is a paid membership). 2% on Amazon Pay partner merchants, 1% on other spends, as Amazon Pay balance. Lifetime free.")
card("idfc-first-millennia", "IDFC FIRST Millennia Credit Card", "IDFC FIRST Bank", ["Visa"], "lifetime_free",
     joining=0, annual=0, redemption=0.25,
     rr=rates(0.375, dining=1.25, travel=1.25, bills=0.125, fuel=0, upi=0),
     src="https://www.idfcfirstbank.com/credit-card/millennia",
     notes="10X points on dining, travel, international and birthday spends; 3X on most others; 1X on utilities, insurance, railways and FASTag. 1X = 1 point per ₹200, 1 point = ₹0.25 (₹99 + GST per redemption). Nothing on fuel or EMI. Lifetime free.")
card("idfc-first-classic", "IDFC FIRST Classic Credit Card", "IDFC FIRST Bank", ["Visa", "RuPay"], "lifetime_free",
     joining=0, annual=0, redemption=0.25, upi=True,
     rr=rates(0.375, dining=1.25, travel=1.25, bills=0.125, fuel=0),
     src="https://www.idfcfirstbank.com/credit-card/classic",
     notes="10X points on dining, travel and international; 3X on eligible spends including UPI; 1X on utilities and insurance. 1X = 1 point per ₹200, 1 point = ₹0.25. Lifetime free.")
card("idfc-first-select", "IDFC FIRST Select Credit Card", "IDFC FIRST Bank", ["Visa", "RuPay"], "lifetime_free",
     joining=0, annual=0, redemption=0.25, upi=True,
     rr=rates(0.375, dining=1.25, travel=1.25, bills=0.125, fuel=0),
     src="https://www.idfcfirstbank.com/credit-card/select",
     notes="10X points on dining, travel and international; 3X on UPI and other eligible spends; 1X on utilities. 1X = 1 point per ₹200, 1 point = ₹0.25. Lifetime free, with lounge access.")
card("axis-neo", "Axis Bank Neo Credit Card", "Axis Bank", ["Visa", "RuPay"], "lifetime_free",
     joining=250, annual=250, redemption=0.2, upi=True, ltf=False,
     rr=rates(0.1, fuel=0),
     src="https://www.axis.bank.in/cards/credit-card/axis-bank-neo-credit-card",
     notes="1 EDGE point per ₹200 (1 point = ₹0.20). The card's value is in merchant offers PERQ doesn't count: ₹120 off Zomato orders over ₹499, 5% off Paytm recharges, 10% off BookMyShow. ₹250 a year, lifetime free through select channels.")
card("icici-platinum-chip", "ICICI Bank Platinum Chip Credit Card", "ICICI Bank", ["Visa"], "lifetime_free",
     joining=0, annual=0, verified=False,
     rr=rates(0),
     src="https://www.icicibank.com/personal-banking/cards/credit-card/platinum-chip-credit-card",
     notes="UNVERIFIED: ICICI publishes 2 points per ₹100 (1 on utilities and insurance) but not what a point is worth in rupees, so PERQ can't compute its value. Lifetime free, age 21–65.")
card("federal-scapia", "Scapia Federal Bank Credit Card", "Federal Bank", ["Visa", "RuPay"], "lifetime_free",
     joining=0, annual=0, upi=True, verified=False,
     rr=rates(0),
     src="https://www.federal.bank.in/scapia",
     notes="UNVERIFIED: the bank and Scapia pages block automated reading. Advertised: 10% Scapia Coins on everyday spends, 5% on RuPay UPI over ₹500, 5 coins = ₹1, coins only redeemable on Scapia travel bookings.")
card("hsbc-visa-platinum", "HSBC Visa Platinum Credit Card", "HSBC", ["Visa"], "lifetime_free",
     joining=0, annual=0, verified=False, min_age=18,
     rr=rates(0),
     src="https://www.hsbc.co.in/credit-cards/products/visa-platinum/",
     notes="UNVERIFIED: HSBC publishes 2 points per ₹150 (up to 6x on travel) but no rupee value per point. Lifetime free.")
card("au-lit", "AU Bank LIT Credit Card", "AU Small Finance Bank", ["Visa"], "lifetime_free",
     joining=0, annual=0, verified=False,
     rr=rates(0),
     src="https://www.au.bank.in/personal-banking/credit-cards/lit-credit-card",
     notes="UNVERIFIED: au.bank.in blocks automated reading. A customisable card: you pay for feature packs (cashback, rewards) that PERQ can't model without the bank's current terms.")

# ---------------- RuPay on UPI ----------------
card("hdfc-upi-rupay", "HDFC Bank UPI RuPay Credit Card", "HDFC Bank", ["RuPay"], "rupay_upi",
     joining=99, annual=99, waiver=25000, upi=True, redemption=0.25,
     rr=rates(0.25, groceries=0.75, dining=0.75, bills=0.5, fuel=0),
     groups=[(["groceries", "dining"], 125, "3% CashPoints on grocery & dining"),
             (["food_delivery", "online_shopping", "upi", "travel", "other"], 125, "1% CashPoints on other spends")],
     caps={"bills": 125},
     src="https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/hdfc-bank-upi-rupay-credit-card/Terms-and-Conditions-HDFC-Bank-UPI-RuPay-Credit-Card-27032025.pdf",
     notes="3% CashPoints on groceries, supermarkets, dining and PayZapp; 2% on utilities; 1% elsewhere; each capped at 500 CashPoints a month. 1 CashPoint = ₹0.25 against your statement, so the real value is 0.75% / 0.5% / 0.25%. Works on UPI. ₹99 fee, waived at ₹25,000 a year.")
card("kiwi-yes-rupay", "Kiwi YES Bank RuPay Credit Card", "YES Bank", ["RuPay"], "rupay_upi",
     joining=0, annual=0, upi=True, partner="Kiwi",
     rr=rates(0, upi=1.5),
     src="https://gokiwi.in/",
     notes="1.5% cashback on every UPI scan-and-pay (5% needs the paid Kiwi Neon plan, not modelled). Virtual RuPay card that lives in the Kiwi UPI app. Lifetime free. Source is the official Kiwi card-program page (issuer: YES Bank).")
card("hsbc-rupay-cashback", "HSBC RuPay Cashback Credit Card", "HSBC", ["RuPay"], "rupay_upi",
     joining=499, annual=499, waiver=200000, upi=True, min_age=18,
     rr=rates(1, dining=10, food_delivery=10, groceries=10, fuel=0),
     groups=[(["dining", "food_delivery", "groceries"], 400, "10% on dining, delivery, grocery")],
     src="https://www.hsbc.bank.in/credit-cards/products/rupay-cashback-credit-card/",
     notes="10% cashback on dining, food delivery and groceries, up to ₹400 a month; 1% on all other eligible spends including UPI.")
card("icici-coral-rupay", "ICICI Bank Coral RuPay Credit Card", "ICICI Bank", ["RuPay"], "rupay_upi",
     joining=500, annual=500, upi=True, verified=False,
     rr=rates(0),
     src="https://www.icicibank.com/personal-banking/cards/credit-card/coral-rupay-card",
     notes="UNVERIFIED: earns 2 points per ₹100 domestically including UPI, but ICICI doesn't publish a rupee value per point. ₹500 + GST fee. Age 21–65.")
card("hsbc-rupay-platinum", "HSBC RuPay Platinum Credit Card", "HSBC", ["RuPay"], "rupay_upi",
     joining=0, annual=0, upi=True, verified=False,
     rr=rates(0),
     src="https://www.hsbc.bank.in/credit-cards/products/rupay-platinum-credit-card/",
     notes="UNVERIFIED: earns points on UPI, but HSBC doesn't publish a rupee value per point on the page.")
card("jupiter-edge-csb", "Jupiter Edge CSB Bank RuPay Credit Card", "CSB Bank", ["RuPay"], "rupay_upi",
     joining=0, annual=0, upi=True, verified=False, partner="Jupiter",
     rr=rates(0),
     src="https://jupiter.money/edge-csb-bank-rupay-credit-card/",
     notes="UNVERIFIED: the program page renders entirely in script, so the current reward terms couldn't be read.")

# ---------------- Secured / FD-backed ----------------
card("idfc-first-wow", "IDFC FIRST WOW! Credit Card", "IDFC FIRST Bank", ["Visa"], "secured",
     joining=0, annual=0, secured=True, fd=20000, redemption=0.25, min_age=18,
     rr=rates(0.5, bills=0.125, fuel=0, upi=0),
     src="https://www.idfcfirstbank.com/credit-card/wow",
     notes="Backed by an IDFC FIRST fixed deposit of at least ₹20,000; no income proof or credit history needed. 4X points on online, offline and international spends, 1X on utilities and insurance (1X = 1 point per ₹200, 1 point = ₹0.25). Lifetime free.")
card("idfc-first-earn", "IDFC FIRST EA₹N Credit Card", "IDFC FIRST Bank", ["RuPay"], "secured",
     joining=499, annual=499, waiver=100000, secured=True, fd=5000, upi=True, min_age=18,
     rr=rates(0.5, fuel=0),
     src="https://www.idfcfirstbank.com/credit-card/secured-rupay-credit-card",
     notes="Virtual RuPay card against an FD of ₹5,000 or more. 1% cashback on UPI through the IDFC FIRST app, 0.5% through other UPI apps and on online spends (PERQ uses 0.5%). Joining fee is ₹0 under a limited-period offer; ₹499 otherwise, waived at ₹1 lakh a year.")
card("axis-insta-easy", "Axis Bank Insta Easy Credit Card", "Axis Bank", ["Visa"], "secured",
     joining=0, annual=0, secured=True, fd=15000, redemption=0.2,
     rr=rates(0.4, fuel=0, upi=0),
     src="https://www.axis.bank.in/cards/credit-card/credit-card-against-fixed-deposit",
     notes="Against an Axis FD of at least ₹15,000. 4 EDGE points per ₹200 (1 point = ₹0.20). No joining or annual fee.")
card("sbi-simplysave-advantage", "SimplySAVE Advantage SBI Card (FD-backed)", "SBI Card", ["Visa"], "secured",
     joining=499, annual=499, waiver=100000, secured=True, redemption=0.25,
     rr=rates(0.167, dining=1.667, groceries=1.667, fuel=0, upi=0),
     src="https://www.sbicard.com/en/personal/credit-cards/simplysave-sbi-card.html",
     notes="The secured variant of SimplySAVE (same page): same earn of 10 points per ₹150 on dining, movies, departmental stores and groceries. SBI doesn't publish the minimum FD on the page.")
card("kotak-811-dream-different", "Kotak 811 #DreamDifferent Credit Card", "Kotak Mahindra Bank", ["Visa"], "secured",
     joining=424, annual=0, secured=True, fd=10000, min_age=18, verified=False, ltf=False,
     rr=rates(0),
     src="https://www.kotak.com/en/personal-banking/cards/credit-cards/811-dream-different-credit-card.html",
     notes="UNVERIFIED reward rate: the page confirms an FD of ₹10,000 (181+ days), ₹500 joining fee incl. GST from 1 Sep 2026, no annual fee and age 18+, but not the current reward rate.")
card("federal-onecard", "OneCard", "Federal Bank / partner banks", ["Visa"], "secured",
     joining=0, annual=0, secured=True, fd=5000, verified=False, partner="OneCard",
     rr=rates(0),
     src="https://www.getonecard.app/",
     notes="UNVERIFIED: the program page confirms no joining, annual or redemption fees and 5X points on your top two categories, plus an FD-backed version from ₹5,000, but not the base earn rate or point value.")

# ---------------- Mid-tier rewards / travel ----------------
card("hdfc-regalia-gold", "HDFC Bank Regalia Gold Credit Card", "HDFC Bank", ["Visa", "Mastercard"], "mid_tier",
     joining=2500, annual=2500, waiver=400000, redemption=0.2, tier="premium",
     rr=rates(0.5, fuel=0, upi=0),
     src="https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/pdf/common/Credit-Cards/Regalia-Gold-Product-feature-change.pdf",
     notes="From 15 May 2026: 5 points per ₹200 on eligible spends. Valued at ₹0.20 a point (statement credit); worth more on SmartBuy flights and hotels. Quarterly and annual voucher milestones weren't restated in the 2026 change notice, so they aren't counted. Lounge: 3 domestic visits a quarter after ₹60,000 the previous quarter. Fee from HDFC MITC (Oct 2026).")
card("hdfc-tata-neu-infinity", "Tata Neu Infinity HDFC Bank Credit Card", "HDFC Bank", ["RuPay", "Visa"], "mid_tier",
     joining=1499, annual=1499, waiver=300000, upi=True, partner="Tata Neu",
     rr=rates(1.5, fuel=0, upi=0.5),
     caps={"groceries": 2000, "bills": 2000, "upi": 500},
     src="https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/tata-neu-infinity-credit-card/pdf/tata_neu_infinity_card_tnc.pdf",
     notes="5% NeuCoins on Tata brands (BigBasket, Croma, Air India, Taj…), 1.5% elsewhere including groceries, insurance and utilities (each capped at 2,000 a month). UPI: 0.5% via any app (+1% via the Tata Neu UPI ID), capped at 500 a month. 1 NeuCoin = ₹1 on Tata Neu. Nothing on fuel, rent, wallets.")
card("sbi-bpcl-octane", "BPCL SBI Card OCTANE", "SBI Card", ["Visa"], "mid_tier",
     joining=1499, annual=1499, waiver=200000, welcome=1500, redemption=0.25, partner="BPCL",
     rr=rates(0.25, fuel=6.25, dining=2.5, groceries=2.5, upi=0),
     caps={"fuel": 625},
     groups=[(["dining", "groceries"], 1875, "10X on dining, grocery, departmental")],
     src="https://www.sbicard.com/en/personal/credit-cards/bpcl-sbi-card-octane.html",
     notes="25 points per ₹100 at BPCL pumps (6.25%, plus 1% surcharge waiver) up to 2,500 points a cycle; 10 points per ₹100 on dining, departmental stores, groceries and movies up to 7,500 a month; 1 point per ₹100 elsewhere; 4 points = ₹1. Welcome 6,000 points (₹1,500) on paying the annual fee. Fuel rate assumes BPCL pumps.")
card("sbi-prime", "SBI Card PRIME", "SBI Card", ["Visa"], "mid_tier",
     joining=2999, annual=2999, waiver=300000, welcome=3000, redemption=0.25,
     rr=rates(0.5, dining=2.5, groceries=2.5, fuel=0, upi=0),
     milestones=[(200000, 4000), (500000, 7000)],
     src="https://www.sbicard.com/en/personal/credit-cards/sbi-card-prime.html",
     notes="10 points per ₹100 on dining, groceries, departmental stores and movies; 2 per ₹100 elsewhere except fuel; 4 points = ₹1. ₹1,000 Pizza Hut voucher per quarter with ₹50,000 spend (modelled as ₹4,000 at ₹2 lakh a year) and ₹7,000 voucher at ₹5 lakh. Welcome ₹3,000 voucher.")
card("axis-atlas", "Axis Bank Atlas Credit Card", "Axis Bank", ["Visa"], "mid_tier",
     joining=5000, annual=5000, welcome=2500, redemption=1, tier="premium",
     rr=rates(2, travel=5, bills=0, fuel=0, upi=0),
     milestones=[(300000, 2500), (750000, 2500), (1500000, 5000)],
     src="https://www.axis.bank.in/cards/credit-card/axis-bank-atlas-credit-card",
     notes="5 EDGE Miles per ₹100 on direct airline, hotel and Travel EDGE spends; 2 per ₹100 elsewhere; Axis states 1 EDGE Mile = ₹1. Milestones 2,500 miles at ₹3 lakh, +2,500 at ₹7.5 lakh, +5,000 at ₹15 lakh. No miles on utilities, telecom, fuel, insurance, wallets. No spend-based fee waiver.")
card("sbi-elite", "SBI Card ELITE", "SBI Card", ["Visa"], "mid_tier",
     joining=4999, annual=4999, waiver=1000000, welcome=5000, redemption=0.25, tier="premium",
     rr=rates(0.5, dining=2.5, groceries=2.5, fuel=0, upi=0),
     milestones=[(300000, 2500), (400000, 2500), (500000, 3750), (800000, 3750)],
     src="https://www.sbicard.com/en/personal/credit-cards/sbi-card-elite.html",
     notes="5X (10 points per ₹100) on dining, departmental stores and groceries; 2 per ₹100 elsewhere except fuel; 4 points = ₹1. Bonus points worth ₹2,500 at ₹3 lakh and ₹4 lakh, ₹3,750 at ₹5 lakh and ₹8 lakh. Welcome ₹5,000 voucher. Fee waived at ₹10 lakh.")
card("hsbc-travelone", "HSBC TravelOne Credit Card", "HSBC", ["Visa"], "mid_tier",
     joining=4999, annual=4999, verified=False, min_age=18, min_income=50000,
     rr=rates(0),
     src="https://www.hsbc.co.in/credit-cards/products/travelone/",
     notes="UNVERIFIED: 4 points per ₹100 on flights, travel and foreign currency, 2 elsewhere, but points convert to airline/hotel partners with no stated rupee value. Needs ₹6 lakh a year (salaried) or ₹12 lakh (self-employed).")
card("amex-membership-rewards", "American Express Membership Rewards Credit Card", "American Express", ["Amex"], "mid_tier",
     joining=1000, annual=4500, waiver=150000, verified=False, min_income=37500,
     rr=rates(0),
     src="https://www.americanexpress.com/in/credit-cards/membership-rewards-card/",
     notes="UNVERIFIED: Amex doesn't publish a rupee value for Membership Rewards points. 1,000 bonus points for ₹20,000 a month; none on fuel, insurance or utilities. Needs ₹4.5 lakh a year salaried or ₹6 lakh self-employed.")

assert len(cards) == 40, len(cards)
assert len({c["id"] for c in cards}) == 40
here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "cards.json"), "w") as f:
    json.dump(cards, f, indent=2, ensure_ascii=False)
    f.write("\n")
v = sum(c["verified"] for c in cards)
print(f"Wrote {len(cards)} cards ({v} verified, {len(cards) - v} unverified)")
from collections import Counter
print(Counter(c["bucket"] for c in cards))

# ---- CARDS_README.md (generated alongside cards.json) ----
BUCKETS = [("secured", "Secured / FD-backed"), ("lifetime_free", "Lifetime free or ₹0 fee"),
           ("entry_cashback", "Entry cashback and co-brand"), ("rupay_upi", "RuPay cards on UPI"),
           ("mid_tier", "Mid-tier rewards and travel")]
lines = [
    "# Card catalogue (40 cards)",
    "",
    "_Generated by `build-cards.py`, do not edit by hand._ Terms checked on **" + CHECKED + "** from each",
    "issuer's own product page, T&C PDF or MITC (linked below). Reading notes: `research-notes.md`.",
    "",
    f"**{v} verified** cards are ranked. **{len(cards) - v} unverified** cards are stored but excluded from",
    "ranking until someone confirms their terms on the bank's page (reason in the Notes column).",
    "",
    "How the numbers are modelled:",
    "- Reward rates are % value back per category, converted from points at the bank's stated or most",
    "  conservative ₹ value (statement credit where the bank gives one).",
    "- A merchant-specific rate applies to a whole category only when that merchant is one of the",
    "  category's two main platforms (Swiggy/Zomato, Amazon/Flipkart) or for fuel co-brands at their",
    "  own pumps. Otherwise the base rate is used. Conditions that can't be modelled use the lower rate.",
    "- Caps are ₹ of reward per month; shared caps cover several categories. Fees exclude 18% GST",
    "  (the finance engine adds it). Paid memberships (Amazon Prime, Kiwi Neon) are not assumed.",
    "",
]
for key, title in BUCKETS:
    group = [c for c in cards if c["bucket"] == key]
    lines += [f"## {title} ({len(group)})", "", "| Card | Issuer | Network | Fee (join / annual) | Verified | Source |", "|---|---|---|---|---|---|"]
    for c in group:
        fee = "Lifetime free" if c["lifetimeFree"] else f"₹{c['joiningFee']:,} / ₹{c['annualFee']:,}"
        lines.append(f"| {c['name']} | {c['issuer']} | {', '.join(c['networks'])} | {fee} | {'yes' if c['verified'] else '**no**'} | [link]({c['sourceUrl']}) |")
    lines.append("")
lines += ["## Notes per card", ""]
for c in cards:
    lines.append(f"- **{c['name']}** (`{c['id']}`): {c['rewardNotes']}")
with open(os.path.join(here, "CARDS_README.md"), "w") as f:
    f.write("\n".join(lines) + "\n")
print("Wrote CARDS_README.md")
