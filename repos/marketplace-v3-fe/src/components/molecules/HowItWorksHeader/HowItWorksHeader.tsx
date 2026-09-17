import HorizontalLine from "@/components/atoms/HorizontalLine/HorizontalLine";
import HowItWorksTitle from "@/components/atoms/HowItWorksTitle/HowItWorksTitle";

const HowItWorksHeader = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex items-end gap-6">
      <div className="">
        <HowItWorksTitle>{children}</HowItWorksTitle>
      </div>
      <HorizontalLine />
    </div>
  );
};

export default HowItWorksHeader;
