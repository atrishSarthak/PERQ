import { NextResponse } from "next/server";
import { profilePatchSchema, quizAnswersV2Schema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { computeResults, getProfile, saveAnswers } from "@/lib/recommender/service";

export const dynamic = "force-dynamic";

/** PUT /api/recommender/profile: save a full quiz v2 answer set, return results. */
export async function PUT(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const parsed = quizAnswersV2Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid answers", issues: parsed.error.issues }, { status: 400 });
  }
  await saveAnswers(auth.id, parsed.data);
  const computed = await computeResults(auth.id);
  return NextResponse.json(computed!.response);
}

/** PATCH /api/recommender/profile: edit one answer, re-rank instantly. */
export async function PATCH(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  const patch = profilePatchSchema.safeParse(await req.json().catch(() => null));
  if (!patch.success) {
    return NextResponse.json({ error: "Invalid edit", issues: patch.error.issues }, { status: 400 });
  }
  const current = await getProfile(auth.id);
  if (!current) return NextResponse.json({ error: "Take the quiz first." }, { status: 404 });

  const merged = quizAnswersV2Schema.safeParse({ ...current.answers, [patch.data.key]: patch.data.value });
  if (!merged.success) {
    return NextResponse.json({ error: "Invalid value", issues: merged.error.issues }, { status: 400 });
  }
  await saveAnswers(auth.id, merged.data);
  const computed = await computeResults(auth.id);
  return NextResponse.json(computed!.response);
}
