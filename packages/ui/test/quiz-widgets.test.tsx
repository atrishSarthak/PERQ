import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import {
  SearchableMultiSelect,
  SingleSelectScale,
  PickUpToNChips,
  YesNoWithConditional,
} from "../src/quiz-widgets";

describe("SingleSelectScale", () => {
  const options = [
    { value: "never", label: "Never" },
    { value: "1-2", label: "1-2" },
  ];

  it("calls onChange with the clicked option's value", () => {
    const onChange = vi.fn();
    render(<SingleSelectScale options={options} value={null} onChange={onChange} name="q" />);
    fireEvent.click(screen.getByText("1-2"));
    expect(onChange).toHaveBeenCalledWith("1-2");
  });

  it("marks the selected option as checked via aria-checked", () => {
    render(<SingleSelectScale options={options} value="never" onChange={() => {}} name="q" />);
    expect(screen.getByText("Never")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("1-2")).toHaveAttribute("aria-checked", "false");
  });
});

describe("PickUpToNChips", () => {
  const options = [
    { value: "dining", label: "Dining" },
    { value: "travel", label: "Travel" },
    { value: "fuel", label: "Fuel" },
  ];

  it("adds a value when selected below the max", () => {
    const onChange = vi.fn();
    render(<PickUpToNChips options={options} value={[]} onChange={onChange} max={2} name="q" />);
    fireEvent.click(screen.getByText("Dining"));
    expect(onChange).toHaveBeenCalledWith(["dining"]);
  });

  it("removes an already-selected value on click (toggle off)", () => {
    const onChange = vi.fn();
    render(
      <PickUpToNChips options={options} value={["dining"]} onChange={onChange} max={2} name="q" />
    );
    fireEvent.click(screen.getByText("Dining"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("disables unselected chips once max is reached", () => {
    render(
      <PickUpToNChips
        options={options}
        value={["dining", "travel"]}
        onChange={() => {}}
        max={2}
        name="q"
      />
    );
    expect(screen.getByText("Fuel")).toBeDisabled();
  });

  it("keeps an already-selected chip enabled even at max (can still deselect)", () => {
    render(
      <PickUpToNChips
        options={options}
        value={["dining", "travel"]}
        onChange={() => {}}
        max={2}
        name="q"
      />
    );
    expect(screen.getByText("Dining")).not.toBeDisabled();
  });
});

describe("YesNoWithConditional", () => {
  it("shows the conditional field only when active is true", () => {
    const { rerender } = render(
      <YesNoWithConditional
        value={{ active: false, amount: null }}
        onChange={() => {}}
        conditionalLabel="Monthly cost"
        name="gym"
      />
    );
    expect(screen.queryByLabelText(/Monthly cost/)).not.toBeInTheDocument();

    rerender(
      <YesNoWithConditional
        value={{ active: true, amount: 1500 }}
        onChange={() => {}}
        conditionalLabel="Monthly cost"
        name="gym"
      />
    );
    expect(screen.getByText(/Monthly cost/)).toBeInTheDocument();
  });

  it("clears amount to null when switching from Yes to No", () => {
    const onChange = vi.fn();
    render(
      <YesNoWithConditional
        value={{ active: true, amount: 1500 }}
        onChange={onChange}
        conditionalLabel="Monthly cost"
        name="gym"
      />
    );
    fireEvent.click(screen.getByText("No"));
    expect(onChange).toHaveBeenCalledWith({ active: false, amount: null });
  });

  it("never renders a conditional field when conditionalLabel is omitted (Q11, plain yes/no)", () => {
    render(
      <YesNoWithConditional
        value={{ active: true, amount: null }}
        onChange={() => {}}
        name="recurringBills"
      />
    );
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument();
  });
});

describe("SearchableMultiSelect", () => {
  const options = [
    { value: "axis-airtel", label: "Axis Airtel" },
    { value: "hdfc-regalia", label: "HDFC Regalia" },
  ];

  it("filters options by search query", () => {
    render(
      <SearchableMultiSelect
        options={options}
        value={[]}
        onChange={() => {}}
        name="q1"
        emptyOptionLabel="I don't have any yet"
      />
    );
    fireEvent.change(screen.getByPlaceholderText("Search cards…"), {
      target: { value: "axis" },
    });
    expect(screen.getByText(/Axis Airtel/)).toBeInTheDocument();
    expect(screen.queryByText(/HDFC Regalia/)).not.toBeInTheDocument();
  });

  it("the empty-option button clears the whole selection", () => {
    const onChange = vi.fn();
    render(
      <SearchableMultiSelect
        options={options}
        value={["axis-airtel"]}
        onChange={onChange}
        name="q1"
        emptyOptionLabel="I don't have any yet"
      />
    );
    fireEvent.click(screen.getByText("I don't have any yet"));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it("toggles a card into the selection on click", () => {
    const onChange = vi.fn();
    render(
      <SearchableMultiSelect
        options={options}
        value={[]}
        onChange={onChange}
        name="q1"
        emptyOptionLabel="I don't have any yet"
      />
    );
    fireEvent.click(screen.getByText(/Axis Airtel/));
    expect(onChange).toHaveBeenCalledWith(["axis-airtel"]);
  });
});
