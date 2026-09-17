const StyledParagraph = ({
  desc,
  className = "",
}: {
  desc: string;
  className?: string;
}) => {
  return (
    <div className="border-l-4 border-(--orange) py-2">
      <p
        className={`sm:pl-6 pl-4 font-semibold sm:text-xl text-lg leading-loose ${className}`}
      >
        {desc}
      </p>
    </div>
  );
};

export default StyledParagraph;
