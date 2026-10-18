interface Props {
  title: string;
  subtitle: string;
}

export function StudioHero({ title, subtitle }: Props) {
  return (
    <div className="text-center">
      <h1 className="text-3xl font-black tracking-[-0.045em] text-slate-950 dark:text-white sm:text-[40px]">{title}</h1>
      <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}
