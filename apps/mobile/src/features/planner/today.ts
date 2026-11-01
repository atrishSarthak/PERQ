import { istDate } from "@perq/finance-engine";
import { useMoneyState } from "@/lib/moneyQueries";

/** Today in IST as the server sees it (so demo time travel applies), else the phone's clock. */
export function usePlannerToday(): string {
  const state = useMoneyState();
  return state.data?.asOf ?? istDate(new Date());
}
