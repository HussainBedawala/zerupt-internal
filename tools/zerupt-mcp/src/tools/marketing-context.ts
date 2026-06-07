import type { ContentBackend } from '../content/backend.js';
import { sanitiseResponse } from '../security.js';

const MARKETING_CONTEXT_PATH = 'internal/agent-os/marketing-context.md';

export async function marketingContext(backend: ContentBackend): Promise<string> {
  try {
    const content = await backend.getFile(MARKETING_CONTEXT_PATH);
    return sanitiseResponse(content);
  } catch {
    return (
      'Marketing context file (`internal/agent-os/marketing-context.md`) has not been written yet. ' +
      'It will be created by a separate process. Try again later, or use `product_overview` for product identity context.'
    );
  }
}
