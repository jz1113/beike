'use client';
import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import AppSidebar from '@/components/common/AppSidebar';
import Navbar from '@/components/common/Navbar';
import CreativeHub from '@/components/hub/CreativeHub';
import GenerateWorkspace from '@/components/workspace/GenerateWorkspace';
import BuyerShowStudio from '@/components/studio/BuyerShowStudio';
import AssetCenter from '@/components/assets/AssetCenter';
import ProductHistoryModal from '@/components/modals/ProductHistoryModal';
import PromptHistoryModal from '@/components/modals/PromptHistoryModal';
import SettingsModal from '@/components/modals/SettingsModal';
import UniversalCollectorModal from '@/components/modals/UniversalCollectorModal';
import ImageLightboxModal from '@/components/modals/ImageLightboxModal';
import AIAssistantButton from '@/components/assistant/AIAssistantButton';
import AIAssistantDrawer from '@/components/assistant/AIAssistantDrawer';

export default function Home() {
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isPromptHistoryOpen, setIsPromptHistoryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCollectorOpen, setIsCollectorOpen] = useState(false);

  const { currentView, setCurrentView, currentStep, setStep } = useAppStore();

  return (
    <div className="h-screen w-screen bg-[#F8F9FA] text-slate-900 flex overflow-hidden selection:bg-blue-100 selection:text-blue-900">
      {/* 🌟 1. 左侧常驻导航条 */}
      <AppSidebar
        currentView={currentView}
        onNavigateHub={() => setCurrentView('hub')}
        onNavigateGenerate={() => setCurrentView('generate')}
        onNavigateBuyerShow={() => {
          useAppStore.getState().setWorkshopMode('social_face_product_swap');
          setCurrentView('buyer_show');
        }}
        onNavigateAssets={() => setCurrentView('assets')}
        onOpenProductVault={() => setIsHistoryOpen(true)}
        onOpenPromptVault={() => setIsPromptHistoryOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* 🌟 2. 右侧主工作区 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* 顶部轻奢导航栏 (仅在买家秀工坊流程中展示 4 步进度条，展馆和生成工作区纯净展示) */}
        {currentView === 'buyer_show' && (
          <Navbar 
            currentView={currentView}
            currentStep={currentStep} 
            onBackToHub={() => setCurrentView('hub')}
            onSelectStep={(step) => setStep(step)}
            onOpenHistory={() => setIsHistoryOpen(true)} 
            onOpenPromptHistory={() => setIsPromptHistoryOpen(true)}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
        )}

        {/* 页面主视图：展馆首页 vs 生成工作区 vs 沉浸式买家秀工坊 vs 资产中心 */}
        <main className="flex-1 overflow-hidden flex flex-col">
          {currentView === 'hub' ? (
            <CreativeHub 
              onEnterBuyerShow={() => {
                useAppStore.getState().setWorkshopMode('social_face_product_swap');
                setCurrentView('buyer_show');
              }}
              onOpenHistory={() => setIsHistoryOpen(true)}
              onOpenPromptVault={() => setIsPromptHistoryOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenCollectorHub={() => setIsCollectorOpen(true)}
            />
          ) : currentView === 'generate' ? (
            <GenerateWorkspace 
              onOpenProductVault={() => setIsHistoryOpen(true)}
              onOpenPromptVault={() => setIsPromptHistoryOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          ) : currentView === 'assets' ? (
            <AssetCenter 
              onEnterBuyerShow={() => setCurrentView('buyer_show')}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          ) : (
            <BuyerShowStudio 
              onOpenHistory={() => setIsHistoryOpen(true)}
              onOpenPromptHistory={() => setIsPromptHistoryOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}
        </main>
      </div>

      {/* 全局大图放大查看与下载模态框 */}
      <ImageLightboxModal />

      {/* 🌟 右下角常驻多模态 AI 问答助手与抽屉面板 */}
      <AIAssistantButton />
      <AIAssistantDrawer onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* 🌟 全渠道智能采集与资产汇总中心 */}
      <UniversalCollectorModal
        isOpen={isCollectorOpen}
        onClose={() => setIsCollectorOpen(false)}
        onEnterBuyerShow={() => {
          setIsCollectorOpen(false);
          setCurrentView('buyer_show');
        }}
      />

      {/* 全局明亮轻奢弹窗：商品库 / 提示词库 / 模型配置中心 */}
      <ProductHistoryModal 
        isOpen={isHistoryOpen} 
        onClose={() => setIsHistoryOpen(false)} 
      />

      <PromptHistoryModal 
        isOpen={isPromptHistoryOpen} 
        onClose={() => setIsPromptHistoryOpen(false)} 
      />

      {isSettingsOpen && (
        <SettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
        />
      )}
    </div>
  );
}
