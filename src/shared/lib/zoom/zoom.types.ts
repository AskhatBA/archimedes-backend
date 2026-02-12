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

export interface RecordingFile {
  id: string;
  meeting_id: string;
  recording_start: string;
  recording_end: string;
  file_type: string;
  file_size: number;
  download_url: string;
  status: string;
  recording_type: string;
}

export interface ZoomRecordingResponse {
  id: string;
  uuid: string;
  host_id: string;
  topic: string;
  start_time: string;
  duration: number;
  total_size: number;
  recording_count: number;
  recording_files: RecordingFile[];
}

export interface RecordingOutput {
  meetingId: string;
  topic: string;
  startTime: string;
  duration: number;
  files: Array<{
    id: string;
    fileType: string;
    fileSize: number;
    downloadUrl: string;
    recordingType: string;
  }>;
}
