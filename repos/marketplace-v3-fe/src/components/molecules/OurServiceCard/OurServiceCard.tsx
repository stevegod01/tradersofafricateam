import SectionTitle from "@/components/atoms/SectionTitle/SectionTitle";
import Image from "next/image";

const OurServiceCard = ({
  isImgFirst = false,
  title,
  children,
  imgUrl,
  size = 360,
  className,
  alignment = "justify-center",
}: {
  isImgFirst?: boolean;
  title: string;
  children: React.ReactNode;
  imgUrl: string;
  size?: number;
  className: string;
  alignment?: string;
}) => {
  return (
    <div
      className={`flex items-center justify-between flex-wrap sm:gap-10 gap-6 ${isImgFirst && "flex-row-reverse"}`}
    >
      <div className="max-w-xl w-full min-w-75 space-y-6">
        <SectionTitle
          title={title}
          className="font-bold sm:text-4xl text-2xl"
        />
        {children}
      </div>
      <div
        className={`flex-1 w-full h-auto min-w-75 min-h-60 flex items-center ${alignment}`}
      >
        <div className="">
          <Image
            src={imgUrl}
            width={size}
            height={size}
            alt=""
            className={`h-auto ${className}`}
          />
        </div>
      </div>
    </div>
  );
};

export default OurServiceCard;
