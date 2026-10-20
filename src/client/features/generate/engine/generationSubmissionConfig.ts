import { GenerationSubmissionQueue } from './generationSubmissionQueue';
import { getGenerationMediaConcurrency, subscribeGenerationMediaConcurrency } from '@client/shared/agent/generationConcurrency';

export { getGenerationMediaConcurrency, setGenerationMediaConcurrency, subscribeGenerationMediaConcurrency } from '@client/shared/agent/generationConcurrency';

// The shared preference has no feature imports; UI and engines use the same value.
export const generationSubmissionQueue = new GenerationSubmissionQueue();
generationSubmissionQueue.setMediaConcurrency(getGenerationMediaConcurrency());
subscribeGenerationMediaConcurrency(() => generationSubmissionQueue.setMediaConcurrency(getGenerationMediaConcurrency()));
