import type {
  TurnStreamState,
} from '@client/features/assistant/model/assistantTurnTypes';
import {
  deriveTurnView,
  type DerivedTurnView,
} from '@client/shared/agent/turnItems';
import type { AssistantItem } from '@shared/domain/assistant/types';

export { applyItemEvent, finishInterruptedItems, makeEmptyItem } from '@client/shared/agent/turnItems';

export function initialState(): TurnStreamState {
  return {
    content: '',
    thinking: '',
    modelUsed: '',
    toolActivity: [],
    pendingApprovals: [],
    sessionApprovals: [],
  };
}

/**
 * 从 item[] 派生 legacy TurnStreamState 字段。
 * 这层 adapter 让旧的 UI（AssistantMessageList + TurnTimeline + ApprovalCard）继续可用，
 * 同时新 UI（AssistantTurnList）直接消费 items[]。
 */
export function deriveLegacyState(items: AssistantItem[]): Pick<TurnStreamState, 'content' | 'thinking' | 'toolActivity' | 'pendingApprovals'> {
  const view: DerivedTurnView = deriveTurnView(items);
  return view;
}
