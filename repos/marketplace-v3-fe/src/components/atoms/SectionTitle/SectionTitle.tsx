const SectionTitle = ({
  title,
  className = "font-semibold text-xl text-(--orange)",
}: {
  title: string;
  className?: string;
}) => {
  return <h2 className={` ${className}`}>{title}</h2>;
};

export default SectionTitle;
