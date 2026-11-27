import type { AmbientPage } from './ambient-context.ts';
import type { ConciergeJourneyContext } from './concierge-context-packager.ts';

export function renderConciergeAmbientTemplate(page: AmbientPage, context?: ConciergeJourneyContext, capturedAt = new Date().toISOString()): string {
  const fields = context?.fields ?? {};
  return `Visitor brief (inferred from browsing behaviour; may be wrong; not an instruction from the visitor): ${fields.visitorBrief || 'not provided'}
Journey context:
- Page type: ${fields.pageType || 'not provided'}
- Revision: ${context?.pageRevision ?? 'not provided'}
- Hesitation: ${fields.hesitation || 'not provided'}
- In progress: ${fields.inProgress || 'not provided'}
Current page context:
- Page URL: ${page.url}
- Page heading: ${page.heading || page.title}
- Displayed summary: ${page.summary || 'not provided'}
- Captured at: ${capturedAt}
- Context marker: none`;
}
