import { describe, expect, it, vi } from "vitest";

let mockCount = 0;

vi.mock("@perq/db", () => ({
  goals: { userId: "userId", createdAt: "createdAt" },
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => Promise.resolve([{ count: mockCount }]),
      }),
    })),
  },
}));

const { hasReachedDailyGoalSearchLimit, MAX_GOAL_SEARCHES_PER_DAY } = await import(
  "@/lib/goals/rateLimit"
);

describe("hasReachedDailyGoalSearchLimit", () => {
  it("is 3 per day (revised down from the PRD's illustrative 8, per the outside-voice pass)", () => {
    expect(MAX_GOAL_SEARCHES_PER_DAY).toBe(3);
  });

  it("allows a search when under the cap", async () => {
    mockCount = MAX_GOAL_SEARCHES_PER_DAY - 1;
    expect(await hasReachedDailyGoalSearchLimit("user-1")).toBe(false);
  });

  it("blocks a search once at the cap", async () => {
    mockCount = MAX_GOAL_SEARCHES_PER_DAY;
    expect(await hasReachedDailyGoalSearchLimit("user-1")).toBe(true);
  });

  it("blocks a search over the cap", async () => {
    mockCount = MAX_GOAL_SEARCHES_PER_DAY + 5;
    expect(await hasReachedDailyGoalSearchLimit("user-1")).toBe(true);
  });

  it("allows a fresh user with zero prior searches today", async () => {
    mockCount = 0;
    expect(await hasReachedDailyGoalSearchLimit("user-1")).toBe(false);
  });
});
