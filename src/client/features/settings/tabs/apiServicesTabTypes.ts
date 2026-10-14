import type { useSettingsConfig } from '../hooks/useSettingsConfig';
import type { useCustomModels } from '../hooks/useCustomModels';
import type { ModelChannel } from '../model/modelManagement';

export interface ApiServicesTabProps {
  config: ReturnType<typeof useSettingsConfig>;
  models: ReturnType<typeof useCustomModels>;
  group: 'models' | 'other' | 'all' | 'storage';
  selectedServiceId: string;
  setSelectedServiceId: (id: string) => void;
  serviceSearch: string;
  setServiceSearch: (value: string) => void;
  onAddModel: (channel: ModelChannel) => void;
  onManageModels: () => void;
  defaultRouteIds: string[];
  showToast: (message: string) => void;
}
