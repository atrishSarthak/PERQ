import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { ResultsCard } from "@/app/(shell)/results/types";
import type { QuizAnswers } from "@perq/scoring-engine";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { ResultsView } = await import("@/app/(shell)/results/ResultsView");
const { MimirChatProvider } = await import("@/app/(shell)/mimir/MimirChatContext");

// ResultCard's "Learn more" button uses useMimirChat(), so every render
// needs a MimirChatProvider ancestor, same as the real (shell) layout.
function renderResultsView(props: React.ComponentProps<typeof ResultsView>) {
  return render(
    <MimirChatProvider>
      <ResultsView {...props} />
    </MimirChatProvider>
  );
}

function makeCard(overrides: Partial<ResultsCard> = {}): ResultsCard {
  return {
    cardId: "card-1",
    name: "Test Card",
    issuer: "TestBank",
    network: "Visa",
    annualFee: 500,
    joiningFee: 0,
    rewardRates: { dining: 0.05 },
    loungeAccess: null,
    feeWaiverCondition: null,
    recommendation: { rank: 1, score: 100, explanation: "Great for dining" },
    arsenalStatus: undefined,
    ...overrides,
  };
}

const mockAnswers: QuizAnswers = {
  heldCardIds: [],
  annualIncome: "6-10l",
  flightFrequency: "never",
  hotelFrequency: "never",
  gymMembership: "none",
  foodDeliverySpend: "1-3k",
  ecommerceSpend: "1-3k",
  grocerySpend: "1-3k",
  diningOutSpend: "1-3k",
  fuelSpend: "1-3k",
  recurringBillsByCard: "no",
  feeTolerant: true,
  priorityCategories: [],
};

describe("ResultsView — DR8 mobile filter drawer", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  it("does not show the drawer dialog by default", () => {
    renderResultsView({ cards: [makeCard()], answers: mockAnswers, cardHolderName: "Taylor" });
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("opens the drawer on clicking the mobile Filters button", () => {
    renderResultsView({ cards: [makeCard()], answers: mockAnswers, cardHolderName: "Taylor" });
    fireEvent.click(screen.getByText(/^Filters/));
    expect(screen.getByRole("dialog", { name: "Filters" })).toBeInTheDocument();
  });

  it("closes the drawer on Done", () => {
    renderResultsView({ cards: [makeCard()], answers: mockAnswers, cardHolderName: "Taylor" });
    fireEvent.click(screen.getByText(/^Filters/));
    fireEvent.click(screen.getByText("Done"));
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("closes the drawer on backdrop click", () => {
    renderResultsView({ cards: [makeCard()], answers: mockAnswers, cardHolderName: "Taylor" });
    fireEvent.click(screen.getByText(/^Filters/));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    const backdrop = dialog.previousElementSibling as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByRole("dialog", { name: "Filters" })).not.toBeInTheDocument();
  });

  it("the drawer's filter controls affect the same result set as the desktop sidebar (shared state, not a separate copy)", () => {
    renderResultsView({
      cards: [
        makeCard({ cardId: "a", network: "Visa" }),
        makeCard({ cardId: "b", network: "RuPay", name: "Card B" }),
      ],
      answers: mockAnswers,
      cardHolderName: "Taylor",
    });
    fireEvent.click(screen.getByText(/^Filters/));
    // Two "RuPay" buttons exist (desktop sidebar is present in the DOM,
    // just visually hidden via md:hidden) — click the one inside the drawer.
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    const rupayButtons = screen.getAllByText("RuPay");
    const drawerRupay = rupayButtons.find((el) => dialog.contains(el))!;
    fireEvent.click(drawerRupay);

    // ResultCard renders "{issuer} {name}" as one combined text node.
    expect(screen.getByText(/Card B/)).toBeInTheDocument();
    expect(screen.queryByText(/TestBank Test Card/)).not.toBeInTheDocument();
  });

  it("shows the active filter count on the mobile Filters button", () => {
    renderResultsView({ cards: [makeCard()], answers: mockAnswers, cardHolderName: "Taylor" });
    fireEvent.click(screen.getByText(/^Filters/));
    const dialog = screen.getByRole("dialog", { name: "Filters" });
    const visaButtons = screen.getAllByText("Visa");
    const drawerVisa = visaButtons.find((el) => dialog.contains(el))!;
    fireEvent.click(drawerVisa);
    fireEvent.click(screen.getByText("Done"));

    expect(screen.getByText("Filters (1)")).toBeInTheDocument();
  });
});
