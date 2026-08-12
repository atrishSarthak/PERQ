import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Chat } from "@/app/(shell)/results/Chat";

describe("Chat (DR7 — unboxed MIMIR responses)", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("shows the user's message immediately in a bubble on send", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "MIMIR's answer" }),
    });

    render(<Chat />);
    fireEvent.change(screen.getByPlaceholderText(/Why not the travel card/), {
      target: { value: "Why not the travel card?" },
    });
    fireEvent.click(screen.getByText("Send"));

    expect(screen.getByText("Why not the travel card?")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("MIMIR's answer")).toBeInTheDocument());
  });

  it("renders MIMIR's response with a MIMIR label, unboxed (DR7)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "Here's the math." }),
    });

    render(<Chat />);
    fireEvent.change(screen.getByPlaceholderText(/Why not the travel card/), {
      target: { value: "hi" },
    });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => expect(screen.getByText("Here's the math.")).toBeInTheDocument());
    expect(screen.getByText("MIMIR")).toBeInTheDocument();
  });

  it("clears the input after a successful send", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "ok" }),
    });

    render(<Chat />);
    const input = screen.getByPlaceholderText(/Why not the travel card/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() => expect(input.value).toBe(""));
  });

  it("on failure, removes the optimistic user bubble, restores the input, and shows an error (post-outside-voice decision — failed turns are not left in the visible history)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "MIMIR couldn't respond — try again." }),
    });

    render(<Chat />);
    const input = screen.getByPlaceholderText(/Why not the travel card/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.click(screen.getByText("Send"));

    await waitFor(() =>
      expect(screen.getByText("MIMIR couldn't respond — try again.")).toBeInTheDocument()
    );
    expect(screen.queryByText("hi")).not.toBeInTheDocument();
    expect(input.value).toBe("hi");
  });

  it("sends on Enter (without Shift)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ reply: "ok" }),
    });

    render(<Chat />);
    const input = screen.getByPlaceholderText(/Why not the travel card/);
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());
  });

  it("does not send an empty message", () => {
    render(<Chat />);
    fireEvent.click(screen.getByText("Send"));
    expect(fetch).not.toHaveBeenCalled();
  });
});
