export interface Attendance {
  participantId: string;
  visitId: string;
  joinedAt: number;
  connectedSince: number;
  disconnectedAt: number;
  accumulatedMs: number;
  status: 'CONNECTED' | 'RECONNECTING' | 'LEFT';
}
export interface AttendanceSnapshot { serverNow: number; participants: Attendance[] }
export function attendanceSeconds(visit: Attendance, serverNow: number) {
  return Math.floor(Math.max(0, visit.accumulatedMs + (visit.status === 'CONNECTED' ? Math.max(0, serverNow - visit.connectedSince) : 0)) / 1000);
}
export function formatAttendance(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return [Math.floor(value / 3600), Math.floor(value / 60) % 60, value % 60].map(n => String(n).padStart(2, '0')).join(':');
}
