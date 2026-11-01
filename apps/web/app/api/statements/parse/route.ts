import { NextResponse } from "next/server";
import { MAX_STATEMENT_BYTES, parseStatementRequestSchema } from "@perq/shared";
import { isAuthed, requireAuth } from "@/lib/auth";
import { hasConsent } from "@/lib/money/consent";
import { friendly, parseForUser, StatementError } from "@/lib/money/statementService";
import { sseResponse } from "@/lib/sse";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/statements/parse (SSE, handoff §5.1): narration steps, then a
 * review draft. The PDF (base64) and password are decoded into memory for
 * this request only. Never logged, written or stored.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (!isAuthed(auth)) return auth;
  if (!(await hasConsent(auth.id, "statements"))) {
    return NextResponse.json({ error: friendly("consent_required"), code: "consent_required" }, { status: 403 });
  }
  const body = parseStatementRequestSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: friendly("too_large"), code: "too_large" }, { status: 400 });
  }
  const pdf = new Uint8Array(Buffer.from(body.data.fileBase64, "base64"));
  if (pdf.byteLength > MAX_STATEMENT_BYTES) {
    return NextResponse.json({ error: friendly("too_large"), code: "too_large" }, { status: 413 });
  }
  const password = body.data.password;

  return sseResponse(async (emit) => {
    try {
      const { draft, parseToken } = await parseForUser(auth.id, pdf, password, (label) => emit({ type: "step", label }));
      emit({ type: "draft", draft: { ...draft, parseToken } });
      emit({ type: "done" });
    } catch (err) {
      const code = err instanceof StatementError ? err.code : "extraction_failed";
      // Log the code only: never the file, password or any statement figure.
      console.warn("[statements/parse] failed:", code);
      emit({ type: "error", message: friendly(code), code });
    } finally {
      pdf.fill(0); // drop the bytes promptly
    }
  });
}
