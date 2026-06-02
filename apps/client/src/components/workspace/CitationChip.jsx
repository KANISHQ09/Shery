import AppIcon from '../AppIcon';

export default function CitationChip({ rawText, title, meta, sourceType, onClick }) {
  const getIcon = () => {
    if (sourceType === 'youtube') return 'video';
    if (sourceType === 'pdf') return 'file';
    return 'alignLeft';
  };

  return (
    <span
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.03] border border-white/5 px-2 py-0.5 text-[10px] font-medium text-slate-350 cursor-pointer hover:bg-white/[0.06] hover:text-orange-400 transition-premium mx-0.5 select-none shadow-sm"
      title={`Click to open preview: ${title} (${meta})`}
    >
      <AppIcon name={getIcon()} size={9} />
      <span>{meta ? `${title} — ${meta}` : title}</span>
    </span>
  );
}

