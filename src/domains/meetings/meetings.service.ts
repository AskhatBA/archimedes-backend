import { zoomService } from '@/shared/lib/zoom/zoom.service';

interface CreateMeetingInput {
  topic: string;
  start_time: string; // ISO 8601 UTC
  duration: number; // minutes
}

interface MeetingResponse {
  meetingId: string;
  joinUrl: string;
  startUrl: string;
}

export const createMeeting = async (input: CreateMeetingInput): Promise<MeetingResponse> => {
  return await zoomService.createMeeting(input);
};

interface RecordingResponse {
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

export const getMeetingRecordings = async (meetingId: string): Promise<RecordingResponse> => {
  return await zoomService.getRecordings(meetingId);
};
