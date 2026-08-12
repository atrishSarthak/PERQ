import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Sidebar } from "@/app/(shell)/Sidebar";

describe("Sidebar — 3 planned features, only Feature 1 live", () => {
  it("renders Card Recommender as a real, enabled link to /quiz", () => {
    render(<Sidebar />);
    const link = screen.getByTitle("Card Recommender");
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", "/quiz");
  });

  it("renders Chrome Extension as a disabled button, not a link", () => {
    render(<Sidebar />);
    const el = screen.getByTitle("Chrome Extension — coming soon");
    expect(el.tagName).toBe("BUTTON");
    expect(el).toBeDisabled();
  });

  it("renders Goal-Based Advisor as a disabled button, not a link", () => {
    render(<Sidebar />);
    const el = screen.getByTitle("Goal-Based Advisor — coming soon");
    expect(el.tagName).toBe("BUTTON");
    expect(el).toBeDisabled();
  });

  it("only one of the three features is an actual navigable link", () => {
    render(<Sidebar />);
    const links = screen.getAllByRole("link");
    // The wordmark itself is also a link (to /home) — filter to feature links.
    const featureLinks = links.filter((l) => l.getAttribute("href") !== "/home");
    expect(featureLinks).toHaveLength(1);
  });
});
