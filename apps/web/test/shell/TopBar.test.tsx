import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

const { TopBar } = await import("@/app/(shell)/TopBar");
const { MimirChatProvider } = await import("@/app/(shell)/mimir/MimirChatContext");

describe("TopBar — replaces the old unlabeled vertical icon rail", () => {
  beforeEach(() => {
    signOutMock.mockReset();
  });

  it("links the PERQ logo to /home", () => {
    render(
      <MimirChatProvider>
        <TopBar />
      </MimirChatProvider>
    );
    const link = screen.getByRole("link", { name: "PERQ home" });
    expect(link).toHaveAttribute("href", "/home");
  });

  it("renders a real, labeled Sign out control, not an icon-only button", () => {
    render(
      <MimirChatProvider>
        <TopBar />
      </MimirChatProvider>
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });

  it("signs out to /login when clicked", () => {
    render(
      <MimirChatProvider>
        <TopBar />
      </MimirChatProvider>
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
