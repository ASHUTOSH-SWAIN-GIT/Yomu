import {
  CONTEXT_LONG,
  contextFill,
  type ContextUsage,
} from "@/lib/agent-progress";

/** Said only once a chat has grown long: how full the model's memory is, and
 * that nothing needs doing. */
export function ContextNote({ usage }: { usage: ContextUsage | null }) {
  const fill = contextFill(usage);
  if (fill < CONTEXT_LONG) return null;
  return (
    <p className="text-muted-foreground mt-2 text-center text-[0.6875rem]">
      This chat is {Math.round(fill * 100)}% of what the model can hold. When it
      fills up, Yomu carries on in a fresh session.
    </p>
  );
}
