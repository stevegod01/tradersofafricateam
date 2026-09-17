import SidebarSectionLabel from "@/features/dashboard/components/atoms/SidebarSectionLabel/SidebarSectionLabel";
import SidebarNavLink from "@/features/dashboard/components/atoms/SidebarNavLink/SidebarNavLink";
import { DashboardNavSection } from "@/features/dashboard/types";

const SidebarSection = ({
  section,
  onNavigate,
}: {
  section: DashboardNavSection;
  onNavigate?: () => void;
}) => (
  <div>
    <SidebarSectionLabel>{section.label}</SidebarSectionLabel>
    <div className="flex flex-col gap-0.5">
      {section.items.map((item) => (
        <SidebarNavLink
          key={item.href}
          href={item.href}
          label={item.label}
          icon={item.icon}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  </div>
);

export default SidebarSection;
