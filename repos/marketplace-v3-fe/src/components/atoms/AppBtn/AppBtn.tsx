import Image from "next/image";

const AppBtn = ({
  imgUrl,
  url,
  alt,
}: {
  url: string;
  imgUrl: string;
  alt: string;
}) => {
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="w-[161.66px] min-w-[161.66px] h-[42.92px] bg-black rounded-[5px] cursor-pointer overflow-hidden"
    >
      <Image
        src={imgUrl}
        width={161.66}
        height={42.92}
        alt={alt}
        className="object-contain hover:scale-110 transition-all duration-300 ease-out"
      />
    </a>
  );
};

export default AppBtn;
