/** Wide tables scroll sideways inside their own box instead of stretching
 * the reading column. */
export function TableBlock({
  header,
  rows,
}: {
  header: string[];
  rows: string[][];
}) {
  return (
    <div className="bg-card my-[1.1em] overflow-x-auto rounded-lg font-sans shadow-[var(--shadow-card)]">
      <table className="w-full border-collapse text-left text-[0.8125rem] leading-snug">
        {header.length > 0 && (
          <thead className="bg-muted">
            <tr>
              {header.map((cell, i) => (
                <th
                  key={i}
                  scope="col"
                  className="border-border text-muted-foreground border-b px-3.5 py-2.5 text-[0.75rem] font-semibold"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-border border-b last:border-b-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3.5 py-2.5 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
