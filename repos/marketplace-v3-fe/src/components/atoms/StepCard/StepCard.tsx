import Image from "next/image";

const StepCard = ({
  iconUrl,
  title,
  desc,
}: {
  iconUrl: string;
  title: string;
  desc: string;
}) => {
  return (
    <div className="sm:max-w-62 w-full min-w-62 space-y-3 text-background">
      <div className="w-12 h-11 flex justify-center items-center rounded-full bg-(--orange-light)">
        <Image
          src={iconUrl}
          alt={title}
          width={24}
          height={24}
          className="object-contain"
        />
      </div>
      <div className="space-y-2">
        <h6 className="sm:text-[20px] font-semibold">{title}</h6>
        <p className="max-sm:text-sm">{desc}</p>
      </div>
    </div>
  );
};

export default StepCard;
