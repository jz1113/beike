import React from 'react';

export const BatchStage1OverviewCard: React.FC = () => {
  return (
    <div className="relative w-full max-w-2xl mx-auto py-8 sm:py-12 px-4 flex flex-col items-center select-none animate-in fade-in zoom-in-98 duration-300">
      {/* 居中大标题与种草业务副标题 */}
      <div className="flex flex-col items-center justify-center gap-2 w-full relative text-center">
        <div className="flex items-center justify-center gap-3 w-full relative">
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            输入商品，一键生成小红书种草内容
          </h2>

        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg leading-relaxed">
          自动提取商品卖点，生成标题、正文与配图灵感，让商品内容更快发布、更容易种草
        </p>
      </div>
    </div>
  );
};
