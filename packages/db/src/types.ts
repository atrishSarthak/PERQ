import type { InferSelectModel, InferInsertModel } from "drizzle-orm";
import type {
  cards,
  chatMessages,
  recommendations,
  userCardArsenal,
  userProfile,
  users,
} from "./schema";

export type User = InferSelectModel<typeof users>;
export type UserProfileRow = InferSelectModel<typeof userProfile>;
export type Card = InferSelectModel<typeof cards>;
export type NewCard = InferInsertModel<typeof cards>;
export type RecommendationRow = InferSelectModel<typeof recommendations>;
export type NewRecommendationRow = InferInsertModel<typeof recommendations>;
export type UserCardArsenalRow = InferSelectModel<typeof userCardArsenal>;
export type ChatMessageRow = InferSelectModel<typeof chatMessages>;
