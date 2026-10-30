import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email");
export const passwordSchema = z.string().min(8, "Use at least 8 characters").max(200);

export const signupRequestSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(80).optional(),
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password"),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  user: publicUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const meResponseSchema = z.object({ user: publicUserSchema });

export const apiErrorSchema = z.object({ error: z.string() });
export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
