import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SingleSelectScale, PickUpToNChips } from "../src/quiz-widgets";

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

  describe("noneOption (Q13's 'No strong preference')", () => {
    const noneOption = { value: "none", label: "No strong preference" };

    it("reads as selected whenever the selection is empty", () => {
      render(
        <PickUpToNChips
          options={options}
          value={[]}
          onChange={() => {}}
          max={2}
          name="q"
          noneOption={noneOption}
        />
      );
      expect(screen.getByText("No strong preference")).toHaveAttribute("aria-pressed", "true");
    });

    it("clicking it clears the selection, without adding a 'none' value", () => {
      const onChange = vi.fn();
      render(
        <PickUpToNChips
          options={options}
          value={["dining"]}
          onChange={onChange}
          max={2}
          name="q"
          noneOption={noneOption}
        />
      );
      fireEvent.click(screen.getByText("No strong preference"));
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it("reads as unselected once a real chip is picked", () => {
      render(
        <PickUpToNChips
          options={options}
          value={["dining"]}
          onChange={() => {}}
          max={2}
          name="q"
          noneOption={noneOption}
        />
      );
      expect(screen.getByText("No strong preference")).toHaveAttribute("aria-pressed", "false");
    });
  });
});
