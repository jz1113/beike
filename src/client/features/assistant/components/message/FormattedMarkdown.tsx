import { AssistantImageBatch } from '../panels/AssistantBatchPanel';
import AssistantCodeBlock from './AssistantCodeBlock';
import type { MediaAttachment } from '@client/store/appStoreTypes';
import MarkdownBody, { type MarkdownAccent } from '@client/shared/ui/markdown/MarkdownBody';

interface Props {
  content: string;
  referenceMedia?: MediaAttachment[];
  className?: string;
  accentColor?: MarkdownAccent;
}

export default function FormattedMarkdown({
  content,
  className = '',
  accentColor = 'amber',
  referenceMedia = [],
}: Props) {
  if (!content) return null;

  return (
    <MarkdownBody
      content={content}
      className={className}
      accentColor={accentColor}
      leading={<AssistantImageBatch content={content} referenceMedia={referenceMedia} />}
      renderCode={(code, lang, incomplete) => (
        <AssistantCodeBlock code={code} lang={lang} referenceMedia={referenceMedia} incomplete={incomplete} />
      )}
    />
  );
}
