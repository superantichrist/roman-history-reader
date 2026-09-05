export async function tryWriteClipboard(text: string, clipboard?: { writeText(text: string): Promise<void> }) {
  try {
    if (!clipboard) return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
