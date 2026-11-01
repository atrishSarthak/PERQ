import { NextResponse } from "next/server";
import { buildSyntheticStatement, FIXTURE_SPECS, renderSyntheticPdf } from "@perq/statements";

export const dynamic = "force-dynamic";

/**
 * GET /api/demo/fixtures?layout=A: a SYNTHETIC test statement PDF,
 * generated in memory, so it can be saved to an iPhone's Files app for
 * testing the upload flow. Only when DEMO_ENABLED=true; never real data.
 */
export async function GET(req: Request) {
  if (process.env.DEMO_ENABLED !== "true") return NextResponse.json({ error: "Not found" }, { status: 404 });
  const layout = new URL(req.url).searchParams.get("layout") ?? "A";
  const spec = FIXTURE_SPECS.find((s) => s.layout === layout);
  if (!spec) return NextResponse.json({ error: "Unknown layout" }, { status: 404 });
  const pdf = await renderSyntheticPdf(buildSyntheticStatement(spec));
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="synthetic-${spec.issuer.split(" ")[0]!.toLowerCase()}-${spec.statementDate}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
