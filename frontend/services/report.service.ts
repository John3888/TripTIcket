import { api, apiUrl, checkSessionResponse } from "./api";
export interface Receipt {
  ticketId: string;
  status: string;
  employee: string;
  vehicle: string;
  destination: string;
  purpose: string;
  requestedAt: string;
  estimatedSeconds: number;
  elapsedSeconds: number;
  flagged: boolean;
  overdueSeconds: number;
  expectedReturnAt?: string | null;
  departure?: string | null;
  arrival?: string | null;
  supervisor?: string | null;
  humanResources?: string | null;
  approvedBy?: string | null;
}
export type PrintResult = {
  mode: "browser" | "raw" | "error";
  receipt?: Receipt;
  error?: string;
};
export const reportService = {
  print: (ticketId: string) =>
    api<PrintResult>(`/reports/receipt/${encodeURIComponent(ticketId)}/print`, {
      method: "POST",
    }),
  downloadCsv: async () => {
    const reportResponse = await fetch(`${apiUrl()}/reports/requests.csv`, {
      credentials: "include",
    });
    checkSessionResponse(reportResponse, "/reports/requests.csv");
    if (!reportResponse.ok)
      throw new Error("The report could not be downloaded.");
    const reportUrl = URL.createObjectURL(await reportResponse.blob()),
      downloadLink = document.createElement("a");
    downloadLink.href = reportUrl;
    downloadLink.download = "EMB_Trip_Tickets.csv";
    downloadLink.click();
    URL.revokeObjectURL(reportUrl);
  },
  receipt: async (ticketId: string) =>
    (await api<{ receipt: Receipt }>(`/reports/receipt/${ticketId}`)).receipt,
};
