"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api } from "@/services/api";
import type { Vehicle } from "@/types/trip-ticket";

type Device = { deviceId: string; vehicleId: string; enabled: boolean; lastSeenAt: string | null; vehicle: Vehicle };
type Registry = { devices: Device[]; vehicles: Vehicle[] };

export function DeviceManagement() {
  const [data, setData] = useState<Registry>({ devices: [], vehicles: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const load = useCallback(async () => {
    try { setData(await api<Registry>("/devices")); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not load devices."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    // Device state is populated from the asynchronous API response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const reset = () => { setEditing(null); setDeviceId(""); setVehicleId(""); setEnabled(true); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      await api(editing ? `/devices/${encodeURIComponent(editing)}` : "/devices", {
        method: editing ? "PATCH" : "POST", body: JSON.stringify({ deviceId: deviceId.trim(), vehicleId, enabled }),
      });
      setMessage(`${deviceId} ${editing ? "updated" : "registered"}.`);
      reset(); await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save the assignment."); }
    finally { setBusy(false); }
  };
  return <section className="settings-panel settings-panel-single" aria-label="Device management">
    <form onSubmit={save}>
      <h2>{editing ? `Edit ${editing}` : "Register a GPS device"}</h2>
      <p className="settings-help">Use the exact device ID configured in the firmware. Each vehicle can have one tracker. Finish active trips before changing an assignment; disabling a tracker stops accepting its telemetry.</p>
      {error && <p role="alert" className="notification-error">{error}</p>}
      {message && <p role="status" className="settings-message">{message}</p>}
      <fieldset disabled={busy || loading} className="settings-section">
        <legend>Device assignment</legend>
        <div className="settings-grid">
          <label><span>Device ID</span><input required pattern="[A-Za-z0-9_\-]{1,80}" maxLength={80} value={deviceId} readOnly={!!editing} onChange={(event) => setDeviceId(event.target.value)} placeholder="GPS-EMB-024" /></label>
          <label><span>Vehicle plate</span><select required value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
            <option value="">Select a vehicle</option>
            {data.vehicles.map((vehicle) => {
              const occupied = data.devices.some((device) => device.vehicleId === vehicle.vehicleId && device.deviceId !== editing);
              const current = data.devices.find((device) => device.deviceId === editing)?.vehicleId === vehicle.vehicleId;
              return <option key={vehicle.vehicleId} value={vehicle.vehicleId} disabled={occupied || (!current && vehicle.status.toUpperCase() !== "STANDBY")}>
                {vehicle.plate}{occupied ? " — tracker assigned" : ` — ${vehicle.status.toLowerCase().replaceAll("_", " ")}`}
              </option>;
            })}
          </select></label>
          <label><span>Accept telemetry</span><select value={enabled ? "enabled" : "disabled"} onChange={(event) => setEnabled(event.target.value === "enabled")}><option value="enabled">Enabled</option><option value="disabled">Disabled</option></select></label>
        </div>
      </fieldset>
      <footer><button className="btn" disabled={busy || loading || !vehicleId} type="submit">{busy ? "Saving…" : editing ? "Save changes" : "Register device"}</button>{editing && <button type="button" className="btn secondary" disabled={busy} onClick={reset}>Cancel editing</button>}</footer>
    </form>
    <section style={{ padding: "24px" }} aria-label="Registered trackers">
      <h2>Registered trackers</h2>
      <button className="btn secondary" type="button" disabled={busy} onClick={() => void load()}>Refresh devices</button>
      {loading ? <p role="status">Loading devices…</p> : !data.devices.length ? <p>No devices registered yet.</p> : data.devices.map((device) => <article key={device.deviceId} className="settings-section">
        <h3>{device.deviceId} · {device.vehicle.plate}</h3>
        <p>{device.enabled ? "Enabled" : "Disabled"} · {device.lastSeenAt ? `Last received ${new Date(device.lastSeenAt).toLocaleString()}` : "No telemetry received yet"}</p>
        <button className="btn secondary" type="button" disabled={busy} onClick={() => { setEditing(device.deviceId); setDeviceId(device.deviceId); setVehicleId(device.vehicleId); setEnabled(device.enabled); setMessage(""); }}>Edit assignment</button>
      </article>)}
    </section>
  </section>;
}
