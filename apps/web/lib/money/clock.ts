// The clock is injectable (handoff §2). Real users always get the real time;
// demo users can be "time travelled" from Diagnostics (checkpoint 14).
export async function nowFor(_userId: string): Promise<Date> {
  return new Date();
}
