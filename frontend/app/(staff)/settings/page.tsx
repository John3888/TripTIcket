import { AccountSettings } from "@/components/AccountSettings";
import { StaffPageHeading } from "@/components/StaffPageHeading";
export default function Page() {
  return (
    <>
      <StaffPageHeading
        title="Account settings"
        subtitle="Manage your sign-in details and notification preferences."
      />
      <AccountSettings />
    </>
  );
}
