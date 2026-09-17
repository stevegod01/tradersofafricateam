const DotIndicator = ({
  setCurrent,
  isCurrent,
  i,
}: {
  isCurrent: boolean;
  setCurrent: (i: number) => void;
  i: number;
}) => {
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        setCurrent(i);
      }}
      aria-label={`Go to slide ${i + 1}`}
      className={`h-1.75 rounded-full transition-all duration-300 ${
        isCurrent ? "w-5 bg-white" : "w-1.75 bg-white/45 hover:bg-white/70"
      }`}
    />
  );
};

export default DotIndicator;
