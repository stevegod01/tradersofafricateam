const FadeMask = ({
  isActive,
  className = "bg-linear-to-r left-0",
}: {
  isActive: boolean;
  className?: string;
}) => {
  return (
    <div
      className={`absolute top-0 bottom-0 w-10  from-background to-transparent z-4 pointer-events-none transition-opacity duration-200 ${className} ${
        isActive ? "opacity-100" : "opacity-0"
      }`}
    />
  );
};

export default FadeMask;
