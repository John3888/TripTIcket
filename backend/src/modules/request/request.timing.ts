type TimedRequest = {
  status: string;
  departedAt: Date | null;
  arrivedAt: Date | null;
  elapsedSeconds: number;
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
  return {
    departure: request.departedAt?.toISOString() || null,
    arrival: request.arrivedAt?.toISOString() || null,
    elapsedSeconds: elapsedTravelSeconds(request, now),
  };
}
