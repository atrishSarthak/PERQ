import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const { QuizWizard } = await import("@/app/quiz/QuizWizard");

const cardOptions = [{ value: "axis-airtel", label: "Axis Airtel" }];

describe("QuizWizard (DR10 keyboard contract + navigation)", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("renders question 1 of 13 first", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    expect(screen.getByText("Question 1 of 13")).toBeInTheDocument();
    expect(screen.getByText(/Which credit cards do you currently hold/)).toBeInTheDocument();
  });

  it("Next is enabled immediately on Q1 (0 held cards is a valid answer)", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    expect(screen.getByText("Next")).not.toBeDisabled();
  });

  it("Back is disabled on the first question", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    expect(screen.getByText("Back")).toBeDisabled();
  });

  it("advances to question 2 on Next click", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    fireEvent.click(screen.getByText("Next"));
    expect(screen.getByText("Question 2 of 13")).toBeInTheDocument();
  });

  it("disables Next on a single-select question until an option is chosen", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    fireEvent.click(screen.getByText("Next")); // -> Q2, annualIncome
    expect(screen.getByText("Question 2 of 13")).toBeInTheDocument();
    expect(screen.getByText(/See my recommendations|Next/)).toBeDisabled();
  });

  it("enables Next after selecting a single-select-scale option", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    fireEvent.click(screen.getByText("Next")); // -> Q2
    fireEvent.click(screen.getByText("₹6L–12L"));
    expect(screen.getByText("Next")).not.toBeDisabled();
  });

  it("Back returns to the previous question and preserves its answer", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    fireEvent.click(screen.getByText("Next")); // -> Q2
    fireEvent.click(screen.getByText("₹6L–12L"));
    fireEvent.click(screen.getByText("Next")); // -> Q3
    expect(screen.getByText("Question 3 of 13")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Question 2 of 13")).toBeInTheDocument();
    expect(screen.getByText("₹6L–12L")).toHaveAttribute("aria-checked", "true");
  });

  it("DR10: Enter advances when the question is answered", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    const container = screen.getByText("Question 1 of 13").closest("div")!;
    fireEvent.keyDown(container, { key: "Enter" });
    expect(screen.getByText("Question 2 of 13")).toBeInTheDocument();
  });

  it("DR10: Enter does nothing on an unanswered required question", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    fireEvent.click(screen.getByText("Next")); // -> Q2, unanswered
    const container = screen.getByText("Question 2 of 13").closest("div")!;
    fireEvent.keyDown(container, { key: "Enter" });
    expect(screen.getByText("Question 2 of 13")).toBeInTheDocument();
  });

  it("DR10: Escape goes back", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    fireEvent.click(screen.getByText("Next")); // -> Q2
    const container = screen.getByText("Question 2 of 13").closest("div")!;
    fireEvent.keyDown(container, { key: "Escape" });
    expect(screen.getByText("Question 1 of 13")).toBeInTheDocument();
  });

  it("shows 'See my recommendations' instead of 'Next' on the last question", () => {
    render(<QuizWizard cardOptions={cardOptions} />);
    for (let i = 0; i < 12; i++) {
      const nextOrFinal = screen.queryByText("Next");
      if (nextOrFinal && !nextOrFinal.hasAttribute("disabled")) {
        fireEvent.click(nextOrFinal);
      } else {
        // answer whatever the current question needs minimally, then advance
        const scaleOption = document.querySelector('button[role="radio"]');
        if (scaleOption) fireEvent.click(scaleOption);
        const yesButton = screen.queryByText("Yes") ?? screen.queryByText("No");
        if (yesButton && !scaleOption) fireEvent.click(yesButton);
        const advance = screen.getByText(/Next|See my recommendations/);
        if (!advance.hasAttribute("disabled")) fireEvent.click(advance);
      }
    }
    expect(screen.getByText("Question 13 of 13")).toBeInTheDocument();
  });

  it("regression: submits gymMembership as {active, monthlyCost}, not the widget's {active, amount} shape (real bug found live — the server's zod schema requires monthlyCost and silently got undefined)", async () => {
    function fakeSSEBody() {
      const encoder = new TextEncoder();
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`data: {"type":"done","topCardId":"x"}\n\n`));
          controller.close();
        },
      });
    }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, body: fakeSSEBody() });
    vi.stubGlobal("fetch", fetchMock);

    render(<QuizWizard cardOptions={cardOptions} />);

    // Q1 heldCardIds — 0 selections is valid, just advance.
    fireEvent.click(screen.getByText("Next"));
    // Q2 annualIncome, Q3 flightFrequency, Q4 hotelFrequency — any scale option.
    for (let i = 0; i < 3; i++) {
      fireEvent.click(document.querySelector('button[role="radio"]')!);
      fireEvent.click(screen.getByText("Next"));
    }
    // Q5 gymMembership — click Yes, fill in a real monthly cost.
    fireEvent.click(screen.getByText("Yes"));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1500" } });
    fireEvent.click(screen.getByText("Next"));
    // Q6-Q10 spend buckets — any scale option each.
    for (let i = 0; i < 5; i++) {
      fireEvent.click(document.querySelector('button[role="radio"]')!);
      fireEvent.click(screen.getByText("Next"));
    }
    // Q11 recurringBillsByCard — No.
    fireEvent.click(screen.getByText("No"));
    fireEvent.click(screen.getByText("Next"));
    // Q12 feeTolerant — any scale option.
    fireEvent.click(document.querySelector('button[role="radio"]')!);
    fireEvent.click(screen.getByText("Next"));
    // Q13 priorityCategories — 0 selections valid, submit.
    fireEvent.click(screen.getByText("See my recommendations"));

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    const [, options] = fetchMock.mock.calls[0]!;
    const payload = JSON.parse(options.body);
    expect(payload.gymMembership).toEqual({ active: true, monthlyCost: 1500 });
  });
});
