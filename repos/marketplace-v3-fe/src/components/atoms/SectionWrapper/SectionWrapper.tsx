import Container from "../Container/Container";

const SectionWrapper = ({
  tag = "section",
  className = "lg:py-28 sm:py-20 py-14",
  children,
  paddingX = "xl:px-28",
  id,
}: {
  tag?: "section" | "footer";
  className?: string;
  children: React.ReactNode;
  paddingX?: string;
  id?: string;
}) => {
  const Tag = tag;

  return (
    <Tag id={id} className={`${className}`}>
      <Container className={paddingX}>{children}</Container>
    </Tag>
  );
};

export default SectionWrapper;
