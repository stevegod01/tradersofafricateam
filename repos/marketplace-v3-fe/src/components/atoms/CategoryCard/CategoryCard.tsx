import { useGetAllRoutes } from "@/lib/hooks/useGetAllRoutes";
import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const CategoryCard = ({
  isActive,
  onMouseEnter,
  onMouseLeave,
  icon,
  name,
  id,
}: {
  isActive: boolean;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  icon: string;
  name: string;
  id: string;
}) => {
  const { routes } = useGetAllRoutes();
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.75 cursor-pointer border-b border-muted last:border-0 transition-colors ${
        isActive ? "bg-(--orange-light)" : "hover:bg-muted/50"
      }`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <Link
        href={routes?.categoryInfo(id)}
        className="flex items-center gap-2 flex-1 group"
      >
        <Image src={icon} alt={name} width={26} height={26} />
        <span
          className={`text-xs flex-1 group-hover:underline transition-all duration-300 ${
            isActive ? "text-(--orange) font-medium" : "text-foreground"
          }`}
        >
          {name}
        </span>
      </Link>
      <ChevronRight size={12} className="text-muted-foreground" />
    </div>
  );
};

export default CategoryCard;
