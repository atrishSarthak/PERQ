import { GoalWizard } from "./GoalWizard";

// Auth is enforced by the (shell) layout — no per-page session check needed
// (this page has no server-side data fetch of its own; GoalWizard drives
// everything client-side via /api/goals/submit, same shape as the quiz
// route's page.tsx delegating to QuizWizard).
export default function GoalPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <GoalWizard />
    </div>
  );
}
