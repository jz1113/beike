import {
  Clapperboard,
  History,
  Package,
  Plus,
  Settings2,
  ShoppingBag,
  Sparkles,
  Film,
} from 'lucide-react';
import { StudioBrandChip, StudioDockBar, studioDockClass } from '@client/shared/ui/studio';
import { useVideoSalesStudio } from './hooks/useVideoSalesStudio';
import { ProductSetupPanel } from './components/ProductSetupPanel';
import { ScriptStoryboardEditor } from './components/ScriptStoryboardEditor';
import { AssetPipelineView } from './components/AssetPipelineView';
import { TimelineComposerView } from './components/TimelineComposerView';
import { PlatformExportPanel } from './components/PlatformExportPanel';

interface Props {
  onBack: () => void;
  onOpenSettings?: () => void;
}

export default function VideoSalesStudio({ onBack, onOpenSettings }: Props) {
  const {
    state,
    updateState,
    goToStep,
    isAnalyzing,
    isGeneratingScript,
    isComposing,
    composeProgress,
    error,
    runProductAnalysis,
    runScriptGeneration,
    updateCurrentScriptShots,
    runVideoComposition,
    useExampleScripts,
    resetProject,
  } = useVideoSalesStudio();

  const currentScript = state.scripts[state.selectedScriptIndex] || state.scripts[0];

  const dock = [
    { id: 'new', icon: <Plus className="h-4 w-4" />, label: '新建', onClick: resetProject, className: studioDockClass(false) },
    { id: 'setup', icon: <Package className="h-4 w-4" />, label: '商品', onClick: () => goToStep('setup'), active: state.currentStep === 'setup', className: studioDockClass(state.currentStep === 'setup') },
    { id: 'script', icon: <Sparkles className="h-4 w-4" />, label: '分镜脚本', onClick: () => goToStep('script'), active: state.currentStep === 'script', className: studioDockClass(state.currentStep === 'script') },
    { id: 'assets', icon: <Film className="h-4 w-4" />, label: '素材', onClick: () => goToStep('assets'), active: state.currentStep === 'assets', className: studioDockClass(state.currentStep === 'assets') },
    { id: 'compose', icon: <Clapperboard className="h-4 w-4" />, label: '合成', onClick: () => goToStep('compose'), active: state.currentStep === 'compose', className: studioDockClass(state.currentStep === 'compose') },
    { id: 'export', icon: <History className="h-4 w-4" />, label: '发布', onClick: () => goToStep('export'), active: state.currentStep === 'export', className: studioDockClass(state.currentStep === 'export') },
    { id: 'settings', icon: <Settings2 className="h-4 w-4" />, label: '设置', onClick: () => onOpenSettings?.(), className: studioDockClass(false) },
  ];

  return (
    <div className="relative h-full w-full flex flex-col bg-transparent text-slate-900 dark:text-[#EDEDED] overflow-hidden select-none">
      <StudioBrandChip title="视频带货" icon={<ShoppingBag className="h-4 w-4" />} onBack={onBack} />
      <StudioDockBar items={dock} label="视频带货导航" />
      <main className="flex-1 overflow-y-auto px-6 pt-20">
        {state.currentStep === 'setup' && (
          <ProductSetupPanel
            state={state}
            updateState={updateState}
            isAnalyzing={isAnalyzing}
            isGeneratingScript={isGeneratingScript}
            error={error}
            onAnalyze={runProductAnalysis}
            onGenerate={runScriptGeneration}
            onUseExample={useExampleScripts}
          />
        )}

        {state.currentStep === 'script' && (
          <ScriptStoryboardEditor
            scripts={state.scripts}
            selectedScriptIndex={state.selectedScriptIndex}
            onSelectScript={(idx) => updateState({ selectedScriptIndex: idx })}
            onUpdateShots={updateCurrentScriptShots}
            onNext={() => goToStep('assets')}
            onBack={() => goToStep('setup')}
          />
        )}

        {state.currentStep === 'assets' && (
          <AssetPipelineView
            shots={currentScript?.shots || []}
            productImages={state.productImages}
            videoModel={state.selectedVideoModel}
            imageModel={state.selectedImageModel}
            voiceModel={state.selectedVoiceModel}
            onUpdateShots={updateCurrentScriptShots}
            onNext={() => goToStep('compose')}
            onBack={() => goToStep('script')}
          />
        )}

        {state.currentStep === 'compose' && (
          <TimelineComposerView
            shots={currentScript?.shots || []}
            isComposing={isComposing}
            composeProgress={composeProgress}
            onCompose={runVideoComposition}
            onBack={() => goToStep('assets')}
          />
        )}

        {state.currentStep === 'export' && currentScript && (
          <PlatformExportPanel
            script={currentScript}
            resultUrl={state.composedResultUrl || state.productImages[0]}
            onRestart={() => goToStep('setup')}
          />
        )}
      </main>
    </div>
  );
}
