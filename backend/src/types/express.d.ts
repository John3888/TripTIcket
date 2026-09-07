declare namespace Express {
  interface Request {
    auth?: {
      userId: string;
      employeeId: string;
      role: string;
      name: string;
      department: string;
      email?: string;
      notificationMode?: "on" | "silent" | "off";
    };
  }
}
