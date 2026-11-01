import { Pressable, View } from "react-native";
import { addDays, formatDay, formatInr } from "@perq/finance-engine";
import type { OptionResult, PlanChoice, PlanResult } from "@perq/shared";
import { Text } from "@/components/Text";
import { useTheme } from "@/theme/ThemeProvider";
import { Figure, netCostHow, optionWhen, Section } from "./components";

// The breakdown sections (§10.5), each expandable. Every ₹ is the engine's,
// and taps through to its source or the sum behind it.

const pct = (n: number) => `${Math.round(n * 10) / 10}%`;

/** The what-if pick that pays the way this option does, or null when it can't be picked. */
export function choiceFor(o: OptionResult): PlanChoice | null {
  if (o.kind === "upi") return { cardAccountId: "upi" };
  if (!o.cardAccountId) return null; // a card from the quiz with no account yet
  if (o.kind === "card_emi") return o.emi ? { cardAccountId: o.cardAccountId, emiTenure: o.emi.tenureMonths } : null;
  return { cardAccountId: o.cardAccountId, purchaseDate: o.purchaseDate };
}

const FLAG_TEXT: Partial<Record<string, string>> = {
  util_over_70: "Uses over 70% of the limit",
  util_blocked: "Over 90% of the limit",
  over_limit: "Over the credit limit",
  rewards_lost_on_emi: "No rewards on EMI",
  no_card_terms: "Rewards unknown",
  unreconciled: "Balance may be off",
};

export function PlanSections({ result: r, onPick, picking }: { result: PlanResult; onPick?: (c: PlanChoice, label: string) => void; picking?: boolean }) {
  return (
    <>
      <BudgetSection r={r} />
      <PaySection r={r} onPick={onPick} picking={picking} />
      {r.timing ? <TimingSection r={r} /> : null}
      {r.credit && r.credit.after !== null ? <CreditSection r={r} /> : null}
      {r.emi ? <EmiSection r={r} /> : null}
      <Section title="How Ember worked this out">
        {r.assumptions.map((a) => (
          <Text key={a} variant="small" tone="muted">
            • {a}
          </Text>
        ))}
        <Text variant="caption" tone="muted">
          Worked out on {formatDay(r.asOf)} from your statements, budget and cards.
        </Text>
      </Section>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: t.spacing[3] }}>
      <Text variant="small" tone="muted" style={{ flex: 1 }}>
        {label}
      </Text>
      <View style={{ alignItems: "flex-end", maxWidth: "60%" }}>{children}</View>
    </View>
  );
}

function BudgetSection({ r }: { r: PlanResult }) {
  const a = r.affordability;
  const spent = a.leftThisMonth !== null && a.afterPurchase !== null ? a.leftThisMonth - a.afterPurchase : null;
  const summary =
    a.leftThisMonth === null ? "No budget or income to check against" : `${formatInr(a.leftThisMonth)} left → ${formatInr(a.afterPurchase ?? 0)} after`;
  const basis = a.basis === "budget" ? "From your monthly budget, minus what you've spent so far" : "No budget set: 30% of your income, minus what you've spent this month";
  return (
    <Section title="Budget" summary={summary} defaultOpen={r.verdict === "wait"}>
      {a.leftThisMonth !== null ? (
        <>
          <Row label="Left to spend this month">
            <Figure value={a.leftThisMonth} {...(a.basis === "budget" ? { href: "/budgets" } : { how: basis })} />
          </Row>
          <Row label="After this purchase">
            <Figure
              value={a.afterPurchase ?? 0}
              tone={(a.afterPurchase ?? 0) < 0 ? "danger" : undefined}
              how={spent !== null ? `${formatInr(a.leftThisMonth)} − ${formatInr(spent)}` : undefined}
            />
          </Row>
        </>
      ) : (
        <Text variant="small" tone="muted">
          Set a monthly budget and Ember can tell you whether this fits your month.
        </Text>
      )}
      {a.neededAmount !== null && a.neededByDate ? (
        <Row label={`Money needed by ${formatDay(a.neededByDate)}`}>
          <Figure value={a.neededAmount} how={r.recommended.kind === "card_emi" ? "Your first instalment" : `Your card bill for this, due ${formatDay(a.neededByDate)}`} />
        </Row>
      ) : null}
      {a.goalImpacts.map((g) => (
        <Text key={g.goalId} variant="small">
          Pushes your {g.name} goal back about {g.monthsSlip} {g.monthsSlip === 1 ? "month" : "months"}.
        </Text>
      ))}
      {a.sizeLabel !== "unknown" ? (
        <Text variant="caption" tone="muted">
          A {a.sizeLabel} purchase for your income.
        </Text>
      ) : null}
    </Section>
  );
}

function PaySection({ r, onPick, picking }: { r: PlanResult; onPick?: (c: PlanChoice, label: string) => void; picking?: boolean }) {
  const t = useTheme();
  return (
    <Section title="Best way to pay" summary={`${r.options.length} ways compared · ${r.recommended.label} first`} defaultOpen={r.verdict === "rethink_payment"}>
      {r.options.map((o) => {
        const isRec = o.id === r.recommended.id;
        const choice = onPick && !isRec ? choiceFor(o) : null;
        const notes = o.flags.map((f) => FLAG_TEXT[f]).filter(Boolean);
        return (
          <View key={o.id} style={{ gap: 2, paddingBottom: t.spacing[2], borderBottomWidth: 1, borderBottomColor: t.colors.border, opacity: o.blocked ? 0.6 : 1 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: t.spacing[3] }}>
              <View style={{ flex: 1 }}>
                <Text variant="small" tone={isRec ? "ember" : "default"}>
                  {isRec ? "★ " : `${o.rank}. `}
                  {o.label}
                </Text>
                <Text variant="caption" tone="muted">
                  {optionWhen(o, r.asOf)}
                  {o.utilisationAfterPct !== null ? ` · ${pct(o.utilisationAfterPct)} of limit` : ""}
                </Text>
              </View>
              <Figure value={o.netCost} how={netCostHow(o)} variant="small" />
            </View>
            {o.offersApplied.map((x) => (
              <Text key={x.rawText} variant="caption" tone="success">
                {formatInr(x.discount)} off: {x.rawText}
              </Text>
            ))}
            {notes.length ? (
              <Text variant="caption" tone="danger">
                {notes.join(" · ")}
              </Text>
            ) : null}
            {choice ? (
              <Pressable onPress={() => onPick!(choice, o.label)} disabled={picking} accessibilityRole="button" hitSlop={6}>
                <Text variant="caption" tone="link">
                  What if I pay this way? ›
                </Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
      {r.recommended.offersSkipped.length ? (
        <View style={{ gap: 2 }}>
          <Text variant="caption" tone="muted">
            Offers that don't apply to {r.recommended.label}:
          </Text>
          {r.recommended.offersSkipped.map((x) => (
            <Text key={x.rawText} variant="caption" tone="muted">
              • {x.rawText} ({x.reason})
            </Text>
          ))}
        </View>
      ) : null}
    </Section>
  );
}

function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return "SMTWTFS"[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

/** Three weeks from today with today, the statement date, the best day and the due date marked. */
export function CalendarStrip({ today, statement, best, due }: { today: string; statement: string | null; best: string; due: string | null }) {
  const t = useTheme();
  const days = Array.from({ length: 21 }, (_, i) => addDays(today, i));
  const weeks = [days.slice(0, 7), days.slice(7, 14), days.slice(14, 21)];
  const cell = (d: string) => {
    const isBest = d === best && best !== today;
    const isToday = d === today;
    const isStmt = d === statement;
    const isDue = d === due;
    return (
      <View
        key={d}
        style={{
          flex: 1,
          aspectRatio: 1,
          maxWidth: 44,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 8,
          backgroundColor: isBest ? t.colors.ember : isStmt ? t.colors.surface2 : "transparent",
          borderWidth: isToday ? 1.5 : 0,
          borderColor: t.colors.text,
        }}
        accessibilityLabel={`${formatDay(d)}${isToday ? ", today" : ""}${isStmt ? ", statement closes" : ""}${isBest ? ", best day to buy" : ""}${isDue ? ", bill due" : ""}`}
      >
        <Text variant="small" tone={isBest ? "onEmber" : isStmt ? "default" : "muted"}>
          {Number(d.slice(8))}
        </Text>
        {isStmt || isDue ? <View style={{ position: "absolute", bottom: 4, width: 4, height: 4, borderRadius: 2, backgroundColor: isDue ? t.colors.danger : t.colors.warning }} /> : null}
      </View>
    );
  };
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", gap: 4 }}>
        {weeks[0]!.map((d) => (
          <View key={d} style={{ flex: 1, maxWidth: 44, alignItems: "center" }}>
            <Text variant="caption" tone="muted">
              {weekday(d)}
            </Text>
          </View>
        ))}
      </View>
      {weeks.map((w) => (
        <View key={w[0]} style={{ flexDirection: "row", gap: 4 }}>
          {w.map(cell)}
        </View>
      ))}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: t.spacing[3], marginTop: 4 }}>
        <Legend swatch={{ borderWidth: 1.5, borderColor: t.colors.text }} label={`Today, ${formatDay(today)}`} />
        {statement ? <Legend swatch={{ backgroundColor: t.colors.surface2 }} dot={t.colors.warning} label={`Statement closes ${formatDay(statement)}`} /> : null}
        {best !== today ? <Legend swatch={{ backgroundColor: t.colors.ember }} label={`Best day ${formatDay(best)}`} /> : null}
        {due ? <Legend dot={t.colors.danger} label={`Bill due ${formatDay(due)}`} /> : null}
      </View>
    </View>
  );
}

function Legend({ swatch, dot, label }: { swatch?: object; dot?: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 12, height: 12, borderRadius: 3, alignItems: "center", justifyContent: "flex-end", ...swatch }}>
        {dot ? <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dot, marginBottom: swatch ? 1 : 4 }} /> : null}
      </View>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

function TimingSection({ r }: { r: PlanResult }) {
  const tm = r.timing!;
  const todayOpt = r.options.find((o) => o.kind === "card_full" && o.cardAccountId === tm.cardAccountId && o.purchaseDate === r.asOf);
  const bestOpt = r.options.find((o) => o.kind === "card_full" && o.cardAccountId === tm.cardAccountId && o.purchaseDate === tm.bestDate);
  const label = (bestOpt ?? todayOpt)?.label ?? "card";
  const summary = tm.extraDays > 0 ? `Buy on ${formatDay(tm.bestDate)} for ${tm.extraDays} more interest-free days` : `Today is fine: ${tm.floatToday} interest-free days`;
  return (
    <Section title="Timing" summary={summary} defaultOpen={r.verdict === "go_with_timing"}>
      <CalendarStrip today={r.asOf} statement={todayOpt?.billedOn ?? null} best={tm.bestDate} due={(bestOpt ?? todayOpt)?.dueOn ?? null} />
      {tm.extraDays > 0 ? (
        <Text variant="small">
          Your {label} statement closes on {todayOpt?.billedOn ? formatDay(todayOpt.billedOn) : "its statement day"}. Bought today, you'd pay by{" "}
          {todayOpt?.dueOn ? formatDay(todayOpt.dueOn) : "the next due date"} ({tm.floatToday} days). Bought on {formatDay(tm.bestDate)}, it lands on the next
          statement and is due {bestOpt?.dueOn ? formatDay(bestOpt.dueOn) : "a month later"} ({tm.floatBest} days), at no extra cost.
        </Text>
      ) : (
        <Text variant="small">
          Bought today on your {label}, you have {tm.floatToday} interest-free days. No day in your buying window gives 10 or more extra.
        </Text>
      )}
    </Section>
  );
}

function Bar({ label, value }: { label: string; value: number }) {
  const t = useTheme();
  const color = value > 70 ? t.colors.danger : value > 30 ? t.colors.warning : t.colors.success;
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="caption">{pct(value)}</Text>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: t.colors.surface2, overflow: "hidden" }}>
        <View style={{ width: `${Math.min(100, value)}%`, height: 10, backgroundColor: color }} />
        <View style={{ position: "absolute", left: "30%", top: 0, bottom: 0, width: 2, backgroundColor: t.colors.textMuted }} />
      </View>
    </View>
  );
}

function CreditSection({ r }: { r: PlanResult }) {
  const c = r.credit!;
  const after = c.after!;
  const label = r.options.find((o) => o.cardAccountId === c.cardAccountId)?.label ?? "card";
  return (
    <Section title="Credit limit" summary={`${label}: ${c.before !== null ? `${pct(c.before)} → ` : ""}${pct(after)} of limit`} defaultOpen={after > 70}>
      {c.before !== null ? <Bar label="Used now" value={c.before} /> : null}
      <Bar label="After this purchase" value={after} />
      {c.payToStayUnder30 ? (
        <Row label={`Pay early${c.nextStatementDate ? ` before ${formatDay(c.nextStatementDate)}` : ""} to keep it under 30%`}>
          <Figure value={c.payToStayUnder30} href={`/account/${c.cardAccountId}`} />
        </Row>
      ) : (
        <Text variant="small" tone="muted">
          Under 30% of the limit is healthiest for your credit score{after <= 30 ? ", and this stays under it" : ""}.
        </Text>
      )}
    </Section>
  );
}

/** "₹a + ₹b − ₹c" for an itemised sum. */
function sumHow(amounts: number[]): string | undefined {
  if (!amounts.length) return undefined;
  return amounts.map((a, i) => (i === 0 ? (a < 0 ? "−" : "") : a < 0 ? " − " : " + ") + formatInr(Math.abs(a))).join("");
}

function EmiSection({ r }: { r: PlanResult }) {
  const e = r.emi!;
  return (
    <Section
      title="EMI vs pay in full"
      summary={e.extraCostVsFullPayment > 0 ? `EMI costs ${formatInr(e.extraCostVsFullPayment)} more` : "No extra cost"}
      defaultOpen={r.verdictReason === "costly_payment"}
    >
      <Row label={`${e.tenureMonths} monthly instalments`}>
        <Figure value={e.monthlyInstalment} how={`${e.tenureMonths} × ${formatInr(e.monthlyInstalment)}`} />
      </Row>
      {e.lines.map((l) => (
        <Row key={l.label} label={l.label}>
          <Text variant="small" tone={l.amount < 0 ? "success" : "default"}>
            {l.amount < 0 ? `−${formatInr(-l.amount)}` : formatInr(l.amount)}
          </Text>
        </Row>
      ))}
      <Row label="Extra cost vs paying in full">
        <Figure value={e.extraCostVsFullPayment} tone={e.extraCostVsFullPayment > 0 ? "danger" : "success"} how={sumHow(e.lines.map((l) => l.amount))} />
      </Row>
      <Text variant="caption" tone="muted">
        The EMI holds {formatInr(e.blockedLimit)} of your limit at first, freed as you pay each instalment.
        {e.assumedRatePa ? ` The interest rate isn't printed, so Ember assumed ${e.assumedRatePa}% a year.` : ""}
      </Text>
    </Section>
  );
}
