import SellerBenefits from "@/components/organisms/SellerBenefits/SellerBenefits";
import SellerHero from "@/components/organisms/SellerHero/SellerHero";
import SellerOnboarding from "@/components/organisms/SellerOnboarding/SellerOnboarding";
import SellerPolicies from "@/components/organisms/SellerPolicies/SellerPolicies";
import SellerPricing from "@/components/organisms/SellerPricing/SellerPricing";
import SellerTutorial from "@/components/organisms/SellerTutorial/SellerTutorial";

const BecomeSellerWrapper = () => (
  <div>
    <SellerHero />
    <SellerBenefits />
    <SellerOnboarding />
    <SellerPricing />
    <SellerPolicies />
    <SellerTutorial />
  </div>
);

export default BecomeSellerWrapper;
