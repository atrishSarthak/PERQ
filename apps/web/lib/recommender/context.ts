import { loadCatalogue } from "./catalog";
import { computeResults, getHeldCardIds } from "./service";

/** Everything Ember's recommender tools need for one signed-in user. */
export async function recommenderContext(userId: string) {
  const computed = await computeResults(userId);
  if (!computed) return null;
  const [catalogue, heldCardIds] = await Promise.all([loadCatalogue(), getHeldCardIds(userId)]);
  return {
    response: computed.response,
    answers: computed.response.answers,
    result: computed.response.result,
    catalogue,
    heldCardIds,
  };
}
