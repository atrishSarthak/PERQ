import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { HomeDashboard } = await import("@/app/(shell)/home/HomeDashboard");
const { MimirChatProvider } = await import("@/app/(shell)/mimir/MimirChatContext");
const { MimirChatPanel } = await import("@/app/(shell)/mimir/MimirChatPanel");

const cardOptions = [
  { value: "card-1", label: "Test Bank Test Card", name: "Test Card", issuer: "Test Bank", network: "Visa" },
];

function renderDashboard(props: Partial<React.ComponentProps<typeof HomeDashboard>> = {}) {
  return render(
    <MimirChatProvider>
      <HomeDashboard
        greeting="Good morning, Taylor"
        dateString="Sunday, August 16"
        quizTaken={false}
        topPick={null}
        arsenalCards={[]}
        cardOptions={cardOptions}
        atGoalSearchDailyLimit={false}
        goalSearchDailyLimit={3}
        {...props}
      />
      <MimirChatPanel />
    </MimirChatProvider>
  );
}

describe("HomeDashboard", () => {
  it("renders the greeting and date", () => {
    renderDashboard();
    expect(screen.getByText("Good morning, Taylor")).toBeInTheDocument();
    expect(screen.getByText("Sunday, August 16")).toBeInTheDocument();
  });

  it("shows the take-the-quiz CTA when the quiz hasn't been taken", () => {
    renderDashboard({ quizTaken: false, topPick: null });
    expect(screen.getByText("Take the quiz")).toBeInTheDocument();
    expect(screen.queryByText("Top pick from MIMIR")).not.toBeInTheDocument();
  });

  it("opens the real QuizWizard modal on Take the quiz, starting at question 1", () => {
    renderDashboard({ quizTaken: false, topPick: null });
    fireEvent.click(screen.getByText("Take the quiz"));
    expect(screen.getByText("Question 1 of 13")).toBeInTheDocument();
  });

  it("shows a real top-pick preview when the quiz was taken and a #1 card exists", () => {
    renderDashboard({
      quizTaken: true,
      topPick: {
        cardId: "card-1",
        issuer: "HDFC Bank",
        name: "Swiggy HDFC Bank Credit Card",
        network: "Visa",
        explanation: "Your dining spend makes this the obvious pick.",
      },
    });
    expect(screen.getByText("Top pick from MIMIR")).toBeInTheDocument();
    expect(screen.getByText("HDFC Bank Swiggy HDFC Bank Credit Card")).toBeInTheDocument();
    expect(screen.getByText(/Your dining spend makes this the obvious pick/)).toBeInTheDocument();
    expect(screen.getByText("See all recommendations →")).toBeInTheDocument();
    expect(screen.queryByText("Take the quiz")).not.toBeInTheDocument();
  });

  it("shows a no-eligible-cards message when the quiz was taken but there's no top pick", () => {
    renderDashboard({ quizTaken: true, topPick: null });
    expect(screen.getByText(/income eligibility/)).toBeInTheDocument();
    expect(screen.queryByText("Take the quiz")).not.toBeInTheDocument();
  });

  it("shows the empty-arsenal state with a link into /results when there are no held cards", () => {
    renderDashboard({ arsenalCards: [] });
    expect(screen.getByText("No cards added yet")).toBeInTheDocument();
    expect(screen.getByText("Add your first card")).toHaveAttribute("href", "/results");
  });

  it("renders each held card in the arsenal grid when cards exist", () => {
    renderDashboard({
      arsenalCards: [
        { cardId: "card-1", issuer: "HDFC Bank", name: "Regalia", network: "Visa" },
        { cardId: "card-2", issuer: "Axis Bank", name: "Ace", network: "Visa" },
      ],
    });
    expect(screen.getByText("2 cards")).toBeInTheDocument();
    expect(screen.getByText("Regalia")).toBeInTheDocument();
    expect(screen.getByText("Ace")).toBeInTheDocument();
    expect(screen.queryByText("No cards added yet")).not.toBeInTheDocument();
  });

  it("opens the shared MIMIR chat panel when Ask MIMIR anything is clicked", () => {
    renderDashboard();
    expect(screen.queryByRole("dialog", { name: "Chat with MIMIR" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Ask MIMIR anything"));
    expect(screen.getByRole("dialog", { name: "Chat with MIMIR" })).toBeInTheDocument();
  });

  it("still renders the static coming-soon widget for Feature 2 (Chrome extension)", () => {
    renderDashboard();
    expect(screen.getByText("MIMIR for Chrome")).toBeInTheDocument();
    expect(screen.getByText("SOON")).toBeInTheDocument();
  });

  it("renders the live Goal-Based Advisor widget as a link into /goal", () => {
    renderDashboard();
    const widget = screen.getByText("Ask MIMIR where to buy it").closest("a");
    expect(widget).toHaveAttribute("href", "/goal");
    expect(screen.queryByText("COMING SOON")).not.toBeInTheDocument();
  });

  it("shows a plain rate-limit message on the Goal Advisor widget when the daily cap is hit", () => {
    renderDashboard({ atGoalSearchDailyLimit: true });
    expect(screen.getByText(/today.s 3 searches/)).toBeInTheDocument();
  });

  it("does not show a rate-limit message when under the daily cap", () => {
    renderDashboard({ atGoalSearchDailyLimit: false });
    expect(screen.queryByText(/today.s 3 searches/)).not.toBeInTheDocument();
  });
});
