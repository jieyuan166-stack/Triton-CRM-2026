type ParseCompleteResult<T> = {
  data: T[];
  errors: Array<{ message: string }>;
  meta: { fields: string[] };
};

type ParseOptions<T> = {
  header?: boolean;
  skipEmptyLines?: boolean;
  complete?: (results: ParseCompleteResult<T>) => void;
  error?: (error: Error) => void;
};

function splitCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current.trim());
  return result;
}

async function parse<T extends Record<string, unknown>>(file: File, options: ParseOptions<T>) {
  try {
    const text = await file.text();
    const lines = text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .filter((line) => (options.skipEmptyLines ? line.trim().length > 0 : true));

    if (lines.length === 0) {
      options.complete?.({ data: [], errors: [], meta: { fields: [] } });
      return;
    }

    if (!options.header) {
      options.complete?.({ data: [] as T[], errors: [], meta: { fields: [] } });
      return;
    }

    const headers = splitCsvLine(lines[0]).map((header) => header.replace(/^"|"$/g, ""));
    const data = lines.slice(1).map((line) => {
      const values = splitCsvLine(line);
      const row: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        row[header] = (values[index] ?? "").replace(/^"|"$/g, "");
      });
      return row as T;
    });

    options.complete?.({ data, errors: [], meta: { fields: headers } });
  } catch (error) {
    options.error?.(error instanceof Error ? error : new Error("CSV parse failed."));
  }
}

const Papa = { parse };

export default Papa;
