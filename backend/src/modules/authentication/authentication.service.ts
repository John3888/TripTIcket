import bcrypt from "bcryptjs";
import jwt, { type SignOptions } from "jsonwebtoken";
import { prisma } from "../../config/prismaClient.js";
import { ENV } from "../../config/env.js";
import { AppError } from "../../middlewares/error.middleware.js";
export async function login(email: string, password: string) {
  const user = await prisma.user.findFirst({
    where: {
      employee: { email: email.trim().toLowerCase(), status: "ACTIVE" },
    },
    include: { employee: true },
  });
  if (!user || !(await bcrypt.compare(password, user.passwordHash)))
    throw new AppError(401, "Invalid email or password.");
  const auth = {
    userId: user.userId,
    employeeId: user.employeeId,
    role: user.appRole,
    name: user.employee.displayName,
    department: user.employee.department,
    email: user.employee.email,
    notificationMode: user.notificationMode.toLowerCase() as "on" | "silent" | "off",
  };
  const token = jwt.sign(auth, ENV.JWT_SECRET, {
    expiresIn: ENV.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
  return {
    token,
    user: {
      ...auth,
      email: user.employee.email,
      notificationMode: user.notificationMode.toLowerCase(),
    },
  };
}
