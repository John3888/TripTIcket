import { api, apiUrl } from "./api";
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
export const reportService = {
  downloadCsv: async () => {
    const reportResponse = await fetch(`${apiUrl()}/reports/requests.csv`, {
      credentials: "include",
    });
    if (!reportResponse.ok) throw new Error("The report could not be downloaded.");
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
