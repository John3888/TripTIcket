/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";
import { ArrowRight, BadgeCheck, Check, CreditCard, Radio, ShieldCheck, X } from "lucide-react";
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
  const sessionSequence = useRef(0);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  const scanStarted = useRef(false);
  const activeScan = useRef("");
  const movementInFlight = useRef(false);
  const [recording, setRecording] = useState(false);
  const [recordedTicket, setRecordedTicket] = useState<Ticket | null>(null);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    dialog?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === dialog ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === dialog ||
          !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    setError("");
    setMovement(null);
    setDone("");
    setRecordedTicket(null);
    setExisting(null);
    setScanning(false);
    setRecording(false);
    setStatus({ connected: false, message: "Checking card reader…" });
    scanStarted.current = false;
    const currentSession = `${registration ? "registry" : type}-${Date.now()}-${++sessionSequence.current}`;
    session.current = currentSession;
    const stopWatchingStatus = rfidService.watchStatus((result) => {
      if (session.current === currentSession) setStatus(result);
    });
    return () => {
      stopWatchingStatus();
      if (session.current === currentSession) session.current = "";
      rfidService.cancel(currentSession).catch(() => undefined);
    };
  }, [open, type, registration]);
  const scan = async () => {
    const currentSession = session.current;
    if (!currentSession || activeScan.current === currentSession) return;
    activeScan.current = currentSession;
    setScanning(true);
    setError("");
    try {
      if (registration) {
        const result = await accountService.scan(currentSession);
        if (session.current !== currentSession) return;
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
      const result = await rfidService.scan(type, currentSession);
      if (session.current !== currentSession) return;
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
      if (session.current === currentSession)
        setError(e instanceof Error ? e.message : "The card could not be read.");
    } finally {
      if (activeScan.current === currentSession) activeScan.current = "";
      if (session.current === currentSession) setScanning(false);
    }
  };
  useEffect(() => {
    if (!open || existing || movement || scanStarted.current) return;
    scanStarted.current = true;
    void scan();
  }, [open, registration, existing, movement]);
  const applyMovement = async (ticket: Ticket) => {
    if (!movement || movementInFlight.current) return;
    const currentSession = session.current;
    movementInFlight.current = true;
    setRecording(true);
    setError("");
    try {
      const store = await ticketService.action(
        ticket.id,
        ticket.status === "approved" ? "start" : "complete",
        movement.result.rfidToken,
      );
      if (session.current !== currentSession) return;
      setRecordedTicket(store.requests.find((record) => record.id === ticket.id) || null);
      setDone(`${ticket.id} marked ${ticket.status === "approved" ? "departed" : "arrived"}.`);
    } catch (e) {
      if (session.current === currentSession)
        setError(e instanceof Error ? e.message : "The movement could not be recorded.");
    } finally {
      movementInFlight.current = false;
      if (session.current === currentSession) setRecording(false);
    }
  };
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="scan-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-title"
      >
        <button className="modal-close" onClick={onClose} aria-label="Cancel scan">
          <X />
        </button>
        <div className="scan-brand">
          <ShieldCheck aria-hidden="true" />
          <span>
            EMB TRIP TICKET<small>Secure identity station</small>
          </span>
        </div>
        <ol className="scan-progress" aria-label="Card reading progress">
          <li className="is-complete">
            <span>
              <Check size={14} aria-hidden="true" />
            </span>
            Prepare
          </li>
          <li
            className={existing || movement || done ? "is-complete" : "is-current"}
            aria-current={!existing && !movement && !done ? "step" : undefined}
          >
            <span>
              {existing || movement || done ? <Check size={14} aria-hidden="true" /> : "2"}
            </span>
            Scan card
          </li>
          <li
            className={done || existing ? "is-complete" : movement ? "is-current" : ""}
            aria-current={movement && !done ? "step" : undefined}
          >
            <span>{done || existing ? <Check size={14} aria-hidden="true" /> : "3"}</span>
            {done || existing ? "Confirmed" : "Confirm"}
          </li>
        </ol>
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
            <button
              className="btn secondary wide"
              onClick={() => {
                scanStarted.current = false;
                setExisting(null);
              }}
            >
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
            <p role="status">{done}</p>
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
                  className="btn secondary wide movement-choice"
                  onClick={() => applyMovement(t)}
                  disabled={recording}
                >
                  <span className="movement-choice-heading">
                    <b>{t.id}</b>
                    <span className="movement-choice-action">
                      {t.status === "approved" ? "Record departure" : "Record arrival"}
                      <ArrowRight size={15} aria-hidden="true" />
                    </span>
                  </span>
                  <small>{t.destination}</small>
                  <TravelTime ticket={t} />
                </button>
              ))}
            </div>
            {recording && (
              <p className="scan-message" role="status">
                Saving this movement. Please wait…
              </p>
            )}
            {error && (
              <p className="scan-message error" role="alert">
                {error}
              </p>
            )}
          </>
        ) : (
          <>
            <div
              role="status"
              className={`device-state ${status.connected ? "online" : "offline"}`}
            >
              <i />
              {status.message}
            </div>
            <div className={`reader-target ${scanning ? "is-scanning" : ""}`}>
              <span className="reader-ring" />
              <CreditCard className="card-illustration" aria-hidden="true" />
              <Radio className="radio-icon" aria-hidden="true" />
            </div>
            <p className="eyebrow">RFID IDENTITY CHECK</p>
            <h2 id="scan-title">
              {scanning ? "Tap your card to continue" : "Let’s try that again"}
            </h2>
            <p
              role={error ? "alert" : "status"}
              className={error ? "scan-message error" : "scan-message"}
            >
              {error || message}
            </p>
            <div className="scan-guidance">
              <CreditCard size={19} aria-hidden="true" />
              <p>
                Place one employee ID flat over the reader and hold it still until the next screen
                appears.
              </p>
            </div>
            {!status.connected && (
              <p className="reader-help">
                If your card is not detected, check the reader’s power and connection, then retry.
              </p>
            )}
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
