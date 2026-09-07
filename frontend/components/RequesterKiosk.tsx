/* eslint-disable react-hooks/set-state-in-effect */
"use client";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  CarFront,
  ClipboardList,
  Clock3,
  History,
  MapPin,
  ScanLine,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanModal } from "./ScanModal";
import { ticketService } from "@/services/ticket.service";
import type { Employee, ScanResult, Vehicle } from "@/types/trip-ticket";
import { departmentLabel } from "@/app/(admin)/config/menu.config";

const KIOSK_IDENTITY_KEY = "emb-kiosk-request-identity";

type KioskIdentity = Pick<ScanResult, "employee" | "rfidToken">;

export function RequesterKiosk({ view = "home" }: { view?: "home" | "new" }) {
  const router = useRouter(),
    [scan, setScan] = useState<false | "ticket" | "movement">(false),
    [employee, setEmployee] = useState<Employee | null>(null),
    [rfidToken, setRfidToken] = useState(""),
    [vehicles, setVehicles] = useState<Vehicle[]>([]),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  useEffect(() => {
    ticketService
      .kioskStore()
      .then((s) => setVehicles(s.vehicles.filter((v) => v.status.toLowerCase() === "standby")))
      .catch((e) => setError(e instanceof Error ? e.message : "Vehicles are unavailable."));
  }, []);
  useEffect(() => {
    if (view !== "new") return;
    try {
      const saved = window.sessionStorage.getItem(KIOSK_IDENTITY_KEY);
      if (!saved) return;
      const identity = JSON.parse(saved) as KioskIdentity;
      if (identity.employee?.employeeId && identity.rfidToken) {
        setEmployee(identity.employee);
        setRfidToken(identity.rfidToken);
      }
    } catch {
      window.sessionStorage.removeItem(KIOSK_IDENTITY_KEY);
    }
  }, [view]);
  const identified = view === "new";
  const scanned = (r: ScanResult) => {
    setEmployee(r.employee);
    setRfidToken(r.rfidToken);
    if (r.type === "ticket" && view === "home") {
      window.sessionStorage.setItem(
        KIOSK_IDENTITY_KEY,
        JSON.stringify({ employee: r.employee, rfidToken: r.rfidToken } satisfies KioskIdentity),
      );
      router.push("/request/new");
    }
  };
  const changeCard = () => {
    window.sessionStorage.removeItem(KIOSK_IDENTITY_KEY);
    setEmployee(null);
    setRfidToken("");
    setError("");
    setScan("ticket");
  };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!employee || !rfidToken) return setError("Scan an employee ID before submitting.");
    const f = new FormData(e.currentTarget);
    setError("");
    try {
      const s = await ticketService.create({
        plate: String(f.get("plate") || ""),
        destination: String(f.get("destination") || ""),
        purpose: String(f.get("purpose") || ""),
        days: Number(f.get("days") || 0),
        hours: Number(f.get("hours") || 0),
        minutes: Number(f.get("minutes") || 0),
        rfidToken,
      });
      setSuccess(`${s.createdRequest?.id || "Trip ticket"} submitted successfully.`);
      window.sessionStorage.removeItem(KIOSK_IDENTITY_KEY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request could not be submitted.");
    }
  };
  if (identified)
    return (
      <KioskFrame>
        <div className="kiosk-form-wrap">
          <Link className="back" href="/request">
            <ArrowLeft /> Back
          </Link>
          <div className="request-journey" aria-label="Request progress">
            <span className={employee ? "complete" : "active"}>
              <b>01</b> Verify identity
            </span>
            <i />
            <span className={employee ? "active" : ""}>
              <b>02</b> Trip details
            </span>
            <i />
            <span>
              <b>03</b> Submit request
            </span>
          </div>
          <div className="form-heading">
            <div>
              <p className="eyebrow">NEW REQUEST</p>
              <h1>Trip Ticket Request</h1>
              <p>
                Complete the travel details below. Your scanned identity is locked to this request.
              </p>
            </div>
            {employee && (
              <div className="verified">
                <BadgeCheck className="verified-icon" aria-hidden="true" />
                <span>
                  <small>IDENTITY VERIFIED</small>
                  <b>{employee.name}</b>
                  <em>
                    {employee.employeeId} · {departmentLabel(employee.department)}
                  </em>
                </span>
                <button type="button" onClick={changeCard}>
                  Change card
                </button>
              </div>
            )}
          </div>
          {success ? (
            <section className="screen-state">
              <BadgeCheck className="success-icon" aria-hidden="true" />
              <h2>Ticket Submitted</h2>
              <p>{success}</p>
              <Link className="btn primary" href="/request">
                Done
              </Link>
            </section>
          ) : employee ? (
            <form className="request-form" onSubmit={submit}>
              <label>
                <span>Requested by</span>
                <div className="input-icon">
                  <UserRound />
                  <input readOnly value={employee?.name || "Scan required"} />
                </div>
              </label>
              <label>
                <span>Standby vehicle</span>
                <div className="input-icon">
                  <CarFront />
                  <select name="plate" required defaultValue="">
                    <option value="" disabled>
                      Select an available vehicle
                    </option>
                    {vehicles.map((v) => (
                      <option key={v.vehicleId} value={v.plate}>
                        {v.plate}
                        {v.description ? ` — ${v.description}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </label>
              <label className="wide">
                <span>Destination</span>
                <div className="input-icon">
                  <MapPin />
                  <input name="destination" required placeholder="Enter destination or office" />
                </div>
              </label>
              <fieldset>
                <legend>Estimated duration</legend>
                <label>
                  <span>Days</span>
                  <input name="days" type="number" min="0" defaultValue="0" />
                </label>
                <label>
                  <span>Hours</span>
                  <input name="hours" type="number" min="0" defaultValue="0" />
                </label>
                <label>
                  <span>Minutes</span>
                  <input name="minutes" type="number" min="0" max="59" defaultValue="0" />
                </label>
              </fieldset>
              <label className="wide">
                <span>Purpose of travel</span>
                <textarea
                  name="purpose"
                  required
                  rows={4}
                  placeholder="Briefly describe the official purpose of this trip"
                />
              </label>
              {error && (
                <p className="login-error wide" role="alert">
                  {error}
                </p>
              )}
              <footer>
                <Link
                  href="/request"
                  className="btn secondary"
                  onClick={() => window.sessionStorage.removeItem(KIOSK_IDENTITY_KEY)}
                >
                  Cancel
                </Link>
                <button className="btn primary" type="submit" disabled={!employee}>
                  Submit Trip Ticket
                </button>
              </footer>
            </form>
          ) : (
            <section className="identity-station" aria-labelledby="identity-station-title">
              <div className="station-mark" aria-hidden="true">
                <span className="station-ring ring-one" />
                <span className="station-ring ring-two" />
                <ScanLine />
              </div>
              <div>
                <p className="eyebrow">STEP 01 · IDENTITY CHECK</p>
                <h2 id="identity-station-title">Tap your employee card here</h2>
                <p>Your card confirms who is making this request. You only need to scan it once.</p>
                {error && (
                  <p className="kiosk-alert" role="alert">
                    {error}
                  </p>
                )}
              </div>
              <button className="station-action" onClick={() => setScan("ticket")}>
                <span>Open card reader</span>
                <b>Tap to identify →</b>
              </button>
            </section>
          )}
        </div>
        <ScanModal
          open={scan === "ticket"}
          type="ticket"
          onScan={scanned}
          onClose={() => setScan(false)}
        />
      </KioskFrame>
    );
  return (
    <KioskFrame>
      <main className="kiosk-home">
        <p className="eyebrow">EMPLOYEE SELF-SERVICE KIOSK</p>
        <h1>Choose your next stop.</h1>
        <p>Tap your employee ID once to begin a trip request or record a vehicle movement.</p>
        {error && <p role="alert">{error}</p>}
        <div className="kiosk-actions">
          <button className="action-card primary-card" onClick={() => setScan("ticket")}>
            <span>
              <ScanLine />
            </span>
            <b>Make a Request</b>
            <small>Scan ID and create a new trip ticket</small>
            <em>SCAN TO BEGIN →</em>
          </button>
          <button className="action-card" onClick={() => setScan("movement")}>
            <span>
              <CarFront />
            </span>
            <b>Depart / Arrive</b>
            <small>Record the start or completion of your trip</small>
            <em>SCAN ID CARD →</em>
          </button>
          <Link className="action-card" href="/request/pending">
            <span>
              <ClipboardList />
            </span>
            <b>View Tickets</b>
            <small>Check pending, outgoing, and past requests</small>
            <em>OPEN RECORDS →</em>
          </Link>
        </div>
        <div className="kiosk-shortcuts">
          <Link href="/request/pending">
            <Clock3 />
            Pending tickets
          </Link>
          <Link href="/request/outgoing">
            <CarFront />
            Outgoing trips
          </Link>
          <Link href="/request/history">
            <History />
            Ticket history
          </Link>
        </div>
      </main>
      <ScanModal
        open={Boolean(scan)}
        type={scan || "ticket"}
        onScan={scanned}
        onClose={() => setScan(false)}
      />
    </KioskFrame>
  );
}
function KioskFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="kiosk">
      <header className="kiosk-header">
        <Link href="/request" className="kiosk-brand">
          <Image src="/assets/emb-logo.png" width={62} height={62} alt="EMB logo" />
          <span>
            <b>EMB CAPITAL LENDING CORPORATION</b>
            <small>TRIP TICKET MANAGEMENT SYSTEM</small>
          </span>
        </Link>
        <div className="system-state">RFID-ENABLED STATION</div>
      </header>
      {children}
      <footer className="kiosk-footer">
        Official use only <span /> Environmental Management Bureau Operations
      </footer>
    </div>
  );
}
