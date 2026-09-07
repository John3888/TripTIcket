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
            title="Outgoing trips"
            subtitle="Monitor approved travel and active vehicle movements."
          />
          <TicketWorkspace kind="outgoing" user={user} />
        </>
      )}
    </StaffPageUser>
  );
}
