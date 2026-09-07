"use client";
import { StaffPageHeading } from "@/components/StaffPageHeading";
import { TicketWorkspace } from "@/components/TicketWorkspace";
import { StaffPageUser } from "@/components/StaffPageUser";
export default function Page() {
  return (
    <StaffPageUser>
      {(user) => (
        <>
          <StaffPageHeading
            title="Pending requests"
            subtitle="Review travel requests waiting for notes or finance approval."
          />
          <TicketWorkspace kind="pending" user={user} />
        </>
      )}
    </StaffPageUser>
  );
}
