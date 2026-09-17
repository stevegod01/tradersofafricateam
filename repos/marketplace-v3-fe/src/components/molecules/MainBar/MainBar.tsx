import Container from "@/components/atoms/Container/Container";
import Logo from "@/components/atoms/Logo/Logo";
import MainSearchbar from "../MainSearchbar/MainSearchbar";
import NavbarActionWrapper from "../NavbarActionWrapper/NavbarActionWrapper";

const MainBar = ({
  mobileOpen,
  toggle,
}: {
  mobileOpen: boolean;
  toggle: () => void;
}) => {
  return (
    <div className="w-full bg-background">
      <Container>
        <div className="flex items-center justify-between gap-3 md:gap-5 h-16 w-full">
          <Logo />
          <div className="max-md:hidden  max-w-2xl w-full">
            <MainSearchbar />
          </div>
          <NavbarActionWrapper mobileOpen={mobileOpen} toggle={toggle} />
        </div>
      </Container>
    </div>
  );
};

export default MainBar;
