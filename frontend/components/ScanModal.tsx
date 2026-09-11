/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";
import { BadgeCheck, CreditCard, Radio, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { accountService, type ExistingCardAssignment } from "@/services/account.service";
import { rfidService } from "@/services/rfid.service";
import { ticketService } from "@/services/ticket.service";
import type { DeviceStatus, ScanResult, Ticket } from "@/types/trip-ticket";
import { departmentLabel } from "@/app/(admin)/config/menu.config";
import { TravelTime } from "./TravelTime";

type Props = {
  open: boolean;
  onClose: () => void;
  onScan?: (result: ScanResult) => void;
  type?: "ticket" | "movement";
  message?: string;
  registration?: boolean;
};
export function ScanModal({
  open,
  onClose,
  onScan,
  type = "ticket",
  message = "Hold your employee ID over the reader",
  registration = false,
}: Props) {
  const [status, setStatus] = useState<DeviceStatus>({
    connected: false,
    message: "Checking ESP32 reader…",
  });
  const [error, setError] = useState(""),
    [scanning, setScanning] = useState(false),
    [existing, setExisting] = useState<ExistingCardAssignment | null>(null);
  const [movement, setMovement] = useState<{
      result: ScanResult;
      tickets: Ticket[];
    } | null>(null),
    [done, setDone] = useState("");
  const session = useRef("");
  const scanStarted = useRef(false);
  const movementInFlight = useRef(false);
  const [recording, setRecording] = useState(false);
  const [recordedTicket, setRecordedTicket] = useState<Ticket | null>(null);
  useEffect(() => {
    if (!open) return;
    setError("");
    setMovement(null);
    setDone("");
    setRecordedTicket(null);
    setExisting(null);
    scanStarted.current = false;
    session.current = `${registration ? "registry" : type}-${Date.now()}`;
    rfidService
      .status()
      .then(setStatus)
      .catch(() => setStatus({ connected: false, message: "ESP32 reader unavailable" }));
    return () => {
      if (session.current) rfidService.cancel(session.current).catch(() => undefined);
    };
  }, [open, type, registration]);
  const scan = async () => {
    if (scanning) return;
    setScanning(true);
    setError("");
    try {
      if (registration) {
        const result = await accountService.scan(session.current);
        if (result.existing) {
          setExisting(result.existing);
          return;
        }
        onScan?.({
          ok: true,
          type: "ticket",
          uid: result.uid,
          rfidToken: "",
          employee: { employeeId: "", name: "", role: "", department: "OPERATIONS", status: "" },
          user: null,
        });
        onClose();
        return;
      }
      const result = await rfidService.scan(type, session.current);
      if (!result.uid || !result.employee)
        throw new Error("The reader returned an incomplete response. Please scan again.");
      if (!result.employee.employeeId || !result.rfidToken || result.employee.status !== "ACTIVE")
        throw new Error(
          "This card is not registered to an active employee. Please contact an administrator.",
        );
      if (type === "movement") {
        const tickets = result.movementTickets;
        if (!tickets)
          throw new Error(
            "Movement tickets could not be loaded. Please restart the backend and scan again.",
          );
        if (!tickets.length) {
          setError("No approved or ongoing trip ticket was found for this employee.");
          return;
        }
        setMovement({ result, tickets });
        return;
      }
      onScan?.(result);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The card could not be read.");
    } finally {
      setScanning(false);
    }
  };
  useEffect(() => {
    if (!open || existing || movement || scanStarted.current) return;
    scanStarted.current = true;
    void scan();
  }, [open, registration, existing, movement]);
  const applyMovement = async (ticket: Ticket) => {
    if (!movement || movementInFlight.current) return;
    movementInFlight.current = true;
    setRecording(true);
    setError("");
    try {
      const store = await ticketService.action(
        ticket.id,
        ticket.status === "approved" ? "start" : "complete",
        movement.result.rfidToken,
      );
      setRecordedTicket(store.requests.find((record) => record.id === ticket.id) || null);
      setDone(`${ticket.id} marked ${ticket.status === "approved" ? "departed" : "arrived"}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The movement could not be recorded.");
    } finally {
      movementInFlight.current = false;
      setRecording(false);
    }
  };
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="scan-modal" role="dialog" aria-modal="true" aria-labelledby="scan-title">
        <button className="modal-close" onClick={onClose} aria-label="Cancel scan">
          <X />
        </button>
        {existing ? (
          <>
            <BadgeCheck className="status-illustration" aria-hidden="true" />
            <p className="eyebrow">CARD ALREADY ASSIGNED</p>
            <h2 id="scan-title">Employee record found</h2>
            <p>
              This card is already linked to an employee. Registration is locked to prevent an
              accidental overwrite.
            </p>
            <div className="detail-grid">
              <div>
                <span>Employee ID</span>
                <b>{existing.employeeId}</b>
              </div>
              <div>
                <span>Name</span>
                <b>{existing.name}</b>
              </div>
              <div>
                <span>Role</span>
                <b>{existing.role}</b>
              </div>
              <div>
                <span>Department</span>
                <b>{departmentLabel(existing.department)}</b>
              </div>
              <div>
                <span>Email</span>
                <b>{existing.email}</b>
              </div>
            </div>
            <button className="btn secondary wide" onClick={() => setExisting(null)}>
              Scan another card
            </button>
            <button className="btn primary wide" onClick={onClose}>
              Done
            </button>
          </>
        ) : done ? (
          <>
            <BadgeCheck className="status-illustration" aria-hidden="true" />
            <h2 id="scan-title">Movement Recorded</h2>
            <p>{done}</p>
            {recordedTicket && <TravelTime ticket={recordedTicket} />}
            <button className="btn primary wide" onClick={onClose}>
              Done
            </button>
          </>
        ) : movement ? (
          <>
            <p className="eyebrow">SELECT TRIP TICKET</p>
            <h2 id="scan-title">Confirm movement</h2>
            <p>{movement.result.employee.name} has eligible tickets. Choose one to update.</p>
            <div className="movement-choices">
              {movement.tickets.map((t) => (
                <button
                  key={t.id}
                  className="btn secondary wide"
                  onClick={() => applyMovement(t)}
                  disabled={recording}
                >
                  <b>{t.id}</b>
                  <small>
                    {t.destination} · {t.status === "approved" ? "Depart" : "Arrive"}
                  </small>
                  <TravelTime ticket={t} />
                </button>
              ))}
            </div>
            {error && (
              <p className="scan-message error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <div className={`device-state ${status.connected ? "online" : "offline"}`}>
              <i />
              {status.message}
            </div>
            <div className={`reader-target ${scanning ? "is-scanning" : ""}`}>
              <span className="reader-ring" />
              <CreditCard className="card-illustration" aria-hidden="true" />
              <Radio className="radio-icon" />
            </div>
            <p className="eyebrow">RFID IDENTITY CHECK</p>
            <h2 id="scan-title">{scanning ? "Ready for your card" : "Card reader paused"}</h2>
            <p className={error ? "scan-message error" : "scan-message"}>
              {error || (scanning ? "Hold your employee ID over the reader." : message)}
            </p>
            <div className="capability-note">
              <ShieldCheck />
              <span>
                <b>Secure card reading</b>
                <small>This station reads your card ID only.</small>
              </span>
            </div>
            {error && (
              <button className="btn primary wide" onClick={scan} disabled={scanning}>
                Try reading the card again
            </button>
            )}
            <button className="btn secondary wide" onClick={onClose}>
              Cancel
            </button>
          </>
        )}
      </section>
    </div>
  );
}
