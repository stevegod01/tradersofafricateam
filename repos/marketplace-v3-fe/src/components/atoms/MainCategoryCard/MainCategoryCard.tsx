import Image from "next/image";
import Link from "next/link";

const MainCategoryCard = ({
  href,
  image,
  category,
}: {
  href: string;
  image: string;
  category: string;
}) => {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 sm:max-w-37.5 sm:min-w-37.5 max-w-24 min-w-24 rounded-xl transition-all duration-300 shrink-0 group hover:shadow-sm bg-background sm:pb-2"
    >
      <div className="sm:w-37.5 sm:h-37.5 w-24 h-24 overflow-hidden bg-muted/40 shrink-0 rounded-xl">
        <Image
          src={image}
          alt={category}
          width={150}
          height={150}
          className="w-full h-full object-cover group-hover:scale-110 transition-all duration-300"
          draggable={false}
        />
      </div>
      <span className="sm:text-sm text-[11px] text-center leading-tight group-hover:text-(--orange) transition-all duration-300">
        {category}
      </span>
    </Link>
  );
};

export default MainCategoryCard;
