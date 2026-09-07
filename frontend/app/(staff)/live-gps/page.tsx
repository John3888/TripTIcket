import { LiveGps } from "@/components/LiveGps";
import { StaffPageHeading } from "@/components/StaffPageHeading";
export default function Page() {
  return (
    <>
      <StaffPageHeading
        title="Live GPS"
        subtitle="See the latest location reports for vehicles currently on trip."
      />
      <LiveGps />
    </>
  );
}
