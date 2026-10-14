import AssistantExecution from './AssistantExecution';
export { activityTarget } from '../model/assistantActivity';

export default function AssistantLiveStatus({ message }: { message?: string }) {
  return <AssistantExecution isSending message={message} />;
}
