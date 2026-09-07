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
            title="Request history"
            subtitle="Search completed and denied trip-ticket records."
          />
          <TicketWorkspace kind="history" user={user} />
        </>
      )}
    </StaffPageUser>
  );
}
