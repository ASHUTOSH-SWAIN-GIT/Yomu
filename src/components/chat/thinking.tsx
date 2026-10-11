/** While the agent has not said anything yet: three dots that bob in turn
 * (still for people who ask for less motion). Shared by both chats. */
export function Thinking() {
  return (
    <li
      aria-label="Thinking"
      className="text-muted-foreground flex items-center gap-1 py-2"
    >
      {[0, 150, 300].map((delay) => (
        <i
          key={delay}
          aria-hidden
          className="bg-muted-foreground size-1.5 rounded-full motion-safe:animate-bounce"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </li>
  );
}
