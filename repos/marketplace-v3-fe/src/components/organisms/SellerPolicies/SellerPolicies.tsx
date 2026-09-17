import { useTranslations } from "next-intl";
import { FileWarning, ShieldCheck } from "lucide-react";

import ScrollReveal from "@/components/atoms/ScrollReveal/ScrollReveal";
import SectionWrapper from "@/components/atoms/SectionWrapper/SectionWrapper";
import SellerPolicyCard from "@/components/atoms/SellerPolicyCard/SellerPolicyCard";

const SellerPolicies = () => {
  const t = useTranslations("becomeSeller");

  return (
    <SectionWrapper className="bg-background py-16 lg:py-20">
      <div className="grid gap-6 lg:grid-cols-2">
        <ScrollReveal>
          <SellerPolicyCard
            icon={ShieldCheck}
            title={t("policies.compliance.title")}
            description={t("policies.compliance.description")}
            downloadLabel={t("policies.compliance.download")}
            downloadHref="/documents/supplier-compliance.pdf"
          />
        </ScrollReveal>
        <ScrollReveal delay={0.08}>
          <SellerPolicyCard
            icon={FileWarning}
            title={t("policies.exclusions.title")}
            description={t("policies.exclusions.description")}
            downloadLabel={t("policies.exclusions.download")}
            downloadHref="/documents/product-exclusions.pdf"
          />
        </ScrollReveal>
      </div>
    </SectionWrapper>
  );
};

export default SellerPolicies;
