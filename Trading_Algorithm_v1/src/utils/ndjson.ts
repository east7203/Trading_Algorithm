import { createReadStream } from 'node:fs';
import readline from 'node:readline';

export const streamNdjsonValues = async <T>(
  filePath: string,
  onValue: (value: T) => void | Promise<void>
): Promise<void> => {
  const stream = createReadStream(filePath, { encoding: 'utf8' });
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  try {
    for await (const rawLine of reader) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      try {
        await onValue(JSON.parse(line) as T);
      } catch {
        // Ignore malformed rows and continue streaming.
      }
    }
  } finally {
    reader.close();
    stream.destroy();
  }
};
