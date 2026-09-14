"use client";
import { CreditCard, ShieldCheck, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { accountService, type ExistingCardAssignment } from "@/services/account.service";
import { ScanModal } from "./ScanModal";
import type { Department, ScanResult } from "@/types/trip-ticket";
import { DEPARTMENTS, departmentLabel } from "@/app/(admin)/config/menu.config";

type Employee = ExistingCardAssignment;
export function AccountRegistry() {
  const [view, setView] = useState<"assign" | "create" | "manage">("assign"),
    [employees, setEmployees] = useState<Employee[]>([]),
    [accounts, setAccounts] = useState<Employee[]>([]),
    [selected, setSelected] = useState(""),
    [editingEmployeeId, setEditingEmployeeId] = useState(""),
    [editRole, setEditRole] = useState("Employee"),
    [editDepartment, setEditDepartment] = useState<Department>("OPERATIONS"),
    [scan, setScan] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [card, setCard] = useState<ScanResult | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [createdAccount, setCreatedAccount] = useState<{
      name: string;
      role: string;
      department: Department;
    } | null>(null);
  const load = async () => {
    try {
      const [unassigned, allEmployees] = await Promise.all([
        accountService.unassigned(),
        accountService.employees(),
      ]);
      setEmployees(unassigned.employees);
      setAccounts(allEmployees.employees);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load employee accounts.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    // Employee state is populated after the asynchronous API response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);
  const assign = async () => {
    if (!card || !selected || busy) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await accountService.assign(card.uid, selected);
      setMessage(`Card ${result.uid} assigned to ${result.employee.name}.`);
      setCard(null);
      setSelected("");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Card could not be assigned.");
    } finally {
      setBusy(false);
    }
  };
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const department = String(form.get("department")) as Department;
    const name = ["firstName", "middleName", "surname"]
      .map((field) => String(form.get(field) || "").trim())
      .filter(Boolean)
      .join(" ");
    const role = String(form.get("role"));
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await accountService.create({
        employeeId: String(form.get("employeeId")),
        firstName: String(form.get("firstName")),
        middleName: String(form.get("middleName")),
        surname: String(form.get("surname")),
        role: role as "Employee" | "Department Head" | "HR Head" | "Finance Head" | "Administrator",
        department,
      });
      setMessage(
        `Account created. Email: ${result.email} · Temporary password: ${result.password}`,
      );
      setCreatedAccount({ name, role, department });
      formElement.reset();
      await load();
      setView("assign");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account could not be created.");
    } finally {
      setBusy(false);
    }
  };
  const chooseEmployeeToEdit = (employeeId: string) => {
    setEditingEmployeeId(employeeId);
    const employee = accounts.find((item) => item.employeeId === employeeId);
    if (!employee) return;
    setEditRole(employee.role);
    setEditDepartment(employee.department);
  };
  const saveEmployee = async () => {
    if (!editingEmployeeId || busy) return;
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const result = await accountService.updateEmployee(editingEmployeeId, {
        role: editRole as
          "Employee" | "Department Head" | "HR Head" | "Finance Head" | "Administrator",
        department: editDepartment,
      });
      setMessage(`${result.employee.name}'s role and department were updated.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Employee account could not be updated.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="registry-panel">
      <div className="registry-intro">
        <div className="registry-art">
          {view === "assign" ? <CreditCard /> : <UserPlus />}
          <i />
        </div>
        <div className="registry-tabs" aria-label="Account management">
          <button className={view === "assign" ? "active" : ""} onClick={() => setView("assign")}>
            Assign card
          </button>
          <button className={view === "create" ? "active" : ""} onClick={() => setView("create")}>
            Create account
          </button>
          <button className={view === "manage" ? "active" : ""} onClick={() => setView("manage")}>
            Edit employee
          </button>
        </div>
        {createdAccount && (
          <section className="registry-created-summary" aria-live="polite">
            <span>Account created</span>
            <b>{createdAccount.name}</b>
            <small>
              {createdAccount.role} · {departmentLabel(createdAccount.department)}
            </small>
          </section>
        )}
        {view === "assign" ? (
          <>
            <p className="eyebrow">CARD ASSIGNMENT</p>
            <h2>{card ? "Your card is ready to connect" : "Connect a card to an employee"}</h2>
            {card ? (
              <>
                <p>
                  Card UID <b>{card.uid}</b> is ready to assign. Choose an account that does not
                  already have a card.
                </p>
                <label>
                  <span>Employee account</span>
                  <select
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={loading || busy}
                  >
                    <option value="">
                      {loading ? "Loading employees…" : "Select an employee"}
                    </option>
                    {employees.map((employee) => (
                      <option key={employee.employeeId} value={employee.employeeId}>
                        {employee.name} · {employee.employeeId} · {employee.role} ·{" "}
                        {departmentLabel(employee.department)}
                      </option>
                    ))}
                  </select>
                  {!loading && !employees.length && (
                    <small className="field-help">
                      All employee accounts already have cards. Create an account first to connect
                      this card.
                    </small>
                  )}
                </label>
                <div className="registry-actions">
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => {
                      setCard(null);
                      setScan(true);
                    }}
                  >
                    Scan another card
                  </button>
                  <button className="btn primary" disabled={!selected || busy} onClick={assign}>
                    {busy ? "Connecting card…" : "Assign card"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p>
                  Have the employee card ready, then open the reader. We’ll check whether it is
                  already assigned before connecting it to an account.
                </p>
                <button className="btn primary" onClick={() => setScan(true)}>
                  <CreditCard /> Open card reader
                </button>
              </>
            )}
          </>
        ) : view === "create" ? (
          <form className="settings-grid" onSubmit={create}>
            <p className="eyebrow wide">CREATE EMPLOYEE ACCOUNT</p>
            <h2 className="wide">New account</h2>
            <div className="form-section-heading wide">
              <span>01</span>
              <div>
                <h3>Employee details</h3>
                <p>Use the employee’s official name and ID.</p>
              </div>
            </div>
            <label>
              <span>Employee ID</span>
              <input name="employeeId" required />
            </label>
            <label>
              <span>First name</span>
              <input name="firstName" required />
            </label>
            <label>
              <span>Middle name</span>
              <input name="middleName" required />
            </label>
            <label>
              <span>Surname</span>
              <input name="surname" required />
            </label>
            <label>
              <span>Role</span>
              <select name="role" defaultValue="Employee">
                <option>Employee</option>
                <option>Department Head</option>
                <option>HR Head</option>
                <option>Finance Head</option>
                <option>Administrator</option>
              </select>
              <small className="field-help">
                Employees request trips. Heads review requests for their role; administrators manage
                accounts and operations.
              </small>
            </label>
            <label>
              <span>Department</span>
              <select name="department" defaultValue="" required>
                <option value="" disabled>
                  Select department
                </option>
                {DEPARTMENTS.map((department) => (
                  <option key={department.value} value={department.value}>
                    {department.label}
                  </option>
                ))}
              </select>
              <small className="field-help">
                Required for page access and department tracking.
              </small>
            </label>
            <div className="form-section-heading wide">
              <span>02</span>
              <div>
                <h3>Ready to get started</h3>
                <p>
                  Sign-in details are generated after creation. Connect an RFID card in the next
                  step.
                </p>
              </div>
            </div>
            <button className="btn primary" disabled={busy}>
              {busy ? "Creating account…" : "Create employee account"}
            </button>
          </form>
        ) : (
          <section className="settings-grid">
            <p className="eyebrow wide">EMPLOYEE MANAGEMENT</p>
            <h2 className="wide">Edit employee access</h2>
            <p className="wide">
              Update an employee&apos;s role or department. Their next sign-in uses the new access.
            </p>
            <label className="wide">
              <span>Employee</span>
              <select
                value={editingEmployeeId}
                onChange={(event) => chooseEmployeeToEdit(event.target.value)}
                disabled={loading || busy}
              >
                <option value="">{loading ? "Loading employees…" : "Select an employee"}</option>
                {accounts.map((employee) => (
                  <option key={employee.employeeId} value={employee.employeeId}>
                    {employee.name} · {employee.employeeId} · {departmentLabel(employee.department)}
                  </option>
                ))}
              </select>
            </label>
            {editingEmployeeId && (
              <>
                <label>
                  <span>Role</span>
                  <select value={editRole} onChange={(event) => setEditRole(event.target.value)}>
                    <option>Employee</option>
                    <option>Department Head</option>
                    <option>HR Head</option>
                    <option>Finance Head</option>
                    <option>Administrator</option>
                  </select>
                </label>
                <label>
                  <span>Department</span>
                  <select
                    value={editDepartment}
                    onChange={(event) => setEditDepartment(event.target.value as Department)}
                  >
                    {DEPARTMENTS.map((department) => (
                      <option key={department.value} value={department.value}>
                        {department.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="btn primary" disabled={busy} onClick={() => void saveEmployee()}>
                  {busy ? "Saving changes…" : "Save employee changes"}
                </button>
              </>
            )}
          </section>
        )}
        {message && (
          <p className="registry-feedback" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <aside className="registry-help">
        <h3>How it works</h3>
        <ol>
          <li className="active">
            <i>1</i>
            <span>
              <b>Create account</b>
              <small>Create employee accounts without needing a card.</small>
            </span>
          </li>
          <li className="active">
            <i>2</i>
            <span>
              <b>Assign card</b>
              <small>Scan once, then choose an unassigned account.</small>
            </span>
          </li>
        </ol>
        <div className="notice">
          <ShieldCheck />
          <p>
            <b>Overwrite protection</b>
            <br />
            An assigned card cannot be linked to another account.
          </p>
        </div>
      </aside>
      <ScanModal
        registration
        open={scan}
        onScan={(result) => {
          setCard(result);
          setScan(false);
        }}
        onClose={() => setScan(false)}
      />
    </section>
  );
}
