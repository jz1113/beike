import AssistantExecution from './AssistantExecution';
export { activityTarget } from '../utils/assistantActivity';

export default function AssistantLiveStatus({ message }: { message?: string }) {
  return <AssistantExecution isSending message={message} />;
}
