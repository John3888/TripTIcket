import { z } from "zod";
const accountFields = {
  employeeId: z.string().regex(/^[A-Z0-9][A-Z0-9-]{2,23}$/),
  firstName: z.string().min(1),
  middleName: z.string().min(1),
  surname: z.string().min(1),
  role: z.enum(["Employee", "Department Head", "HR Head", "Finance Head", "Administrator"]),
  department: z.enum(["MIS", "FINANCE", "HUMAN_RESOURCES", "OPERATIONS"]),
};
const validateHeadDepartment = (
  value: { role: string; department: string },
  context: z.RefinementCtx,
) => {
  if (value.role === "HR Head" && value.department !== "HUMAN_RESOURCES")
    context.addIssue({
      code: "custom",
      path: ["department"],
      message: "The HR Head must belong to Human Resources.",
    });
  if (value.role === "Finance Head" && value.department !== "FINANCE")
    context.addIssue({
      code: "custom",
      path: ["department"],
      message: "The Finance Head must belong to Finance.",
    });
};
export const registerSchema = z
  .object({
    uid: z.string().min(4),
    ...accountFields,
  })
  .superRefine(validateHeadDepartment);
export const createAccountSchema = z.object(accountFields).superRefine(validateHeadDepartment);
export const updateEmployeeSchema = z
  .object({
    role: accountFields.role,
    department: accountFields.department,
  })
  .superRefine(validateHeadDepartment);
export const assignCardSchema = z.object({
  uid: z.string().min(4),
  employeeId: accountFields.employeeId,
});
