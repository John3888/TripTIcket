import { DeviceManagement } from "@/components/DeviceManagement";
import { StaffPageHeading } from "@/components/StaffPageHeading";
export default function DevicesPage() {
  return <><StaffPageHeading title="Fleet devices" subtitle="Register GPS trackers and manage their vehicle assignments." /><DeviceManagement /></>;
}
