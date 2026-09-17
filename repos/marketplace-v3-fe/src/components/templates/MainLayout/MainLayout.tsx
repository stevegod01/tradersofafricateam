import TopNavbar from "@/components/molecules/TopNavbar/TopNavbar";
import FooterSection from "@/components/organisms/FooterSection/FooterSection";
import Navbar from "@/components/organisms/Navbar/Navbar";

const MainLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen relative w-full bg-muted/70 text-primary">
      <TopNavbar />
      <Navbar />
      <main>{children}</main>
      <FooterSection />
    </div>
  );
};

export default MainLayout;
