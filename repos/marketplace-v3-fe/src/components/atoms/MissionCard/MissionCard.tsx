const MissionCard = ({
  title,
  desc,
  className,
}: {
  title: string;
  desc: string;
  className?: string;
}) => {
  return (
    <div
      className={`text-background max-w-lg w-full col-span-6 space-y-4 ${className}`}
    >
      <div className="flex items-center gap-2">
        <div className="w-10 h-px bg-(--orange)" />
        <h2 className="text-sm">{title}</h2>
      </div>
      <p className="font-semibold text-xl">{desc}</p>
    </div>
  );
};

export default MissionCard;
