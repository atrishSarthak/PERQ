import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { swiggyCartResponseSchema, swiggyStatusSchema } from "@perq/shared";
import { http } from "./api";
import { useInvalidateMoney } from "./moneyQueries";

// Swiggy (Step 4 Lite). The Confirm tap is the only thing that places an order.
const enc = encodeURIComponent;
export const swiggyApi = {
  status: () => http.request("/api/swiggy", { schema: swiggyStatusSchema }),
  connect: () => http.request("/api/swiggy", { method: "POST", schema: swiggyStatusSchema }),
  disconnect: () => http.request("/api/swiggy", { method: "DELETE", schema: swiggyStatusSchema }),
  sync: () => http.request("/api/swiggy/sync", { method: "POST", schema: z.object({ added: z.number() }) }),
  cart: (id: string) => http.request(`/api/swiggy/carts/${enc(id)}`, { schema: swiggyCartResponseSchema }),
  checkout: (id: string) => http.request(`/api/swiggy/carts/${enc(id)}/checkout`, { method: "POST", body: { confirm: true }, schema: swiggyCartResponseSchema }),
  cancel: (id: string) => http.request(`/api/swiggy/carts/${enc(id)}/cancel`, { method: "POST", schema: swiggyCartResponseSchema }),
};

export const useSwiggyStatus = () => useQuery({ queryKey: ["swiggy"], queryFn: swiggyApi.status });
export const useSwiggyCart = (id: string) => useQuery({ queryKey: ["swiggy-cart", id], queryFn: async () => (await swiggyApi.cart(id)).cart });

/** Connect or disconnect; either changes the financial state. */
export function useSwiggyConnection() {
  const qc = useQueryClient();
  const invalidate = useInvalidateMoney();
  const done = (s: z.infer<typeof swiggyStatusSchema>) => {
    qc.setQueryData(["swiggy"], s);
    return invalidate();
  };
  return {
    connect: useMutation({ mutationFn: swiggyApi.connect, onSuccess: done }),
    disconnect: useMutation({ mutationFn: swiggyApi.disconnect, onSuccess: done }),
  };
}

/** Confirm (the order) or Cancel on a cart card. */
export function useCartAction(id: string) {
  const qc = useQueryClient();
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (action: "checkout" | "cancel") => (action === "checkout" ? swiggyApi.checkout(id) : swiggyApi.cancel(id)),
    onSuccess: ({ cart }) => {
      qc.setQueryData(["swiggy-cart", id], cart);
      return invalidate();
    },
  });
}
