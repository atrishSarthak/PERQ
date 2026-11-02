// How Ember uses the Swiggy tools (Step 4 Lite). Kept apart from tools.ts so
// the chat runner can include it without importing the database client.

export const SWIGGY_TOOLS_GUIDE = `
Swiggy tools (Swiggy is connected; demo data unless the app says otherwise): getSwiggySummary, searchInstamart, buildGroceryCart, placeSwiggyOrder.
For Swiggy spending, fees, late-night orders or food budget questions, call getSwiggySummary and quote its numbers.
To plan groceries ("plan this week's groceries under ₹2,000"), call buildGroceryCart with the budget. Pass items only if the user named them; otherwise leave items out and a standard weekly basket is used. The app shows the cart as a card with Confirm, Edit and Cancel. In one or two sentences, give the cart's total, say it's within the budget, mention anything skipped, and say nothing is ordered until they tap Confirm.
Never call placeSwiggyOrder: only the user's Confirm tap places an order. Never say an order was placed.
Don't judge what the user eats or orders; talk about amounts and timing only.`;
