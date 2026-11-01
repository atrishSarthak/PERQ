import type { SyntheticSpec } from "./synthetic";

// The committed synthetic fixtures (handoff §13): three layouts, fictional
// holders and card numbers, passwords in the usual "NAME4 + DDMM" format.
export const FIXTURE_SPECS: SyntheticSpec[] = [
  {
    seed: 101, layout: "A", issuer: "HDFC Bank", cardName: "Millennia", holder: "ARJUN MEHTA",
    last4: "4821", statementDate: "2026-10-15", creditLimit: 150000, previousBalance: 18240.5,
    password: "ARJU1503", transactionCount: 26,
  },
  {
    seed: 202, layout: "B", issuer: "SBI Card", cardName: "CASHBACK SBI Card", holder: "PRIYA NAIR",
    last4: "7710", statementDate: "2026-10-22", creditLimit: 80000, previousBalance: 12300,
    password: "PRIY2208", transactionCount: 18, withLateFee: true, withInterest: true,
  },
  {
    seed: 303, layout: "C", issuer: "Axis Bank", cardName: "Axis Bank ACE Credit Card", holder: "ROHAN IYER",
    last4: "0093", statementDate: "2026-10-05", creditLimit: 120000, previousBalance: 9450.75,
    password: "ROHA0510", transactionCount: 48, withPoints: true,
  },
];
