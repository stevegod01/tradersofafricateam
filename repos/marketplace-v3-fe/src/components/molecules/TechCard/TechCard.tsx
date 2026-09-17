import SectionTitle from "@/components/atoms/SectionTitle/SectionTitle";
import Image from "next/image";

const TechCard = ({ title }: { title: string }) => {
  return (
    <div className="flex items-center gap-2">
      <Image
        src="/assets/icons/check-orange.svg"
        width={20}
        height={20}
        alt=""
        className="object-contain"
      />
      <SectionTitle title={title} className="font-semibold text-lg" />
    </div>
  );
};

export default TechCard;
