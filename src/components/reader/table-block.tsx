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
    <div className="border-border my-4 overflow-x-auto rounded-lg border">
      <table className="w-full border-collapse text-left text-sm">
        {header.length > 0 && (
          <thead className="bg-muted/50">
            <tr>
              {header.map((cell, i) => (
                <th
                  key={i}
                  scope="col"
                  className="border-border border-b px-3 py-2 font-medium"
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
                <td key={j} className="px-3 py-2 align-top">
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
