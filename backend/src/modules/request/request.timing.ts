type TimedRequest = {
  status: string;
  departedAt: Date | null;
  arrivedAt: Date | null;
  elapsedSeconds: number;
  estimatedSeconds?: number;
  flagged?: boolean;
};

export function elapsedTravelSeconds(request: TimedRequest, now = new Date()) {
  if (!["ONGOING", "COMPLETED"].includes(request.status)) return 0;
  const end = request.arrivedAt || (request.status === "ONGOING" ? now : null);
  if (request.departedAt && end) {
    return Math.max(0, Math.floor((end.getTime() - request.departedAt.getTime()) / 1000));
  }
  return Math.max(0, request.elapsedSeconds);
}

export function tripTiming(request: TimedRequest, now = new Date()) {
  const elapsedSeconds = elapsedTravelSeconds(request, now);
  const estimatedSeconds = Math.max(0, request.estimatedSeconds || 0);
  const overdueSeconds = estimatedSeconds > 0 ? Math.max(0, elapsedSeconds - estimatedSeconds) : 0;
  return {
    departure: request.departedAt?.toISOString() || null,
    arrival: request.arrivedAt?.toISOString() || null,
    elapsedSeconds,
    estimatedSeconds,
    overdueSeconds,
    isOverdue: overdueSeconds > 0,
    flagged: Boolean(request.flagged) || overdueSeconds > 0,
    expectedReturnAt:
      request.departedAt && estimatedSeconds > 0
        ? new Date(request.departedAt.getTime() + estimatedSeconds * 1000).toISOString()
        : null,
  };
}
