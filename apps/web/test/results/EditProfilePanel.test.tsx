import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { QuizAnswers } from "@perq/scoring-engine";

const refreshMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const { EditProfilePanel } = await import("@/app/(shell)/results/EditProfilePanel");

const answers: QuizAnswers = {
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

describe("EditProfilePanel (PRD §11)", () => {
  beforeEach(() => {
    refreshMock.mockReset();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  });

  it("starts collapsed, showing only an 'Edit my profile' button", () => {
    render(<EditProfilePanel answers={answers} cardOptions={[]} />);
    expect(screen.getByText("Edit my profile")).toBeInTheDocument();
    expect(screen.queryByText(/spend on fuel each month/)).not.toBeInTheDocument();
  });

  it("expands to show all 13 questions on click", () => {
    render(<EditProfilePanel answers={answers} cardOptions={[]} />);
    fireEvent.click(screen.getByText("Edit my profile"));
    expect(screen.getByText(/spend on fuel each month/)).toBeInTheDocument();
    expect(screen.getByText(/Which cards do you currently have/)).toBeInTheDocument();
    expect(screen.getByText(/What matters most to you/)).toBeInTheDocument();
  });

  it("PATCHes the correct field/value shape when a scale option is changed, then refreshes", async () => {
    render(<EditProfilePanel answers={answers} cardOptions={[]} />);
    fireEvent.click(screen.getByText("Edit my profile"));
    // "₹6,000+" is shared across all 5 spend-bucket questions — scope to
    // the fuel-spend section specifically.
    const fuelPrompt = screen.getByText(/spend on fuel each month/);
    const fuelSection = fuelPrompt.closest("div")!;
    const options6k = screen.getAllByText("₹6,000+").find((el) => fuelSection.contains(el))!;
    fireEvent.click(options6k);

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, reqOptions] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse(reqOptions.body)).toEqual({ field: "fuelSpend", value: "6k+" });
    await waitFor(() => expect(refreshMock).toHaveBeenCalledOnce());
  });

  it("maps feeTolerant between its boolean storage and the scale widget's string option values", async () => {
    render(<EditProfilePanel answers={{ ...answers, feeTolerant: true }} cardOptions={[]} />);
    fireEvent.click(screen.getByText("Edit my profile"));
    fireEvent.click(screen.getByText("No, I want ₹0-fee cards only"));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse(options.body)).toEqual({ field: "feeTolerant", value: false });
  });

  it("PATCHes recurringBillsByCard as a plain bucket string", async () => {
    render(<EditProfilePanel answers={{ ...answers, recurringBillsByCard: "no" }} cardOptions={[]} />);
    fireEvent.click(screen.getByText("Edit my profile"));
    fireEvent.click(screen.getByText("Yes"));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse(options.body)).toEqual({ field: "recurringBillsByCard", value: "yes" });
  });

  it("PATCHes gymMembership as a plain bucket string", async () => {
    render(<EditProfilePanel answers={{ ...answers, gymMembership: "none" }} cardOptions={[]} />);
    fireEvent.click(screen.getByText("Edit my profile"));
    fireEvent.click(screen.getByText("Yes, ₹1,500+/month"));

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(JSON.parse(options.body)).toEqual({ field: "gymMembership", value: "1500-plus" });
  });

  it("shows an inline error and does NOT refresh on a failed PATCH (2D)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Couldn't update your results — try again." }),
    });

    render(<EditProfilePanel answers={answers} cardOptions={[]} />);
    fireEvent.click(screen.getByText("Edit my profile"));
    const fuelPrompt = screen.getByText(/spend on fuel each month/);
    const fuelSection = fuelPrompt.closest("div")!;
    const options6k = screen.getAllByText("₹6,000+").find((el) => fuelSection.contains(el))!;
    fireEvent.click(options6k);

    await waitFor(() =>
      expect(screen.getByText("Couldn't update your results — try again.")).toBeInTheDocument()
    );
    expect(refreshMock).not.toHaveBeenCalled();
  });

  it("collapses back to the button on Done", () => {
    render(<EditProfilePanel answers={answers} cardOptions={[]} />);
    fireEvent.click(screen.getByText("Edit my profile"));
    fireEvent.click(screen.getByText("Done"));
    expect(screen.queryByText(/spend on fuel each month/)).not.toBeInTheDocument();
  });

  describe("Feature 3 §11 financial-context fields (2B)", () => {
    it("shows the financial-context section, distinct from the 13 quiz questions", () => {
      render(<EditProfilePanel answers={answers} cardOptions={[]} />);
      fireEvent.click(screen.getByText("Edit my profile"));
      expect(screen.getByText("Financial context")).toBeInTheDocument();
      expect(screen.getByText(/credit score range/)).toBeInTheDocument();
      expect(screen.getByText(/statement close/)).toBeInTheDocument();
    });

    it("does NOT render financial-context questions in the onboarding quiz wizard itself", async () => {
      const { QuizWizard } = await import("@/app/(shell)/quiz/QuizWizard");
      render(<QuizWizard cardOptions={[]} />);
      expect(screen.queryByText(/credit score range/)).not.toBeInTheDocument();
      expect(screen.getByText("Question 1 of 13")).toBeInTheDocument();
    });

    it("PATCHes a select field (creditScoreRange) on click", async () => {
      render(<EditProfilePanel answers={answers} cardOptions={[]} />);
      fireEvent.click(screen.getByText("Edit my profile"));
      fireEvent.click(screen.getByText("750+"));

      await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(JSON.parse(options.body)).toEqual({ field: "creditScoreRange", value: "750-plus" });
    });

    it("PATCHes a numeric field (statementDate) on blur, not on every keystroke", async () => {
      render(<EditProfilePanel answers={answers} cardOptions={[]} />);
      fireEvent.click(screen.getByText("Edit my profile"));
      const input = screen.getByLabelText("statementDate");

      fireEvent.change(input, { target: { value: "1" } });
      fireEvent.change(input, { target: { value: "15" } });
      expect(fetch).not.toHaveBeenCalled();

      fireEvent.blur(input);
      await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
      const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
      expect(JSON.parse(options.body)).toEqual({ field: "statementDate", value: 15 });
    });

    it("does not PATCH a numeric field on blur if the value is unchanged", async () => {
      render(
        <EditProfilePanel answers={{ ...answers, creditLimit: 50000 }} cardOptions={[]} />
      );
      fireEvent.click(screen.getByText("Edit my profile"));
      const input = screen.getByLabelText("creditLimit");
      fireEvent.blur(input);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});
