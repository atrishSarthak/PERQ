import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";

const signInMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signIn: (...args: unknown[]) => signInMock(...args),
}));

const { default: RegisterPage } = await import("@/app/register/page");

describe("RegisterPage", () => {
  beforeEach(() => {
    signInMock.mockReset();
    vi.stubGlobal("fetch", vi.fn());
    // jsdom doesn't implement navigation; stub the setter so we can assert
    // on it without a real "Not implemented" navigation error.
    delete (window as unknown as { location?: unknown }).location;
    (window as unknown as { location: { href: string } }).location = { href: "" };
  });

  it("registers then signs in and redirects to /quiz on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "u1", email: "new@perq.test" } }),
    });
    signInMock.mockResolvedValue({ error: null });

    render(<RegisterPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "new@perq.test" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Password/), {
      target: { value: "testpassword123" },
    });
    fireEvent.click(screen.getByText("Create account"));

    await waitFor(() => expect(window.location.href).toBe("/quiz"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/register",
      expect.objectContaining({ method: "POST" })
    );
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "new@perq.test",
      password: "testpassword123",
      redirect: false,
    });
  });

  it("shows the server's error message on a failed registration (e.g. duplicate email) without redirecting", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "An account with this email already exists." }),
    });

    render(<RegisterPage />);
    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "dup@perq.test" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Password/), {
      target: { value: "testpassword123" },
    });
    fireEvent.click(screen.getByText("Create account"));

    await waitFor(() =>
      expect(
        screen.getByText("An account with this email already exists.")
      ).toBeInTheDocument()
    );
    expect(window.location.href).toBe("");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("links to /login for an existing user", () => {
    render(<RegisterPage />);
    expect(screen.getByText(/Already have an account/).closest("a")).toHaveAttribute(
      "href",
      "/login"
    );
  });
});
