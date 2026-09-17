import MainLayout from "@/components/templates/MainLayout/MainLayout";
import WhatWeDoWrapper from "@/components/organisms/WhatWeDoWrapper/WhatWeDoWrapper";
import OurServices from "@/components/organisms/OurServices/OurServices";

const WhatWeDoPage = () => {
  return (
    <MainLayout>
      <WhatWeDoWrapper />
      <OurServices />
    </MainLayout>
  );
};

export default WhatWeDoPage;
