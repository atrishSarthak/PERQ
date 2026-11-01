import type { CatalogCard } from "@perq/shared";
import type { Card as CardRow, NewCard } from "./types";

// Maps between `cards` rows and the shared CatalogCard shape. One place, so
// the seed script, the API and scoring never disagree about column meaning.

export function catalogCardToRow(card: CatalogCard, sourceUpdatedAt: Date): NewCard {
  return {
    id: card.id,
    name: card.name,
    issuer: card.issuer,
    network: card.networks[0]!, // legacy single-network column; `networks` is authoritative
    networks: card.networks,
    bucket: card.bucket,
    tier: card.tier,
    cardType: card.cardType,
    fdMinAmount: card.fdMinAmount,
    lifetimeFree: card.lifetimeFree,
    upiEnabled: card.upiEnabled,
    joiningFee: String(card.joiningFee),
    annualFee: String(card.annualFee),
    feeWaiverSpend: card.feeWaiverSpend,
    feeWaiverCondition:
      card.feeWaiverSpend === null ? null : `Renewal fee waived on annual spends of ₹${card.feeWaiverSpend.toLocaleString("en-IN")}`,
    waiverExcludes: card.waiverExcludes,
    rewardRates: card.rewardRates,
    rewardCaps: card.rewardCaps,
    capGroups: card.capGroups,
    rewardNotes: card.rewardNotes,
    milestoneBenefits: card.milestones,
    welcomeBenefitValue: card.welcomeBenefitValue,
    redemptionValue: card.redemptionValue === null ? null : String(card.redemptionValue),
    coBrandPartner: card.coBrandPartner,
    minAge: card.minAge,
    eligibleOccupations: card.eligibleOccupations,
    minMonthlyIncome: card.minMonthlyIncome,
    minIncomeEligibility: card.minMonthlyIncome === null ? null : String(card.minMonthlyIncome * 12),
    sourceUrl: card.sourceUrl,
    sourceUrls: [card.sourceUrl],
    verified: card.verified,
    emiRewards: card.emiRewards,
    origin: "seeded",
    searchBucketKey: null,
    status: "active",
    sourceUpdatedAt,
  };
}

export function rowToCatalogCard(row: CardRow): CatalogCard {
  return {
    id: row.id,
    name: row.name,
    issuer: row.issuer,
    networks: (row.networks.length ? row.networks : [row.network]) as CatalogCard["networks"],
    bucket: (row.bucket ?? "entry_cashback") as CatalogCard["bucket"],
    tier: row.tier,
    cardType: row.cardType as CatalogCard["cardType"],
    fdMinAmount: row.fdMinAmount,
    lifetimeFree: row.lifetimeFree,
    upiEnabled: row.upiEnabled,
    joiningFee: Number(row.joiningFee),
    annualFee: Number(row.annualFee),
    feeWaiverSpend: row.feeWaiverSpend,
    waiverExcludes: row.waiverExcludes as CatalogCard["waiverExcludes"],
    rewardRates: row.rewardRates as CatalogCard["rewardRates"],
    rewardCaps: (row.rewardCaps ?? {}) as CatalogCard["rewardCaps"],
    capGroups: (row.capGroups ?? []) as CatalogCard["capGroups"],
    rewardNotes: row.rewardNotes ?? "",
    milestones: (row.milestoneBenefits ?? []) as CatalogCard["milestones"],
    welcomeBenefitValue: row.welcomeBenefitValue,
    redemptionValue: row.redemptionValue === null ? null : Number(row.redemptionValue),
    coBrandPartner: row.coBrandPartner,
    minAge: row.minAge,
    eligibleOccupations: row.eligibleOccupations as CatalogCard["eligibleOccupations"],
    minMonthlyIncome: row.minMonthlyIncome,
    sourceUrl: row.sourceUrl ?? "",
    sourceUpdatedAt: row.sourceUpdatedAt.toISOString().slice(0, 10),
    verified: row.verified,
    emiRewards: row.emiRewards,
  };
}
