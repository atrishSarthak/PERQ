import PDFDocument from "pdfkit";
import type { ExtractedStatement, ExtractedTransaction } from "@perq/shared";

// Synthetic credit-card statements (handoff §13). NEVER real data: every
// name, number and merchant line is generated from a seed. Three layouts
// imitate common Indian formats:
//   A "summary box + table"  (HDFC-like): summary block on top, one table, "Cr" suffix
//   B "two-column"           (SBI-like):  account summary left, card details right, Debit/Credit columns
//   C "multi-page + points"  (Axis-like): long table over several pages, reward points block at the end
// Each statement reconciles by construction (§5.4), and the generator also
// returns the exact JSON extraction should produce.

export type Layout = "A" | "B" | "C";

export interface SyntheticSpec {
  seed: number;
  layout: Layout;
  issuer: string;
  cardName: string;
  holder: string; // fictional
  last4: string;
  statementDate: string; // ISO
  creditLimit: number;
  previousBalance: number;
  password: string;
  transactionCount: number;
  withPoints?: boolean;
  withLateFee?: boolean;
  withInterest?: boolean;
  /** Override: the exact transactions to print (demo loader). */
  transactions?: ExtractedTransaction[];
}

export interface SyntheticStatement {
  spec: SyntheticSpec;
  expected: ExtractedStatement;
}

// Small seeded PRNG (mulberry32) so fixtures are reproducible.
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Merchant descriptors as they really appear on Indian statements (gateway
// prefixes, cities, reference numbers). [descriptor, min ₹, max ₹, intl?]
export const MERCHANT_POOL: [string, number, number, boolean?][] = [
  ["SWIGGY*ORDER BANGALORE", 180, 950],
  ["PAYU*ZOMATO GURGAON", 200, 1100],
  ["ZOMATO ONLINE ORDER", 150, 800],
  ["AMAZON PAY INDIA PRIVA BANGALORE", 300, 4500],
  ["FLIPKART INTERNET PVT LTD", 400, 6000],
  ["MYNTRA DESIGNS BANGALORE", 600, 3500],
  ["UPI-BLINKIT-COMMERCE PVT LTD", 120, 900],
  ["ZEPTO MARKETPLACE PVT LTD MUMBAI", 150, 1200],
  ["BIGBASKET INNOVATIVE RETAIL", 500, 2500],
  ["UPI-SWIGGY INSTAMART-6378221", 200, 1100],
  ["IOCL PETROL PUMP KORAMANGALA", 500, 2500],
  ["HPCL FUEL STATION PUNE", 500, 2200],
  ["AIRTEL PAYMENTS BANK MUMBAI", 299, 999],
  ["BESCOM ELECTRICITY BILL", 700, 2600],
  ["JIO PREPAID RECHARGE", 239, 749],
  ["NETFLIX.COM SINGAPORE", 649, 649, true],
  ["SPOTIFY AB STOCKHOLM", 119, 119, true],
  ["MAKEMYTRIP INDIA PVT LTD", 2500, 9000],
  ["IRCTC E TICKETING NEW DELHI", 500, 2400],
  ["UPI-CHAI POINT-9876543210@YBL", 60, 250],
  ["UPI-RAJU KIRANA STORES-PAYTM", 80, 600],
  ["THIRD WAVE COFFEE BANGALORE", 250, 700],
  ["PVR CINEMAS FORUM MALL", 300, 1200],
  ["APOLLO PHARMACY HSR LAYOUT", 150, 1800],
  ["RAZ*URBAN COMPANY", 400, 1500],
];

/** Builds a reconciling statement (data only) from a spec. */
export function buildSyntheticStatement(spec: SyntheticSpec): SyntheticStatement {
  const r = rng(spec.seed);
  const periodEnd = spec.statementDate;
  const periodStart = addDays(periodEnd, -30);
  const dueDate = addDays(periodEnd, 18);
  const between = (lo: number, hi: number) => round2(lo + r() * (hi - lo));
  const dayIn = () => addDays(periodStart, 1 + Math.floor(r() * 29));

  let txns: ExtractedTransaction[] = spec.transactions ? [...spec.transactions] : [];
  let intlTotal = 0;
  if (!spec.transactions) {
    for (let i = 0; i < spec.transactionCount; i++) {
      const [desc, lo, hi, intl] = MERCHANT_POOL[Math.floor(r() * MERCHANT_POOL.length)]!;
      const amount = lo === hi ? round2(lo * (intl ? 84.37 / 80 : 1)) : between(lo, hi);
      if (intl) intlTotal += amount;
      txns.push({ date: dayIn(), description: desc, amount, direction: "debit" });
    }
    // A refund of an earlier shopping spend, a cashback credit and one line
    // that (wrongly) prints a full card number (must be stripped on save, §12).
    txns.push({ date: dayIn(), description: "REFUND AMAZON PAY INDIA PRIVA", amount: between(250, 900), direction: "credit" });
    txns.push({ date: dayIn(), description: "CASHBACK CREDITED", amount: between(40, 160), direction: "credit" });
    txns.push({ date: dayIn(), description: "AUTOPAY SI 4532015112830366 GOOGLE PLAY", amount: between(99, 199), direction: "debit" });
  } else {
    intlTotal = txns.filter((t) => /SINGAPORE|STOCKHOLM|USA|LONDON/.test(t.description)).reduce((s, t) => s + t.amount, 0);
  }

  // Payment of (most of) last month's balance.
  if (spec.previousBalance > 0) {
    const paid = spec.withInterest ? round2(spec.previousBalance * 0.4) : spec.previousBalance;
    txns.push({ date: addDays(periodStart, 3), description: "PAYMENT RECEIVED - THANK YOU", amount: paid, direction: "credit" });
  }

  // Fees and GST (18%) lines.
  const feeLines: ExtractedTransaction[] = [];
  if (intlTotal > 0) {
    const markup = round2(intlTotal * 0.035);
    feeLines.push({ date: periodEnd, description: "MARKUP FEE ON INTL TXN", amount: markup, direction: "debit" });
  }
  if (spec.withLateFee) feeLines.push({ date: addDays(periodStart, 2), description: "LATE PAYMENT FEE", amount: 500, direction: "debit" });
  const feeBase = feeLines.reduce((s, l) => s + l.amount, 0);
  if (feeBase > 0) feeLines.push({ date: periodEnd, description: "IGST ON FEES @18%", amount: round2(feeBase * 0.18), direction: "debit" });

  const interestLines: ExtractedTransaction[] = [];
  if (spec.withInterest) {
    interestLines.push({ date: periodEnd, description: "FINANCE CHARGES", amount: round2(spec.previousBalance * 0.6 * 0.0375), direction: "debit" });
  }

  // Word boundaries matter: "COFFEE" is a purchase, not a fee.
  const isFeeOrInterest = (d: string) => /\bFEES?\b|\bI?GST\b|FINANCE CHARGE/i.test(d);
  const purchases = txns.filter((t) => t.direction === "debit" && !isFeeOrInterest(t.description));
  const credits = txns.filter((t) => t.direction === "credit");
  txns = [...txns, ...feeLines, ...interestLines].sort((a, b) => a.date.localeCompare(b.date) || a.description.localeCompare(b.description));

  const sum = (l: ExtractedTransaction[]) => round2(l.reduce((s, t) => s + t.amount, 0));
  const paymentsCredits = sum(credits);
  const purchasesDebits = sum(purchases);
  const feesCharges = sum(feeLines);
  const financeCharges = sum(interestLines);
  const totalDue = round2(Math.max(0, spec.previousBalance - paymentsCredits + purchasesDebits + feesCharges + financeCharges));
  const minimumDue = round2(Math.max(Math.min(200, totalDue), totalDue * 0.05));

  const withPoints = spec.withPoints ?? spec.layout === "C";
  const earned = Math.floor(purchasesDebits / 100) * 2;
  const points = withPoints
    ? {
        opening: 3200 + Math.floor(r() * 800),
        earned,
        redeemed: 0,
        closing: 0,
        expiring: 400,
        expiryDate: addDays(periodEnd, 45),
      }
    : null;
  if (points) points.closing = points.opening + points.earned - points.redeemed;

  const expected: ExtractedStatement = {
    issuer: spec.issuer,
    cardName: spec.cardName,
    last4: spec.last4,
    statementDate: periodEnd,
    periodStart,
    periodEnd,
    dueDate,
    totalDue,
    minimumDue,
    previousBalance: spec.previousBalance,
    paymentsCredits,
    purchasesDebits,
    feesCharges,
    financeCharges,
    creditLimit: spec.creditLimit,
    availableLimit: round2(Math.max(0, spec.creditLimit - totalDue)),
    points,
    transactions: txns,
  };
  return { spec, expected };
}

// ---- Rendering -------------------------------------------------------------

const rs = (n: number) =>
  n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function dmy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dMonY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** Renders the statement as a password-protected PDF, in memory. */
export async function renderSyntheticPdf(s: SyntheticStatement): Promise<Uint8Array> {
  const { spec, expected: e } = s;
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    userPassword: spec.password,
    ownerPassword: `${spec.password}-owner`,
    pdfVersion: "1.7",
    info: { Title: `${spec.issuer} credit card statement (synthetic)` },
  });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on("end", () => resolve()));

  doc.font("Helvetica-Bold").fontSize(15).text(`${spec.issuer.toUpperCase()}`);
  doc.font("Helvetica").fontSize(9).fillColor("#555").text("SYNTHETIC TEST STATEMENT - NOT A REAL ACCOUNT");
  doc.fillColor("#000").moveDown(0.5);

  if (spec.layout === "A") renderA(doc, spec, e);
  else if (spec.layout === "B") renderB(doc, spec, e);
  else renderC(doc, spec, e);

  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

type Doc = InstanceType<typeof PDFDocument>;

function line(doc: Doc, cols: [string, number, ("left" | "right")?][], y?: number) {
  const top = y ?? doc.y;
  for (const [text, x, align] of cols) {
    if (align === "right") doc.text(text, x - 120, top, { width: 120, align: "right", lineBreak: false });
    else doc.text(text, x, top, { lineBreak: false });
  }
  doc.y = top + 14;
  doc.x = 40;
}

function renderA(doc: Doc, spec: SyntheticSpec, e: ExtractedStatement) {
  doc.fontSize(10).text(`${spec.cardName} Credit Card Statement`);
  doc.text(`Name : ${spec.holder}`);
  doc.text(`Card No : XXXX XXXX XXXX ${spec.last4}`);
  doc.text(`Statement Date : ${dmy(e.statementDate!)}`);
  doc.text(`Statement Period : ${dmy(e.periodStart!)} To ${dmy(e.periodEnd!)}`);
  doc.text(`Payment Due Date : ${dmy(e.dueDate!)}`);
  doc.text(`Credit Limit : ${rs(e.creditLimit!)}   Available Credit Limit : ${rs(e.availableLimit!)}`);
  doc.moveDown(0.6).font("Helvetica-Bold").text("Account Summary").font("Helvetica");
  doc.text(`Opening Balance : Rs. ${rs(e.previousBalance!)}`);
  doc.text(`Payment/Credits : Rs. ${rs(e.paymentsCredits!)}`);
  doc.text(`Purchase/Debits : Rs. ${rs(e.purchasesDebits!)}`);
  doc.text(`Fees & Charges : Rs. ${rs(e.feesCharges!)}`);
  doc.text(`Finance Charges : Rs. ${rs(e.financeCharges!)}`);
  doc.text(`Total Dues : Rs. ${rs(e.totalDue!)}`);
  doc.text(`Minimum Amount Due : Rs. ${rs(e.minimumDue!)}`);
  doc.moveDown(0.6).font("Helvetica-Bold");
  line(doc, [["Date", 40], ["Transaction Description", 120], ["Amount (in Rs.)", 555, "right"]]);
  doc.font("Helvetica");
  for (const t of e.transactions) {
    if (doc.y > 780) doc.addPage();
    line(doc, [[dmy(t.date), 40], [t.description, 120], [`${rs(t.amount)}${t.direction === "credit" ? " Cr" : ""}`, 555, "right"]]);
  }
}

function renderB(doc: Doc, spec: SyntheticSpec, e: ExtractedStatement) {
  const top = doc.y;
  doc.fontSize(10).font("Helvetica-Bold").text("ACCOUNT SUMMARY", 40, top);
  doc.font("Helvetica");
  const left: [string, number][] = [
    ["Previous Balance", e.previousBalance!],
    ["Payments & Other Credits", e.paymentsCredits!],
    ["Purchases & Other Debits", e.purchasesDebits!],
    ["Fee, Taxes & Charges", e.feesCharges!],
    ["Finance Charges", e.financeCharges!],
    ["Total Amount Due", e.totalDue!],
    ["Minimum Amount Due", e.minimumDue!],
  ];
  left.forEach(([k, v], i) => {
    doc.text(k, 40, top + 16 + i * 14, { lineBreak: false });
    doc.text(rs(v), 160, top + 16 + i * 14, { width: 110, align: "right", lineBreak: false });
  });
  const right: [string, string][] = [
    ["Card", `${spec.cardName}`],
    ["Card Number", `XXXX XXXX XXXX ${spec.last4}`],
    ["Name", spec.holder],
    ["Statement Date", dMonY(e.statementDate!)],
    ["For the period", `${dMonY(e.periodStart!)} - ${dMonY(e.periodEnd!)}`],
    ["Payment Due Date", dMonY(e.dueDate!)],
    ["Total Credit Limit", rs(e.creditLimit!)],
    ["Available Credit Limit", rs(e.availableLimit!)],
  ];
  right.forEach(([k, v], i) => {
    doc.text(`${k}:`, 310, top + 16 + i * 14, { lineBreak: false });
    doc.text(v, 420, top + 16 + i * 14, { lineBreak: false });
  });
  doc.x = 40;
  doc.y = top + 16 + right.length * 14 + 14;
  doc.font("Helvetica-Bold");
  line(doc, [["Date", 40], ["Transaction Details", 110], ["Debit", 470, "right"], ["Credit", 555, "right"]]);
  doc.font("Helvetica");
  for (const t of e.transactions) {
    if (doc.y > 780) doc.addPage();
    line(doc, [
      [dMonY(t.date), 40],
      [t.description, 110],
      [t.direction === "debit" ? rs(t.amount) : "", 470, "right"],
      [t.direction === "credit" ? rs(t.amount) : "", 555, "right"],
    ]);
  }
}

function renderC(doc: Doc, spec: SyntheticSpec, e: ExtractedStatement) {
  doc.fontSize(10).text(`${spec.cardName}`);
  doc.text(`Card Number: ${"*".repeat(12)}${spec.last4}   Customer: ${spec.holder}`);
  doc.text(`Statement Generation Date: ${dmy(e.statementDate!)}   Payment Due Date: ${dmy(e.dueDate!)}`);
  doc.text(`Statement Period: ${dmy(e.periodStart!)} - ${dmy(e.periodEnd!)}`);
  doc.moveDown(0.5);
  doc.text(
    `Previous Balance ${rs(e.previousBalance!)} - Payments ${rs(e.paymentsCredits!)} + Purchases ${rs(e.purchasesDebits!)} + Fees ${rs(
      e.feesCharges!
    )} + Finance Charges ${rs(e.financeCharges!)} = Total Payment Due ${rs(e.totalDue!)}`,
    { width: 515 }
  );
  doc.text(`Minimum Payment Due: ${rs(e.minimumDue!)}   Credit Limit: ${rs(e.creditLimit!)}   Available Credit Limit: ${rs(e.availableLimit!)}`);
  doc.moveDown(0.6).font("Helvetica-Bold");
  line(doc, [["DATE", 40], ["TRANSACTION DETAILS", 110], ["AMOUNT (Rs.)", 555, "right"]]);
  doc.font("Helvetica");
  let rows = 0;
  for (const t of e.transactions) {
    // Force a page break every 22 rows so the table spans pages (§13 layout C).
    if (rows > 0 && rows % 22 === 0) {
      doc.addPage();
      doc.font("Helvetica-Bold");
      line(doc, [["DATE", 40], ["TRANSACTION DETAILS", 110], ["AMOUNT (Rs.)", 555, "right"]]);
      doc.font("Helvetica");
    }
    line(doc, [[dmy(t.date), 40], [t.description, 110], [`${rs(t.amount)} ${t.direction === "credit" ? "Cr" : "Dr"}`, 555, "right"]]);
    rows++;
  }
  if (e.points) {
    doc.moveDown(1).font("Helvetica-Bold").text("REWARD POINTS SUMMARY", 40).font("Helvetica");
    doc.text(`Opening Balance: ${e.points.opening}   Earned: ${e.points.earned}   Redeemed: ${e.points.redeemed}   Closing Balance: ${e.points.closing}`);
    doc.text(`Points expiring: ${e.points.expiring} on ${dmy(e.points.expiryDate!)}`);
  }
}
