interface Props {
  fromCache?: boolean;
  apiUsed?: string;
  detailsMissing?: boolean;
}

export function CollectionSourceStatus({ fromCache, apiUsed, detailsMissing }: Props) {
  const source = [fromCache === true ? '缓存结果' : fromCache === false ? '本次接口采集' : '', apiUsed].filter(Boolean).join(' · ');
  if (!source && !detailsMissing) return null;
  return (
    <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400" role="status">
      {source}{source && detailsMissing ? ' · ' : ''}{detailsMissing ? '接口未返回详情图，仅展示已返回素材' : ''}
    </p>
  );
}
