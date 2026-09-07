"use client";

import { AccountRegistry } from "@/components/AccountRegistry";
import { StaffPageHeading } from "@/components/StaffPageHeading";

export default function AccountRegistryPage() {
  return (
    <>
      <StaffPageHeading
        title="Account registry"
        subtitle="Create department-based employee accounts and securely assign RFID cards."
      />
      <AccountRegistry />
    </>
  );
}
