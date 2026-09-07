export function StaffPageHeading({
  eyebrow = "OPERATIONS CONSOLE",
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </section>
  );
}
