export interface ZoomAccessToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export interface CreateMeetingInput {
  topic: string;
  start_time: string; // ISO 8601 UTC
  duration: number; // minutes
}

export interface ZoomMeetingResponse {
  id: number;
  host_id: string;
  topic: string;
  type: number;
  start_time: string;
  duration: number;
  timezone: string;
  join_url: string;
  start_url: string;
}

export interface MeetingOutput {
  meetingId: string;
  joinUrl: string;
  startUrl: string;
}
