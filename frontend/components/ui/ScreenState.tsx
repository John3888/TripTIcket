export function ScreenState({
  kind = "empty",
  title,
  message,
}: {
  kind?: "empty" | "loading" | "error";
  title: string;
  message: string;
}) {
  return (
    <div className={`screen-state ${kind}`} role={kind === "error" ? "alert" : undefined}>
      <span aria-hidden>{kind === "loading" ? "◌" : kind === "error" ? "!" : "○"}</span>
      <h3>{title}</h3>
      <p>{message}</p>
    </div>
  );
}
